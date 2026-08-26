import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Read a CPU profile and report self time per function.
   Plain node — no build step.

     node perf/profile.mjs a.cpuprofile            # one profile
     node perf/profile.mjs a.cpuprofile b.json     # two, side by side

   Accepts both shapes Chrome produces, because which one you get depends on
   how you exported it:

     .cpuprofile   { nodes, samples, timeDeltas }  — node --cpu-prof, or the
                   JS Profiler panel
     .json         a DevTools Performance trace. The profile is spread across
                   Profile/ProfileChunk events and has to be stitched back
                   together. This is what you get from a phone.

   Self time is weighted by timeDeltas rather than counted per sample. Sampling
   is not evenly spaced, and on a loaded phone it is much less evenly spaced
   than in a container, which is exactly the comparison this is for. */

/* Colour codes, because `ls` is aliased to a colourising one on plenty of
   setups and $(ls -t ...) then captures the escapes along with the name. */
const ANSI = /\u001B\[[0-9;]*m/g;

/* A directory means "the newest profile in here", so nobody has to shell out to
   ls at all. */
function resolve(path) {
  const p = path.replace(ANSI, "");
  let st;
  try {
    st = statSync(p);
  } catch {
    return p; // let the read produce the real error
  }
  if (!st.isDirectory()) return p;
  const found = readdirSync(p)
    .filter((f) => /\.(cpuprofile|json)$/.test(f))
    .map((f) => join(p, f))
    .map((f) => ({ f, t: statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!found.length) {
    console.error(`${p}: no .cpuprofile or .json in that directory`);
    process.exit(2);
  }
  console.error(`${p} -> ${found[0].f}`);
  return found[0].f;
}

function parse(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));

  if (raw.nodes && raw.samples) return raw;

  const events = Array.isArray(raw) ? raw : raw.traceEvents;
  if (!events)
    throw new Error(`${path}: not a .cpuprofile or a DevTools trace`);

  const nodes = [];
  const samples = [];
  const timeDeltas = [];
  for (const e of events) {
    const d = e.args && e.args.data;
    if (!d) continue;
    const cp = d.cpuProfile;
    if (cp) {
      if (cp.nodes) nodes.push(...cp.nodes);
      if (cp.samples) samples.push(...cp.samples);
    }
    if (d.timeDeltas) timeDeltas.push(...d.timeDeltas);
  }
  if (!nodes.length)
    throw new Error(
      `${path}: no profile data. A Performance recording only contains one if ` +
        `JS sampling was on — record with the default settings, not "screenshots only".`,
    );
  return { nodes, samples, timeDeltas };
}

/* Chrome reports these as functions; they are not, and lumping them in with
   real frames hides the thing we are looking for. */
const SYNTHETIC = new Set([
  "(garbage collector)",
  "(program)",
  "(idle)",
  "(root)",
  "(no name)",
]);

function selfTime(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const n = Math.min(p.samples.length, p.timeDeltas.length || p.samples.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const dt = p.timeDeltas.length ? Math.max(0, p.timeDeltas[i]) : 1;
    const node = byId.get(p.samples[i]);
    if (!node) continue;
    const cf = node.callFrame || {};
    const name = cf.functionName || "(anonymous)";
    if (name === "(idle)") continue; // not work
    self.set(name, (self.get(name) || 0) + dt);
    total += dt;
  }
  return { self, total };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node perf/profile.mjs <profile> [profile2]");
  process.exit(2);
}
/* Refuse extra arguments rather than quietly using the first two. A glob like
   perf/.prof/CPU.*.cpuprofile expands to every profile you have ever taken, and
   silently comparing two of those against each other looks exactly like a real
   result — every share within the noise floor, which is precisely the answer a
   container-versus-container comparison gives. */
if (files.length > 2) {
  console.error(
    `expected one or two profiles, got ${files.length}:\n` +
      files.map((f) => `  ${f}`).join("\n") +
      "\n\nA glob probably matched more than you meant. To pick the newest:\n" +
      '  node perf/profile.mjs "$(ls -t perf/.prof/*.cpuprofile | head -1)" <device.json>',
  );
  process.exit(2);
}

const runs = files
  .map(resolve)
  .map((f) => ({ file: f, ...selfTime(parse(f)) }));
const share = (r, k) => (100 * (r.self.get(k) || 0)) / r.total;

if (runs.length === 1) {
  const [r] = runs;
  console.log(`${r.file}\n${(r.total / 1000).toFixed(0)} ms sampled\n`);
  for (const [k, v] of [...r.self].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(
      `  ${share(r, k).toFixed(1).padStart(5)}%  ${((v / 1000).toFixed(0) + " ms").padStart(9)}  ${k}`,
    );
  const gc = share(r, "(garbage collector)");
  console.log(`\n  garbage collector: ${gc.toFixed(1)}%`);
  process.exit(0);
}

/* Two profiles: rank by the first, show how the second weights the same
   functions. The point is not which is faster — they are different machines —
   but whether they agree on what the bottleneck is. */
const [a, b] = runs;
const keys = [...new Set([...a.self.keys(), ...b.self.keys()])]
  .filter((k) => !SYNTHETIC.has(k) || k === "(garbage collector)")
  .sort((x, y) => (b.self.get(y) || 0) - (b.self.get(x) || 0))
  .slice(0, 22);

console.log(`A  ${a.file}   ${(a.total / 1000).toFixed(0)} ms sampled`);
console.log(`B  ${b.file}   ${(b.total / 1000).toFixed(0)} ms sampled\n`);
console.log(`  ${"A".padStart(6)} ${"B".padStart(7)}   shift   function`);
for (const k of keys) {
  const sa = share(a, k);
  const sb = share(b, k);
  const d = sb - sa;
  const mark = Math.abs(d) < 1 ? "" : d > 0 ? "  <-- heavier in B" : "";
  console.log(
    `  ${sa.toFixed(1).padStart(5)}% ${sb.toFixed(1).padStart(6)}%  ${(d >= 0 ? "+" : "") + d.toFixed(1)}pp`.padEnd(
      34,
    ) + `${k}${mark}`,
  );
}
console.log(
  "\nShares, not times. Different machines run for different durations; what\n" +
    "matters is whether they agree on the ranking. A function materially heavier\n" +
    "in B is one the container profile under-weights, and its issue moves up.",
);

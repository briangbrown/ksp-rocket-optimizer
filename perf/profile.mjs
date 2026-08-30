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

/* ---- source maps -------------------------------------------------------
   A profile from the deployed app carries minified names — r, Mt, m — which
   line up with nothing. The production bundle is reproducible, and building
   with `sourcemap: hidden` leaves the JS byte-identical (same content hash),
   so a map built locally describes exactly the bundle the phone ran. Nothing
   has to be deployed, and no source is exposed. */

const B64 = new Map(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (c, i) => [c, i],
  ),
);

function decodeVlq(str) {
  const out = [];
  let shift = 0,
    value = 0;
  for (const c of str) {
    const d = B64.get(c);
    if (d === undefined) return out;
    value += (d & 31) << shift;
    if (d & 32) {
      shift += 5;
    } else {
      const neg = value & 1;
      value >>= 1;
      out.push(neg ? -value : value);
      shift = 0;
      value = 0;
    }
  }
  return out;
}

function loadMap(path) {
  const m = JSON.parse(readFileSync(path, "utf8"));
  const lines = [];
  let srcIdx = 0,
    srcLine = 0,
    srcCol = 0;
  m.mappings.split(";").forEach((line) => {
    let genCol = 0;
    const segs = [];
    for (const part of line.split(",")) {
      if (!part) continue;
      const f = decodeVlq(part);
      genCol += f[0];
      if (f.length >= 4) {
        srcIdx += f[1];
        srcLine += f[2];
        srcCol += f[3];
        segs.push({ genCol, srcIdx, srcLine });
      }
    }
    lines.push(segs);
  });
  return {
    lines,
    file: m.file,
    sources: m.sources,
    content: m.sourcesContent || [],
    split: [],
  };
}

/* The map's `names` array is empty — this minifier does not record original
   identifiers — so the name is recovered from the source instead. Map the frame
   to a line of original code, then scan upwards for the declaration enclosing
   it. That also resolves nested closures correctly: `dvOf` is a const inside
   boostedAscent, and the scan finds it before it finds its parent. */
const DECL = new RegExp(
  "^\\s*(?:export\\s+)?(?:async\\s+)?(?:" +
    "function\\s+([A-Za-z_$][\\w$]*)" + // function foo(
    "|(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*" +
    "(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)" + // const foo = (…) =>
    ")",
);

function originalName(map, line, col) {
  for (const l of [line, line - 1, line + 1]) {
    const segs = map.lines[l];
    if (!segs || !segs.length) continue;
    let best = null;
    for (const seg of segs) {
      if (seg.genCol > col) break;
      best = seg;
    }
    best = best || segs[0];

    if (!map.split[best.srcIdx]) {
      const text = map.content[best.srcIdx];
      if (!text) return null;
      map.split[best.srcIdx] = text.split("\n");
    }
    const src = map.split[best.srcIdx];
    const file = (map.sources[best.srcIdx] || "?").split("/").pop();
    for (let i = Math.min(best.srcLine, src.length - 1); i >= 0; i--) {
      const m = DECL.exec(src[i]);
      if (m) return { name: m[1] || m[2], file };
    }
    return { name: `${file}:${best.srcLine + 1}`, file };
  }
  return null;
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

const warned = new Set();
function selfTime(p, pick) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  /* Keyed on the bare function name. The source file is carried alongside for
     display only — putting it in the key made every device frame a different
     key from its container twin, and the whole comparison read 0.0%. */
  const where = new Map();
  const n = Math.min(p.samples.length, p.timeDeltas.length || p.samples.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const dt = p.timeDeltas.length ? Math.max(0, p.timeDeltas[i]) : 1;
    const node = byId.get(p.samples[i]);
    if (!node) continue;
    const cf = node.callFrame || {};
    let name = cf.functionName || "(anonymous)";
    if (pick && cf.url && cf.lineNumber >= 0) {
      /* A map for a different build resolves every frame to a plausible-looking
         wrong name, which is worse than not resolving at all. The bundles are
         content-hashed, so a URL matching none of the maps means the profile
         and the build are different commits. */
      const m = pick(cf.url);
      if (!m && cf.url.includes(".js")) {
        if (!warned.has(cf.url)) {
          warned.add(cf.url);
          console.error(
            `warning: the profile ran ${cf.url.split("/").pop()}, which none of ` +
              `the ${maps.length} maps describe. Names from it are not ` +
              `trustworthy — rebuild the commit that was deployed when the ` +
              `profile was taken.`,
          );
        }
      } else if (m) {
        const orig = originalName(m, cf.lineNumber, cf.columnNumber ?? 0);
        if (orig) {
          name = orig.name;
          if (orig.file) where.set(name, orig.file);
        }
      }
    }
    if (name === "(idle)") continue; // not work
    self.set(name, (self.get(name) || 0) + dt);
    total += dt;
  }
  return { self, total, where };
}

const args = process.argv.slice(2);
const mapAt = args.indexOf("--map");
const mapPath = mapAt === -1 ? null : args[mapAt + 1];
/* Every map in the directory, not one.

   It used to insist on exactly one and stop, which was true when the
   application was a single bundle and stopped being true the moment anything
   was split out of it: there are five now — the app, the route chunk, the lazy
   three.js view and the two workers. Naming one by hand is the wrong answer as
   well as an annoying one, because a device trace spans several. The solve runs
   in `solver.worker` and the interface that starts it is in `index`, so a
   profile of a real solve needs both to read. */
function findMaps(p) {
  const c = p.replace(ANSI, "");
  let st;
  try {
    st = statSync(c);
  } catch {
    return [c];
  }
  if (!st.isDirectory()) return [c];
  const maps = readdirSync(c)
    .filter((f) => f.endsWith(".js.map"))
    .map((f) => join(c, f));
  if (!maps.length) {
    console.error(`${c}: no .js.map here. Run \`npm run perf:map\` first.`);
    process.exit(2);
  }
  return maps;
}

/* Which map describes a given frame, by the bundle it came from. The names are
   content-hashed, so a URL matching a map's `file` is a real check that the two
   are the same build and not merely the same shape. */
function mapPicker(maps) {
  return (url) => {
    if (!url) return null;
    for (const m of maps) if (m.file && url.includes(m.file)) return m;
    return null;
  };
}
const maps = mapPath ? findMaps(mapPath).map(loadMap) : null;
const pick = maps ? mapPicker(maps) : null;
const files =
  mapAt === -1 ? args : args.filter((_, i) => i !== mapAt && i !== mapAt + 1);
if (!files.length) {
  console.error(
    "usage: node perf/profile.mjs <profile> [profile2] [--map <bundle.js.map>]",
  );
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

/* The map describes the deployed bundle, so it applies to the device profile —
   the last file given — and never to a container profile, which is not minified. */
const runs = files.map(resolve).map((f, i) => ({
  file: f,
  ...selfTime(parse(f), pick && i === files.length - 1 ? pick : null),
}));
const share = (r, k) => (100 * (r.self.get(k) || 0)) / r.total;

if (runs.length === 1) {
  const [r] = runs;
  console.log(`${r.file}\n${(r.total / 1000).toFixed(0)} ms sampled\n`);
  for (const [k, v] of [...r.self].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(
      `  ${share(r, k).toFixed(1).padStart(5)}%  ${((v / 1000).toFixed(0) + " ms").padStart(9)}  ${k}` +
        (r.where.get(k) ? `  <${r.where.get(k)}>` : ""),
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
  const file = b.where.get(k) || a.where.get(k);
  console.log(
    `  ${sa.toFixed(1).padStart(5)}% ${sb.toFixed(1).padStart(6)}%  ${(d >= 0 ? "+" : "") + d.toFixed(1)}pp`.padEnd(
      34,
    ) + `${k}${file ? "  <" + file + ">" : ""}${mark}`,
  );
}
console.log(
  "\nShares, not times. Different machines run for different durations; what\n" +
    "matters is whether they agree on the ranking. A function materially heavier\n" +
    "in B is one the container profile under-weights, and its issue moves up.",
);

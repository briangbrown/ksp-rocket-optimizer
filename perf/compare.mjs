import { readFileSync } from "node:fs";

/* Compare two benchmark runs. Plain node — reads JSON only, so it needs no
   build step.

   Timings are only comparable within one machine. A baseline captured on a
   laptop says nothing about a run in a container, which is why perf:save writes
   a local, gitignored file rather than a committed one. */

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error(
    "usage: node perf/compare.mjs <baseline.json> <current.json>\n" +
      "   or: npm run perf:compare   (local baseline vs a fresh run)",
  );
  process.exit(2);
}

const load = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.error(
      `cannot read ${p}: ${e.code === "ENOENT" ? "no such file — run `npm run perf:save` first" : e.message}`,
    );
    process.exit(2);
  }
};

const base = load(a);
const cur = load(b);

if (base.mode !== cur.mode) {
  console.error(
    `mode mismatch: baseline is ${base.mode}, current is ${cur.mode}`,
  );
  process.exit(2);
}
if (base.node !== cur.node || base.cpus !== cur.cpus) {
  console.warn(
    `warning: different machine or runtime — baseline ${base.node}/${base.cpus} cpus, ` +
      `current ${cur.node}/${cur.cpus} cpus. Treat the comparison as indicative only.\n`,
  );
}

const byName = new Map(cur.rows.map((r) => [r.name, r]));
const rows = [];
for (const r of base.rows) {
  const c = byName.get(r.name);
  if (!c) continue;
  rows.push({ name: r.name, before: r.ms, after: c.ms, delta: c.ms - r.ms });
}

const tb = base.rows.reduce((s, r) => s + r.ms, 0);
const tc = cur.rows.reduce((s, r) => s + r.ms, 0);

const bar = (ratio) => {
  /* one cell per 10% change, capped */
  const n = Math.min(12, Math.round(Math.abs(1 - ratio) * 10));
  return (ratio < 1 ? "-" : "+").repeat(n);
};

console.log(`baseline ${base.when}`);
console.log(`current  ${cur.when}\n`);

const moved = rows
  .filter((r) => Math.abs(r.delta) / Math.max(r.before, 1e-9) > 0.05)
  .sort((x, y) => x.delta - y.delta);

if (moved.length) {
  console.log("cases moved by more than 5%:");
  for (const r of moved.slice(0, 20)) {
    const ratio = r.after / r.before;
    console.log(
      `  ${r.name.padEnd(30)} ${r.before.toFixed(0).padStart(7)} -> ` +
        `${r.after.toFixed(0).padStart(7)} ms  ${((ratio - 1) * 100).toFixed(1).padStart(6)}%  ${bar(ratio)}`,
    );
  }
  if (moved.length > 20) console.log(`  … and ${moved.length - 20} more`);
} else {
  console.log("no case moved by more than 5%.");
}

const ratio = tc / tb;
console.log(
  `\ntotal ${(tb / 1000).toFixed(2)}s -> ${(tc / 1000).toFixed(2)}s   ` +
    `${((ratio - 1) * 100).toFixed(1)}%  (${(1 / ratio).toFixed(2)}x)`,
);
console.log(
  "\nA speedup means nothing on its own — run `npm test` and confirm the design\n" +
    "snapshot is byte-identical. A faster solver that picks different rockets is\n" +
    "not a faster solver.",
);

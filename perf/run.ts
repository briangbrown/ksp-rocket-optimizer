import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { solveGroup } from "../src/core/solver.js";
import { planMission } from "../src/core/plan.js";
import { cases } from "../test/grid.js";
import { missionInput, MISSIONS } from "./cases.js";

/* Benchmark runner. Built through vite (for the JSON imports) and run under
   plain node, which is also what makes --cpu-prof available.

   Prints a summary and, with --out, writes the per-case numbers so two runs can
   be compared. See perf/README.md. */

const argv = process.argv.slice(2);
const mode = argv[0] || "grid";
/* One row of whichever benchmark ran: the grid names a case and what it was,
   the mission names a destination and how many stages it delivered. */
type Row = {
  name: string;
  ms: number;
  tier?: number | null;
  payload?: number | null;
  dv?: number | null;
  objective?: string | null;
  solved?: boolean;
  stages?: number;
};

const flag = <T extends string | number | null>(
  name: string,
  dflt: T,
): string | T => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};

const ms = <T>(fn: () => T): [number, T] => {
  const t0 = process.hrtime.bigint();
  const out = fn();
  return [Number(process.hrtime.bigint() - t0) / 1e6, out];
};

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);

function summarise(
  rows: ReadonlyArray<Row>,
  keyOf: (r: Row) => unknown,
  label: string,
) {
  const total = rows.reduce((a, r) => a + r.ms, 0);
  const by = new Map<unknown, { ms: number; n: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const e = by.get(k) || { ms: 0, n: 0 };
    e.ms += r.ms;
    e.n++;
    by.set(k, e);
  }
  console.log(`\nby ${label}:`);
  for (const [k, e] of [...by].sort((a, b) => b[1].ms - a[1].ms))
    console.log(
      `  ${String(k).padEnd(8)} ${(e.ms / 1000).toFixed(2).padStart(7)}s  ` +
        `${pct(e.ms, total).toFixed(1).padStart(5)}%   (${e.n} cases)`,
    );
}

async function grid() {
  const rows: Array<Row> = [];
  for (const c of cases()) {
    const [t, res] = ms(() => solveGroup(c.input));
    const m = c.name.match(/^tier(\d+)-pay([\d.]+)-dv(\d+)-(\w+)$/);
    rows.push({
      name: c.name,
      tier: m && +m[1],
      payload: m && +m[2],
      dv: m && +m[3],
      objective: m && m[4],
      ms: t,
      solved: !!res,
    });
  }
  const total = rows.reduce((a, r) => a + r.ms, 0);
  console.log(
    `grid: ${(total / 1000).toFixed(2)}s over ${rows.length} cases ` +
      `(${rows.filter((r) => r.solved).length} solved)`,
  );
  summarise(rows, (r) => r.tier, "tech tier");
  summarise(rows, (r) => r.objective, "objective");
  console.log("\nslowest 8:");
  for (const r of [...rows].sort((a, b) => b.ms - a.ms).slice(0, 8))
    console.log(`  ${(r.ms / 1000).toFixed(2).padStart(7)}s  ${r.name}`);
  return rows;
}

async function mission() {
  const tier = +flag("tier", 9);
  const repeat = +flag("repeat", 3);
  const rows: Array<Row> = [];
  console.log(`mission: tech tier ${tier}, best of ${repeat}\n`);
  for (const dest of MISSIONS) {
    const input = missionInput(dest, tier);
    let best = Infinity;
    let stages = 0;
    for (let i = 0; i < repeat; i++) {
      const t0 = process.hrtime.bigint();
      const r = await planMission(input);
      const t = Number(process.hrtime.bigint() - t0) / 1e6;
      /* Best of N, not mean. A benchmark's fast runs are the signal; the slow
         ones are whatever else the machine was doing. */
      if (t < best) best = t;
      stages = r ? r.stages.length : 0;
    }
    rows.push({ name: dest, ms: best, stages });
    console.log(
      `  ${dest.padEnd(8)} ${best.toFixed(0).padStart(6)} ms   ${stages} stages`,
    );
  }
  console.log(
    `\n  total    ${rows
      .reduce((a, r) => a + r.ms, 0)
      .toFixed(0)
      .padStart(6)} ms`,
  );
  return rows;
}

const rows = mode === "mission" ? await mission() : await grid();

const out = flag("out", null);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        mode,
        node: process.version,
        cpus: (await import("node:os")).cpus().length,
        when: new Date().toISOString(),
        rows,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`\nwrote ${out}`);
}

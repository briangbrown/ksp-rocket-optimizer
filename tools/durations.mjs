#!/usr/bin/env node
/* Regenerate test/durations.json — what each test file costs a worker.

   The table is what test/shard-plan.ts packs the CI shards by. It is a
   measurement, like the tables in src/data/, and goes stale the same way: it
   costs time when it is wrong, never coverage. Nothing here can drop a test
   file, and test/sharding.test.ts is what holds that.

   The pricing is tools/duration-reporter.ts, which has the reason it is not the
   json reporter — in short, a file whose work happens at import time has no
   test to hang that time on, and one of this suite's slowest files was priced
   at 0.2 seconds against the 87 it really takes.

   Run it on a quiet machine — every other process is competition for the four
   workers, and the numbers come out long. What matters is the ratios between
   files rather than the absolute seconds, since the runner is a different
   machine again; the packing only ever asks which file is bigger than which.

       npm run test:durations

   Takes as long as the suite does, because it is the suite. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "test", "durations.json");
const scratch = mkdtempSync(join(tmpdir(), "durations-"));
const report = join(scratch, "durations.json");

try {
  const before = JSON.parse(readFileSync(out, "utf8"));

  console.log("running the suite, once, timing every file…");
  execFileSync(
    "npx",
    ["vitest", "run", "--reporter=./tools/duration-reporter.ts"],
    {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, DURATIONS_OUT: report },
    },
  );

  const table = JSON.parse(readFileSync(report, "utf8"));
  const names = Object.keys(table);
  if (names.length === 0) throw new Error("the run reported no test files");
  writeFileSync(out, `${JSON.stringify(table, null, 2)}\n`);

  const total = Object.values(table).reduce((a, b) => a + b, 0);
  const worst = Object.entries(table).sort(([, a], [, b]) => b - a);
  console.log(
    `${names.length} files, ${total.toFixed(0)}s of CPU. Longest: ${worst
      .slice(0, 3)
      .map(([p, s]) => `${p} ${s}s`)
      .join(", ")}`,
  );

  /* What moved, loudest first. A file that has doubled is worth knowing about
     before the diff is committed — it is either a test that grew or one that
     regressed, and the table cannot tell which. */
  const moved = names
    .filter(
      (n) => before[n] !== undefined && Math.abs(table[n] - before[n]) > 5,
    )
    .sort(
      (a, b) => Math.abs(table[b] - before[b]) - Math.abs(table[a] - before[a]),
    );
  const added = names.filter((n) => before[n] === undefined);
  const gone = Object.keys(before).filter((n) => table[n] === undefined);

  for (const n of moved.slice(0, 8))
    console.log(`  moved  ${before[n]}s -> ${table[n]}s  ${n}`);
  if (added.length) console.log(`  added  ${added.join(", ")}`);
  if (gone.length) console.log(`  gone   ${gone.join(", ")}`);

  console.log("written to test/durations.json — run prettier over it");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

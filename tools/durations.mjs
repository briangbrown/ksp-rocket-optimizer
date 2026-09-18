#!/usr/bin/env node
/* Regenerate test/durations.json — how long each test file takes.

   The table is what test/shard-plan.ts packs the CI shards by. It is a
   measurement, like the tables in src/data/, and goes stale the same way: it
   costs time when it is wrong, never coverage. Nothing here can drop a test
   file, and test/sharding.test.ts is what holds that.

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
const report = join(scratch, "run.json");

try {
  console.log("running the suite, once, with the json reporter…");
  execFileSync(
    "npx",
    ["vitest", "run", "--reporter=json", `--outputFile=${report}`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const run = JSON.parse(readFileSync(report, "utf8"));
  const table = {};
  for (const file of run.testResults ?? []) {
    const rel = file.name.slice(root.length).replace(/\\/g, "/");
    /* Seconds to one decimal. The packing compares these against each other and
       nothing reads them to more precision than that; rounding keeps the diff
       readable when the table is regenerated. */
    table[rel] = Math.round((file.endTime - file.startTime) / 100) / 10;
  }

  const sorted = Object.fromEntries(
    Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  if (Object.keys(sorted).length === 0)
    throw new Error("the run reported no test files");

  writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);

  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  const worst = Object.entries(sorted).sort(([, a], [, b]) => b - a);
  console.log(
    `${Object.keys(sorted).length} files, ${total.toFixed(0)}s of CPU. ` +
      `Longest: ${worst
        .slice(0, 3)
        .map(([p, s]) => `${p} ${s}s`)
        .join(", ")}`,
  );
  console.log(`written to test/durations.json — run prettier over it`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

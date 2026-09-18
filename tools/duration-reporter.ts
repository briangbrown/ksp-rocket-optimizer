import { writeFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";

/* What a test file costs a worker, for test/durations.json.

   Why this exists rather than the json reporter, which is what
   `npm run test:durations` used first: that one reports each test's own start
   and end, and a file whose work happens while the module is being imported has
   no test to hang it on. `test/model.test.ts` builds the model of every mission
   at every staging step at module scope — that is the same reason it carries a
   note about a worker running out of memory when they were built twice — and
   the json reporter priced it at 0.2 seconds against the 87 it really takes.

   Priced at nothing, it sorted last, started two minutes into its shard on #478
   and held that shard open for 57 seconds after everything else had finished:
   exactly the thing the longest-first order exists to prevent, defeated by a
   wrong number rather than by a wrong rule.

   So the price is the whole of the worker's occupancy — the environment, the
   harness, the import, the setup file and the tests themselves. That is what
   packing needs, since it is what the slot is unavailable for. It is also what
   vitest's own reporter prints beside each file, which makes the table
   checkable against any CI log. */
export default class DurationReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const out = process.env.DURATIONS_OUT;
    if (!out) throw new Error("DURATIONS_OUT is not set");

    const root = `${process.cwd().replace(/\\/g, "/")}/`;
    const table: Record<string, number> = {};

    for (const mod of modules) {
      const d = mod.diagnostic();
      const ms =
        d.environmentSetupDuration +
        d.prepareDuration +
        d.collectDuration +
        d.setupDuration +
        d.duration;
      const rel = mod.moduleId.replace(/\\/g, "/").replace(root, "");
      /* Seconds to one decimal. The packing only ever compares these against
         each other, and rounding keeps the diff readable on a regeneration. */
      table[rel] = Math.round(ms / 100) / 10;
    }

    const sorted = Object.fromEntries(
      Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
  }
}

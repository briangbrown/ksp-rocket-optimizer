import { existsSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { durations, floorOf, planShards, priceOf } from "./shard-plan.js";
import ShardSequencer from "./sequencer.js";

/* That the shards are a partition.

   This is the check the packing cannot do without. A shard plan that drops a
   file does not fail — it passes, faster, having run fewer tests, and nothing
   downstream can tell the difference between a test that passed and a test that
   was never handed to a runner. Balance is a performance property and is allowed
   to drift as the table ages; coverage is not, and is held here for every shard
   count CI might plausibly use.

   The files come off disk rather than out of the table, so a test file added
   without regenerating the durations is still covered by all of this. */

/* The same set `vitest.config.js` collects — every `.test.ts` or `.test.tsx`
   under `test/`, at any depth — walked here rather than globbed, so this depends
   on nothing but node. If that `include` ever changes, this walk has to change
   with it, and the first assertion below is what notices. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : /\.test\.tsx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    )
    .sort();
}

const FILES = walk("test").sort();

const pieces = FILES.map((path) => ({ path }));

describe("the CI shard plan", () => {
  it("has files to plan, collected the way vitest collects them", () => {
    expect(FILES.length, "no test files found under test/").toBeGreaterThan(20);
    expect(FILES).toContain("test/sharding.test.ts");
  });

  for (const count of [1, 2, 3, 4, 5, 6]) {
    it(`runs every file exactly once across ${count} shard(s)`, () => {
      const bins = planShards(pieces, count);
      expect(bins).toHaveLength(count);

      const seen = bins.flat().map((p) => p.path);
      expect(
        seen.length,
        "a file was placed on more than one shard, or on none",
      ).toBe(FILES.length);
      expect([...seen].sort()).toEqual(FILES);
    });
  }

  /* The glue, not just the arithmetic above. This is the path CI takes: vitest
     hands the sequencer every spec with an absolute `moduleId`, asks each runner
     for its own row, and trusts the rows not to overlap. `relPath` turning those
     absolute paths back into the table's keys is the part that could silently
     stop matching — every file would price at the median, the packing would
     quietly become arbitrary, and nothing would fail. */
  it("partitions through the sequencer vitest is given", async () => {
    const root = process.cwd();
    const specs = FILES.map((path) => ({ moduleId: `${root}/${path}` }));

    const rows: string[][] = [];
    for (let index = 1; index <= 3; index++) {
      const seq = new ShardSequencer({
        config: { root, shard: { index, count: 3 } },
      } as never);
      const got = (await seq.shard(specs as never)) as unknown as {
        moduleId: string;
      }[];
      rows.push(got.map((s) => s.moduleId.slice(root.length + 1)));
    }

    expect([...rows.flat()].sort()).toEqual(FILES);
    /* Priced, not defaulted: if `relPath` stopped matching the table, every
       file would fall back to the median and the rows would come out equal in
       length instead of equal in weight. */
    const heavy = rows.map((r) => r.filter((p) => priceOf(p) > 30).length);
    expect(heavy.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(Math.max(...heavy) - Math.min(...heavy)).toBeLessThanOrEqual(1);
  });

  it("gives the same answer twice", () => {
    const a = planShards(pieces, 3).map((b) => b.map((p) => p.path));
    const b = planShards(pieces, 3).map((b) => b.map((p) => p.path));
    expect(a).toEqual(b);
  });

  it("does not care what order the files arrive in", () => {
    const shuffled = [...pieces].reverse();
    const a = planShards(pieces, 3).map((b) =>
      [...b].map((p) => p.path).sort(),
    );
    const b = planShards(shuffled, 3).map((b) =>
      [...b].map((p) => p.path).sort(),
    );
    expect(b).toEqual(a);
  });

  /* The guarantee the rule actually carries. A shard can never beat its own
     longest file, nor its total over the four workers a runner has; LPT lands
     within a third of that, and asserting the bound rather than a number of
     seconds keeps this true on a machine slower than the one that measured. */
  it("packs each shard within a third of what it could possibly do", () => {
    const WORKERS = 4;
    for (const count of [2, 3, 4]) {
      const bins = planShards(pieces, count).map((b) => b.map((p) => p.path));
      const ideal = floorOf(FILES, WORKERS * count);
      for (const [i, bin] of bins.entries()) {
        const load = bin.reduce((s, p) => s + priceOf(p), 0);
        expect(
          load / WORKERS,
          `shard ${i + 1} of ${count} carries ${load.toFixed(0)}s over ${WORKERS} workers against a floor of ${ideal.toFixed(0)}s`,
        ).toBeLessThanOrEqual(ideal * (4 / 3) + 1);
      }
    }
  });

  /* A heavy entry that no longer names a file is the one kind of staleness worth
     failing over: renaming the suite's longest file leaves the table pricing a
     ghost and the packing blind to the real one, which is exactly the imbalance
     this module exists to prevent. Ordinary drift — a new file, a number that
     has grown — is left alone and costs only time. */
  it("prices no heavy file that has been renamed away", () => {
    const ghosts = Object.entries(durations)
      .filter(([path, seconds]) => seconds > 30 && !existsSync(path))
      .map(([path]) => path);
    expect(
      ghosts,
      `test/durations.json prices these as heavy but they are gone; run \`npm run test:durations\``,
    ).toEqual([]);
  });
});

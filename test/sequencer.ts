import { BaseSequencer } from "vitest/node";
import { planShards, priceOf, relPath } from "./shard-plan.js";
import type { TestSpecification } from "vitest/node";

/* The sequencer vitest.config.js hands to vitest. `shard-plan.ts` is the
   arithmetic and the reasoning; this is the part that knows vitest's shapes.

   Both methods defer to the base class when `--shard` is absent. The table is a
   CI device: on a developer's machine vitest has its own cache of what each file
   actually took last time, which is a better answer than a committed snapshot of
   what it took on someone else's, and it also runs the files that failed last
   time first, which matters more locally than packing does. */
export default class ShardSequencer extends BaseSequencer {
  override async shard(
    specs: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const { shard, root } = this.ctx.config;
    if (!shard) return super.shard(specs);

    const pieces = specs.map((spec) => ({
      spec,
      path: relPath(root, spec.moduleId),
    }));
    return planShards(pieces, shard.count)[shard.index - 1]!.map(
      ({ spec }) => spec,
    );
  }

  /* Longest first, within the shard.

     This is not cosmetic. Four workers pick files off the front of this list, so
     a three-minute file that starts last holds the shard open for three minutes
     after everything else has finished. vitest's own order here is by file size
     in bytes whenever it has no cache to consult — which on a fresh CI runner is
     always — and bytes say very little about how long a test takes: the suite's
     longest file is a middling one on disk. */
  override async sort(
    specs: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const { shard, root } = this.ctx.config;
    if (!shard) return super.sort(specs);

    return [...specs].sort((a, b) => {
      const pa = relPath(root, a.moduleId);
      const pb = relPath(root, b.moduleId);
      const d = priceOf(pb) - priceOf(pa);
      return d !== 0 ? d : pa < pb ? -1 : pa > pb ? 1 : 0;
    });
  }
}

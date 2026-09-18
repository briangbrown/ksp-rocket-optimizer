import { readFileSync } from "node:fs";

/* Which test file runs on which CI shard, and in what order.

   vitest's own answer is to sort the files by the SHA-1 of their path and cut
   that list into equal counts. That is a good split for a suite whose files all
   cost about the same, and a poor one here: five files are most of the work, and
   on the run that introduced sharding (#474) all three of the heaviest landed
   together. That shard took 232s while the other two took 90s and 75s — equal
   counts of a very unequal suite.

   Two things follow from `maxWorkers` being the runner's four vCPUs. A shard
   cannot finish before its longest single file, since vitest gives a whole file
   to one worker and never splits it; and it cannot finish before its total
   divided by four. So the best a shard can do is the larger of those two, and
   what packing can fix is everything above it.

   The durations are measurements, in `durations.json`, regenerated with
   `npm run test:durations`. A file the table has not heard of is priced at the
   median of the ones it has, so a new test lands somewhere sensible and a stale
   table costs time rather than coverage — nothing here can drop a file, and
   `sharding.test.ts` is what holds that.

   The rule is longest-first into whichever shard is lightest so far. That is
   LPT, which no arrangement beats by more than a third, and for three bins it
   is not worth improving on. */

type Table = Readonly<Record<string, number>>;

const TABLE: Table = JSON.parse(
  readFileSync(new URL("./durations.json", import.meta.url), "utf8"),
) as Table;

/* Read as text rather than imported. This module is loaded by the sequencer,
   which vitest pulls in through its config rather than through the test
   pipeline, and a JSON import there depends on which bundler happens to be
   holding the file. `readFileSync` behaves the same everywhere. */

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const FALLBACK = median(Object.values(TABLE));

export const durations = TABLE;

/* Seconds, as the table records them. An unmeasured file is priced at the
   median rather than at zero: zero would pile every new test onto one shard,
   which is the failure this module exists to avoid. */
export function priceOf(path: string): number {
  return TABLE[path] ?? FALLBACK;
}

/* Repo-relative, forward slashes, no leading separator — the shape the table is
   keyed by, from the absolute path vitest carries. */
export function relPath(root: string, moduleId: string): string {
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  const m = moduleId.replace(/\\/g, "/");
  return m.startsWith(`${r}/`) ? m.slice(r.length + 1) : m.replace(/^\//, "");
}

export type Piece = { readonly path: string };

/* The assignment, as a whole. Every shard computes this from the same file list
   and then takes its own row, so the rows are a partition: what makes that true
   is that the order below is total — duration first, then path, which is unique
   — and that nothing here depends on which shard is asking. */
export function planShards<T extends Piece>(
  pieces: readonly T[],
  count: number,
): T[][] {
  const bins: T[][] = Array.from({ length: count }, () => []);
  const load = new Array<number>(count).fill(0);

  const order = [...pieces].sort((a, b) => {
    const d = priceOf(b.path) - priceOf(a.path);
    return d !== 0 ? d : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  for (const piece of order) {
    let best = 0;
    for (let i = 1; i < count; i++) if (load[i]! < load[best]!) best = i;
    bins[best]!.push(piece);
    load[best] += priceOf(piece.path);
  }
  return bins;
}

/* What a shard cannot beat however it is packed: its longest file, or its total
   spread over the workers, whichever is larger. `sharding.test.ts` measures the
   plan against this rather than against a wall-clock number, which would be a
   different assertion on every machine. */
export function floorOf(paths: readonly string[], workers: number): number {
  const times = paths.map(priceOf);
  const total = times.reduce((a, b) => a + b, 0);
  return Math.max(times.length === 0 ? 0 : Math.max(...times), total / workers);
}

# Benchmarks

Measurement for the solver work in [#22](../../../issues/22). **Not run in CI** —
these take minutes, they assert nothing, and their results depend on the machine.
`vitest.config.js` pins collection to `test/`, so nothing here can be picked up
as a test by accident.

## Running

```bash
npm run perf              # the 81-case grid, ~30s. Same cases as the design snapshot.
npm run perf:mission      # one whole mission through planMission, the way a user waits for it
npm run perf:save         # record the current numbers as your local baseline
npm run perf:compare      # run again and diff against that baseline
npm run perf:profile      # CPU profile into perf/.prof
```

`perf:mission` takes `--tier` (default 9) and `--repeat` (default 3, reports the
best). Tier 9 unlocks the whole tree and is where 93% of the cost lives; tier 5
is roughly fifteen times faster and is not representative of anything hard.

## The workflow that matters

```bash
git checkout main && npm run perf:save     # baseline this machine
git checkout my-optimisation && npm run perf:compare
npm test                                   # designs byte-identical?
```

**A speedup means nothing on its own.** Every optimisation on the #22 list is
supposed to be behaviour-preserving, so `test/__snapshots__/designs.txt` must come
out byte-identical. A faster solver that picks different rockets is not a faster
solver — it is a different solver, and an unverified one.

The grid imports its cases from `test/grid.js` rather than defining its own, so
the thing being timed is exactly the thing the snapshot pins. Do not fork it.

## Reading the numbers

Baselines are **machine-local** — `perf/baselines/local.json` is gitignored.
Comparing a laptop run against a container run measures the hardware. `compare.mjs`
warns when the Node version or CPU count differs, but it cannot detect a different
machine with the same shape, so keep baselines to one machine and re-save after
changing anything about it.

Absolute figures also do not transfer to phones. A Pixel 8 measured **~11× slower**
than this container on the same workload, and that ratio held to within 10% across
a 1.43× change — so container numbers are usable for planning if you apply the
multiplier, and misleading if you do not. See [#30](../../../issues/30).

Two runs of the same code differ by a few percent. `compare.mjs` only lists cases
that moved more than 5%; treat anything smaller as noise unless it is consistent
across runs.

## Call counts

The most useful measurement in #22 was not a timing — it was that `ispAt` is
called 124 million times and has 116 distinct answers. That kind of number needs
instrumentation inside the function, because ES module bindings mean wrapping an
export does not intercept the module's own internal calls.

It is not committed, because a counter on a hot path costs what it measures. The
recipe, when you need it:

1. Add a module-level `export const PERF = { calls: 0, keys: new Set() }`.
2. In the function, `PERF.calls++` and `PERF.keys.add(<the arguments>)`.
3. Import `PERF` in `run.js` and print it at the end.
4. Revert before committing.

The ratio of calls to distinct keys is what tells you whether something is a
memoisation candidate. Note from #26 that a _large_ ratio is necessary but not
sufficient: `couplerFor` had a repeat factor of 101,000 and a string-keyed cache
still gained under 1%, because building the key allocated on every call. How a
memo is keyed matters as much as whether it exists.

## Profiling

```bash
npm run perf:profile
```

Writes a `.cpuprofile` to `perf/.prof`. Load it in Chrome DevTools (Performance →
Load profile), or read self time straight out of the JSON — `nodes` plus `samples`
is enough to aggregate by function.

For the device profile in #30, this harness is the wrong tool: use
`chrome://inspect` against the phone and record the deployed app.

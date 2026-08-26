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
npm run perf:profile                     # writes a .cpuprofile to perf/.prof
node perf/profile.mjs <profile>          # self time per function
node perf/profile.mjs <a> <b>            # two profiles side by side
```

`profile.mjs` reads both shapes Chrome produces — a raw `.cpuprofile` from
`--cpu-prof`, and a DevTools Performance trace `.json`, which is what a phone
gives you. It weights by `timeDeltas` rather than counting samples, because
sampling is not evenly spaced and is much less evenly spaced on a loaded phone.

**Noise floor:** two runs of identical code in this container agree within 0.6
percentage points on real functions, but GC moved 1.2pp between runs. Treat a
GC difference under about 2pp as noise.

## Profiling on a device (#30)

Every priority in #22 comes from a container profile, and there is evidence the
phone ranks these differently — the memoisation gained 1.43× on a Pixel 8 against
1.53× here. This is how to check.

**1. Make the device run the same mission.** On the deployed site, a hard reload
followed by clicking tier 9 already is the benchmark configuration. Nothing
persists there — the roster is saved through `window.storage`, the Claude
artifact API, which does not exist in a browser and has no `localStorage`
fallback (#35). So there is no stale state to guard against, and the app's
defaults match `missionInput()` exactly.

If that is ever fixed, or you are measuring somewhere state does survive:

```bash
npm run perf:config          # prints a KSP-PLANNER string, tier 9, Mun
```

Paste it into **Load configuration**. `test/perf-config.test.js` keeps that
string honest — `parseConfig` counts unrecognised fields rather than failing, so
a rename would leave you measuring the defaults and not knowing.

Getting a 1.5 kB string onto a phone is awkward, and there is a trick: the
DevTools window for a remote target runs on your **desktop**, so paste into that
Console and it executes on the phone. React ignores a plain `.value` assignment
on a controlled textarea, so it needs the native setter and an input event:

```js
const ta = document.querySelector("textarea");
const set = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value",
).set;
set.call(ta, "KSP-PLANNER {…}");
ta.dispatchEvent(new Event("input", { bubbles: true }));
```

**2. Connect the phone.** Developer options → USB debugging, plug in, accept the
prompt. On the desktop open `chrome://inspect#devices`; the phone's tab appears
under Remote Target. Click **inspect**.

**3. Record.** In the DevTools window that opens, Performance → record, trigger
the solve on the phone, stop when the design appears. Leave the default capture
settings — JS sampling has to be on, and "screenshots only" produces a trace with
no profile in it.

**4. Export and read it.** Save the recording (download icon) and:

```bash
npm run perf:profile                                  # fresh container profile
node perf/profile.mjs perf/.prof/CPU.*.cpuprofile ~/Downloads/<device>.json
```

The second file is the device. The output ranks by the device and shows how each
share shifted, because the question is not which machine is faster — it is
whether they agree on what the bottleneck is.

**What to look for**

- **GC share** against the container's ~3.8%. If it is materially higher, #28
  (allocations) moves ahead of #27 (root-find).
- Whether `boostedAscent` + `dvOf` still total around 57%.
- Whether the `Map`/`WeakMap` lookups added by #26 are visible.
- Any main-thread time that is not solver work — layout, or the SVG build view
  redrawing.

Worth capturing against both builds for comparison: production, and the memoised
prototype at `perf/solver-baseline`.

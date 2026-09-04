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

The grid imports its cases from `test/grid.ts` rather than defining its own, so
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
3. Import `PERF` in `run.ts` and print it at the end.
4. Revert before committing.

The ratio of calls to distinct keys is what tells you whether something is a
memoisation candidate. Note from #26 that a _large_ ratio is necessary but not
sufficient: `couplerFor` had a repeat factor of 101,000 and a string-keyed cache
still gained under 1%, because building the key allocated on every call. How a
memo is keyed matters as much as whether it exists.

## Profiling

```bash
npm run perf:profile                     # CPU profile into perf/.prof
npm run perf:heap                        # heap profile into perf/.prof
node perf/profile.mjs <profile>          # self time per function
node perf/profile.mjs <a> <b>            # two profiles side by side
```

**A CPU profile will not find an allocation problem.** `simplify` in `tanks.ts`
is 84% of everything the solver allocates and 0.5% of its CPU time — cheap work
and expensive garbage, invisible to sampling by time. `--heap-prof` attributes
allocation by function instead. Read it with:

```bash
node --input-type=module -e "
import { readFileSync, readdirSync } from 'node:fs';
const f = 'perf/.prof/' + readdirSync('perf/.prof').find(x => x.endsWith('.heapprofile'));
const p = JSON.parse(readFileSync(f, 'utf8'));
const self = new Map(); let total = 0;
(function w(n){ const k = (n.callFrame||{}).functionName || '(anon)';
  if (n.selfSize) { self.set(k, (self.get(k)||0) + n.selfSize); total += n.selfSize; }
  (n.children||[]).forEach(w); })(p.head);
for (const [k,v] of [...self].sort((a,b)=>b[1]-a[1]).slice(0,10))
  console.log((100*v/total).toFixed(1).padStart(5)+'%  '+(v/1e6).toFixed(1).padStart(7)+' MB  '+k);
"
```

It attributes to a **frame**, not a line, and V8 credits an inlined callee's
allocation to its caller — so a large number against one function is a place to
start bisecting, not an answer. See #28, where three plausible fixes to
`simplify` all left the figure unmoved.

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
followed by clicking tier 9 is the benchmark configuration. The mission settings
are not persisted, so those come up at the app's defaults, which match
`missionInput()` exactly.

The roster is persisted (#35), so it does not: a phone that has been measured on
before comes back at whatever tier it was left on, and clicking 9 when it is
already 9 changes no state and starts no solve. Read the tech-tree header rather
than assuming the reload reset it, or clear it from the remote DevTools Console
before you start:

```js
localStorage.removeItem("ksp-planner:roster"); // then reload
```

**Thread count.** The sharded search (#50) sizes its pool from
`hardwareConcurrency` — one per core bar the orchestrator on a desktop, half
the cores on a phone. The two differ because a phone's cores do:

    Pixel 8, full-tech Mun, best of three

      serial      10.5 s
      4 threads    5.1 s    2.06x
      8 threads    5.6 s    1.88x

More threads is slower there. Four of a Tensor G3's nine cores are A510s, a
unit takes about three times as long on one, and the pool waits on it. Append
`?threads=N` to re-check that on another device — the search line at the foot
of the setup sheet reports what it actually used, so a fallback to one thread
cannot be mistaken for a poor result. **Take the best of three**: single readings on a
phone vary by 0.7 s, which is wider than the difference being measured.

    https://ksp-rocket-optimizer.pages.dev/?threads=4

To measure a roster the tier chips do not describe:

```bash
npm run perf:config          # prints a KSP-PLANNER string, tier 9, Mun
```

Paste it into **Load configuration**. `test/perf-config.test.ts` keeps that
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

**2. Connect the phone.**

- Settings → About phone → tap **Build number** seven times.
- Settings → System → Developer options → **USB debugging** on.
- Plug into the desktop with a **data** cable; charge-only cables enumerate but
  carry no ADB.
- Unlock, accept **Allow USB debugging?**, tick _Always allow_. No prompt means
  a stale authorisation — _Revoke USB debugging authorisations_, replug.
- Desktop Chrome → `chrome://inspect#devices`, **Discover USB devices** ticked.
- Open the app on the phone. Its tab appears under the device; click **inspect**.
  A DevTools window opens on the desktop, driving the phone's tab.

If the device never appears it is almost always the cable or an unaccepted
prompt. `adb devices` distinguishes the two: `unauthorized` versus absent.

**3. Set up the capture.**

- Performance panel → gear → **Disable JavaScript samples must be UNCHECKED**.
  With it on you get a trace containing no profile at all, which is the one
  setting that silently wastes the whole run. `profile.mjs` will tell you, but
  only after you have already recorded.
- CPU throttling **No throttling** — the phone is the slow device under test.
- Network panel → **Disable cache**, then Ctrl/Cmd-R with the DevTools window
  focused to reload the phone bypassing cache. Both builds serve from the same
  Cloudflare project, so without this you can get the other build's bundle.

**4. Record.** Click ● (Ctrl/Cmd-E). On the **phone**, open setup (the gear
in the header), expand _Tech tree_, then under _Unlock through tier:_ tap
**9**. Wait for the rocket — about 20 s on production. Stop.

A solve that long heats the phone. Leave a minute between runs, or alternate
builds rather than running either twice in a row; thermal throttling will
otherwise look like a result.

**5. Export and read it.** The download arrow in the Performance toolbar saves a
`.json` trace. Then:

Copy the exported trace into **`perf/traces/`** and run:

```bash
npm run perf:device
```

That takes a fresh container profile, builds sourcemaps for the deployed
bundles, and compares the two. Both directories resolve to the newest file in
them, so nothing has to be renamed.

`--map` on a directory loads **every** map in it and picks one per frame by the
bundle the frame came from. It has to: the application is no longer one file,
and a device trace spans several of them — the solve runs in `solver.worker`
and the interface that starts it is in `index`. A frame whose bundle matches
none of the maps is left minified and warned about once, which is the case
where the profile and the build are different commits.

**Comparing two device traces is a different job**, and one set of maps cannot
do it: two deployments have different content hashes, so maps built from one
commit describe one of the traces and none of the other. Name the pair, and
read the named half:

```bash
node perf/profile.mjs perf/traces/<prod>.json perf/traces/<branch>.json --map dist/assets
```

Only the last profile is mapped, so build the commit whose trace you want named.

`perf/traces/` is gitignored apart from its `.gitkeep`. It lives inside the
repository because a dev container cannot read anything outside it, and a 35 MB
trace has no business in source control — one reached `main` before this
existed.

The long form, if you want a specific pair:

```bash
node perf/profile.mjs perf/.prof/<a>.cpuprofile perf/traces/<b>.json --map dist/assets
```

**A device profile carries minified names** — `r`, `Mt`, `m` — because it ran the
production bundle. `--map` resolves them.

Nothing is deployed to make this work and no source is exposed. The build is
reproducible, and `--sourcemap hidden` appends no `sourceMappingURL` comment, so
the JavaScript is byte-identical to what shipped — same content hash. A map built
locally therefore describes exactly the bundle the phone ran.

That only holds for the commit that was deployed **when the profile was taken**.
If the trace predates a change to `src/`, the bundle hash differs and the map
does not describe it:

````bash
git stash && git checkout <deployed-commit>
npm run perf:map
git checkout - && git stash pop
``` `profile.mjs` compares the map's
filename against the bundle in the profile and warns rather than resolving every
frame to a plausible-looking wrong name.

The map's `names` array is empty — this minifier does not record original
identifiers — so names come from `sourcesContent` instead: map the frame to a
line of original code, then scan upwards for the enclosing declaration. Nested
closures resolve correctly, a closure inside `boostedAscent` before its parent.

Pass the **directory** and it takes the newest profile in it, printing which.
Do not glob: `perf/.prof/CPU.*.cpuprofile` expands to every profile you have ever
taken, which puts a container profile in both slots and the device trace nowhere.
The output then looks entirely reasonable — every share inside the noise floor —
because comparing a machine against itself is what it is showing. `profile.mjs`
refuses more than two files now, and strips ANSI codes, since `$(ls -t …)` picks
those up wherever `ls` is aliased to a colourising one.

The second file is the device. The output ranks by the device and shows how each
share shifted, because the question is not which machine is faster — it is
whether they agree on what the bottleneck is.

**What to look for**

- **GC share** against the container's ~3.8%. If it is materially higher, #28
  (allocations) moves ahead of #27 (root-find).
- Whether `boostedAscent` and what it calls still total around 57%.
- Whether the `Map`/`WeakMap` lookups added by #26 are visible.
- Any main-thread time that is not solver work — layout, or the three.js build
  view redrawing.

Worth capturing against both builds for comparison: production, and whatever
branch carries the change being measured.
````

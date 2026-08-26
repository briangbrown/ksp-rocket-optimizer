# Working on this

## Verification that matters

Three checks caught nearly every regression during development. All three now
run as `npm test` and gate CI; the sections below record what each is for and,
just as importantly, what it cannot see.

**A design snapshot.** Solve a fixed grid of configurations — tech tiers,
payloads, delta-v budgets, objectives, slenderness limits — and record a
signature per stage: every part, every quantity, stage mass to four decimals,
delta-v to three. Any change that is meant to be behaviour-preserving must leave
all of them byte-identical. Consolidating duplicated geometry, caching part
diameters, and memoising the tank picker were each verified this way, and one
"harmless" refactor turned out to change 31 of 72 designs.

**A render sweep.** Render the app across destinations and objectives and fail on
`NaN`, `Infinity`, `null` or `undefined` appearing in the output. This caught a
crash-on-load from a `const` used before its declaration that neither the linter
nor the bundler flagged.

**Panel containment.** Every part lies inside its panel at every staging step —
the elevation and the geometry have drifted apart three separate times.

## Lint before bundling

`eslint` with `no-undef` caught several bugs that esbuild compiled happily: a
constant referenced before definition, a variable used outside its scope, a
helper renamed in one place but not another. The bundler will not tell you about
any of them.

> **This check is currently missing.** There is no `.eslintrc.json` in the
> repository and eslint is not a dependency, so the command this section used to
> quote cannot be run. The render sweep catches the first of those three cases,
> because a module-scope TDZ error throws on import — but a helper renamed in one
> place and not another, on a branch the grid does not reach, would pass
> everything today. See [#8](../../../issues/8).

## Where the bodies are buried

- **`stageGeom` is the single source of stage geometry.** `stageSize` sums it
  into a bounding box; the elevation lays it out as rectangles. They drifted apart
  on width, then height, then packing — do not recompute either one locally.
- **`fitStructure` is shared between `solveStage` and `boostedAscent`.** Five
  bugs came from fixing one and not the other: couplers, the thrust limiter, the
  gimbal check, the cluster cap, and a missing decoupler quantity.
- **Stage solutions are shared between candidate chains.** Writing to one leaks
  into another. The tank-packing pass copies before it writes, for exactly this
  reason.
- **`adapterChain` only walks narrow to wide.** `adapterGraph` keys its edges
  small>large and `walk` never moves down, so spanning a narrow tank up to a
  wider coupler is `adapterChain(tanks, stackD, under)`. Asked the other way it
  hits the `from >= to` guard and returns an empty chain — silently, every time.
  That is how the entire adapter subsystem sat dead: not one design in the
  snapshot carried an adapter, so nothing ever looked wrong.
- **The adapter caches are keyed on the tank array, like `poolsFor`.** They were
  a bare `let` and a bare `Map`, built once from whichever roster asked first.
  An empty `Map` is truthy, so a first roster with no adapters pinned the graph
  empty for the life of the module.
- **Slenderness is a constraint, not a tie-break.** The simulation walk once fell
  through every compliant design and returned a 30.6:1 stack under a 14:1 limit.

## Running the checks

All three checks are implemented and gate CI. Together they take about 37
seconds.

```bash
npm test           # design snapshot + render sweep + panel containment
npm run test:bless # accept current output as the new baseline
```

    test/grid.js                          the configuration grid and its axes
    test/signature.js                     reducing a design to stable text
    test/design-snapshot.test.js          the design snapshot
    test/render-sweep.test.jsx            the render sweep
    test/panel-containment.test.jsx       every part inside its panel
    test/seam-contract.test.js            planMission stays serialisable
    test/__snapshots__/designs.txt        solver baseline
    test/__snapshots__/solvability.txt    which destinations build, and how big

The grid is 81 configurations — three tech tiers, three payloads, three delta-v
budgets, three objectives — of which 66 produce a design and 15 are legitimately
unbuildable at that tech level. It takes about 35 seconds on its own, and is
what makes the suite as a whole cost what it does — the other two checks run
alongside it rather than after it.

**Re-bless deliberately.** A diff means the physics changed. When that is what
you intended, run `npm run test:bless` and record the before and after in the
commit message. Never re-bless to turn a red build green: a diff you cannot
explain is precisely the bug this test exists to catch.

Its reach has limits worth knowing. It drives `solveGroup`, so it covers the
design solver but not `buildRoute`, `missionHardware`, or the simulator-guided
candidate walk. Those are now reachable — they live in `src/core/plan.js` behind
`planMission` — so extending the grid to solve by destination rather than by raw
delta-v budget is the obvious next move, and nothing structural is in the way.

## What the render sweep catches, and what it cannot

It mounts the real application in jsdom and drives it across every destination,
objective and profile. Three things are asserted: no `NaN`, `Infinity`,
`undefined` or `null` in the rendered text; the module loads at all; and the
same destinations still produce a design, recorded in `solvability.txt` as
liftoff mass and stage count.

That third assertion is not part of the original description of this sweep, and
it turned out to be the one that earns its keep. `fmt` converts every non-finite
number to an em-dash before display, so a `NaN` travelling through any `Stat` is
invisible to a text scan — forcing liftoff mass to `NaN` produced no textual
trace at all. What a reader would actually notice is the design collapsing into
a row of dashes, so that is what is checked.

**A bad number in a CSS value cannot be caught this way.** The CSSOM validates
on assignment and silently discards what it cannot parse, so `width: NaN%`,
`width: undefinedpx` and `opacity: NaN` leave no trace — reading the attribute
back returns null rather than the bad value. This is true of real browsers as
much as jsdom, so no DOM scan will find them. Only string-valued properties
survive to be seen, `font-family: NaN` being the type case.

Catching a bad number in the drawing is what the panel-containment check does
instead, and it works because it reads a different thing entirely.

## Panel containment

Every part drawn in the build view must lie inside its panel, at every staging
step. This reads the SVG shapes directly — the elevation's rectangles and the
plan view's circles — and compares each bounding box against the panel it sits
in. **SVG geometry lives in attributes, not CSS**, so jsdom preserves `x`, `y`,
`width`, `height`, `cx`, `cy` and `r` exactly, which is why this succeeds where
the style scan cannot.

It covers ten destinations across every staging step, plus all three objectives
on Dres, checking between 4 and 37 shapes per step. The elevation is drawn with
overflow visible, so an escaping part is never clipped — it just overlaps the
rest of the page, which is why nothing throws when this goes wrong.

Verified by removing the booster reach from the `wMax` estimate in `BuildView`,
which is the historical failure: the check reported the escape per destination
and staging step, in pixels.

One latent inconsistency turned up while writing it, left alone rather than
"fixed" on speculation. `wMax` picks one term per part — pack, else parallel
stacks, else plain width — but a packed tank part carries both `pack` and `S`,
and the renderer runs both loops. A part both packed and on parallel stacks
would draw out to 1.52 × td while the estimate counted only `pack.w / 2`. It
does not arise: of the 153 stages the snapshot grid produces, 23 are packed and
4 run parallel stacks, and none are both. If a change ever makes that
combination reachable, this check is what will catch it.
[#9](../../../issues/9).

## Layout

    src/data/   part tables, bodies, curves — JSON, no logic
    src/core/   solver and physics. No React, no DOM, no imports from ui.
    src/ui/     the application

`src/core/plan.js` is the seam. `planMission(input, { signal, onYield })` takes a
destination and a payload and returns solved stages, and everything crossing it
is plain data — no `Set`, no `Map`, no object identity. That is what lets the
solver later become a Web Worker or a Rust/WASM module without the UI changing,
and `test/seam-contract.test.js` fails the day it stops being true.

It has already earned its place. `groups` used to arrive as arrays of the same
leg objects held in `route`, and `route.indexOf(legs[0])` depended on that
identity; JSON duplicates rather than shares, so a round trip returned -1 and
the split-point lookup broke silently. Nothing else in the suite could see it,
because in-process every caller passes the shared objects.

## Benchmarks

`perf/` holds the solver benchmarks. They are deliberately outside CI —
`vitest.config.js` pins collection to `test/`, so nothing there can be collected
as a test by accident.

```bash
npm run perf          # the 81-case grid, same cases as the design snapshot
npm run perf:mission  # one whole mission, the way a user waits for it
npm run perf:save     # baseline this machine
npm run perf:compare  # run again and diff
```

The workflow is baseline on `main`, compare on the branch, **then run `npm test`
and confirm the design snapshot has not moved.** Every optimisation on the #22
list is supposed to be behaviour-preserving; a faster solver that picks different
rockets is a different solver. `perf/README.md` has the rest, including why
baselines are machine-local and how to add call counters.

## Open work

Everything known to be outstanding is filed. In rough order of what unblocks
what:

|                           |                                           |                                                                       |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| ~~[#7]~~                  | ~~Extract the mission orchestration~~     | Done — it lives in `src/core/plan.js`                                 |
| [#8](../../../issues/8)   | Restore the eslint `no-undef` check       | Small, independent, closes a gap nothing else covers.                 |
| [#9](../../../issues/9)   | `wMax` picks one term per part            | Latent, not live. Needs a reachable case before it is worth touching. |
| [#10](../../../issues/10) | Richer pitch program for the gravity turn | The largest open problem — see below.                                 |
| [#11](../../../issues/11) | Convert the source to TypeScript          | Now affordable; the snapshot is the guardrail.                        |

Converting to TypeScript before the snapshot existed would have meant a
mechanical diff across roughly 2,560 lines of physics and part tables with
nothing able to detect a silently changed result — the exact failure this
document records. That guardrail is now in place.

## The largest open problem

The gravity turn takes two parameters — kick speed and kick angle — and follows
prograde thereafter. That is enough for most rockets and badly wrong for low
thrust-to-weight stacks, where it overstates the ascent cost by up to 44% and
sometimes cannot reach orbit at all. Fixing it means a richer pitch program: a
third parameter, or a pitch schedule against altitude, rather than more
accounting patches. [#10](../../../issues/10).

It is worth being clear that this is the one item on the list that is _supposed_
to move the design snapshot. Every other change should leave it byte-identical;
this one should not, and the before and after belong in the commit message.

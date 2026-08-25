# Working on this

## Verification that matters

Two checks caught nearly every regression during development, and both are worth
keeping if the file is refactored.

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

For drawing changes, additionally check that every part lies inside its panel at
every staging step — the elevation and the geometry have drifted apart three
separate times.

## Lint before bundling

`eslint --no-eslintrc -c .eslintrc.json` with `no-undef` caught several bugs that
esbuild compiled happily: a constant referenced before definition, a variable
used outside its scope, a helper renamed in one place but not another. The
bundler will not tell you about any of them.

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
- **Slenderness is a constraint, not a tie-break.** The simulation walk once fell
  through every compliant design and returned a 30.6:1 stack under a 14:1 limit.

## Running the checks

Both checks are implemented and gate CI. Together they take about 35 seconds.

```bash
npm test           # design snapshot + render sweep
npm run test:bless # accept current output as the new baseline
```

    test/grid.js                          the configuration grid and its axes
    test/signature.js                     reducing a design to stable text
    test/design-snapshot.test.js          the design snapshot
    test/render-sweep.test.jsx            the render sweep
    test/__snapshots__/designs.txt        solver baseline
    test/__snapshots__/solvability.txt    which destinations build, and how big

The grid is 81 configurations — three tech tiers, three payloads, three delta-v
budgets, three objectives — of which 66 produce a design and 15 are legitimately
unbuildable at that tech level. It takes about 35 seconds.

**Re-bless deliberately.** A diff means the physics changed. When that is what
you intended, run `npm run test:bless` and record the before and after in the
commit message. Never re-bless to turn a red build green: a diff you cannot
explain is precisely the bug this test exists to catch.

Its reach has limits worth knowing. It drives `solveGroup`, which is the design
solver. It does not cover `buildRoute`, `missionHardware`, or the
simulator-guided candidate walk, because those live inside the component's
effect and are not callable from a test yet. Extracting that orchestration into
a plain function is the next thing worth doing, and the snapshot now covers
enough to make it safe.

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

Catching a bad number in the drawing therefore needs assertions on the geometry
itself. `stageGeom` and `stageSize` are pure functions, so the check this
document describes elsewhere — every part lying inside its panel at every
staging step — is straightforward to write against them directly and does not
need a DOM at all. **That check is not implemented.** It is the most valuable
remaining piece, given the elevation and the geometry have drifted apart three
separate times.

## Planned follow-up

1. **The panel-containment geometry check**, per above.
2. **Extract the orchestration** out of the component's effect — `buildRoute`,
   `missionHardware` and the simulator-guided candidate walk are not reachable
   from a test, so the design snapshot covers the solver rather than the full
   destination-to-design pipeline.
3. **Then convert the source to TypeScript**, with these checks as the guardrail.

Converting before the snapshot existed would have meant a mechanical diff across
roughly 2,560 lines of physics and part tables with nothing able to detect a
silently changed result — the exact failure this document records, where a
refactor believed to be behaviour-preserving altered 31 of 72 designs. That
guardrail is now in place, so the conversion is affordable whenever you want it.

## The largest open problem

The gravity turn takes two parameters — kick speed and kick angle — and follows
prograde thereafter. That is enough for most rockets and badly wrong for low
thrust-to-weight stacks, where it overstates the ascent cost by up to 44% and
sometimes cannot reach orbit at all. Fixing it means a richer pitch program: a
third parameter, or a pitch schedule against altitude, rather than more
accounting patches.

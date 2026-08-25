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

## The largest open problem

The gravity turn takes two parameters — kick speed and kick angle — and follows
prograde thereafter. That is enough for most rockets and badly wrong for low
thrust-to-weight stacks, where it overstates the ascent cost by up to 44% and
sometimes cannot reach orbit at all. Fixing it means a richer pitch program: a
third parameter, or a pitch schedule against altitude, rather than more
accounting patches.

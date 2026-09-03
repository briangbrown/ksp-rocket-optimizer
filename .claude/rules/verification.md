---
paths:
  - "test/**"
  - "visual/**"
  - "perf/**"
---

# What each check is for, and what it cannot see

`CLAUDE.md` carries the contract — never re-bless a red build, and what none of
these reach. This is the detail: what each one actually does, and the map of the
files.

**The design snapshot** solves a fixed grid of 81 configurations — three tech
tiers, three payloads, three delta-v budgets, three objectives — and compares
every resulting design against a committed baseline, part by part, mass to four
decimals and delta-v to three. 66 produce a design; the other 15 are legitimately
unbuildable at that tech level. It is the check that matters here, because the
characteristic failure in this codebase is silent — a refactor believed to be
behaviour-preserving once altered 31 of 72 designs without erroring. It is also
what makes the suite cost what it does; the other checks run alongside it rather
than after it.

**The render sweep** mounts the app in jsdom and drives it across every
destination, objective and profile. It asserts three things: no `NaN`,
`Infinity`, `undefined` or `null` in the rendered text; that the module loads at
all; and that the same destinations still produce a design, recorded in
`solvability.txt` as liftoff mass and stage count. That third assertion is the
one that earns its keep — see the `fmt` entry below for why a text scan alone is
not enough.

**The model checks** stand where the panel-containment check used to. That one
read the SVG rectangles out of jsdom and asserted every part lay inside its
panel; #63 step 4 deleted the SVG, and jsdom has no WebGL to draw a replacement,
so there is nothing left to read. The questions moved to `modelOf` instead,
which is stronger: no two parts overlap, the bottom stage reaches no further
than `stageSize` says it does, the model stands exactly as tall as
`stackGeometry` measured it for the slenderness limit, and every camera's
frustum covers it. A part overlapping another is a rocket that cannot be built,
whatever it is drawn with, where containment only ever said the drawing was
tidy.

The walk is the build view's own — `stagingSteps` and `stepModels` are exported
from `build.tsx` and called by both the component and the test, so what is
checked is what a user is shown, including the boosters-away step that the
solver knows nothing about. Containment in the 3D view is true by construction:
`fitOrtho` sizes the frustum from the same extent the panel is sized from, and
`test/three-view.test.ts` pins that arithmetic without a renderer.

**The visual suite** is what does reach the drawing. `npm run test:visual`
builds the application, serves it, and drives it through a real WebGL context in
headless Chrome — jsdom implements none, so `canRender3D()` is false in every
test under `test/` and the build view there takes a path no user takes. It
checks that a shader compiled and something was drawn, that each canvas is the
size of its panel at a device pixel ratio above one, that the drawing survives a
repaint, that the plan redraws when a stage is dropped, that the outline colour
appears at all, and that the console stayed quiet.

Each of those is a bug that shipped past a green build. Reintroduce
`setSize(w, h, false)` and one test fails; drop `preserveDrawingBuffer` and four
do; break a line of GLSL and three do, one of them naming the compiler error.

It asserts properties of the pixels rather than comparing against a golden
image, on purpose: SwiftShader is not promised to be stable to the pixel across
versions, and a baseline whose diffs nobody can explain is a cost this
repository has already priced. It is a separate script and a separate CI job —
the main suite is minutes long and `test/model.test.ts` records a worker running
out of memory when the mission models were built twice.

**The layout suite**, `visual/layout.test.ts`, runs in the same job and
measures the UI's budgets the way the design snapshot measures the solver's:
at 390 px with touch and at 1280 px, the page's height, its visible words,
whether anything is wider than its box, how much text is under 12 and 13 px,
how many pressable things are under 44 px (phone) or 24 (desktop), how many a
keyboard cannot reach, and what axe objects to at WCAG 2 A and AA. Each has a
number at the top of the file that is what the application measured the day
it was written, and the assertion is that it has not grown. A pull request
that improves one lowers it in the same commit. The screenshots and the
numbers go to `visual/.out/`, gitignored and uploaded as the `layout`
artefact, for a person — never compared.

The same page is then switched to the light theme with
`page.emulateMediaFeatures`, screenshotted again as `<screen>-light.png`, and
axe is run a second time; `color-contrast` is held at zero in each theme
rather than folded into the axe budget, because contrast is the one rule a
theme can break on its own. Headless Chrome answers `light` to
`prefers-color-scheme` when nothing says otherwise, so `open()` in
`visual/browser.ts` pins dark before `goto` — a page opened without that
measures one theme and samples the other's palette. #131

What it finds is decided by `visual/measure.ts`, which runs inside the page:
a target is a form control or anything with a pointer cursor whose parent has
none, which is how a `div` with an `onClick` is counted; text is measured on
the element that owns it, not inherited. What it cannot see: a real GPU, a
real phone's address bar or keyboard, a thumb, or whether the words it counted
are the right ones. Reintroduce a 10 px label, a 16 px button, a 3,000 px
table or a clickable `div` and it names each one.

Two things it learned the hard way. A `Choice` keeps one chip in the Tab
order and reaches the rest by arrow key — that is what a radiogroup is — so
the Tab walk marks a chip reached when its group was, or every choice on the
page reads as unreachable. And `scrollWidth` counts an absolutely positioned
descendant even at `opacity: 0`, so a tooltip that is merely transparent
while hidden turns every icon button's row into "scrolling sideways"; the
`IconButton` tooltip is `display: none` until shown for this reason, not a
styling preference.

One thing it has to be told: `settle` waits for the solver, and a staging
transition has nothing to do with the solver. Sampling a panel before the
separation has finished reads a frame of the animation as though it were the
step, which is how the plan check started failing on steps that were perfectly
fine.

It still says nothing about a real GPU, about performance, or about a phone.

**The mission sweep** solves thirteen whole missions through `planMission` — four
destinations by three payloads at tier 9 — and pins the delivered stages against
a baseline. It exists because the design snapshot reads `best` and the
application does not: for an auto-stage-count launch, `planMission` walks `byK`
cheapest-first through the ascent simulator, delivers the first candidate that
flies, and then re-solves against the flown cost. Dropping the cluster-cap
variant left every one of the 81 grid _designs_ untouched and moved three of
these. Re-bless it exactly as deliberately as the design snapshot.

The thirteenth is the odd one out and is there on purpose: it is cut into
segments, which none of the other twelve are. Cuts are how a user says "this
part flies on its own hardware", and until #102 they were also the only way to
reach a whole branch of the slenderness constraint — so a change to it was
invisible to every baseline here.

    test/grid.ts                          the configuration grid and its axes
    test/signature.ts                     reducing a design to stable text
    test/app-harness.ts                   driving the app in jsdom
    test/framing.ts                       whether a camera sees the whole rocket
    test/must.ts                          an expectation the compiler can read
    visual/browser.ts                     chromium with a software WebGL context
    visual/pixels.ts                      reading a canvas back as numbers
    visual/render.test.ts                 what the build view actually draws
    visual/measure.ts                     the layout suite's in-page measurements
    visual/layout.test.ts                 the UI's budgets, held
    test/design-snapshot.test.ts          the design snapshot
    test/render-sweep.test.tsx            the render sweep
    test/model.test.ts                    the rocket as shapes, checked as shapes
    test/parts-order.test.tsx             the parts list reads as a build order
    test/separation.test.ts               what a staging animation does, on numbers
    test/slenderness.test.ts              the limit is on the whole rocket
    test/staging-figures.test.tsx         the figures follow the staging step
    test/three-view.test.ts               the orthographic framing, on numbers
    test/seam-contract.test.ts            planMission stays serialisable
    test/seam-input.test.tsx              what the app actually hands the seam
    test/resolve-wiring.test.tsx          does a control change re-solve
    test/solver-client.test.ts            the worker message protocol
    test/mission-sweep.test.ts            what planMission actually delivers
    test/shard.test.ts                    the sharded search folds back in order
    test/__snapshots__/designs.txt        solver baseline
    test/__snapshots__/missions.txt       delivered-design baseline
    test/__snapshots__/solvability.txt    which destinations build, and how big

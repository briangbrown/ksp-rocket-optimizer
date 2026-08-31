# CLAUDE.md — ksp-rocket-optimizer

Agent instructions for Claude Code working in this repository.

**Read ["Where the bodies are buried"](#where-the-bodies-are-buried) before
changing `src/core/`.** It records the traps that have caused repeat
regressions — shared stage solutions, the `stageGeom` / `stageSize` / elevation
triangle, `fitStructure` being reached from two callers.

---

## Branch protection

`main` is protected, and protection is enforced for administrators. Direct
pushes are rejected by the server. Every change goes through a branch and a pull
request, and the `build` check must pass before the PR can merge.

Do not attempt to push to `main`, including for one-line documentation fixes.

---

## Development commands

```bash
npm run dev        # Vite dev server, hot reload
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # the whole suite — see Verification below
npm run test:bless # accept current solver output as the new baseline
npm run test:visual # the build view in a real browser — see Verification
npm run lint       # eslint, one rule: no-undef
```

Node 24 or newer. **Run `npm test && npm run build` before every commit** — both
are what CI runs.

`npm test` takes about a minute and a half locally and several minutes on CI. It
is solving 81 rocket designs and mounting the app a few dozen times, not doing
nothing.

### Benchmarks

```bash
npm run perf          # the 81-case grid, same cases as the design snapshot
npm run perf:mission  # one whole mission, the way a user waits for it
npm run perf:save     # baseline this machine
npm run perf:compare  # run again and diff
```

The workflow is baseline on `main`, compare on the branch, **then run `npm test`
and confirm the design snapshot has not moved.** Optimisations are supposed to
be behaviour-preserving; a faster solver that picks different rockets is a
different solver.

These are deliberately outside CI — `vitest.config.js` pins collection to
`test/`, so nothing in `perf/` can be collected as a test by accident.
`perf/README.md` has the rest, including why baselines are machine-local, how to
add call counters, and how to profile on a device.

---

## The shape of this project

Three layers, and the boundary between the first two is the point:

    src/data/   part tables, bodies, curves — JSON, no logic
    src/core/   solver and physics. No React, no DOM, no imports from ui.
    src/ui/     the application

**`src/core/plan.ts` is the seam.** `planMission(input, { signal, onYield })`
takes a destination and a payload and returns solved stages. Everything crossing
it is plain data — no `Set`, no `Map`, no object identity, no functions — so the
solver behind it can become a Web Worker or a Rust/WASM module without the UI
changing. `test/seam-contract.test.ts` enforces that and will fail if it slips.

Part data is extracted from a specific KSP install (Squad 1.12.5 + Breaking
Ground + ReStock+). It is not re-derived at runtime, so changing a number in
`src/data/` is changing a measurement, not a config value. It is JSON so a
native port can embed the same files rather than keeping a second copy.

This was one file until it had a test suite worth the name. The "droppable into
any React project" property is gone, deliberately.

---

## Code style

The conventions here differ from a typical React project. Match the file rather
than habit:

> **TypeScript.** All of it, since [#11](../../issues/11): `src/`, `test/`,
> `visual/` and the two `perf/` entry points that go through vite. What is left
> in JavaScript is the configuration at the root and the two benchmark scripts
> node runs directly.
>
> `npm run typecheck` is a CI step and is what stands in `no-undef`'s place —
> eslint here has no TypeScript parser, so it lints none of the source, and
> neither the build nor the suite can see a type error either: vite and vitest
> both strip types with esbuild and never check them.
>
> `.claude/typescript-style-guide.md` is the conventions reference. Its opening
> section lists four rules this project deliberately breaks — read that before
> applying anything from the rest of it.

- **Inline `style={{}}` is correct here.** There is no Tailwind, no CSS file,
  and no class-based design system. Static styling lives in a `<style>` block
  inside the component, alongside a small set of custom classes (`card`, `chip`,
  `disp`, `eyebrow`, `mono`). Do not introduce a styling framework.
- **The component is a default export.** Solver functions are module-private.
  Export something by name when a caller genuinely needs it — that is how the
  snapshot test reaches `solveGroup` — not as a blanket convention.
- **Naming is terse and domain-flavoured** (`cdOf`, `ispAt`, `fitStructure`,
  `solveStage`, `boostedAscent`). Follow it. Do not expand these into prose.
- **Physics constants and part tables are UPPER_SNAKE.**
- **Prettier formats everything.** `npm run format:check` verifies it, `npm run
format` fixes it, and CI runs the former. Nothing in `src/` is excluded.
- **eslint runs one rule, `no-undef`.** Not a style gate — prettier owns
  formatting and the conventions above are this project's own, so a preset would
  spend its time arguing with decisions already made. Do not add rules to it
  without a bug they would have caught.
- **Comment the non-obvious physics** — where a constant came from, why a curve
  has the shape it does, which KSP behaviour is being reproduced. Not what the
  code does.

---

## Verification, and how to talk about it

Three checks caught nearly every regression during development. What each is
for, and just as importantly what it cannot see:

**The design snapshot** solves a fixed grid of 81 configurations — three tech
tiers, three payloads, three delta-v budgets, three objectives — and compares
every resulting design against a committed baseline, part by part, mass to four
decimals and delta-v to three. 66 produce a design; the other 15 are legitimately
unbuildable at that tech level. It is the check that matters here, because the
characteristic failure in this codebase is silent — a refactor believed to be
behaviour-preserving once altered 31 of 72 designs without erroring. It is also
what makes the suite cost what it does; the other checks run alongside it rather
than after it.

A snapshot diff means the physics moved. If that is what you intended, re-bless
with `npm run test:bless` and put the before and after in the commit message.
**Never re-bless to turn a red build green.** A diff you cannot explain is the
bug the test exists to catch, and blessing it destroys the only evidence.

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
    test/design-snapshot.test.ts          the design snapshot
    test/render-sweep.test.tsx            the render sweep
    test/model.test.ts                    the rocket as shapes, checked as shapes
    test/parts-order.test.tsx             the parts list reads as a build order
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

Know what none of them reach:

- The design snapshot drives `solveGroup`, not `buildRoute`, `missionHardware`,
  or the candidate walk. The mission sweep covers those, but at twelve
  configurations against the snapshot's 81 — it is a regression net, not a
  survey, and a solver change with a narrow blast radius can still slip between
  its cases. The 128-configuration sweep that found the cluster-cap problem
  lives in the history of [#29](../../issues/29), not in the suite.
- No check can see a bad number in a CSS value. The CSSOM validates on
  assignment and silently discards what it cannot parse, so `width: NaN%`,
  `width: undefinedpx` and `opacity: NaN` read back as null rather than as the
  bad value. That is true of real browsers as much as jsdom. Only
  string-valued properties survive to be seen, `font-family: NaN` being the type
  case.
- Containment is checked at the default tech tier and payload. Other rosters
  produce different shapes and are not swept.
- The main suite runs in jsdom, which has no worker, no visual viewport, no
  on-screen keyboard and no IME. `npm run test:visual` covers the WebGL half in
  a real browser; everything else on that list is still checked on the
  Cloudflare preview, by a person, and the device is still the only place
  mobile behaviour is decided.

A green build on its own says nothing about solver output. When you change
something these checks cannot see, say plainly that it is unverified rather than
implying CI covered it.

---

## Where the bodies are buried

- **A `.js` import specifier resolves to a `.ts` file, everywhere it matters.**
  Vite, vitest and `tsc` all map `./foo.js` onto `foo.ts` when that is what is
  on disk, so converting a module is a rename and nothing else — no caller
  changes, and no extensionless-import sweep across the repository. The
  alternative was rewriting every specifier in `src/` and `test/`, which would
  have buried the conversion diff in churn that proves nothing.
- **A panel is never narrower than the label above it.** The elevation's header
  — the word and the `Iso` chip beside it — runs to about 110 px, and a column
  is as wide as the widest thing in it. Sizing the drawing below 110 widened
  the column anyway, so the arithmetic that laid the row out described a row
  narrower than the one on screen and the plan spilled three pixels past the
  card. `MIN_PANEL` in `src/ui/views.ts` is that floor, and it is a layout
  number rather than a drawing one: `fitOrtho` is happy to draw a pencil in a
  wide panel with air either side of it.
- **A ref that an effect installs stops working when the element moves.** The
  build view's drawing row is unmounted and rebuilt inside a portal every time
  full screen is toggled. An effect with an empty dependency list goes on
  observing the element that left, which reports a zero box — and both panels
  came out one pixel. A callback ref is called with the new element and with
  null on the way out, which is the shape this needs.
- **`position: fixed` is not the viewport inside the solving veil.** `Solving`
  drops its children to `opacity: .22` and `filter: grayscale(1)` while a solve
  runs, and either of those makes the wrapper the containing block for a fixed
  descendant. A full-screen overlay rendered inside it re-anchors itself to the
  results column halfway through a solve. The build view's goes through
  `createPortal` to `document.body` for that reason, and sits at a z-index
  below the app's own solving bar — which is fixed at 50 and outside the veil —
  so a full-screen rocket about to be replaced still says so.

  What a portal costs is that it is a second root. The type stack is set on the
  application's own root div, and `button { font-family: inherit }` in the
  style block therefore reaches the browser's default in anything portaled out
  of it — the chips in the overlay came out in Times. `FONT` in
  `src/ui/tokens.ts` exists so the two roots cannot disagree about it.

- **A stand-in part has to be a whole one.** The booster pools dress a liquid
  column and a drop tank up as engines so the two-phase maths can fly them
  without a second version of itself. The drop tank was built without a `cost`,
  and `undefined` in `stageCost`'s booster term made the whole stage price NaN
  — which is worse than a wrong number, because every comparison against NaN is
  false and the stage could then never win the cost objective at any payload.
  `BoosterPart.cost` is required for that reason: a pool that has nothing to
  charge has to say so. #93
- **Asparagus is solved by nothing but its own test.** Drop tanks and liquid
  columns are only built when the user asks for asparagus, and neither the
  design grid nor the mission sweep turns it on — so that whole branch of
  `boostedAscent` ran in no check at all until `test/manifest.test.ts` grew one.
  A change in there is invisible to both baselines; measure it deliberately.
- **A solved stage is not one shape.** A boosted stage carries no `stacks`,
  `perStack`, `rejoin` or `joiner` at all — it is a single core with a ring
  bolted to the side of it, built by `boostedAscent` from a different literal
  than the scratch object `solveStage` fills. Every reader already wrote
  `sol.stacks || 1` and tested the other three before use; `Solution` in
  `src/core/solution.ts` now says which is which and why.
- **Which part a shape stands for follows from the job it is doing.** `modelOf`
  writes `role` and `part` together, so a booster shape carries whatever the
  ring is made of and a coupler shape may carry a shroud, which has no name at
  all. Asking a shape's part what it is instead — does it have a `column`? —
  finds the liquid columns and misses every solid booster in the game, because
  a solid one is a plain engine record. `ModelPart` is discriminated on the
  role for that reason; narrow by asking the role.
- **Flow analysis cannot see an assignment made inside a callback.** Two locals
  set only by a nested `scan` still read as their initialiser everywhere below
  it, which is how `optimiseTurn` ended up holding its two running bests on an
  object instead. The same shape appears wherever a helper mutates a local of
  its enclosing function: give the function an explicit return type, or hold
  the state somewhere the compiler has to re-read.
- **`stageGeom` is the single source of stage geometry.** `stageSize` sums it
  into a bounding box; the elevation lays it out as rectangles. They drifted
  apart on width, then height, then packing — do not recompute either one
  locally.
- **`fitStructure` is shared between `solveStage` and `boostedAscent`.** Five
  bugs came from fixing one and not the other: couplers, the thrust limiter, the
  gimbal check, the cluster cap, and a missing decoupler quantity.
- **An engine plate is a decoupler.** It is a coupler that sits _above_ the
  engines it carries, with them hanging inside its shroud, and it separates the
  stack at its own node. So a plated stage reads tanks, adapter, plate, engines
  and then straight into the next stage's tanks — the plate is the joint, and
  nothing else goes there. An unplated stage reads tanks, engines, decoupler,
  next stage's tanks. The solver charges every joint to the stage _below_ it —
  the decoupler is drawn at a stage's top — which is the same joint named the
  other way round, and is why `plateAbove` zeroes the decoupler a stage would
  otherwise buy.
- **A stage buys one decoupler, at its top, on the axis.** The count was
  `split ? perEng * stacks : stacks`, and both branches disagreed with the
  rocket `modelOf` draws. `perEng` counts the nodes a cluster presents at its
  _bottom_; this part is at the top, which is why `plateAbove` zeroing it makes
  sense and why `stacks` contradicted the line below it — radial stacks are held
  by joiners and never separate alone. A plated stage was charged one decoupler
  per engine for the joint its own plate makes, the same joint `plateAbove`
  tells the stage below not to pay for. It was in the original commit and never
  revisited, and nothing tied the charge to the drawing until #78.
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
- **And it is a constraint on the whole rocket, which is not what a group
  sees.** A mission cut into segments is solved a segment at a time, and each
  one was judged as though it were the whole vehicle with a pod on its nose:
  four segments reading 6.2, 4.6, 2.3 and 1.7 against a limit of 8, for a stack
  that is 9.5:1. It cut both ways — a segment over the limit was rejected on a
  vehicle that was under it, and a vehicle over the limit was delivered on
  segments that were all under. Groups are solved from the top of the stack
  downwards, so what stands above one is known when it is sized; `stackOf`
  carries that down, and the group that reaches the pad therefore judges the
  vehicle. A mission with no cuts is one group, which is why neither baseline
  could see any of it. #102
- **`best` is not what the user gets.** For an auto-stage-count launch,
  `planMission` walks `byK` cheapest-first through the ascent simulator and
  delivers the first candidate that flies. A change that leaves `best`
  byte-identical can still hand back a different rocket, and the design snapshot
  drives `solveGroup` directly — it never enters the walk. Dropping the
  cluster-cap variant looked free by that measure and moved 11 of 128 real
  missions, nine of them dearer on the objective asked for. `npm test` now
  covers thirteen of those through the mission sweep — but thirteen, not 128, so a
  solver change you cannot explain still deserves a wider sweep before you
  believe it is invisible.
- **A variant that improves `best` can degrade what is delivered.** Same sweep:
  the cluster-cap variant wins the walk on a 0.8 t Kerbin orbit launch with a
  design 7.9% dearer than what the search returns without it. Building more
  candidates is not monotonically better once the walk chooses among them.
- **The seam duplicates rather than shares.** `groups` used to arrive as arrays
  of the same leg objects held in `route`, and `route.indexOf(legs[0])` depended
  on that identity. JSON duplicates, so a round trip returned -1 and the
  split-point lookup broke silently. Nothing in the suite could see it, because
  in-process every caller passes the shared objects.
- **`fmt` turns every non-finite number into an em-dash before display.** A
  `NaN` travelling through any `Stat` is therefore invisible to a text scan —
  forcing liftoff mass to `NaN` produced no textual trace at all. What a reader
  would actually notice is the design collapsing into a row of dashes, which is
  why `solvability.txt` exists rather than the sweep relying on its own scan.
- **`position: fixed` is not the top of the screen on a phone.** An on-screen
  keyboard shrinks the visual viewport, not the layout one, and the browser
  scrolls the focused field up into what is left — so a fixed overlay ends up
  above the visible area at exactly the moment it is wanted. The solving bar
  translates by `visualViewport.offsetTop` for this reason.
- **A text field renders its draft, not its value.** `Slider` holds a draft
  string while focused so half-typed values are not fought. A typed number
  therefore looks accepted whether or not it ever reached state, so "the value
  updated" is not evidence that anything did — the slider moving is, because the
  range input renders the committed value. Two fixes were built on the wrong
  reading of this before the real cause turned up.
- **A WebGL canvas drawn once needs `preserveDrawingBuffer`.** `ThreeView`
  renders a frame when the rocket or the view changes and never on a loop,
  because the cameras do not move. The drawing buffer is cleared once it has
  been composited, so without the flag the schematic is right on the frame that
  draws it and can come back blank on the next repaint. Nothing in the suite
  can see this: jsdom has no WebGL and never constructs a renderer. The other
  half of the same fact: a canvas holds its last frame until something else is
  drawn, so a render effect that returns early on an empty model leaves the
  previous rocket up. The plan view showed the step before the last one that
  way — the elevation, which always has a payload in it, was right alongside
  it. Clear rather than return.
- **`renderer.setSize(w, h, false)` does not size the canvas.** The third
  argument suppresses the CSS width and height, and the canvas is
  `devicePixelRatio` times bigger in device pixels — so it lays out at that
  size and draws at twice the panel on any screen with a ratio above 1. It
  looks correct in a container at ratio 1 and wrong on a phone. Let three.js
  set the style.
- **Every camera must send world +x to the right of the screen.** Columns start
  at +x and work round, and the elevation draws that first pair left and right,
  so a view that disagrees draws the same rocket mirrored against the one next
  to it — a three-column stage leaned right in the elevation and left in the
  plan. three.js builds its basis as `right = up x (eye - target)`, so the
  plan's up vector decides this, not its position. Looking up from underneath,
  +x on the right forces +z to the top: the SVG plan's z-down cannot be kept as
  well, and a camera above the rocket that keeps both puts the payload over the
  engines. `viewRight` in `src/ui/views.ts` is the invariant, and
  `test/three-view.test.ts` checks it without a renderer.
- **`src/ui/views.ts` must not import three.js.** The build view sizes its
  panels from `framing`, so whatever that module imports lands in the bundle
  that gets you to a solved rocket — and the renderer is half a megabyte of it,
  lazy-loaded for exactly that reason. The camera basis is four multiplications;
  it does not need `Vector3`. The renderer imports this module, never the other
  way round.
- **A full-screen quad has to opt out of frustum culling.** The composite pass
  writes clip space straight out of the vertex shader and never reads the
  camera, so three culls it against a frustum it does not live in and the panel
  comes back empty with nothing logged. `frustumCulled = false` on the mesh.
- **A bare `ShaderMaterial` bypasses colour management in both directions.**
  Nothing converts on the way in and nothing converts on the way out, so the
  palette token is what gets drawn — which is what the shaders here want. The
  trap is anything that does not go through them: `setClearColor(C.panel)`
  converts the hex into the linear working space, and the drawing would sit in a
  rectangle of the same colour about a third as bright as the card around it.
  `panelClear()` names the working space so the conversion is a no-op.
- **A whole number interpolated into GLSL loses its decimal point.** `${3.0}`
  is the string `3`, and there is no `pow(float, int)` in GLSL — the shader
  fails to compile, the pass it belongs to draws nothing, and the only trace is
  a console message. It is worse than it sounds, because it depends on the
  value: 2.6 and 3.4 compiled and 3.0 did not, so tuning a constant broke it.
  Everything interpolated into a shader goes through `f()` in `shaders.ts`.
  `npm run test:visual` is what caught it, by reading the console — nothing in
  `test/` can.
- **The surface-id buffer must not be filtered or multisampled.** A linear
  filter blends two ids into a third along every boundary, and a multisample
  resolve does the same; either invents parts that are not in the model and
  outlines them. Nearest filtering, no samples. The fill target is multisampled,
  because that one does want a smooth silhouette — which is why they are two
  targets rather than one.
- **`VIEWS` writes its directions unnormalised, and `viewAxis` is the only way
  to use one.** The isometric is `[0.72, 0.52, 0.72]`, which reads well and is
  1.143 long. Placing the camera at `dir * distance` therefore stood it 14%
  further off than its near and far planes were told, and the far plane cut the
  back off the model — visibly at the last staging steps, where the stand-off's
  constant term dominates, and invisibly behind other geometry everywhere else.
  `cameraFor` now returns the position, the frustum and the depth window
  together, so the axis that places the camera is the axis its depth is measured
  along.
- **A line exists only where the model has two parts.** Surface ids find the
  seam between two tanks of the same diameter, which nothing else can — but only
  if there are two of them to have ids. The drawing put a whole tank run down as
  a single cylinder, so a stage of five identical tanks came out as one tube
  with no seams, while a packed ring beside it was drawn level by level and had
  them. `stageGeom.run` is the run as the tanks it is made of; `tankStackLen`
  sums the same per-tank length, so the drawing and the slenderness limit cannot
  disagree about how long it is.
- **The id buffer is two bytes wide.** One capped the model at 254 parts and
  failed silently — the 255th clamps onto the first and its outlines stop being
  drawn. The largest model in the mission grid is 78.
- **Creases are geometry, silhouettes are screen space.** `EdgesGeometry` knows
  where a cap meets a tube — 90 degrees, in the model, the same from every
  angle. It cannot know a cylinder's side outline, which is an occluding contour
  and depends on where the camera stands. And neither depth nor normals can find
  the seam between two tanks of the same diameter, which is the commonest join
  in the rocket: same plane, same normal. Surface ids find that one. Three
  techniques, three jobs; do not try to make one of them do another's.
- **A closed form cannot check itself.** `framing` reduces the model to one
  cylinder and solves for its extent. The containment test used to assert that
  answer against the same reasoning, which proved only that the arithmetic was
  consistent with itself. It samples the rim circles of every part and projects
  them through the camera basis instead — independent, and it names the part
  and the metres when it fails.

  This is not a mistake you make once. The first depth-containment check took
  its camera position and its near and far planes from the same `cameraFor`
  call, so a direction of the wrong length inflated both together and the test
  passed with the bug it was written for still in place. It stands the camera
  where the renderer stands it and normalises the look direction itself.

---

## What not to do

- Do not push directly to `main` — it will be rejected.
- Do not make `core/` import from `ui/`, and do not put a `Set`, a `Map` or a
  live object reference across the `planMission` boundary — both are the whole
  reason the split exists.
- Do not re-bless the design snapshot to make a red build green.
- Do not make a mechanical, repository-wide change without running the snapshot
  over the result. The TypeScript conversion was held back for exactly this
  reason until there was something able to detect a silently changed design, and
  then done a chunk at a time against it. The next such change gets the same
  treatment.
- Do not replace inline styles with Tailwind or another CSS framework.
- Do not recompute stage geometry locally, or fix `solveStage` without checking
  `boostedAscent` — see "Where the bodies are buried".
- Do not commit `dist/`; it is gitignored and built by CI and Cloudflare.
- Do not leave `console.log` in committed code.

---

## Recording what you learn

When you work out something non-obvious about the physics, the solver, or a trap
in the code, append it to "Where the bodies are buried" above. That section is
the established home for this knowledge — keep it there rather than starting a
parallel set of notes or a new document.

Work that is outstanding rather than known belongs in a filed issue, not in
prose here.

---
paths:
  - "src/core/**"
---

# The solver and the physics

Traps in `src/core/`. Every one of these caused a regression that a green build
did not catch — the characteristic failure here is silent, so read the entry
before changing the thing it names.

- **What an engine measures is not what it occupies.** `widthOf` reads a
  part's face off its drag cube, which for an engine is the bells and not the
  node it mounts on: an Ant mounts on 0.625 m and measures 0.37 across. That is
  the right width to draw it at and the
  wrong one to ask whether a booster can stand beside it — comparing it against
  the tank above says there is nothing there to bolt to, so the ring stops at
  the tanks rather than running down past the engine to stand on its base, and
  the boosters hang partway up the stack. A stack engine occupies its node; a
  radial one occupies only what it measures, because it is bolted to the side
  of something rather than sitting under it. `isRadial` is the distinction, not
  a tolerance. #109

  Pick the example carefully: the Ant is narrower than its node in a stock
  install and in a ReStock one, and it is the only stack engine that is. The
  Mammoth was the original illustration and turned out to be reading a corrupt
  cube; the Poodle replaced it and is ReStock-specific — ReStock draws it 1.92 m
  across a 2.5 m node, stock draws it 2.49, which is not narrower at all. A
  worked example here has to hold in whichever install the tables were measured
  from.

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

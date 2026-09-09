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

- **A radial engine is beside the tank, in `stageGeom` as in the drawing.**
  Its stage spans the tank and an engine either side (`td + 2·ed`), and the
  stack is longer only by what hangs below the tank — `RADIAL_HANG`, a
  quarter of the engine's length, or the whole of the engine less the tank
  run where the run is the shorter. `engine` is what it adds to the stack and
  `engineH` the part's length; they are the same number for a stack engine.
  Until #164 a Thud stage was a full Thud under the tank and two Thuds
  tiling its base, so it was measured too slender and too narrow: the
  snapshot moved on every tier 5 and 9 design with a Twitch or Thud stage —
  aspect ratios fell, one Twitch stage picked a shorter tank pair it had
  been too slender for, and a Spark stage above a Twitch stage packed into a
  ring because the packing pass's `roomBelow` is the stage below's width,
  which now counts its engines. The render sweep's Minmus row moved with it
  (67.8 t in two stages to 57.2 t in three): Minmus designs at that tier
  lift off on Thuds.

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

- **Asparagus has three baseline rows and one rule, and the design grid is
  not among them.** Drop tanks and liquid columns are only built when the user
  asks for asparagus. The design snapshot never turns it on; what pins that
  branch of `boostedAscent` is the three crossfed rows of the mission sweep
  (#126, one per objective, with `test/mission-sweep.test.ts` holding that at
  least one delivers a drop tank), `test/asparagus.test.ts` for the shedding
  rule, and `test/manifest.test.ts` for the drop tank's price. A change in
  there is invisible to the 81-case grid; measure it against the sweep.

- **Both baselines carry a solid in the roster, so neither can see what a
  roster without one gets.** The design grid and the mission sweep solve at
  tiers where the Hammer and the Flea are researched. `wantMounts` once asked
  for a solid before it would try any mount, and a career with liquid engines
  and no SRBs never saw a liquid radial column — invisible to every baseline,
  because with a solid present the gate was already open.
  `test/radial-columns.test.ts` is what pins the solid-free case. #160

- **A named part is charged at its table figure, and three literals were not.**
  The booster decoupler's mass, its price and the fallback join for radial
  stacks all named the TT-38K and carried the TT-70's mass (0.05 t) or the
  no-decoupler estimate (75 funds) for the life of the solver; every ring paid
  double for its decouplers and an eighth of their price. They read
  `structure.json` now. Pricing the part moved 39 of the 81 grid designs and
  13 of the 16 sweep missions, and on the cost objective the walk buys fewer
  boosters than it did — that is the price, not a regression. #161

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
  covers sixteen of those through the mission sweep — but sixteen, not 128, so
  a solver change you cannot explain still deserves a wider sweep before you
  believe it is invisible.

- **The flown ascent is compared with what the chain carries for the
  climb, not with the group.** A cut can put a plane change, a capture and a
  descent in the launch group; `planMission` compared the simulator's ascent
  with the whole group's Δv and found a rocket 600 m/s short of orbit
  "carrying its flight". `ascentShareOf` is the ascent legs' share, margin
  included; `carriedFor` adds what the chain's tanks rounded the group up
  to; the re-solve grows the group by the shortfall beyond that and keeps
  the other legs whole. The margin is a reserve — a flight within what is
  carried stands — and a flight over it is grown to carry the margin over
  what it flew at. Fixing this re-sized every launch whose flown ascent
  exceeded the map's 3,400 m/s share and had been passing against the
  group: Duna at 3.5 t (lightest) went 131 → 149 t, its old design flying
  238 m/s over what it carried. #167

- **A sustainer under one is admitted only when the boost has made it
  fast.** The 0.85 floor's own comment said "already fast and climbing"
  and never checked it; six Hammers on a Mainsail passed at 0.88 with the
  stack at 100 m/s and 1.9 km, then stalled straight up for forty seconds.
  `sustainerHolds` estimates the separation speed from the boost phase's
  net acceleration on its average mass and requires `SUSTAINER_FAST`
  (250 m/s) of it under one, `SUSTAINER_MIN` (0.85) regardless; `twrSep`
  rides on `Boosters` and the stage card shows it between liftoff and
  burnout. Every design it refuses was passing before, so what replaces one
  is dearer or heavier: Minmus at 6.5 t (cheapest) 48,761 → 52,765 funds,
  low orbit at 0.8 t (lightest) 5.3 → 7.0 t. Tune `SUSTAINER_FAST` with the
  sweep, not by hand. #168

- **The walk judges a candidate by what it would weigh once grown, and it
  sees the runners-up.** `reduceUnits` keeps `ALTS_PER_K` (3) chains per
  stage count, not one: the closed form's favourite at a count is not
  always one the simulator flies to budget, and the one behind it often
  is — the 7.2 t Torch chain the cost objective found on a 1 t low-orbit
  brief was never in the mass objective's list. Candidates are flown
  cheapest first, and one that flies over what it carries has its score
  scaled by the rocket equation (`GROW_VE`, 2,500 m/s) for the growth the
  re-solve will impose; the walk stops once the next score cannot beat the
  best estimate. Taking the first that flew grew a light chain a great
  deal when the one behind flew nearly to budget; taking the first that
  fitted took a heavy chain over a light one that needed a little. #168
  #169

- **Cheapest is never dearer than lightest.** The cost and parts objectives
  minimise within a group and are charged nothing for the mass handed
  down; the mass objective compounds through it. `planMission` plans the
  lightest design as well for those two objectives and delivers whichever
  measures better on the one asked for — twice the work for two of the
  three objectives, and `test/flown-cost.test.ts` holds the floor on the
  Minmus brief that showed it (48,761 asked cheapest against 42,235 asked
  lightest). #169

- **The turn has three parameters, and the third is the nose above
  prograde.** A stack near TWR 1 pinned the two-parameter search at its
  corner — the latest, shallowest kick, "stay vertical" — because following
  prograde after any real kick lets the velocity vector fall over faster
  than the thrust bends it back. `lead` holds the nose that many degrees
  above prograde once prograde has caught the kick attitude, which is what a
  pilot does on such a stack; `optimiseTurn` tries `LEADS` (3, 6, 10, 15°)
  round the two-parameter seed and refines round the best, a few dozen
  flights rather than a third grid dimension. Zero is the classic turn and
  reproduces it exactly. On the six-Hammer Mainsail it takes 4,549 → 4,223
  m/s with a 7° kick at 125 m/s and 6° of lead; on a stack that flies well
  already it changes nothing. The flight card says "keep the nose N° above
  it" where it used to say "switch SAS to prograde". #10

- **A flight's `total` is what the orbit needs, never what the tanks held.**
  `flyAscent` integrates the circularisation on the stage live at apoapsis.
  It used to stop when that stage ran dry and report what it had spent:
  a Torch rocket 1,600 m/s short of circular reported a 2,313 m/s ascent —
  under the physical minimum — and the turn search _preferred_ that flight,
  because falling short is always cheaper than not. `planMission` then found
  2,313 ≤ 3,762 built and delivered it. Now the burn stages up when a stage
  runs dry (the vehicle has the stage above, and the closed form counted its
  Δv toward this orbit — `circStaged`) and is costed to completion,
  impulsively for whatever is left when the last stage runs dry
  (`circShort`); `total ≥ dvUsed + vCirc − vApo` always, and
  `test/ascent.test.ts` holds it on the simulator directly. Costed honestly,
  the turn search found a steeper flight for the same Torch rocket that
  circularises on one stage at 3,561 m/s. The mission sweep moved on one
  design, Low orbit at 0.8 t: 5× Twitch at 5.32 t had been passing on a
  truncated burn and re-solved to 7× Twitch at 8.52 t. #170

- **A variant that improves `best` can degrade what is delivered.** Same sweep:
  the cluster-cap variant wins the walk on a 0.8 t Kerbin orbit launch with a
  design 7.9% dearer than what the search returns without it. Building more
  candidates is not monotonically better once the walk chooses among them.

- **The seam duplicates rather than shares.** `groups` used to arrive as arrays
  of the same leg objects held in `route`, and `route.indexOf(legs[0])` depended
  on that identity. JSON duplicates, so a round trip returned -1 and the
  split-point lookup broke silently. Nothing in the suite could see it, because
  in-process every caller passes the shared objects.

- **A mission is an endpoint to an endpoint; `buildRoute` is an adapter.**
  `routeFor(from, to, chutes, returning, planeNow)` in `orbits.ts` builds
  every route from a body-and-state pair — surface, low orbit, stationary
  orbit at the From end; those or a fly-by at the To end — and `possible`
  says which pairs are missions, with the sentence a disabled chip carries.
  The old form (destination name, profile, origin) is mapped onto endpoints
  by `endpointsOf`, so every caller and every saved configuration still
  works. **`test/routes.test.ts` holds all 5,904 routes the old form could
  ask for, hashed**; a diff there is a mission that moved and is re-blessed
  like the design snapshot, with the before and after in the commit. Two
  things to know: Kerbin departures still take the map's tabulated legs
  (`DEST`, validated in play) and a start in Kerbin's low orbit drops the
  table's ascent; and the origin's own orbits never had a return leg under
  the old form, which the adapter preserves by passing `returning: false`
  for them. The Sun is a body now — rotation and atmosphere from the game —
  with a stationary orbit at about 1.77 Gm and no surface; an aerobrake is
  credited only over a surface one could stand on, so a return to Kerbol or
  Jool is a capture. #188

- **Transfer windows (#197) are priced in `core/transfer.ts` and ride on the
  leg that leaves.** `routeFor` with a start time prices every leg between
  planets on the first window from that time: `findWindow` runs a porkchop
  search — departure against time of flight, a Lambert solution (`lambert.ts`,
  Izzo 2015) in every cell on the ephemeris in `kepler.ts` — over one synodic
  period, then refines to the second. The ejection is `inject(v_park, v∞)`
  with the window's excess in place of the Hohmann's, so the route's own leg
  formulas are unchanged; a mid-course plane change is its own leg where it
  is cheaper than flying the inclination ballistically, and the Sun-level
  entry of `planeChanges` is dropped when a window has paid it. Without a
  start time the route is the tabulated one it always was, which is what
  keeps `test/routes.test.ts` byte-identical; the app always passes one.
  The ejection is priced from an equatorial parking orbit — `ejection` in
  `transfer.ts` turns the hyperbola's plane about the burn's radius until
  its asymptote reaches the excess's elevation, and the burn is a prograde
  part and a normal part, the resultant charged — so a ballistic transfer
  to an inclined target pays hundreds of m/s of normal and the mid-course
  plane change wins more often than the tools that assume an inclined
  parking orbit suggest. Three traps: the ephemeris uses KSP's g₀ of 9.80665, not the solver's 9.81
  — at 9.81 Kerbin's year came out 1,600 s short; the search covers _one_
  synodic period, because two found a cheaper window two years on and the
  reader asked for the first; and the plane-change branch's burn time wraps
  the anomalies into [0, 2π) before Kepler's equation, or a Dres burn came
  out 835 days before departure. A window is about 8 ms; a route with both
  directions about 25 ms, cached on its arguments.
  The excess velocity is taken at infinity, from the relative velocity at
  the sphere of influence's edge: `atInfinity` in `transfer.ts` removes the
  2μ/r_soi the ship still has to climb after the patch. Without it every
  ejection and capture ran 1–2% over alexmoon's planner at the same cell
  (12 m/s at Kerbin, 20 at Eve); with it, nine of his selected transfers
  agree to the metre per second, ejection inclination included.

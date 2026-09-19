import { TALLY } from "./tally.js";
import { BODY, atmoFor } from "./atmosphere.js";
import { SYS, omegaOf } from "./orbits.js";
import { darkFraction, drawOf, sizePlant } from "./power.js";
import type { Plant } from "./power.js";
import { G0, REGIME_DEFAULT } from "./constants.js";
import {
  heightOf,
  packFor,
  stackGeometry,
  boostersFit,
  stageSize,
  useArt,
  boosterLength,
  boosterWidth,
  standoffOf,
  engineLen,
  tankStackLen,
} from "./geometry.js";
import {
  couplerFor,
  decouplerFor,
  diaOf,
  isRadial,
  maxCluster,
  shroudFor,
  holderFor,
  tanksInArt,
  braceFor,
} from "./parts.js";
import {
  STAGE_PRESSURE,
  ispAt,
  finiteBurnDv,
  ARC_MAX,
  IMPULSIVE_ARC,
  SPIRAL_ARC,
  propellantFor,
  splitBurn,
  scoreOf,
  COUPLE_COST,
  COUPLE_PARTS,
  stageCost,
  stageParts,
} from "./performance.js";
import { fitStructure, pickTanksMemo, poolsFor } from "./tanks.js";
import { attachHalf } from "./nodes.js";
import type { Excluded, Expansions, Regime, Roster } from "./constants.js";
import type { Engine, Tank } from "./catalogue.js";
import type { Objective } from "./performance.js";
import type { BoosterPart, Solution } from "./solution.js";
import type { BurnOrbit } from "./orbits.js";
import type { Pool, TankPool } from "./tanks.js";

/* --------------------------------- solver ---------------------------------
   Rocket equation with tankage. For propellant mass mp and structural
   coefficient k (tank dry mass per tonne of propellant):
       mf = P + E + k*mp        m0 = mf + mp        R = exp(dv / (Isp*g0))
   Solving for mp:
       mp = (R-1)(P+E) / (1 + k - R*k)
   Feasible only while R < (1+k)/k — for stock 9:1 tanks that caps a single
   stage at Isp*g0*ln(9).                                                   */
/* ----------------------------- what the search takes -----------------------------

   One options object per entry point rather than a positional list. Both of
   these are called from two places apiece, and a positional list of twenty is
   how `solveStage` and `boostedAscent` drifted apart five times over — see
   `fitStructure` in "Where the bodies are buried". */
type StageOpt = {
  dv: number;
  payload: number;
  engines: ReadonlyArray<Engine>;
  tanks: ReadonlyArray<Tank>;
  unlocked: Roster;
  excluded: Excluded;
  twrMin: number;
  g: number;
  pRef?: number;
  pSurf?: number;
  extra: number;
  maxBurn?: number;
  /* The legs this stage flies, each with its share of the requirement and the
     rate of the orbit it is burnt in. Empty where the caller gave no route. */
  burns?: ReadonlyArray<StageBurn>;
  /* Whether every one of those legs is a burn made in orbit, and where the
     farthest of them is made — what an electric engine's plant is sized for.
     Both as `StageParams` carries them. */
  coasts?: boolean;
  power?: StageParams["power"];
  /* Which regime of burn the mission will fly — a filter on what is offered,
     never on how a design is priced. `REGIME_DEFAULT` where absent. */
  regime?: Regime;
  objective?: Objective;
  needGimbal?: boolean;
  hasStageBelow?: boolean;
  noPlate?: boolean;
  expansions?: Expansions | null;
  plateAbove?: boolean;
  capCluster?: number;
};

type BoostOpt = {
  /* Whether the stage above ends in an engine plate, whose own decoupler
     makes the joint — the same flag solveStage takes; hard-wired false here,
     a boosted stage under a plate bought a TD-37 it did not need (#467). */
  plateAbove?: boolean;
  dv: number;
  payload: number;
  engines: ReadonlyArray<Engine>;
  tanks: ReadonlyArray<Tank>;
  unlocked: Roster;
  excluded: Excluded;
  needGimbal: boolean;
  twrMin: number;
  g: number;
  extra: number;
  srbs: ReadonlyArray<Engine>;
  pRef?: number;
  pSurf?: number;
  objective?: Objective;
  noLiquid?: boolean;
  noPlate?: boolean;
  expansions?: Expansions | null;
  asparagus?: boolean;
};

/* One stage of a chain, with what it was asked for and what it was carrying. */
type StageInChain = {
  sol: Solution;
  want: number;
  payloadIn: number;
  twrMin: number;
  g: number;
};

/* A whole stack, judged as one. `slim` is the slenderness constraint and is
   compared before anything else: a pencil that is 10% lighter is not a better
   rocket. */
type ChainCandidate = {
  chain: Array<StageInChain>;
  total: number;
  k: number;
  chainScore: number;
  ar: number;
  slim: boolean;
};

/* The search's answer: the best chain, the best at each stage count, and
   the runners-up at each (`alts`, ALTS_PER_K − 1 of them). `byK` and `alts`
   are what plan.js walks — `best` is not what the user gets. */
type GroupResult = ChainCandidate & {
  byK: Array<ChainCandidate>;
  alts: Array<ChainCandidate>;
};

/* Everything a group is searched with. `prepare` turns it into the argument a
   unit runs on; `minK` and `maxK` are read by `solveGroup` alone. */
type GroupInput = {
  dv: number;
  payload: number;
  /* Absent where the caller has a payload mass and nothing else, which is what
     `payloadDiaOf` falls back for — the design grid is one such caller. */
  payloadDia?: number;
  engines: ReadonlyArray<Engine>;
  tanks: ReadonlyArray<Tank>;
  unlocked: Roster;
  excluded: Excluded;
  needGimbal: boolean;
  maxAspect?: number;
  expansions?: Expansions | null;
  asparagus?: boolean;
  g: number;
  kind: string;
  boosters: boolean;
  srbs: ReadonlyArray<Engine>;
  /* What is already standing above this group: the stages of every group
     solved before it, as `stackOf` measures them. Slenderness is a property of
     the vehicle that leaves the pad, and a segment judged on its own chain is
     judged as though it were the whole rocket. Absent for the topmost group
     and for every mission with no cuts in it. #102 */
  above?: { h: number; w: number };
  /* Absent on a segment that flies nowhere near a body with air, which is what
     `prepare` tests before asking for its surface pressure. */
  bodyName?: string;
  objective?: Objective;
  regime?: Regime;
  minK: number;
  maxK: number;
  /* The legs this group flies, in flight order, each with the fraction of the
     group's Δv at which it ends (the last is 1), its kind, the gravity its
     burn is judged against and the body it burns at. Plain data, so it crosses
     the seam and rides to the unit workers. Absent from callers that have a
     Δv and nothing else — the design grid — and then every stage is judged as
     the group's kind says, which is what the grid pins. With it, each stage
     is judged by the legs its own slice of the Δv covers: the pressure it
     lights at, the gravity it fights and the floor that fits. A cut group
     that began in orbit used to get the pad's pressure, Kerbin's gravity and
     the landing floor for every stage, and solid boosters on a stage that
     separates in vacuum. #347 */
  legs?: ReadonlyArray<GroupLeg>;
};

type GroupLeg = {
  end: number;
  kind: string;
  g: number;
  body: string | null;
  /* Null on an ascent, a landing and an aerobrake, which are not spread
     impulses, and on a group whose caller gave no route at all. */
  orbit?: BurnOrbit | null;
  /* What the leg costs as a spiral over many revolutions, as a multiple of
     the impulsive Δv it is budgeted at — 2.4 on an escape from low orbit.
     Null where the leg has no spiral price, which is every leg with no orbit
     and every group solved without a route. #415 */
  spiral?: number | null;
  /* Whether that price stands only after the leg before was itself flown as
     a spiral by the same stage. `Leg.spiralAfter` in orbits.ts. */
  spiralAfter?: boolean;
};

/* What one stage of a chain is judged against, from the legs its slice of the
   group's Δv covers. `lo` and `hi` are fractions of the group's Δv, bottom
   stage first; `ordinal` counts the stages before this one that also start
   inside the same ascent leg, which is what STAGE_PRESSURE is indexed by. */
/* The landing floor, per body. A stage that lands must out-thrust the body's
   pull by enough to stop a fall, and what stops a fall is the net
   deceleration, (TWR − 1)·g, not the ratio: 1.6 everywhere bought 0.29 m/s² on
   Minmus and 4.7 on Tylo, which is backwards from where landings are hard. So
   every lander is asked for the same LANDING_MARGIN of net deceleration,
   floor = 1 + margin / g, clamped: tiny moons would otherwise demand ratios
   the smallest engine already exceeds, and heavy bodies keep a margin a
   suicide burn can be flown at. About 2 on the Mun, 1.3 on Tylo. A landing
   through more than an atmosphere of air keeps its own lower floor, because
   thick air punishes a hard descent. #347 */
const LANDING_MARGIN = 2; // m/s² of deceleration in hand, beyond hovering
const LANDING_FLOOR_MIN = 1.3;
const LANDING_FLOOR_MAX = 2.5;
const landingFloor = (g: number, p0: number) =>
  p0 > 1
    ? 1.35
    : Math.min(
        LANDING_FLOOR_MAX,
        Math.max(LANDING_FLOOR_MIN, 1 + LANDING_MARGIN / g),
      );

/* One leg's share of a stage's Δv, and how fast the orbit it is burnt in turns.
   `share` is a fraction of the stage's own requirement and the shares sum to 1;
   `omega` is zero where the leg is not a spread impulse — an ascent, a landing,
   an aerobrake — or where the caller gave no route. #410 */
type StageBurn = {
  share: number;
  omega: number;
  /* What the leg is and where, so a stage can say which of its burns the arc
     cost went on rather than quoting one number for several. */
  kind: string;
  body: string | null;
  /* The low-thrust price of the leg, as a multiple of its impulsive one.
     Zero where the leg has none, and then a burn too long for the closed
     form is refused rather than spiralled. */
  spiral: number;
  /* Whether that price presumes the leg before was flown as a spiral by the
     same stage — a capture from rest at the edge, which only a craft that
     spiralled out to match the body's speed arrives at. A stage may not begin
     its spiralling on such a leg. */
  after: boolean;
};

type StageParams = {
  twrMin: number;
  g: number;
  pRef: number;
  pSt: number;
  /* The clock, kept for the two cases an arc cannot be computed for: the pad,
     where a long burn is gravity loss rather than impulsive error, and a group
     solved with no legs at all. Infinite where the arc does the work. */
  maxBurn: number;
  mounts: boolean;
  burns: ReadonlyArray<StageBurn>;
  /* Whether every leg the stage flies is a burn made in orbit — a transfer, a
     capture, a plane change — with nothing to climb or land. Only then is a
     thrust floor meaningless for an engine whose burns are spirals: the
     spiral price is what low thrust costs, and a floor on top of it would
     charge for the same thing twice. False without a route. #415 */
  coasts: boolean;
  /* Where a power plant would have to work: the least sunlight any of this
     stage's burns is made in, and the worst shadow it has to cross. Only an
     electric engine reads it, and none is offered yet. #414 */
  power: { flux: number; dark: number; period: number };
};

/* What a stage must carry to deliver `dv` across the legs it flies.

   Each leg is a separate burn, made at a different point of a different orbit,
   and what it costs above the impulse the route budgeted is set by the arc it
   sweeps there — `finiteBurnDv` in performance.ts, and #409 for the form. So
   the walk goes leg by leg, spending the stage down as it goes: a burn made
   later is made lighter, takes less propellant for the same Δv, and sweeps
   less arc for it.

   The applied Δv is corrected once per leg rather than solved for. A second
   pass would move it by the square of a few percent, which is nothing against
   a tank quantum.

   Null where any one of the burns sweeps an arc the closed form will not stand
   behind, which is the refusal that replaces the clock.

   What this does not model: several stages sharing one leg burn one after
   another, so their arcs run on from each other and only the sequence as a
   whole is centred on the ideal point. Priced independently, as here, a leg
   split n ways is charged about n times less than it should be. The legs that
   are split most are the ascents, which carry no arc at all; see
   .claude/rules/solver.md. #410 */
/* The leg the last walk spent most of its arc cost on. Module scratch rather
   than a returned object: the walk runs once per candidate in the widest loop
   in the program, and `solveStage` reuses a scratch Solution for the same
   reason. Only a candidate that is accepted ever reads it. */
let worstArc = 0,
  worstKind = "",
  worstBody: string | null = null,
  worstPasses = 1;
/* Which of a stage's burns the walk has been told to fly as spirals whatever
   their arc, and where it last asked for one. A capture from rest at the edge
   is only what a craft that spiralled out to match the body arrives at: a
   stage whose capture comes out a spiral has to have flown the transfer
   before it as one too, even where that burn's own arc — weeks of thrusting
   on a solar orbit of years — would have let it pass as a long impulse. So
   the walk is run again with that burn forced, and again if that forces
   another, until it settles or a burn with no spiral price is reached. Module
   scratch for the same reason as the fields above. #415 */
const forced: Array<boolean> = [];
let retryAt = -1;

function needFor(
  burns: ReadonlyArray<StageBurn>,
  dv: number,
  m0: number,
  ve: number,
  mdot: number,
  regime: Regime,
) {
  forced.length = 0;
  for (let attempt = 0; attempt <= burns.length; attempt++) {
    retryAt = -1;
    const need = walkBurns(burns, dv, m0, ve, mdot, regime);
    if (need !== null) return need;
    if (retryAt < 0) return null;
    forced[retryAt] = true;
  }
  return null;
}

function walkBurns(
  burns: ReadonlyArray<StageBurn>,
  dv: number,
  m0: number,
  ve: number,
  mdot: number,
  regime: Regime,
) {
  /* What the mission will fly. The physics of a burn is the same on every
     rung; a rung only refuses the designs that need a burn the reader has
     not agreed to sit through. #416 */
  const kicks = regime === "long" || regime === "low";
  const spirals = regime === "low";
  const onePass = regime === "impulsive" ? IMPULSIVE_ARC : ARC_MAX;
  let m = m0,
    need = 0,
    dearest = -1;
  worstArc = 0;
  worstKind = "";
  worstBody = null;
  worstPasses = 1;
  /* Whether the burn before this one, plane changes aside, was a spiral:
     what a capture priced from rest at the edge has to follow. */
  let lastSpiral = false;
  let lastAt = -1;
  for (let i = 0; i < burns.length; i++) {
    const b = burns[i];
    const d = dv * b.share;
    let applied = d;
    let spiral = false;
    if (b.omega > 0) {
      const t = (m - m * Math.exp(-d / ve)) / mdot;
      const arc = b.omega * t;
      /* A transfer is flown in periapsis kicks where they earn their keep; a
         capture has one periapsis and has to be bound by the end of it. */
      let passes = 1;
      /* Three regimes by arc. Under `ARC_MAX` a pass is a long impulse and
         costs the sinc penalty; up to a revolution a transfer is split into
         passes that each stay under it; past a revolution the burn is a
         spiral over many turns and costs the spiral price — the whole
         circular speed to escape, the difference of circular speeds between
         orbits, Edelbaum for a turn — where the leg has one, and is refused
         where it has not. A capture or a turn that one pass cannot make is a
         spiral or nothing. The two forms do not meet, and the solver keeps
         clear of the gap on its own: nothing that can make a burn in a
         fraction of an orbit is priced as a spiral, and an ion engine cannot
         make one in less than several. #415 */
      if (forced[i] || arc >= SPIRAL_ARC) spiral = true;
      else if (b.kind === "transfer" && kicks) {
        const split = splitBurn(d, arc);
        if (split === null) spiral = true;
        else {
          applied = split.applied;
          passes = split.passes;
        }
      } else {
        const grown = arc > onePass ? null : finiteBurnDv(d, arc);
        if (grown === null) spiral = true;
        else applied = grown;
      }
      if (spiral) {
        if (!spirals || !(b.spiral > 0)) return null;
        /* A capture from rest at the edge is only what a craft that
           spiralled out to match the body arrives at; a stage that did not
           make that spiral itself has an excess to kill that no spiral price
           includes, and cannot kill it slowly. Where the burn before it can
           be a spiral, ask for the walk again with it flown as one; where
           there is none, or it has no spiral price, the stage cannot fly. */
        if (b.after && !lastSpiral) {
          if (lastAt < 0 || !(burns[lastAt].spiral > 0) || forced[lastAt])
            return null;
          retryAt = lastAt;
          return null;
        }
        applied = d * b.spiral;
        passes = 0;
      }
      if (applied - d > dearest) {
        dearest = applied - d;
        worstArc = arc;
        worstKind = b.kind;
        worstBody = b.body;
        worstPasses = passes;
      }
    }
    if (b.kind !== "plane") {
      lastSpiral = spiral;
      lastAt = i;
    }
    need += applied;
    m *= Math.exp(-applied / ve);
  }
  return need;
}

/* Electric propulsion, and when it is admitted.

   An ion engine is an engine flying on nothing until two things are paid for.
   A power plant — panels sized for the sun where the farthest burn is made,
   a battery for the shadow, or a generator where neither will do — which is
   mass and money the stage carries like any other part (#414, `sizePlant`).
   And the spiral: a Dawn cannot make any burn in a fraction of an orbit, so
   its burns are spirals over many revolutions and cost the spiral Δv, 2.4
   times the impulse on an escape (#415, `spiralOf` in orbits.ts).

   Both are known only where the stage has a route: the plant needs the sun
   and the shadow at each burn, the spiral needs the orbit each burn is made
   in. A group solved with no legs — the design grid — has neither, and there
   an electric engine is left out because nothing can price it, which is what
   keeps that baseline where it is. The 420 s clock used to keep ions out by
   accident; #410 replaced the clock with an arc and the mass objective
   answered Eeloo with fourteen ion engines and no power system; this is the
   exclusion made on purpose and then lifted on purpose. Xenon is the marker
   because the catalogue's one electric engine is the only thing that burns
   it. */
const electric = (e: { f: ReadonlyArray<string> }) => e.f.includes("Xe");
const sizeable = (
  e: { f: ReadonlyArray<string> },
  burns: ReadonlyArray<StageBurn>,
  regime: Regime,
) => !electric(e) || (regime === "low" && burns.some((b) => b.omega > 0));

/* How many separate ignitions a stage's slice of the route amounts to.

   Each leg is a burn made at its own point of its own orbit, with a coast in
   between, so legs and ignitions are the same count — with one exception. Two
   climbs off the same body back to back are one continuous run to orbit, with
   nothing shut down between them, and a stage covering only those has lit once.
   No route in the catalogue currently puts two together; the rule says what it
   means rather than counting blindly, so the next one that does is right by
   construction. #435 */
const climbing = (kind: string) => kind === "ascent" || kind === "ascentBack";
function ignitions(burns: ReadonlyArray<StageBurn>) {
  let n = 0;
  for (let i = 0; i < burns.length; i++) {
    const prev = i > 0 ? burns[i - 1] : null;
    const continuous =
      prev !== null &&
      climbing(burns[i].kind) &&
      climbing(prev.kind) &&
      burns[i].body === prev.body;
    if (!continuous) n++;
  }
  return n;
}

function stageParamsFor(
  legs: ReadonlyArray<GroupLeg & { p0: number }>,
  lo: number,
  hi: number,
  ordinalIn: (legIx: number) => number,
): StageParams {
  const eps = 1e-9;
  let start = 0;
  let twrMin = 0.5,
    g = legs[0].g,
    demand = -1;
  let pRef = 0,
    pSt = 0,
    mounts = false;
  let startIx = -1;
  /* The same overlap walk `burnPortions` does in the Δv domain, in the
     fraction domain the group's shares live in. A stage's slice is not cut on
     leg boundaries, so it can take part of one leg, all of several, or a piece
     of each end — and each piece is a separate burn in its own orbit. #418 */
  const span = hi - lo;
  const burns: Array<StageBurn> = [];
  /* A plant that cannot run at the farthest point the stage burns cannot fly
     the mission, so the worst of them is what it is sized for. A burn made in
     solar orbit is its own distance from the sun and has nothing to hide
     behind; one made about a body takes that body's distance and shadow. */
  let flux = 1,
    dark = 0,
    period = 0;
  let coasts = true;
  legs.forEach((l, j) => {
    const s0 = start;
    start = l.end;
    if (l.end <= lo + eps || s0 >= hi - eps) return; // no overlap
    const climbs = l.kind === "ascent" || l.kind === "ascentBack";
    const lands = l.kind === "land";
    if (!l.orbit) coasts = false;
    const atStart = lo <= s0 + eps;
    if (span > eps)
      burns.push({
        share: (Math.min(hi, l.end) - Math.max(lo, s0)) / span,
        omega: l.orbit ? omegaOf(l.orbit) : 0,
        kind: l.kind,
        body: l.orbit ? l.orbit.body : l.body,
        spiral: l.spiral ?? 0,
        after: !!l.spiralAfter,
      });
    if (l.orbit) {
      const b = l.orbit.body;
      /* How far from the sun the burn is made: the orbit's own radius about
         the Sun, or the distance of the planet — a moon's `sma` is about its
         planet, and read as a distance from the sun it put Tylo in Kerbin's
         light. */
      let planet = b;
      while (SYS[planet]?.parent && SYS[planet].parent !== "Sun")
        planet = SYS[planet].parent!;
      const sun = b === "Sun" ? l.orbit.r : (SYS[planet]?.sma ?? NaN);
      if (isFinite(sun) && sun > 0) {
        const f = (SYS.Kerbin.sma! / sun) ** 2;
        if (f < flux) flux = f;
      }
      const shade = b === "Sun" ? 0 : darkFraction(SYS[b].R, l.orbit.r);
      if (shade > dark) {
        dark = shade;
        period = (2 * Math.PI) / omegaOf(l.orbit);
      }
    }
    if (startIx < 0) {
      startIx = j;
      if (climbs) {
        pRef = l.p0 * STAGE_PRESSURE[Math.min(ordinalIn(j), 3)];
        pSt = atStart ? l.p0 : pRef; // it lights where it sits
        mounts = atStart && l.p0 > 0.1;
      }
    }
    /* The floor each leg would ask of a stage flying it, and the acceleration
       that floor amounts to; the most demanding leg sets the stage's. */
    const floor = climbs
      ? atStart
        ? 1.25
        : 0.8
      : lands
        ? landingFloor(l.g, l.p0)
        : 0.5;
    if (floor * l.g > demand) {
      demand = floor * l.g;
      twrMin = floor;
      g = l.g;
    }
  });
  /* The pad keeps its clock: down there a long burn is gravity loss, which is
     a different thing from the impulsive error an arc measures, and the 200 s
     is what the design snapshot has always been solved against. Above it the
     arc does the work and there is no clock at all. */
  return {
    twrMin,
    g,
    pRef,
    pSt,
    maxBurn: pSt > 0.5 ? 200 : Infinity,
    mounts,
    burns,
    coasts,
    power: { flux, dark, period },
  };
}

function solveStage({
  dv,
  payload,
  engines,
  tanks,
  unlocked,
  excluded,
  twrMin,
  g,
  pRef = 0,
  pSurf = 0,
  extra,
  maxBurn = 420,
  burns = [],
  coasts = false,
  power = { flux: 1, dark: 0, period: 0 },
  regime = REGIME_DEFAULT,
  objective = "mass",
  needGimbal = false,
  hasStageBelow = false,
  noPlate = false,
  expansions = null,
  plateAbove = false,
  capCluster = 0,
}: StageOpt): Solution | null {
  if (!isFinite(dv) || dv <= 0) return null; // refuse a nonsense requirement outright
  /* Most stages have no arc to price — every leg of a launch group climbs, and
     a burn made out between the planets sweeps nothing — so the walk is worth
     skipping outright rather than running to add zero. */
  const anyArc = burns.some((b) => b.omega > 0);
  /* A solid cannot be throttled, shut down or relit: once it is lit it burns
     its grain to depletion. So a stage whose own engine is a solid flies
     exactly one burn. It may take part of a leg — the stage below finishes the
     rest, burning after it rather than with it — but not two legs, because two
     legs are two ignitions with a coast between them. Before this a Pol return
     was offered as one Kickback covering a landing, a climb, a transfer and an
     aerobrake: a design that is flyable only on paper. #435

     The ordinary use of a solid is a strap-on ring, which `boostedAscent`
     builds on a different path and which this does not touch: the ring lights
     at liftoff, burns out and is dropped, and that is one burn. */
  const manyBurns = ignitions(burns) > 1;
  /* A stage that flies through air has to steer. Without a gimbal you are relying
     on fins and reaction wheels alone, which is how a launch ends up pinwheeling
     off the pad — so by default an atmospheric stage needs a vectoring nozzle.
     Solids never gimbal, which is exactly why they are strap-ons rather than
     cores. */
  const gimbalNeeded = needGimbal && pSurf > 0.02;
  let best: Solution | null = null;
  /* One scratch object, filled and re-filled. A stage design is built, scored,
     compared and thrown away tens of thousands of times per solve — only the few
     that become the new best need to outlive the iteration, so only those are
     copied. Everything the candidate points at (tanks, structure) is already a
     distinct object per candidate, so a shallow copy is enough. */
  /* Asserted, and this is the one place in the conversion that is. Every field
     is written before `consider` sees it, so the object is a complete solution
     by the time anything reads one — but the compiler cannot be shown that
     without either a blank initialiser allocated per solve or a partial type
     that would make every read below ask whether the field is there. On the
     hottest object in the solver, saying it once here is the cheapest of the
     three. */
  const scratch = {} as Solution;
  /* A shallow copy, which is all a candidate needs: everything it points at
     (tanks, structure) is already a distinct object per candidate. Spread
     rather than the `for...in` this used to be — the scratch is a plain object
     literal with nothing on its prototype, so the two copy exactly the same
     properties. */
  /* The scratch candidate carries `finite` on every pass so its shape stays
     the same one; a stage that paid nothing drops the key on the way out, so a
     launch — which sweeps no arc at all — looks exactly as it did before there
     was such a thing to carry. #411 */
  const keep = (c: Solution): Solution => {
    const out = { ...c };
    if (out.finite == null) delete out.finite;
    if (out.plant == null) delete out.plant;
    return out;
  };
  const consider = (cand: Solution) => {
    if (!cand) return;
    TALLY.stages++;
    /* A part with impossible bookkeeping — negative dry mass, fuel heavier than
       the whole part — produces a negative mass ratio and a NaN dv that then
       renders as "NaN m/s". Reject the candidate rather than let it through. */
    if (
      !isFinite(cand.total) ||
      !isFinite(cand.dv) ||
      !isFinite(cand.twr) ||
      cand.total <= 0 ||
      cand.dry <= 0 ||
      cand.dv <= 0
    )
      return;
    cand.cost = stageCost(cand);
    cand.parts = stageParts(cand);
    cand.score = scoreOf(cand, objective);
    if (!best || cand.score < best.score) best = keep(cand);
  };

  for (const e of engines) {
    if (!sizeable(e, burns, regime)) continue;
    if (manyBurns && e.f.includes("SF")) continue;
    if (gimbalNeeded && !(e.gim > 0)) continue;
    /* Charge a second per engine at full throttle, for a plant to make. Zero
       for anything that burns propellant alone. */
    const draw = drawOf(e.n);
    /* No thrust floor for an electric engine whose every burn is in orbit:
       its burns are spirals, and the spiral price is what its low thrust
       costs. Anywhere it has to climb or land the floor stands, and keeps it
       out. */
    const floor = draw > 0 && coasts ? 0 : twrMin;

    const cap = maxCluster(e, unlocked, excluded);
    /* The cluster cap limits engines on one column, not engines on the stage. A
       Skipper cannot be clustered — no stock coupler has 2.5 m outlets — but
       three Skippers on three radial stacks need no coupler at all. Breaking out
       of this loop at the cap meant a 2.5 m engine could never appear more than
       once, which left heavy launches with no gimballed option and no design. */
    /* 5, 7 and 9 are the plates' 4x1, 6x1 and 8x1 patterns — one engine in the
       middle and four, six or eight around it. Nothing else mounts those counts,
       so without the plates in the table they were unreachable. */
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      if (n > cap * 9) break;
      if (capCluster && n > capCluster) continue;
      /* Some engines gimbal in one plane only — the Trash Panda's ModuleGimbal
         carries yMult = 0, which zeroes one axis. A pair steers in that plane and
         does nothing in the other, so the stack has no authority about one axis
         and departs as soon as anything disturbs it. Two perpendicular pairs
         restore full control, so require at least four. */
      if (gimbalNeeded && e.gim1 && n < 4) continue;
      /* A radial engine bolts to the side of the stack, so one on its own thrusts
         off the centreline and the craft yaws. Two or more placed on radial
         symmetry balance out — three at 120° is as sound as four at 90°, which is
         why this is a floor of two rather than a requirement to be even. */
      if (isRadial(e) && n < 2) continue;
      const ispE = ispAt(e, pRef); // efficiency over the burn
      if (ispE < 20) continue; // engine is dead at this pressure
      /* Below this count the stage cannot meet its thrust floor whatever else is
         chosen, because m0 is at least the payload it carries and thrust is
         exactly proportional to n. Everything under it is a wasted trip through
         tank selection and structure fitting.

         Both sides matter: the mass floor is payload plus fixed extras (never
         less), and the thrust is the engine's output at the pressure it lights
         at, not its vacuum rating — using vacuum thrust here would overstate what
         one engine does and let the bound sit too low to be worth having. */
      const thrust1 = e.fv * (ispAt(e, pSurf) / e.iv);
      if (n < Math.ceil((floor * (payload + extra) * g) / thrust1)) continue;

      const thrust = n * e.fv * (ispAt(e, pSurf) / e.iv); // thrust where it lights
      const mdot = (n * e.fv) / (e.iv * G0); // mass flow is constant in KSP

      if (e.fuelM > 0) {
        /* Self-contained booster (SRB or Twin-Boar): can't tune propellant.

           More than one of these still has to hang off something. A radial part
           bolts to the side of the core and needs nothing, but a stack-mounted
           engine-and-tank like the Twin-Boar is a column: four of them side by
           side need a coupler or an engine plate at the top, exactly as four bare
           engines would. This branch skipped that check entirely, which is how
           four Twin-Boars appeared with nothing joining them to the stage above. */
        const selfCoup =
          n > 1 && !isRadial(e)
            ? couplerFor(e, n, unlocked, excluded, noPlate, expansions)
            : null;
        if (n > 1 && !isRadial(e) && !selfCoup) continue;
        const selfShroud =
          selfCoup && selfCoup.plate
            ? shroudFor(selfCoup.n, heightOf(e, 1))
            : null;
        const selfCoupM = selfShroud ? selfShroud.m : selfCoup ? selfCoup.m : 0;
        const selfDec = plateAbove
          ? null
          : decouplerFor(unlocked, diaOf(e), excluded);
        const mf =
          payload + extra + n * e.dry + selfCoupM + (selfDec ? selfDec.m : 0);
        const m0 =
          payload + extra + n * e.m + selfCoupM + (selfDec ? selfDec.m : 0);
        const got = ispE * G0 * Math.log(m0 / mf);
        if (got < dv * 0.995) continue;
        const twr = thrust / (m0 * g);
        if (twr < twrMin) continue;
        scratch.engine = e;
        scratch.n = n;
        scratch.tanks = null;
        scratch.stacks = 1;
        scratch.adapters = null;
        scratch.rejoin = null;
        scratch.joiner = null;
        scratch.perStack = null;
        scratch.total = m0;
        scratch.wet = m0;
        scratch.dry = mf;
        scratch.burn = (n * e.fuelM) / mdot;
        scratch.coupler = selfCoup;
        scratch.shroud = selfShroud;
        scratch.decoupler = selfDec
          ? {
              m: selfDec.m,
              n: selfDec.n,
              cost: selfDec.cost,
              d: diaOf(e),
              qty: 1,
            }
          : {
              m: 0,
              n: null,
              cost: 0,
              d: diaOf(e),
              qty: 0,
              viaPlateAbove: true,
            };
        scratch.boosters = null;
        scratch.dv = got;
        scratch.twr = twr;
        scratch.twrBurnout = thrust / (mf * g);
        scratch.prop = n * e.fuelM;
        scratch.isp = Math.round(ispE);
        scratch.finite = null;
        scratch.plant = null;
        consider(scratch);
        continue;
      }

      const groups = poolsFor(e, tanks);
      if (!groups.length) continue;
      const dryBase = payload + extra + n * e.m;

      for (const grp of groups) {
        // one per tank diameter
        /* A radial engine bolts to the tank's wall, and an oval's wall is at
           no one radius (#467). */
        if (isRadial(e) && grp.lifting) continue;
        /* Parallel stacks. Nine tanks in a column is 30 m of rocket; the same
         propellant in three columns of three is a third of that and far easier to
         build. Each stack carries its own engines and its own tanks, all burning
         together and staged as one — mass is unchanged, height divides by the
         stack count, and the price is frontal area, since every column meets the
         air rather than hiding behind the one in front. */
        /* A central stack with radial stacks bolted around it. Unlike joining
         columns end to end, this needs only a radial decoupler per outer stack,
         so any diameter and any symmetric count works — which is why it is
         buildable where parallel columns were not. No crossfeed: each stack
         drains its own tanks, and since they are identical they burn out
         together, so the whole thing behaves as one large stage. */
        for (const stacks of [1, 3, 4, 5, 7, 9]) {
          if (n % stacks !== 0) continue;
          if (n / stacks > cap) continue; // per column, the cap does apply
          if (stacks > 1 && isRadial(e)) continue;
          const { usable, k, dia: stackD, biggest } = grp;
          /* A cluster hangs off a coupler, so the adapter run starts at the coupler's
           upper face rather than the engine's own diameter. */
          const fit = fitStructure({
            engine: e,
            n,
            stacks,
            stackD,
            tanks,
            unlocked,
            excluded,
            noPlate,
            expansions,
            plateAbove,
            hasStageBelow,
          });
          if (!fit) continue;
          const { coup, shroud, adapt, rejoin, dec, joiner } = fit;
          let fixed = dryBase + fit.dry;

          let mp0 = propellantFor(dv, fixed, ispE, k);
          if (mp0 === null) continue;
          /* The plant an electric engine flies on, carried as dry mass. Its
             size depends on the burn only through the shadow it has to cross
             and the fuel a cell burns, so it is sized once on the burn the
             first estimate implies, and checked below against the burn the
             stage actually makes. Nothing to make the charge with — nothing
             unlocked, or a demand no count of it meets — and the stage
             cannot fly. */
          let plant: Plant | null = null;
          if (draw > 0) {
            const seconds = (mp0 * (1 + k) + adapt.prop) / mdot;
            plant = sizePlant(
              { ec: n * draw, seconds, ...power },
              unlocked,
              excluded,
              objective,
              expansions,
            );
            if (!plant) continue;
            fixed += plant.m;
            mp0 = propellantFor(dv, fixed, ispE, k);
            if (mp0 === null) continue;
          }
          /* Where an arc is priced, aim the tanks at what the stage will
             actually have to carry rather than at the map's figure, or every
             candidate that a few percent would have saved is rejected for
             being a few percent short. The estimate uses the mass the first
             pass implies; the real one is checked below against the tanks that
             were packed. */
          let mp = mp0;
          if (anyArc) {
            const est = needFor(
              burns,
              dv,
              fixed + mp0 * (1 + k),
              ispE * G0,
              mdot,
              regime,
            );
            if (est === null) continue;
            if (est !== dv) {
              const grown = propellantFor(est, fixed, ispE, k);
              if (grown === null) continue;
              mp = grown;
            }
          }
          // Reject a diameter with no tank big enough to hold this propellant
          // sensibly — this is what stops 13x Oscar-B on a Spark.
          if (mp > 10 * biggest) continue;
          /* Size one column, then multiply — every stack is identical. */
          const per = Math.max(0.001, (mp - adapt.prop) / stacks);
          const one = pickTanksMemo(usable, per, 12, objective);
          if (!one) continue;
          const tk =
            stacks === 1
              ? one
              : {
                  list: one.list.map((x) => ({ t: x.t, c: x.c * stacks })),
                  prop: one.prop * stacks,
                  dryMass: one.dryMass * stacks,
                  count: one.count * stacks,
                  columnLen: null,
                };
          if (!tk) continue;
          let mf = fixed + tk.dryMass;
          let m0 = mf + tk.prop + adapt.prop;
          let got = ispE * G0 * Math.log(m0 / mf);
          /* A necessary condition and the cheapest one: the arc can only grow
             what is needed, never shrink it, so anything short of the map's
             figure is short of the priced one too. */
          if (got < dv * 0.995) continue;
          const twr = thrust / (m0 * g);
          if (twr < floor) continue;
          const burn = (tk.prop + adapt.prop) / mdot;
          /* Only the pad still keeps a clock, and only a group with no route
             at all keeps the old vacuum one. */
          if (burn > maxBurn) continue;
          /* The plant, sized again on the burn the packed tanks make. Heavier
             than what was budgeted for and the stage is short of Δv, which
             the check below sees; lighter and the budgeted plant stands — a
             part more than the minimum, and buildable. */
          if (plant) {
            const again = sizePlant(
              { ec: n * draw, seconds: burn, ...power },
              unlocked,
              excluded,
              objective,
              expansions,
            );
            if (!again) continue;
            if (again.m > plant.m + 1e-9) {
              mf += again.m - plant.m;
              m0 += again.m - plant.m;
              plant = again;
            }
          }
          got = ispE * G0 * Math.log(m0 / mf);
          if (got < dv * 0.995) continue;
          let finite: Solution["finite"] = null;
          if (anyArc) {
            const need = needFor(burns, dv, m0, ispE * G0, mdot, regime);
            /* An arc past what the closed form stands behind and no spiral
               price to fall back on: refused, which is what the 420 s clock
               used to do and on the right measure. */
            if (need === null) continue;
            if (got < need * 0.995) continue;
            if (need > dv)
              finite = {
                added: need - dv,
                arc: worstArc,
                kind: worstKind,
                body: worstBody,
                passes: worstPasses,
                ...(worstPasses === 0 ? { spiral: true } : {}),
              };
          }
          scratch.engine = e;
          scratch.n = n;
          scratch.tanks = tk;
          scratch.adapters = adapt;
          scratch.decoupler = dec;
          scratch.coupler = coup;
          scratch.rejoin = rejoin;
          scratch.stacks = stacks;
          scratch.perStack = one;
          scratch.shroud = shroud;
          scratch.joiner = joiner;
          scratch.boosters = null;
          scratch.total = m0;
          scratch.wet = m0;
          scratch.dry = mf;
          scratch.burn = burn;
          scratch.dv = got;
          scratch.twr = twr;
          scratch.twrBurnout = thrust / (mf * g);
          scratch.prop = tk.prop + adapt.prop;
          scratch.isp = Math.round(ispE);
          scratch.finite = finite;
          scratch.plant = plant;
          consider(scratch);
        }
      }
    }
  }
  return best;
}

/* Delta-v of a boosted stage for a given core propellant load.

   Hoisted to module scope and given its arguments explicitly. It used to be a
   closure defined at nesting depth thirteen inside the innermost loop, and the
   bracket counter puts its construction at 19,298,990 times per grid run —
   nineteen million closures, each capturing ten variables, all garbage a moment
   later. GC is 12.5% of a solve on a Pixel 8 against 3.9% in a container, so
   that allocation costs more on a phone than profiling here suggests.

   Ten positional arguments rather than an options object: an object would
   reintroduce the allocation this exists to remove. */
function boostDv(
  mp: number,
  burnA: number,
  fixed: number,
  k: number,
  nb: number,
  b: BoosterPart,
  drop: boolean,
  aspHere: boolean,
  ispCore: number,
  ispEff: number,
) {
  if (mp <= burnA * 1.02) return -1; // core has to outlast the boosters
  const m0 = fixed + k * mp + mp + nb * b.m;
  /* Solids cannot do this. Asparagus works by draining one stack's
   propellant through every engine on the rocket, and solid fuel does
   not flow — a Kickback burns its own grain and nothing else's. Only
   liquid columns qualify. */
  if (drop) {
    /* Only the core burns. It draws from the side tanks first, a pair at
     a time, dropping each pair's dry mass as it empties, and finishes
     on its own propellant. No extra thrust and no extra flow — the
     whole benefit is not carrying empty tankage to burnout. */
    const pairs = Math.floor(nb / 2);
    const perPair = 2 * b.fuelM,
      dryPair = 2 * b.dry;
    let m = m0,
      tot = 0;
    for (let q = 0; q < pairs; q++) {
      const mEnd = m - perPair;
      if (mEnd <= 0) return -1;
      tot += ispCore * G0 * Math.log(m / mEnd);
      m = mEnd - dryPair;
    }
    if (nb % 2) {
      const mEnd = m - b.fuelM;
      if (mEnd <= 0) return -1;
      tot += ispCore * G0 * Math.log(m / mEnd);
      m = mEnd - b.dry;
    }
    const mB1 = fixed + k * mp;
    if (m <= mB1) return -1;
    return tot + ispCore * G0 * Math.log(m / mB1);
  }
  if (!aspHere) {
    const mA = m0 - nb * b.fuelM - burnA;
    const mB0 = mA - nb * b.dry; // boosters away
    const mB1 = fixed + k * mp;
    return ispEff * G0 * Math.log(m0 / mA) + ispCore * G0 * Math.log(mB0 / mB1);
  }
  /* Pairs drop one at a time. Each phase burns one pair's propellant
   through every engine still attached, so the phase is short and the
   rocket sheds a pair's dry mass at the end of it. */
  const pairs = Math.floor(nb / 2);
  const perPair = 2 * b.fuelM,
    dryPair = 2 * b.dry;
  let m = m0,
    total = 0;
  for (let q = 0; q < pairs; q++) {
    const mEnd = m - perPair;
    if (mEnd <= 0) return -1;
    total += ispEff * G0 * Math.log(m / mEnd);
    m = mEnd - dryPair; // that pair leaves
  }
  if (nb % 2) {
    // an odd one out burns alone
    const mEnd = m - b.fuelM;
    if (mEnd <= 0) return -1;
    total += ispEff * G0 * Math.log(m / mEnd);
    m = mEnd - b.dry;
  }
  const mB1 = fixed + k * mp;
  if (m <= mB1) return -1;
  return total + ispCore * G0 * Math.log(m / mB1);
}

/* -------------------------- parallel solid boosters --------------------------
   Radial SRBs fire alongside the liquid core and are jettisoned at burnout, so
   the launch stage has two phases:
     A  boosters + core together, lasting t_b = booster fuel / booster flow
     B  core alone on whatever propellant phase A left it
   A KSP engine's mass flow is constant (mdot = F_vac / (Isp_vac·g0)); atmospheric
   thrust is just that flow times a lower Isp. So the combined Isp across phase A
   is total vacuum thrust over total flow — no averaging fudge required.        */
/* boostDv against the budget, as a module-level function.

   This was a closure inside solveCore, built once per bracket — around
   eighteen million per grid run. Hoisting dvOf out of the innermost loop was
   the point of the previous commit, and allocating a fresh closure one level
   down would have quietly put a fraction of it back.

   Eleven positional arguments is not pretty. An options object would be worse:
   it is the allocation this exists to avoid. */
function offsetDv(
  mp: number,
  dv: number,
  burnA: number,
  fixed: number,
  k: number,
  nb: number,
  b: BoosterPart,
  drop: boolean,
  aspHere: boolean,
  ispCore: number,
  ispEff: number,
) {
  const v = boostDv(mp, burnA, fixed, k, nb, b, drop, aspHere, ispCore, ispEff);
  return v < 0 ? v : v - dv;
}

/* Smallest core propellant load whose delta-v closes the budget.

   The bracket comes first, growing by 1.6 until the budget is met — that part
   was already efficient at 2.25 steps on average. What followed was twenty
   fixed bisections: 363 million evaluations across a grid run, 85% of every
   call this function makes.

   Illinois instead — regula falsi, halving the retained endpoint's value when
   it is kept twice so the interval cannot stagnate the way plain false position
   does. Superlinear, and it never leaves the bracket, so a pathological curve
   degrades to bisection rather than diverging.

   Returns the upper bound, as the bisection did: a value known to close the
   budget rather than one approaching it from below. `pickTanksMemo` is asked to
   cover it, and covering slightly too much is a heavier rocket while covering
   slightly too little is one that does not reach orbit.

   boostDv returns -1 for a load the stage cannot fly at all. That is a sentinel,
   not a delta-v, and interpolating through it would aim the secant at nothing,
   so those steps fall back to bisection. */
function solveCore(
  lo: number,
  hi: number,
  dv: number,
  burnA: number,
  fixed: number,
  k: number,
  nb: number,
  b: BoosterPart,
  drop: boolean,
  aspHere: boolean,
  ispCore: number,
  ispEff: number,
) {
  let flo = offsetDv(
      lo,
      dv,
      burnA,
      fixed,
      k,
      nb,
      b,
      drop,
      aspHere,
      ispCore,
      ispEff,
    ),
    fhi = offsetDv(
      hi,
      dv,
      burnA,
      fixed,
      k,
      nb,
      b,
      drop,
      aspHere,
      ispCore,
      ispEff,
    ),
    side = 0;
  /* Match what twenty halvings of this bracket delivered, so the answer is at
     least as precise as before rather than merely close to it. */
  const tol = Math.max(1e-9, (hi - lo) / 1048576);
  for (let i = 0; i < 40 && hi - lo > tol; i++) {
    let c;
    if (flo < 0 && fhi > 0 && isFinite(flo) && isFinite(fhi) && flo !== -1) {
      c = hi - (fhi * (hi - lo)) / (fhi - flo);
      /* Keep the step inside the bracket; a flat region can push it out. */
      const pad = (hi - lo) / 64;
      if (!(c > lo + pad && c < hi - pad)) c = (lo + hi) / 2;
    } else {
      c = (lo + hi) / 2;
    }
    const fc = offsetDv(
      c,
      dv,
      burnA,
      fixed,
      k,
      nb,
      b,
      drop,
      aspHere,
      ispCore,
      ispEff,
    );
    if (fc >= 0) {
      hi = c;
      fhi = fc;
      if (side === 1) flo /= 2;
      side = 1;
    } else {
      lo = c;
      flo = fc;
      if (side === -1) fhi /= 2;
      side = -1;
    }
  }
  return hi;
}

function boostedAscent({
  dv,
  payload,
  engines,
  tanks,
  unlocked,
  excluded,
  needGimbal,
  twrMin,
  g,
  extra,
  srbs,
  pRef = 0.62,
  pSurf = 1,
  objective = "mass",
  noLiquid = false,
  noPlate = false,
  expansions = null,
  asparagus = false,
  plateAbove = false,
}: BoostOpt): Solution | null {
  let best: Solution | null = null;

  /* Tank pools depend only on the core engine, so build them once. This runs
     inside a split search now, and re-filtering 64 tanks per combination was
     the whole cost of the function. */
  const cores: Array<{
    c: Engine;
    k: number;
    usable: TankPool;
    grp: Pool;
    cap: number;
  }> = [];
  for (const c of engines) {
    /* A boosted core climbs off a pad, which is no place for an electric
       engine whatever its route. */
    if (electric(c)) continue;
    /* A boosted core still flies through the whole atmosphere, so it needs to
       steer just as much as an unboosted one. This check was only in solveStage,
       which let a Reliant core through the moment boosters were involved. */
    if (needGimbal && pSurf > 0.02 && !(c.gim > 0)) continue;

    if (c.fuelM !== 0 || !c.f.includes("Ox")) continue;
    /* Not a lifting body: a ring of boosters or columns bolts to the core's
       wall, and an oval has no wall at one radius (#467). */
    for (const grp of poolsFor(c, tanks))
      if (!grp.lifting)
        cores.push({
          c,
          k: grp.k,
          usable: grp.usable,
          grp,
          cap: Math.min(4, maxCluster(c, unlocked, excluded)),
        });
  }
  if (!cores.length) return null;

  /* A mount is whatever the ring is made of, with the two figures the two-phase
     maths needs. A solid booster, a powered liquid column and a bare drop tank
     all present the same fields. */
  type Mount = { b: BoosterPart; mdotB: number; tB: number };
  const mounts: Array<Mount> = [];
  for (const b of srbs) {
    if (!b.sz.includes("R")) continue; // must be radially mountable
    const mdotB = b.fv / (b.iv * G0);
    const tB = b.fuelM / mdotB; // booster burn time, seconds
    if (tB < 20) continue; // too brief to be a stage
    mounts.push({ b, mdotB, tB });
  }

  /* Liquid radial stacks, as mounts. A column of engine plus tanks behaves
     exactly like a solid booster from the two-phase maths' point of view — it
     burns for a while alongside the core and is then dropped — so rather than
     write that again, a column is dressed up to expose the same five fields an
     SRB does: vacuum thrust, vacuum Isp, wet mass, propellant, dry mass. It also
     keeps the engine's own atmosphereCurve, so ispAt works on it unchanged.

     The free parameter is burn time. Fixing the engine to the core's own means
     the column is the same size as the core or smaller, which is the case worth
     covering and keeps the search bounded. Different burn times are the whole
     point: a shorter column drops earlier and lighter. */
  /* Side tanks with no engine on them. They feed the core through crossfeed and
     are dropped as they empty, so the stack sheds their dry mass part-way up
     instead of carrying it to burnout — the same mechanism asparagus uses, minus
     the engines. On identical propellant that is worth more, because an engine
     per stack is pure overhead unless the thrust is actually needed.

     What they do not give is thrust. Liftoff TWR is strictly worse than the same
     core without them, so they only work where the core has thrust to spare. */
  const tankMounts = (coreEngine: Engine, grp: Pool | null) => {
    const out: Array<Mount> = [];
    if (!grp || !grp.usable.length) return out;
    const mdot1 = coreEngine.fv / (coreEngine.iv * G0);
    /* Four sizes, not seven. A drop tank's value is a smooth function of how much
       propellant it holds, so the ladder does not need to be fine — and every rung
       multiplies through the booster-count and core-size search beneath it. */
    for (const tB of [60, 130, 260, 450]) {
      const prop = mdot1 * tB;
      const tk = pickTanksMemo(grp.usable, prop, 12, objective);
      if (!tk) continue;
      tk.funds = tk.list.reduce((a2, x) => a2 + x.c * (x.t.cost || 0), 0);
      out.push({
        b: {
          n: "drop tank",
          fv: 0,
          iv: coreEngine.iv,
          ia: coreEngine.ia,
          m: tk.dryMass + tk.prop,
          fuelM: tk.prop,
          dry: tk.dryMass,
          /* Nothing, and said rather than left out. A drop tank is tankage and
             the decoupler holding it on: `column.funds` prices the tanks and
             `DECOUPLER_FUNDS` the decoupler, both added beside this in
             `stageCost`, and there is no engine here to charge for. Omitted, it
             was `undefined` in that sum — so the stage priced NaN, and since
             every comparison against NaN is false it could never win the cost
             objective at any payload. #93 */
          cost: 0,
          sz: coreEngine.sz,
          f: coreEngine.f,
          t: null,
          column: tk,
          dropTank: true,
          nEng: 0,
        },
        mdotB: 0,
        tB,
      });
    }
    return out;
  };

  const liquidMounts = (coreEngine: Engine, grp: Pool | null) => {
    const out: Array<Mount> = [];
    if (!grp || !grp.usable.length) return out;
    const mdot1 = coreEngine.fv / (coreEngine.iv * G0);
    /* A column is normally sized as a booster: a short burn strapped to the side
       of a core that does the real work. Asparagus inverts that. Because the
       outermost pair feeds every engine, the side stacks want to be as large as
       the core or larger — that is where the gain lives, and it scales with how
       much of the rocket sits in them, not with how many there are. A 27 t column
       is worth about 4%; a 70 t column is worth 12%.

       So when the user asks for asparagus, the burn-time ladder is extended well
       past what makes sense for a booster. The tank limit goes up with it, since
       a full-size stack needs more than eight tanks. */
    for (const tB of asparagus
      ? [30, 45, 60, 90, 130, 200, 300, 450, 650] // extends the ladder, never shortens it
      : [30, 45, 60, 90, 130]) {
      const prop = mdot1 * tB;
      const tk = pickTanksMemo(grp.usable, prop, asparagus ? 12 : 8, objective);
      if (!tk) continue;
      const realT = tk.prop / mdot1;
      if (realT < 20) continue;
      const dry = coreEngine.m + tk.dryMass;
      // the column's own funds, so cost and part counts include its tanks
      tk.funds = tk.list.reduce((a2, x) => a2 + x.c * (x.t.cost || 0), 0);
      out.push({
        b: {
          ...coreEngine,
          fv: coreEngine.fv,
          m: dry + tk.prop,
          fuelM: tk.prop,
          dry,
          column: tk,
          nEng: 1,
        },
        mdotB: mdot1,
        tB: realT,
      });
    }
    return out;
  };

  /* Necessary condition, independent of which boosters get bolted on: once they
     separate the core alone must still make 0.85 TWR, and it can only get
     lighter than the payload it is already carrying. Anything failing this can
     never produce a valid design, so reject it before bisecting.
     This is the whole cost of the function — the search was making 89 million
     dvOf calls across 2.7 million combinations. */
  const floor = 0.85 * g * (payload + extra);
  const viable: Array<{ core: (typeof cores)[number]; nc: number }> = [];
  for (const core of cores)
    for (let nc = isRadial(core.c) ? 2 : 1; nc <= core.cap; nc++)
      // a lone radial thrusts off-axis
      // a one-plane gimbal needs two perpendicular pairs to control both axes
      if (!(needGimbal && pSurf > 0.02 && core.c.gim1 && nc < 4))
        if (nc * core.c.fv * (ispAt(core.c, pSurf) / core.c.iv) >= floor)
          viable.push({ core, nc });

  for (const { core, nc } of viable) {
    /* In vacuum there is nothing for a booster to do — solids and powered columns
       both exist to help climb out of air. Only drop tanks are worth trying up
       here, and trying the other two anyway made an asparagus solve seven times
       slower than a plain one for no possible gain. */
    const vac = pSurf <= 0.1;
    const all = noLiquid
      ? vac
        ? []
        : mounts
      : vac
        ? asparagus
          ? tankMounts(core.c, core.grp)
          : []
        : mounts.concat(
            liquidMounts(core.c, core.grp),
            asparagus ? tankMounts(core.c, core.grp) : [],
          );
    if (!all.length) continue;
    for (const { b, mdotB, tB } of all) {
      /* Asparagus drops in pairs, so odd counts waste a stack, and the technique
         is worth more the more pairs there are — real asparagus rockets run six
         to sixteen. Only widen the ladder for liquid columns: a ring of sixteen
         solid boosters is a different and worse idea. */
      /* Drop tanks are shed in pairs and their gain is nearly flat past a few of
         them, so the wide ladder is reserved for powered columns where it earns
         its search cost. */
      const counts = b.dropTank
        ? [2, 4, 6]
        : asparagus && b.column
          ? [2, 3, 4, 6, 8, 12, 16]
          : [2, 3, 4, 6, 8];
      for (const nb of counts) {
        {
          const { c, k, usable, grp } = core;
          /* How many actually fit around the core. Bolted to it they cannot
             float and cannot share space with each other, so a count that does
             not fit is not a stage to be sized — it is one that cannot be
             built. The core's span is the same max of tank and cluster the
             geometry takes; boosters never run with parallel columns, so there
             is no ring of stacks to widen it. #423 */
          const bd = boosterWidth(b);
          /* Held by what the decoupler meets, the casing at the attach node,
             not the cube's width: a Kickback is 1.6 m over its fins and
             1.27 m where the TT-38K takes it (#467). */
          const holder = holderFor(
            2 * attachHalf(b, bd),
            boosterLength(b, bd),
            unlocked,
            excluded,
            expansions,
          );
          if (
            !boostersFit(
              nb,
              bd,
              grp.dia / 2,
              standoffOf(holder.n),
              attachHalf(b, bd),
            )
          )
            continue;
          const mdotC = (nc * c.fv) / (c.iv * G0);
          /* Pressure comes from the body being left, not from Kerbin. Eve's
             surface is 5 atm, where the real curves put a Terrier at zero — its
             cutoff is 3 atm — while a Kickback still makes 51 s. The ranking does
             not just shift, it inverts. */
          const pR = pRef;
          const thr = (
            e: { n: string; fv: number; iv: number; ia: number },
            p: number,
          ) => e.fv * (ispAt(e, p) / e.iv); // thrust at pressure p
          const ispEff =
            (nb * b.fv * (ispAt(b, pR) / b.iv) +
              nc * c.fv * (ispAt(c, pR) / c.iv)) /
            ((nb * mdotB + mdotC) * G0);
          const ispCore = ispAt(c, pR);
          const stackD = grp.dia;
          const fit = fitStructure({
            engine: c,
            n: nc,
            stacks: 1,
            stackD,
            tanks,
            unlocked,
            excluded,
            noPlate,
            expansions,
            plateAbove,
            hasStageBelow: false,
          });
          if (!fit) continue;
          const { adapt, dec, shroud } = fit;
          /* A liquid column is braced to the core with two EAS-4s where they
             are researched; a solid on its decouplers is not (#483). */
          const brace = b.column ? braceFor(unlocked, excluded) : null;
          const fixed =
            payload +
            extra +
            nc * c.m +
            nb *
              (holder.m * holder.count + (brace ? brace.m * brace.count : 0)) +
            fit.dry;

          const coreBurnA = mdotC * tB; // core propellant spent under boost

          /* Two ways the mounts can feed the core.

             Parallel: everything burns from its own tanks, the boosters run dry
             together and leave in one go. Two phases.

             Asparagus: the outermost pair feeds every engine on the rocket, so it
             empties while the core stays full, and pairs leave one at a time. The
             core arrives at the top of the stack still full, which is where the
             gain comes from — the same propellant does its work under a lighter
             and lighter rocket. It needs crossfeed, which on a radial decoupler is
             a right-click toggle and otherwise a pair of fuel ducts. */
          /* Under asparagus the core draws from the side stacks, not its own
             tanks, so it burns nothing of its own until the last pair is gone.
             The "core must outlast the boosters" rule is a parallel-staging
             assumption, and applying it here was rejecting every configuration
             where the ring carries most of the propellant — which is precisely
             the arrangement asparagus exists for. */
          /* Asparagus is an extra way to plumb the same hardware, not a
             replacement for the parallel arrangement. Evaluating a liquid column
             only as asparagus meant that whenever parallel happened to be better,
             enabling the option made the design worse — which it must never do. */
          const drop = !!b.dropTank;
          /* A drop tank has no engine, so there is nothing to plumb differently —
             it is always fed to the core and always shed in pairs. */
          const plumbings = drop
            ? [true]
            : asparagus && nb >= 2 && !!b.column
              ? [false, true]
              : [false];
          for (const aspHere of plumbings) {
            const burnA = aspHere ? 0 : coreBurnA;

            // smallest core that still closes the budget
            let lo = aspHere ? 0.05 : coreBurnA * 1.03,
              hi = lo,
              found =
                boostDv(
                  lo,
                  burnA,
                  fixed,
                  k,
                  nb,
                  b,
                  drop,
                  aspHere,
                  ispCore,
                  ispEff,
                ) >= dv;
            if (!found) {
              for (let i = 0; i < 18 && hi < 8000; i++) {
                hi *= 1.6;
                if (
                  boostDv(
                    hi,
                    burnA,
                    fixed,
                    k,
                    nb,
                    b,
                    drop,
                    aspHere,
                    ispCore,
                    ispEff,
                  ) >= dv
                ) {
                  found = true;
                  break;
                }
              }
            }
            if (!found) continue;
            hi = solveCore(
              lo,
              hi,
              dv,
              burnA,
              fixed,
              k,
              nb,
              b,
              drop,
              aspHere,
              ispCore,
              ispEff,
            );

            const biggest = Math.max(...usable.map((t) => t.prop));
            if (hi > 10 * biggest) continue;
            const tk = pickTanksMemo(usable, hi, 12, objective);
            if (!tk) continue;
            /* The booster hangs from its middle — its attach node — and the
               decoupler there has to be on this stage's tanks: a booster more
               than twice the stage's length has its middle above the stage.
               Eeloo's 22 m Clydesdales on a 10 m Mainsail stage had theirs a
               metre above the decoupler, bolted to nothing (#483). The
               length is not costed; it is refused where it cannot be held. */
            if (
              boosterLength(b, bd) / 2 >
              engineLen(c) + tankStackLen(tk) + 1e-9
            )
              continue;

            const mp = tk.prop;
            if (mp <= burnA * 1.02) continue;
            const coreDry = fixed + tk.dryMass;
            const m0 = coreDry + mp + nb * b.m;
            const mA = m0 - nb * b.fuelM - coreBurnA;
            const mB0 = mA - nb * b.dry;
            const dvA = ispEff * G0 * Math.log(m0 / mA);
            const got = dvA + ispCore * G0 * Math.log(mB0 / coreDry);
            if (got < dv * 0.995) continue;

            const thrustA = nb * thr(b, pSurf) + nc * thr(c, pSurf);
            const twr = thrustA / (m0 * g);
            if (twr < twrMin) continue;
            /* The core has to keep flying once the boosters go. Without this the
             optimiser bolts on SRBs purely to pass the liftoff TWR check and
             leaves a sustainer that can't hold itself up. */
            const hold = sustainerHolds(
              thrustA,
              nc * thr(c, pSurf),
              m0,
              mA,
              mB0,
              tB,
              g,
            );
            if (!hold.ok) continue;
            /* Boosters that burn out in a handful of seconds are a crutch, not a stage. */
            if (dvA < dv * 0.08) continue;

            const cand: Solution = {
              engine: c,
              n: nc,
              tanks: tk,
              adapters: adapt,
              decoupler: dec,
              coupler: fit.coup,
              shroud,
              asparagus: aspHere,
              dropTank: drop,
              total: m0,
              wet: m0,
              dry: coreDry,
              prop: mp + nb * b.fuelM,
              isp: Math.round(ispEff),
              dv: got,
              twr,
              twrBurnout: (nc * thr(c, pSurf)) / (coreDry * g),
              burn: tB + (mp - coreBurnA) / mdotC,
              boosters: {
                part: b,
                n: nb,
                hold: holder,
                brace,
                burn: tB,
                dv: dvA,
                sepMass: mA,
                twrSep: hold.twrSep,
              },
              /* Filled in on the next three lines. Named here so the object is
                 built once with the shape it will keep, rather than growing
                 three properties immediately afterwards. */
              cost: 0,
              parts: 0,
              score: 0,
            };
            cand.cost = stageCost(cand);
            cand.parts = stageParts(cand);
            cand.score = scoreOf(cand, objective);
            TALLY.boosted++;
            if (!best || cand.score < best.score) best = cand;
          }
        }
      }
    }
  }
  return best;
}

/* --------------------------- stages within a segment ---------------------------
   One leg routinely needs more than one stage: 3 400 m/s to orbit is usually two,
   and Eve ascent is three or four. For k stages we search how the segment's dv is
   divided between them and keep the lightest stack. Shares are bottom-first, so
   index 0 fires first. The grid is deliberately coarse — a finer one moves the
   answer by well under a tonne and costs real interaction latency.            */
/* How a segment's dv is divided between k stages. Every entry must have exactly k
   elements: a short one leaves shares[i] undefined, the stage's requirement becomes
   NaN, and because every comparison against NaN is false it then passes the "did
   this deliver enough dv" test and a junk stage lands in the design. */
function splitShares(k: number): Array<Array<number>> {
  if (k === 1) return [[1]];
  const out: Array<Array<number>> = [];
  if (k === 2) {
    for (let a = 0.3; a <= 0.701; a += 0.1) out.push([a, 1 - a]);
  } else if (k === 3) {
    for (let a = 0.2; a <= 0.501; a += 0.1)
      for (let b = 0.2; b <= 0.501; b += 0.1) {
        const c = 1 - a - b;
        if (c >= 0.15 && c <= 0.6) out.push([a, b, c]);
      }
  } else {
    /* Even, plus tilts — mostly toward the top. Of the ten k ≥ 4 winners in
       the sweep at a lattice twice as fine, nine took a top-heavy split and
       the tenth a slight bottom one; the +0.4 tilt never won and is gone,
       and −0.1 and −0.3 are here because they did. The upper stages carry
       the vacuum engines, so the staging optimum tilts upward. #447 */
    const even = 1 / k;
    out.push(Array(k).fill(even));
    for (const tilt of [0.2, -0.1, -0.2, -0.3, -0.4]) {
      const sh = Array.from(
        { length: k },
        (_, i) => even * (1 + tilt * (1 - (2 * i) / (k - 1))),
      );
      const sum = sh.reduce((a, b) => a + b, 0);
      out.push(sh.map((x) => x / sum));
    }
  }
  return out.filter((sh) => sh.length === k && sh.every((x) => x > 0.05));
}

/* ------------------------- the second wave of splits -------------------------

   The lattice is coarse, and what it lacks is resolution rather than shape:
   at a step twice as fine, 31 of 54 sweep cases came out lighter or cheaper
   on the objective asked for, by up to 26%, and 25 of the 48 winning splits
   used a share the lattice does not have. A lattice twice as fine costs 2.75×
   the solve; four times ran out of memory. So the lattice is searched once,
   and then a second, targeted wave is built round what it found. #447

   Three kinds of split go in the second wave, for each stage count the first
   wave produced a chain at:

   - **The Lagrange point.** For the engines the winning chain chose — each
     stage's exhaust velocity `c` and structural coefficient `ε` — the
     classical staging optimum: mass ratios `R_i = (c_i λ − 1) / (c_i ε_i λ)`
     with λ chosen so the Δv adds up. On the mass objective every winner at
     the fine lattice lay within 0.2 of this point on every share and most
     within 0.1; the outliers were floors and the pad clock binding, which the
     search finds for itself by the unit failing.
   - **The winner's neighbours**, each boundary moved by `REFINE_STEP` either
     way. Halving the lattice's step where it matters, and where the Lagrange
     point is not the theory — cost and parts, which are minimising tank
     quanta rather than mass.
   - **Snaps to a leg's end.** A boundary within `SNAP` of a leg's end is moved
     onto it, so a stage may own a burn whole: a solid may then fly it, an
     electric stage may spiral it, and two stages stop sharing one burn.

   Nothing in the wave changes how a design is priced; it only asks the same
   question at a few more points. A split the lattice already asked is not
   asked again. */
const REFINE_STEP = 0.05;
const SNAP = 0.1;
/* How far behind the group's best a stage count may be and still get its
   second wave: 30% on the chain score. At 15% one grid case lost its
   winner — a k=2 chain 24% behind on the lattice that the second wave took
   to the front. */
const REFINE_NEAR = 1.3;
/* No stage below this share: a sliver of a stage is a decoupler and a tank
   for nothing, and the lattice has never offered one. */
const SHARE_MIN = 0.05;

/* The staging optimum for a chain's engines, as shares of its Δv, or null
   where the chain's engines could not deliver the Δv at any split — every
   stage at its mass-ratio limit falls short — or where a stage's structure
   reads as nonsense. Bottom stage first, as `shares` are. */
function lagrangeShares(
  chain: ReadonlyArray<StageInChain>,
  dv: number,
): Array<number> | null {
  const c = chain.map((s) => s.sol.isp * G0);
  const e = chain.map((s) => {
    const own = s.sol.total - s.payloadIn;
    return own > 0 ? (s.sol.dry - s.payloadIn) / own : NaN;
  });
  if (c.some((x) => !(x > 0)) || e.some((x) => !(x > 0 && x < 0.95)))
    return null;
  /* Every stage at the edge of what its structure allows is the most Δv the
     chain can give; below that there is a λ to find. */
  const most = c.reduce((a, ci, i) => a + ci * Math.log(1 / e[i]), 0);
  if (!(most > dv)) return null;
  const total = (lam: number) => {
    let t = 0;
    for (let i = 0; i < c.length; i++) {
      const R = (c[i] * lam - 1) / (c[i] * e[i] * lam);
      if (!(R > 1)) return -Infinity;
      t += c[i] * Math.log(R);
    }
    return t;
  };
  /* Σ c ln R rises with λ from −∞ at the largest 1/c toward `most`; bisect
     in the log, since λ spans decades. */
  let lo = Math.max(...c.map((ci) => 1 / ci)) * (1 + 1e-7);
  let hi = lo * 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (total(mid) < dv) lo = mid;
    else hi = mid;
  }
  const dvs = c.map((ci, i) => ci * Math.log((ci * hi - 1) / (ci * e[i] * hi)));
  const sum = dvs.reduce((a, b) => a + b, 0);
  return sum > 0 ? dvs.map((d) => d / sum) : null;
}

/* The boundaries of a split, as fractions of the group's Δv, and back. */
const boundsOf = (shares: ReadonlyArray<number>) => {
  const out: Array<number> = [];
  let acc = 0;
  for (let i = 0; i < shares.length - 1; i++) out.push((acc += shares[i]));
  return out;
};
const sharesOf = (bounds: ReadonlyArray<number>) => {
  const out: Array<number> = [];
  let last = 0;
  for (const b of bounds) {
    out.push(b - last);
    last = b;
  }
  out.push(1 - last);
  return out;
};
const wellFormed = (shares: ReadonlyArray<number>) =>
  shares.every((x) => x >= SHARE_MIN - 1e-9);
const keyOf = (shares: ReadonlyArray<number>) =>
  shares.map((x) => x.toFixed(3)).join("/");

function refineUnits(
  p: Prepared,
  first: GroupResult | null,
  tried: ReadonlyArray<{ k: number; shares: Array<number> }>,
): Array<{ k: number; shares: Array<number> }> {
  if (!first) return [];
  const seen = new Set(tried.map((u) => `${u.k}:${keyOf(u.shares)}`));
  const out: Array<{ k: number; shares: Array<number> }> = [];
  const add = (k: number, shares: Array<number>) => {
    if (!wellFormed(shares)) return;
    const key = `${k}:${keyOf(shares)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ k, shares });
  };
  const ends = p.legs ? p.legs.slice(0, -1).map((l) => l.end) : [];
  const snapped = (shares: ReadonlyArray<number>) =>
    sharesOf(
      boundsOf(shares).map((b) => {
        let best = b;
        for (const e of ends)
          if (Math.abs(e - b) < Math.abs(best - b)) best = e;
        return Math.abs(best - b) <= SNAP ? best : b;
      }),
    );
  for (const win of first.byK) {
    const k = win.k;
    if (k < 2) continue;
    /* Only the stage counts in the running. A count whose lattice best is
       far behind the group's best does not close the gap with a twentieth
       of a share, and measured over the sweep at REFINE_NEAR nothing
       delivered changes while the mission benchmark loses a fifth of its
       time. A count that keeps the slenderness limit is always refined when
       the best does not, since it wins on that alone; one that breaks it
       never is when the best keeps it. */
    if (
      win.slim === first.slim &&
      win.chainScore > first.chainScore * REFINE_NEAR
    )
      continue;
    if (win.slim !== first.slim && !win.slim) continue;
    const shares = win.chain.map((s) => s.want / p.dv);
    /* The winner's neighbours, one boundary at a time. */
    const b = boundsOf(shares);
    for (let i = 0; i < b.length; i++)
      for (const d of [-REFINE_STEP, REFINE_STEP]) {
        const nb = b.slice();
        nb[i] += d;
        add(k, sharesOf(nb));
      }
    add(k, snapped(shares));
    const lag = lagrangeShares(win.chain, p.dv);
    if (lag) {
      add(k, lag);
      add(k, snapped(lag));
    }
  }
  return out;
}

/* Everything a `(k, shares)` unit needs, hoisted out of solveGroup so the unit
   depends on nothing but its arguments.

   Sets are allowed across this boundary where they are forbidden across the
   planMission seam. That rule is about JSON, which cannot carry a Set; this one
   is a structured clone, which can. */
function prepare({
  dv,
  payload,
  payloadDia,
  engines,
  tanks: tanksAsGiven,
  unlocked,
  excluded,
  needGimbal,
  maxAspect = Infinity,
  expansions = null,
  asparagus = false,
  g,
  kind,
  boosters,
  srbs,
  above = { h: 0, w: 0 },
  bodyName,
  objective = "mass",
  regime = REGIME_DEFAULT,
  legs: groupLegs,
}: GroupInput) {
  /* Which art the geometry tables are read from, set before anything asks for a
     height or a frontal area. Every way into the search comes through here —
     solveGroup, solveGroupWith, and the design snapshot, which drives
     solveGroup directly. #118 And the tanks as that art has them (#468). */
  useArt(expansions);
  const tanks = tanksInArt(tanksAsGiven, expansions);
  /* Bottom stage carries the full TWR requirement. Upper stages are already
     moving and climbing, so they get a lower floor — but not on a coast burn,
     where thrust barely matters. */
  const pSurf =
    kind !== "space" && bodyName && BODY[bodyName]
      ? atmoFor(bodyName).p(0) / 101.325
      : 0;
  /* Thick air punishes thrust: drag goes as v², so climbing hard low down on
     Eve costs more than the gravity loss it saves. */
  const twrBottom =
    kind === "launch" ? 1.25 : kind === "land" ? (pSurf > 1 ? 1.35 : 1.6) : 0.5;
  const twrUpper = kind === "launch" ? 0.8 : kind === "land" ? 1.1 : 0.5;
  /* Each leg with the surface pressure of the body it burns at, in absolute
     atmospheres, for the stages that light on that surface. */
  const legs = groupLegs
    ? groupLegs.map((l) => ({
        ...l,
        p0: l.body && BODY[l.body] ? atmoFor(l.body).p(0) / 101.325 : 0,
      }))
    : null;
  return {
    legs,
    dv,
    payload,
    payloadDia,
    engines,
    tanks,
    unlocked,
    excluded,
    needGimbal,
    maxAspect,
    expansions,
    asparagus,
    g,
    kind,
    boosters,
    srbs,
    above,
    objective,
    regime,
    pSurf,
    twrBottom,
    twrUpper,
  };
}

/* Which `(k, shares)` pairs a group is searched over, in the order the serial
   search visited them. The order is not decorative: `better` keeps the first of
   equals, so reducing out of order picks a different rocket. */
function unitsOf(minK: number, maxK: number) {
  const out: Array<{ k: number; shares: Array<number> }> = [];
  for (let k = minK; k <= maxK; k++)
    for (const shares of splitShares(k)) out.push({ k, shares });
  return out;
}

const better = (x: ChainCandidate, y: ChainCandidate | null | undefined) =>
  !y || (x.slim !== y.slim ? x.slim : x.chainScore < y.chainScore);

/* How many candidates a stage count keeps for the walk in plan.ts. One was
   the mass objective's undoing on a 1 t low-orbit brief: its lightest
   two-stage chain could not be flown to budget, and the 7.2 t Torch chain
   that could — the cost objective's pick — was never in the list. Three
   costs a few more flights on the candidates that fail, and nothing on the
   ones that do not. #169 */
const ALTS_PER_K = 3;

/* Whether the core can keep the stack climbing once the boosters go.

   A sustainer may sit a little under one by separation *if it is already
   fast and climbing* — that was always the argument for the 0.85 floor, and
   the floor never checked it. Six Hammers on a Mainsail lift 187 t at 1.40
   for 24 seconds, to 1.9 km and 100 m/s, then leave the Mainsail alone at
   0.88; the stack decelerates, straight up, for the next forty seconds and
   pays 2,600 m/s of gravity loss for it. So: a core under one is allowed
   only when the boost phase has given it SUSTAINER_FAST of speed — the net
   acceleration of the boost, on its average mass, for its burn — and never
   under SUSTAINER_MIN. Thrust in kN, mass in t, g in m/s². #168 */
const SUSTAINER_MIN = 0.85;
const SUSTAINER_FAST = 250;
function sustainerHolds(
  thrustA: number,
  thrustC: number,
  m0: number,
  mA: number,
  mB0: number,
  tB: number,
  g: number,
) {
  const twrSep = thrustC / (mB0 * g);
  const vSep = Math.max(0, (thrustA / ((m0 + mA) / 2) - g) * tB);
  const ok = twrSep >= 1 || (twrSep >= SUSTAINER_MIN && vSep >= SUSTAINER_FAST);
  return { ok, twrSep, vSep };
}

/* Fold the units' candidates back into one answer. Fed the results in unit
   order, this is what the loop used to do inline. */
function reduceUnits(
  results: ReadonlyArray<ReadonlyArray<ChainCandidate> | null | undefined>,
): GroupResult | null {
  let best: ChainCandidate | null = null;
  const byK: Array<ChainCandidate> = [];
  /* The next-best few at each stage count, in the walk's order. */
  const top: Array<Array<ChainCandidate>> = [];
  for (const cands of results)
    for (const cand of cands ?? []) {
      if (better(cand, best)) best = cand;
      if (better(cand, byK[cand.k])) byK[cand.k] = cand;
      const list = (top[cand.k] ??= []);
      let i = list.length;
      while (i > 0 && better(cand, list[i - 1])) i--;
      if (i < ALTS_PER_K) {
        list.splice(i, 0, cand);
        if (list.length > ALTS_PER_K) list.pop();
      }
    }
  return (
    best && {
      ...best,
      byK: byK.filter((c) => c !== undefined),
      alts: top.flatMap((l) => (l ? l.slice(1) : [])),
    }
  );
}

/* One `(k, shares)` unit: build every chain for that split and hand back the
   candidates. Touches nothing outside its arguments, which is what lets it run
   somewhere else — see #50. */
type Prepared = ReturnType<typeof prepare>;

function solveUnit(
  p: Prepared,
  k: number,
  shares: Array<number>,
): Array<ChainCandidate> {
  const {
    dv,
    payload,
    payloadDia,
    engines,
    tanks,
    unlocked,
    excluded,
    needGimbal,
    maxAspect,
    expansions,
    asparagus,
    g,
    kind,
    boosters,
    srbs,
    above,
    objective,
    regime,
    pSurf,
    twrBottom,
    twrUpper,
    legs,
  } = p;
  const out: Array<ChainCandidate> = [];
  /* Where each stage's slice of the Δv begins and ends, bottom stage first. */
  const bounds: Array<[number, number]> = [];
  {
    let acc = 0;
    for (const sh of shares) {
      bounds.push([acc, acc + sh]);
      acc += sh;
    }
  }
  /* Which ascent leg each stage starts in, if any, so STAGE_PRESSURE can be
     indexed by a stage's place within that climb rather than within the
     group. */
  const startLeg = (lo: number) =>
    legs ? legs.findIndex((l) => l.end > lo + 1e-9) : -1;
  const ordinalIn = (i: number, legIx: number) => {
    let n = 0;
    for (let j = 0; j < i; j++) if (startLeg(bounds[j][0]) === legIx) n++;
    return n;
  };
  {
    {
      /* The per-stage score is only a heuristic for picking within a stage; the
       chain is judged on the real measure. A greedy pass that takes the cheapest
       stage every time can miss the cheapest rocket, which is how a fewest-parts
       design ended up costing less than a cost-optimised one. So build the chain
       under each heuristic and keep whichever comes out best on the objective
       actually asked for. */
      /* A stage that scores better on its own can still make the chain worse, and
       liquid radial columns are heavy enough to do it. Rather than trust the
       coupling term, build the chain both with and without them and keep whichever
       is genuinely better on the objective asked for. */
      /* Three ways to build the same split: everything available, without liquid
       radial columns, and without engine plates. Both of those can score better
       as a stage while making the stack worse, and the chain comparison is the
       only thing that actually knows. */
      /* Trying every build variant on every split triples the solve for a gain that
       only shows up on cost, where the coupling heuristic is weakest. Mass and
       parts rank stages closely enough to their chain effect that one pass is
       enough. */
      /* Build variants. Each removes one option that can score well as a single
       stage while making the whole stack worse, and the chain comparison decides
       — the only thing that actually knows.

       Variant 3 caps clusters at four. Measured over 54 configurations, allowing
       larger ones is right sometimes (a 4.1 t lift is 14% lighter with a cluster
       of five) and badly wrong others (a 12 t lift is 19% dearer). Since it cuts
       both ways it cannot be settled with a fixed limit, only by building it both
       ways and keeping what wins. */
      /* Variant 3 runs under cost only, and only where the cap can bind.

         Under mass and parts it never wins, so those objectives build one chain
         per split rather than two. Under cost it looked equally droppable — it
         wins no chain in the 81-case grid either — and it is not. The grid reads
         `best`; plan.js delivers the first byK candidate the simulator can fly.
         Swept over 128 real missions, 16 destinations by four payloads by two
         slenderness limits at tier 9, dropping variant 3 moves 11 of them: nine
         dearer on the objective asked for, one by 21%. #29 has the table.

         What is free is skipping it where it cannot change anything. capCluster
         filters one thing — the engine-count loop in solveStage — so if every
         stage variant 0 chose already came back with n <= 4, the capped pass
         reproduces that chain exactly. The uncapped pick survives the filter and
         is still the argmax over a subset; it cannot be a tie with a discarded
         larger cluster, because the first of equals is kept and a tied larger one
         reached earlier would have been the pick. boostedAscent is not handed the
         cap at all, so where the boosted result won it still wins — capping only
         makes the plain result worse. A chain that found nothing still finds
         nothing, the subset being empty too. And the candidate would tie on score
         and slimness, which better() compares with a strict <, so it would not
         displace best or byK either. Exact, not a heuristic.

         The note above about the cap cutting both ways predates #18, which fixed
         the adapter direction and moved 21 of 66 designs. Re-measure it rather
         than extend it. */
      const clustered: Record<string, boolean> = {};
      for (const variant of objective === "cost" ? [0, 1, 2, 3] : [0]) {
        /* Named rather than written inline, so the two arms agree on a
           objective and not merely on a string. */
        const picks: Array<Objective> =
          objective === "cost" ? ["cost", "parts"] : [objective];
        for (const pick of picks) {
          /* Nothing variant 0 clustered past the cap, so variant 3 would rebuild
             the same chain. See the note above for why that is exact. */
          if (variant === 3 && !clustered[pick]) continue;
          const chain: Array<StageInChain> = new Array(k),
            sub: Array<Solution> = [];
          let carried = payload,
            ok = true;
          for (let i = k - 1; i >= 0; i--) {
            // solve top down
            const bottom = i === 0;
            const sdv = dv * shares[i];
            /* Judged by the legs this stage flies where the group says which
               they are, and by the group's kind where it does not. */
            const sp: StageParams = legs
              ? stageParamsFor(legs, bounds[i][0], bounds[i][1], (legIx) =>
                  ordinalIn(i, legIx),
                )
              : {
                  /* No route, so nothing can say where a burn is made. The
                     clock stands, exactly as it did: this is the path the
                     design grid takes, and it is why that baseline cannot
                     move under this change. */
                  burns: [],
                  coasts: false,
                  power: { flux: 1, dark: 0, period: 0 },
                  twrMin: bottom ? twrBottom : twrUpper,
                  g,
                  pRef: pSurf * STAGE_PRESSURE[Math.min(i, 3)],
                  pSt: bottom ? pSurf : pSurf * STAGE_PRESSURE[Math.min(i, 3)],
                  maxBurn: pSurf > 0.5 && bottom ? 200 : 420,
                  mounts:
                    (kind === "launch" || kind === "land") &&
                    (bottom ? pSurf : pSurf * STAGE_PRESSURE[Math.min(i, 3)]) >
                      0.1,
                };
            const twrMin = sp.twrMin;
            const gS = sp.g;
            const pRef = sp.pRef;
            const pSt = sp.pSt; // it lights where it sits
            const extra = 0; // decouplers and adapters are costed as real parts now
            /* What sits directly above this stage. The chain is pre-sized and filled
           from the top down, so index i+1 is already solved when i is reached —
           chain.length would just be k and always point at the topmost stage. */
            const above = i + 1 < k ? chain[i + 1] : null;
            const plateAbove = !!(
              above &&
              above.sol &&
              above.sol.coupler &&
              above.sol.coupler.plate
            );
            let s = solveStage({
              dv: sdv,
              payload: carried,
              engines,
              tanks,
              unlocked,
              excluded,
              needGimbal,
              twrMin,
              g: gS,
              hasStageBelow: !bottom,
              noPlate: variant === 2,
              expansions,
              plateAbove,
              capCluster: variant === 3 ? 4 : 0,
              pRef,
              pSurf: pSt,
              extra,
              maxBurn: sp.maxBurn,
              burns: sp.burns,
              coasts: sp.coasts,
              power: sp.power,
              regime,
              objective: pick,
            });
            /* Radial boosters are worth trying on any stage that climbs out of air,
           not just the pad. On Eve they beat a liquid core outright: at three
           atmospheres a Terrier produces nothing at all while a Kickback holds
           144 s. (The 43 s I had assumed for the Terrier came from a synthesised
           curve; its real cutoff is 3 atm.) */
            /* Only where the stage actually lights in meaningful air. On Kerbin an
           upper stage ignites near vacuum, and strapping solids to it was both
           odd and a waste of mass; on Eve the second stage is still in a quarter
           of an atmosphere and boosters genuinely help there. */
            /* Boosters only make sense where there is air to climb out of, but
             drop tanks are not boosters — they add no thrust and their whole
             value is shedding empty tankage, which pays just as well in vacuum.
             In fact it pays better: up here the thrust floor is 0.8 rather than
             1.25, and it was that floor rejecting almost every drop-tank
             configuration on the pad.

             A ring is solids or liquid columns, and the switch covers both:
             this used to ask for a solid in the roster before it would try
             any mount at all, so a career with liquid engines and no SRBs
             never saw a radial column unless asparagus was on. #160 */
            const wantMounts = boosters && sp.mounts;
            if (
              wantMounts ||
              (asparagus && (kind === "launch" || kind === "land"))
            ) {
              const bs = boostedAscent({
                dv: sdv,
                payload: carried,
                engines,
                tanks,
                unlocked,
                excluded,
                needGimbal,
                twrMin,
                g: gS,
                extra,
                srbs,
                pRef,
                pSurf: pSt,
                objective: pick,
                noLiquid: variant === 1,
                noPlate: variant === 2,
                expansions,
                plateAbove,
                asparagus,
              });
              if (bs && (!s || bs.score < s.score)) s = bs;
            }
            if (!s) {
              ok = false;
              break;
            }
            chain[i] = { sol: s, want: sdv, payloadIn: carried, twrMin, g: gS };
            /* Recorded per stage rather than per finished chain: a chain that
               fails lower down still tells us what the cap would have bound on,
               and the capped pass would fail at the same stage. */
            if (variant === 0 && s.n > 4) clustered[pick] = true;
            sub.push(s);
            carried = s.total;
          }
          if (!ok) continue;
          /* Compare whole chains on the chosen measure, not just the final mass —
         otherwise splitting a segment always looks free in cost or part terms. */
          /* And on the mass a group hands down where there is a group below
             to carry it: a launch group is the bottom of the rocket and its
             mass costs nobody anything, but every other group's mass is
             propellant and engines for the groups beneath, which are solved
             later and cannot argue. The per-stage heuristic has always
             coupled at COUPLE_COST and COUPLE_PARTS; the chain comparison
             did not, so a cheaper-but-heavier upper group won its own
             contest and lost the mission's — the Eeloo cut mission came out
             11% dearer on the cost objective once packed rings were priced
             honestly, the understated brackets having steered it to the
             lighter chain by accident. #447 */
          const couple = kind !== "launch";
          const scoreChain = (stages: ReadonlyArray<Solution>) =>
            objective === "mass"
              ? carried
              : stages.reduce(
                  (a, x) => a + (objective === "cost" ? x.cost : x.parts),
                  0,
                ) +
                (couple
                  ? objective === "cost"
                    ? carried * COUPLE_COST
                    : carried / COUPLE_PARTS
                  : 0);
          let chainScore = scoreChain(sub);
          let packedAny = false;
          /* Slenderness is a property of the whole stack, so it can only be judged
         once the chain is complete. Chains inside the limit always beat chains
         outside it, whatever they score — a pencil that is 10% lighter is not a
         better rocket. If nothing fits, the best of the rest still comes back
         rather than leaving you with no design at all. */
          /* Packing pass. It can only be judged once the chain is complete, because
         whether a stage may widen depends on everything beneath it — and stages
         are solved top-down, so that is not known while they are being built.
         Nothing about the propellant changes, so applying it afterwards is safe:
         it trades height for width and adds a few kilograms of brackets. */
          for (let q = chain.length - 1; q >= 0; q--) {
            const sol = chain[q].sol;
            if (!sol) continue;
            const roomBelow =
              q === 0
                ? Infinity
                : Math.max(
                    ...chain.slice(0, q).map((x) => stageSize(x.sol).width),
                  );
            /* Whether the base may widen depends on whether this group lifts off into
           air. pSurf is the pressure where the bottom stage lights. */
            const pk = packFor(sol, roomBelow, pSurf <= 0.05);
            if (!pk) continue;
            /* Copy before packing. A stage solution is shared between the candidate
           chains that contain it, so writing the packing onto it leaked one
           chain's geometry into another — and the "already packed" guard then
           skipped re-checking it against different room below, which is how three
           stages ended up wider than the stage they sat on. */
            /* One ring per column, so its brackets are paid once per column. */
            const packMass = pk.mass * (sol.stacks || 1);
            const packedSol: Solution = {
              ...sol,
              packed: pk,
              dry: sol.dry + packMass,
              total: sol.total + packMass,
            };
            /* The brackets are money and parts as well as mass, and the
               stage's own figures have to say so: `chainScore` below ranks
               chains on `cost` and `parts`, and `planMission` delivers the
               cheaper of the cost plan and the mass plan on the same
               figures. Left at the unpacked numbers, a packed ring read 1,848
               funds cheaper than its bill, and a dearer rocket was delivered
               as the cheaper one. #447 */
            packedSol.cost = stageCost(packedSol);
            packedSol.parts = stageParts(packedSol);
            packedSol.score = scoreOf(packedSol, pick);
            chain[q] = { ...chain[q], sol: packedSol };
            packedAny = true;
          }
          /* Re-ranked on the packed figures where a ring was added. */
          if (packedAny && objective !== "mass")
            chainScore = scoreChain(chain.map((x) => x.sol));
          /* The whole stack, not this segment of it: everything already
             solved above, plus this chain, plus one payload on the nose. For
             the group that reaches the pad — the last one solved — that is
             exactly the vehicle, so the constraint that gates delivery is the
             one the drawing reports. #102 */
          const ar = stackGeometry(chain, payload, payloadDia, above).ar;
          TALLY.chains++;
          const cand = {
            chain,
            total: carried,
            k,
            chainScore,
            ar,
            slim: ar <= maxAspect,
          };
          out.push(cand);
        }
      }
    }
  }
  return out;
}

/* The whole search for one group, on this thread. */
/* The two waves, reduced apart and then joined: the best at each stage count
   is the better of the two, and the runners-up are both waves' runners-up.
   Reduced together, the second wave's neighbours — several splits a twentieth
   apart round one winner — filled every runner-up slot with near-copies of
   it, and the lattice's own answer, a different chain altogether, fell out of
   the list the candidate walk flies. On the Low orbit 3.5 t lightest brief
   the one chain flown was then 5 m/s over budget, was grown, and came back
   as a three-stage 25.3 t rocket where the lattice's 24.6 t two-stage chain
   had never been given its turn. Each wave keeps its own runners-up, so the
   walk sees both the lattice's spread and the refinement's precision. #447 */
function mergeResults(
  a: GroupResult | null,
  b: GroupResult | null,
): GroupResult | null {
  if (!a) return b;
  if (!b) return a;
  const byK: Array<ChainCandidate> = [];
  const losers: Array<ChainCandidate> = [];
  for (const c of [...a.byK, ...b.byK]) {
    const held = byK[c.k];
    if (better(c, held)) {
      if (held) losers.push(held);
      byK[c.k] = c;
    } else losers.push(c);
  }
  const best = better(b, a) ? b : a;
  return {
    ...best,
    byK: byK.filter((c) => c !== undefined),
    alts: [...a.alts, ...b.alts, ...losers],
  };
}

function solveGroup(input: GroupInput) {
  const p = prepare(input);
  const units = unitsOf(input.minK, input.maxK);
  const first = reduceUnits(units.map((u) => solveUnit(p, u.k, u.shares)));
  /* The second wave, built round what the first found. */
  const more = refineUnits(p, first, units);
  const second = reduceUnits(more.map((u) => solveUnit(p, u.k, u.shares)));
  return mergeResults(first, second);
}

/* The same search, with the units handed to someone who can run them at the
   same time. `fanOut(p, units)` must resolve to their candidate lists **in unit
   order** — see reduceUnits for why. */
async function solveGroupWith(
  input: GroupInput,
  fanOut: (
    p: Prepared,
    units: Array<{ k: number; shares: Array<number> }>,
  ) => Promise<ReadonlyArray<ReadonlyArray<ChainCandidate> | null>>,
) {
  const p = prepare(input);
  const units = unitsOf(input.minK, input.maxK);
  const first = reduceUnits(await fanOut(p, units));
  const more = refineUnits(p, first, units);
  const second = more.length ? reduceUnits(await fanOut(p, more)) : null;
  return mergeResults(first, second);
}

/* Which parts each node actually unlocks. 27 of the 63 stock nodes carry nothing
   that can appear in a rocket — science, comms, robotics — so they are shown
   greyed rather than offered as though they mattered. */

export {
  boostedAscent,
  lagrangeShares,
  mergeResults,
  solveGroup,
  solveGroupWith,
  solveStage,
  solveUnit,
  splitShares,
  sustainerHolds,
};
export type {
  BoostOpt,
  ChainCandidate,
  GroupInput,
  GroupResult,
  Prepared,
  StageInChain,
  StageOpt,
};

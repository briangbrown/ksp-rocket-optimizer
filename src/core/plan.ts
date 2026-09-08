import { TALLY, resetTally } from "./tally.js";
import { BODY, orbitAlt } from "./atmosphere.js";
import { buildVehicleFor, simCached } from "./ascent.js";
import { stackOf, useArt } from "./geometry.js";
import { missionHardware } from "./parts.js";
import { solveGroup, solveGroupWith } from "./solver.js";
import type { Expansions } from "./constants.js";
import type { Engine, Tank } from "./catalogue.js";
import type { Leg } from "./orbits.js";
import type { Objective } from "./performance.js";
import type { Solution } from "./solution.js";
import type { ChainCandidate, GroupInput, Prepared } from "./solver.js";

/* ------------------------------ across the seam ------------------------------

   Plain data both ways. No `Set`, no `Map`, no object identity, no functions —
   `test/seam-contract.test.js` enforces it, and the reason is at the top of
   this file. The rosters arrive as arrays and are rebuilt into the Sets the
   solver wants on this side of the line. */
type PlanInput = {
  route: ReadonlyArray<Leg>;
  cuts: ReadonlyArray<number>;
  payload: number;
  payloadDia: number;
  margin: number;
  extraDv: number;
  engines: ReadonlyArray<Engine>;
  tanks: ReadonlyArray<Tank>;
  unlocked: ReadonlyArray<string>;
  excluded: ReadonlyArray<string>;
  needGimbal: boolean;
  maxAspect: number;
  expansions: Expansions | null;
  asparagus: boolean;
  objective: Objective;
  origin: string;
  /* Which segment is forced to how many stages, as pairs rather than a Map. */
  splitBy: ReadonlyArray<[number, number]>;
  boosters: boolean;
};

/* One delivered stage: the solved design, the legs it flies, and where it sits
   in the segment it belongs to. */
type PlanStage = {
  legs: Array<Leg>;
  key: number;
  want: number;
  sol: Solution | null;
  payloadIn: number;
  twrMin: number;
  g: number;
  isLaunch: boolean;
  isLand: boolean;
  sub: number;
  subCount: number;
};

type Plan = {
  stages: Array<PlanStage>;
  tally: { stages: number; boosted: number; flights: number; chains: number };
};

/* How the caller gives the thread back, stops a superseded run, and — where it
   has somewhere to run them — takes a group's units off this one. */
type PlanOpts = {
  signal?: AbortSignal | null;
  onYield?: () => Promise<unknown>;
  fanOut?:
    | ((
        p: Prepared,
        units: Array<{ k: number; shares: Array<number> }>,
      ) => Promise<ReadonlyArray<ReadonlyArray<ChainCandidate> | null>>)
    | null;
};

/* The mission plan: destination and payload in, a list of solved stages out.

   This is the seam. Everything below the call is pure and DOM-free, so the
   solver behind it can later be a Web Worker or a WASM module without the UI
   changing. Two things exist for that reason and are worth keeping even though
   the in-process version does not need them:

     signal   an AbortSignal, so a superseded run stops at its next yield
              instead of finishing work nobody wants
     onYield  how to give the thread back. In-process that is a setTimeout(0)
              so React can paint; in a worker it will be a no-op.
     fanOut   how to run a group's (k, shares) units somewhere else. Absent,
              they run here, in order, exactly as they always did. See #50 —
              the units are independent, and the caller owns the threads
              because core/ is not allowed to know what kind it has.

   The solve is genuinely slow — seconds — which is why it cannot simply be a
   synchronous call and never will be. */
export async function planMission(
  input: PlanInput,
  opts: PlanOpts = {},
): Promise<Plan | null> {
  const own = await planFor(input, opts, input.objective);
  if (!own || input.objective === "mass") return own;
  /* The cost and parts objectives are minimised group by group, and a group
     is charged nothing for the mass it hands down — a cheap, heavy upper
     segment makes every stage beneath it dearer, and the sum comes out above
     what the mass objective, which compounds through that mass on its own,
     would have paid. Minmus at 6.5 t: 48,761 funds asked cheapest, 42,235
     asked lightest. So the lightest design is planned too and delivered
     where it measures better on the objective asked for. Twice the work for
     those two objectives; the floor it buys is that "cheapest" is never
     dearer than "lightest". #169 */
  const alt = await planFor(input, opts, "mass");
  if (!alt) return own;
  const measure = (p: Plan) =>
    p.stages.reduce(
      (a, s) =>
        a +
        (s.sol ? (input.objective === "cost" ? s.sol.cost : s.sol.parts) : NaN),
      0,
    );
  const mo = measure(own);
  const ma = measure(alt);
  const tally = { ...own.tally };
  for (const k of Object.keys(tally) as Array<keyof typeof tally>)
    tally[k] += alt.tally[k];
  return Number.isFinite(ma) && (!Number.isFinite(mo) || ma < mo)
    ? { ...alt, tally }
    : { ...own, tally };
}

/* How a candidate's score is expected to grow with the Δv it turns out to
   need: the rocket equation at an exhaust velocity of 2,500 m/s, a launch
   stage's — a little pessimistic about growth, so a candidate that fits is
   preferred over one that needs growing unless it is clearly lighter. */
const GROW_VE = 2500;

/* What a chain carries for the climb: the group's Δv less the legs beyond
   the ascent, plus whatever its tanks rounded the group up to. */
const carriedFor = (c: ChainCandidate, groupDv: number, share: number) =>
  c.chain.reduce((a, x) => a + x.sol.dv, 0) - (groupDv - share);

/* The share of a group's Δv that is the climb to orbit, margin included:
   what the ascent simulator's total is compared against. The rest of the
   group — a plane change, a capture, a descent cut into the same segment —
   is not something the simulator flies, and comparing the flown ascent with
   the whole group let a rocket 600 m/s short of orbit pass as carrying its
   flight. #167 */
function ascentShareOf(legs: ReadonlyArray<Leg>, margin: number) {
  return (
    legs.filter((l) => l.kind === "ascent").reduce((a, l) => a + l.dv, 0) *
    (1 + margin / 100)
  );
}

async function planFor(
  input: PlanInput,
  { signal, onYield = () => Promise.resolve(), fanOut = null }: PlanOpts,
  objective: Objective,
): Promise<Plan | null> {
  const solve = (groupInput: GroupInput) =>
    fanOut ? solveGroupWith(groupInput, fanOut) : solveGroup(groupInput);
  const {
    route,
    payload,
    payloadDia,
    margin,
    extraDv,
    engines,
    tanks,
    needGimbal,
    maxAspect,
    expansions,
    asparagus,
    origin,
    boosters,
  } = input;

  /* Before anything else: the geometry tables the whole solve and the drawing
     after it will read. `prepare` sets it too, but a mission can measure a
     payload or size a fairing before the first group is prepared. #118 */
  useArt(expansions);

  /* The boundary takes plain arrays and rebuilds the Set and Map the solver
     wants. Neither survives JSON, so accepting them here would make the seam
     unserialisable and a worker or WASM backend impossible without changing
     every caller. Rebuilding costs nothing next to the solve. */
  const unlocked = new Set(input.unlocked);
  const excluded = new Set(input.excluded);
  const splitBy = new Map<number, number>(input.splitBy);

  /* Groups are built here from the route and the cut positions rather than
     handed in ready-made. They used to arrive as arrays of the very same leg
     objects held in `route`, and `route.indexOf(legs[0])` below depended on
     that identity — which a JSON round trip destroys, taking the split-point
     lookup with it. Rebuilding from indices means the seam carries only values.
     (cut i = separate after leg i.) */
  const cuts = new Set(input.cuts);
  const groups: Array<Array<number>> = [];
  {
    let cur: Array<number> = [];
    route.forEach((leg, i) => {
      if (leg.free) return;
      cur.push(i);
      if (cuts.has(i)) {
        groups.push(cur);
        cur = [];
      }
    });
    if (cur.length) groups.push(cur);
  }

  resetTally();
  const out: Array<PlanStage> = [];
  let carried =
    payload + missionHardware(route, payload, origin, unlocked, excluded).mass;
  const srbs = engines.filter((e) => e.f.includes("SF") && e.fuelM > 0);
  for (let i = groups.length - 1; i >= 0; i--) {
    await onYield();
    if (signal && signal.aborted) return null;
    const legs = groups[i].map((ix) => route[ix]);
    const key = groups[i][0];
    /* The margin scales the route; the extra is a flat reserve on top of it.
         It rides on the last segment, which is the top of the stack — spare dv
         is only useful if it is still there at the end, and putting it lower
         would mean lifting fuel you then stage away. */
    const dv =
      legs.reduce((a, l) => a + l.dv, 0) * (1 + margin / 100) +
      (i === groups.length - 1 ? extraDv : 0);
    const isLaunch = legs.some((l) => l.kind === "ascent");
    const isLand = legs.some(
      (l) => l.kind === "land" || l.kind === "ascentBack",
    );
    /* `?? NaN` rather than a default: a leg without a local gravity is one
       nothing has measured, and the arithmetic already answered NaN for it.
       Every leg `buildRoute` returns carries one. */
    const g = isLaunch ? 9.81 : Math.max(...legs.map((l) => l.g ?? NaN));
    const kind = isLaunch ? "launch" : isLand ? "land" : "space";
    const forced = splitBy.get(key) || 0;
    /* How many stages to allow. A stage asked for much more than about two
         km/s pays compound interest: its propellant is lifted by everything
         beneath it. Measured across budgets from 3 700 to 11 600 m/s the
         cheapest design lands on 1 100–2 600 m/s per stage, median 1 870, so
         the cap follows the budget rather than sitting at a fixed four — which
         was set when this only planned Mun trips and cost an Eeloo mission
         300 000 funds. One spare above the estimate, since the split is rarely
         even, and never more than six: past that nothing improved. */
    const autoK = Math.min(6, Math.max(2, Math.ceil(dv / 2200) + 1));
    const bodyName = isLaunch ? origin : legs.find((l) => l.body)?.body;
    /* What is already standing above this group. Groups are solved from the
       top of the stack downwards, so `out` holds exactly the stages over this
       one — and the group that reaches the pad therefore judges its
       slenderness on the whole vehicle. #102 */
    const above = stackOf(out);
    /* `solved` and `res` start as the same object and part company the moment
       the candidate walk picks a different one. Only `solved` carries `byK` —
       what the search found at every stage count — and only the walk below
       reads it, which is why the two names exist. */
    /* The group's Δv, and the ascent's share of it, both grown together when
       the flown ascent costs more than the map said. */
    let groupDv = dv;
    let share = isLaunch ? ascentShareOf(legs, margin) : 0;
    const solved = await solve({
      dv,
      payload: carried,
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
      bodyName,
      objective,
      minK: forced || 1,
      maxK: forced || autoK,
    });
    let res: ChainCandidate | null = solved;

    /* The closed-form solver can pick a stage count the vehicle cannot fly —
         an upper stage that satisfies the rocket equation but has no pitch
         programme reaching orbit. On auto, walk the candidates cheapest first
         and take the first the simulator accepts. */
    if (
      solved &&
      isLaunch &&
      !forced &&
      bodyName &&
      BODY[bodyName] &&
      solved.byK.length > 1
    ) {
      /* Keep the slenderness preference while looking for one that flies —
           sorting purely on score here threw away the solver's choice and put
           the pencil straight back. */
      /* Slenderness is a constraint the user set, not a tie-break. Ordering
           compliant designs first is not enough: when every one of them fails
           the ascent simulation the walk kept going and settled on a design
           that breaks the limit — a 0.144 t payload came back at 30.6:1 under
           a 14:1 setting, because the thin compliant stacks could not be flown
           and the fat one could.

           Better to keep the best compliant design and report that the sim
           could not fly it than to silently hand back something the user ruled
           out. Only when nothing compliant exists at all does an over-limit
           design get offered. */
      /* The best at each stage count and the runners-up behind each: the
           closed form's favourite at a count is not always one the simulator
           can fly to budget, and the one behind it often is. #169 */
      const all = [...solved.byK, ...solved.alts];
      const compliant = all.filter((x) => x && x.slim);
      const pool = compliant.length ? compliant : all.filter(Boolean);
      const order = pool.sort((x, y) => x.chainScore - y.chainScore);
      /* Cheapest first, and judged on what each would cost *once grown to
           what it flies at*: a candidate whose flown ascent exceeds the share
           is re-solved heavier below, and its score is scaled by the rocket
           equation for the difference before it is compared. Taking the first
           that flew handed back a rocket that had to be grown a great deal
           when the one behind it flew nearly to budget; taking the first that
           fitted handed back a heavy rocket that needed no growing when a
           lighter one needed a little. The scores are sorted, and an estimate
           is never below its score, so the walk stops at the first candidate
           whose score cannot beat the best estimate so far. #168 #169 */
      let pick: ChainCandidate | null = null;
      let bestEst = Infinity;
      for (const cand of order) {
        if (cand.chainScore >= bestEst) break;
        await onYield();
        if (signal && signal.aborted) return null;
        const veh = buildVehicleFor(
          cand.chain.map((c) => ({
            isLaunch: true,
            legs,
            sol: c.sol,
            payloadIn: c.payloadIn,
          })),
          () => true,
          bodyName,
          payloadDia,
        );
        const flown = veh && simCached(veh, orbitAlt(bodyName));
        if (!flown || !flown.ok) continue;
        /* The margin is a reserve: a flight that costs no more than the
           vehicle carries for the climb — the ascent's share of the group,
           plus whatever its tanks rounded up to — is fine as it stands. One
           that costs more is grown to carry the margin over what it flew at,
           which is what the re-solve below does, so that is the growth
           estimated here. */
        const carries = carriedFor(cand, groupDv, share);
        const over =
          flown.total > carries
            ? flown.total * (1 + margin / 100) - carries
            : 0;
        const est = cand.chainScore * Math.exp(over / GROW_VE);
        if (est < bestEst) {
          bestEst = est;
          pick = cand;
        }
      }
      /* Nothing in the compliant pool could be flown. Keep the best of them
           anyway — the design is the one the user asked for, and the flight card
           will show that the ascent could not be simulated. */
      res = pick ?? (order.length ? order[0] : res);
    }

    /* The map's ascent figure is a rule of thumb; the simulator knows what
         this particular vehicle will actually spend. Sizing to the map and then
         reporting a higher flown cost — which is what happened, 3 740 built
         against 4 062 needed — hands you a rocket that cannot reach orbit.
         Re-solve against the flown cost until the vehicle carries it. */
    if (res && isLaunch && bodyName && BODY[bodyName]) {
      for (let pass = 0; pass < 3; pass++) {
        await onYield();
        if (signal && signal.aborted) return null;
        const veh = buildVehicleFor(
          res.chain.map((c) => ({
            isLaunch: true,
            legs,
            sol: c.sol,
            payloadIn: c.payloadIn,
          })),
          () => true,
          bodyName,
          payloadDia,
        );
        const flown = veh && simCached(veh, orbitAlt(bodyName));
        if (!flown || !flown.ok) break;
        /* What the vehicle carries for the climb, surfaced next to the
           ascent cost. */
        const carries = carriedFor(res, groupDv, share);
        flown.carried = carries;
        if (flown.total <= carries) break; // it carries the flight
        const need = flown.total * (1 + margin / 100);
        groupDv += need - carries;
        share += need - carries;
        const grown = await solve({
          dv: groupDv,
          payload: carried,
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
          bodyName,
          objective,
          minK: forced || 1,
          maxK: forced || autoK,
        });
        if (!grown) break;
        res = grown;
      }
    }

    if (!res) {
      out.unshift({
        legs,
        key,
        want: dv,
        sol: null,
        payloadIn: carried,
        twrMin: 1,
        g,
        isLaunch,
        isLand,
        sub: 1,
        subCount: 1,
      });
      carried = NaN;
      break;
    }
    out.unshift(
      ...res.chain.map((c, j) => ({
        legs,
        key,
        want: c.want,
        sol: c.sol,
        payloadIn: c.payloadIn,
        twrMin: c.twrMin,
        g,
        isLaunch,
        isLand,
        sub: j + 1,
        subCount: res.k,
      })),
    );
    carried = res.total;
  }
  return { stages: out, tally: { ...TALLY } };
}

export { ascentShareOf };
export type { Plan, PlanInput, PlanOpts, PlanStage };

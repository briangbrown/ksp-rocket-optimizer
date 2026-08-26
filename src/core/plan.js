import { BODY, orbitAlt } from "./atmosphere.js";
import { buildVehicleFor, simCached } from "./ascent.js";
import { missionHardware } from "./parts.js";
import { TALLY, resetTally, solveGroup } from "./solver.js";

/* The mission plan: destination and payload in, a list of solved stages out.

   This is the seam. Everything below the call is pure and DOM-free, so the
   solver behind it can later be a Web Worker or a WASM module without the UI
   changing. Two things exist for that reason and are worth keeping even though
   the in-process version does not need them:

     signal   an AbortSignal, so a superseded run stops at its next yield
              instead of finishing work nobody wants
     onYield  how to give the thread back. In-process that is a setTimeout(0)
              so React can paint; in a worker it will be a no-op.

   The solve is genuinely slow — seconds — which is why it cannot simply be a
   synchronous call and never will be. */
export async function planMission(
  input,
  { signal, onYield = () => Promise.resolve() } = {},
) {
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
    objective,
    origin,
    boosters,
  } = input;

  /* The boundary takes plain arrays and rebuilds the Set and Map the solver
     wants. Neither survives JSON, so accepting them here would make the seam
     unserialisable and a worker or WASM backend impossible without changing
     every caller. Rebuilding costs nothing next to the solve. */
  const unlocked = new Set(input.unlocked);
  const excluded = new Set(input.excluded);
  const splitBy = new Map(input.splitBy);

  /* Groups are built here from the route and the cut positions rather than
     handed in ready-made. They used to arrive as arrays of the very same leg
     objects held in `route`, and `route.indexOf(legs[0])` below depended on
     that identity — which a JSON round trip destroys, taking the split-point
     lookup with it. Rebuilding from indices means the seam carries only values.
     (cut i = separate after leg i.) */
  const cuts = new Set(input.cuts);
  const groups = [];
  {
    let cur = [];
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
  const out = [];
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
    const g = isLaunch ? 9.81 : Math.max(...legs.map((l) => l.g));
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
    const bodyName = isLaunch ? origin : (legs.find((l) => l.body) || {}).body;
    let res = solveGroup({
      dv,
      payload: carried,
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
      bodyName,
      objective,
      minK: forced || 1,
      maxK: forced || autoK,
    });

    /* The closed-form solver can pick a stage count the vehicle cannot fly —
         an upper stage that satisfies the rocket equation but has no pitch
         programme reaching orbit. On auto, walk the candidates cheapest first
         and take the first the simulator accepts. */
    if (res && isLaunch && !forced && BODY[bodyName] && res.byK.length > 1) {
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
      const compliant = [...res.byK].filter((x) => x && x.slim);
      const pool = compliant.length ? compliant : [...res.byK].filter(Boolean);
      const order = pool.sort((x, y) => x.chainScore - y.chainScore);
      let flew = false;
      for (const cand of order) {
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
        if (flown && flown.ok) {
          res = cand;
          flew = true;
          break;
        }
      }
      /* Nothing in the compliant pool could be flown. Keep the best of them
           anyway — the design is the one the user asked for, and the flight card
           will show that the ascent could not be simulated. */
      if (!flew && order.length) res = order[0];
    }

    /* The map's ascent figure is a rule of thumb; the simulator knows what
         this particular vehicle will actually spend. Sizing to the map and then
         reporting a higher flown cost — which is what happened, 3 740 built
         against 4 062 needed — hands you a rocket that cannot reach orbit.
         Re-solve against the flown cost until the vehicle carries it. */
    if (res && isLaunch && BODY[bodyName]) {
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
        const built = res.chain.reduce((a2, c) => a2 + c.sol.dv, 0);
        flown.carried = built; // surfaced next to the ascent cost
        if (flown.total <= built) break; // it carries the flight
        const grown = solveGroup({
          dv: flown.total * (1 + margin / 100),
          payload: carried,
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

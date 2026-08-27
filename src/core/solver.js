import { TALLY, resetTally } from "./tally.js";
import { BODY, atmoFor } from "./atmosphere.js";
import { G0 } from "./constants.js";
import { heightOf, packFor, stackGeometry, stageSize } from "./geometry.js";
import {
  RADIAL_DECOUPLER,
  couplerFor,
  decouplerFor,
  diaOf,
  isRadial,
  maxCluster,
  shroudFor,
} from "./parts.js";
import {
  STAGE_PRESSURE,
  ispAt,
  propellantFor,
  scoreOf,
  stageCost,
  stageParts,
} from "./performance.js";
import { fitStructure, pickTanksMemo, poolsFor } from "./tanks.js";

/* --------------------------------- solver ---------------------------------
   Rocket equation with tankage. For propellant mass mp and structural
   coefficient k (tank dry mass per tonne of propellant):
       mf = P + E + k*mp        m0 = mf + mp        R = exp(dv / (Isp*g0))
   Solving for mp:
       mp = (R-1)(P+E) / (1 + k - R*k)
   Feasible only while R < (1+k)/k — for stock 9:1 tanks that caps a single
   stage at Isp*g0*ln(9).                                                   */
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
  objective = "mass",
  needGimbal = false,
  hasStageBelow = false,
  noPlate = false,
  expansions = null,
  plateAbove = false,
  capCluster = 0,
}) {
  if (!isFinite(dv) || dv <= 0) return null; // refuse a nonsense requirement outright
  /* A stage that flies through air has to steer. Without a gimbal you are relying
     on fins and reaction wheels alone, which is how a launch ends up pinwheeling
     off the pad — so by default an atmospheric stage needs a vectoring nozzle.
     Solids never gimbal, which is exactly why they are strap-ons rather than
     cores. */
  const gimbalNeeded = needGimbal && pSurf > 0.02;
  let best = null;
  /* One scratch object, filled and re-filled. A stage design is built, scored,
     compared and thrown away tens of thousands of times per solve — only the few
     that become the new best need to outlive the iteration, so only those are
     copied. Everything the candidate points at (tanks, structure) is already a
     distinct object per candidate, so a shallow copy is enough. */
  const scratch = {};
  const keep = (c) => {
    const o = {};
    for (const k in c) o[k] = c[k];
    return o;
  };
  const consider = (cand) => {
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
    if (gimbalNeeded && !(e.gim > 0)) continue;

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
      if (n < Math.ceil((twrMin * (payload + extra) * g) / thrust1)) continue;

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
        consider(scratch);
        continue;
      }

      const groups = poolsFor(e, tanks);
      if (!groups.length) continue;
      const dryBase = payload + extra + n * e.m;

      for (const grp of groups) {
        // one per tank diameter
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
          const { coup, shroud, coupM, adapt, rejoin, dec, joiner } = fit;
          const perEng = fit.perEng;
          const fixed = dryBase + fit.dry;

          const mp = propellantFor(dv, fixed, ispE, k);
          if (mp === null) continue;
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
          const mf = fixed + tk.dryMass;
          const m0 = mf + tk.prop + adapt.prop;
          const got = ispE * G0 * Math.log(m0 / mf);
          if (got < dv * 0.995) continue;
          const twr = thrust / (m0 * g);
          if (twr < twrMin) continue;
          const burn = (tk.prop + adapt.prop) / mdot;
          if (burn > maxBurn) continue; // rules out clusters of tiny engines on heavy stages
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
function boostDv(mp, burnA, fixed, k, nb, b, drop, aspHere, ispCore, ispEff) {
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
  mp,
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
}) {
  let best = null;

  /* Tank pools depend only on the core engine, so build them once. This runs
     inside a split search now, and re-filtering 64 tanks per combination was
     the whole cost of the function. */
  const cores = [];
  for (const c of engines) {
    /* A boosted core still flies through the whole atmosphere, so it needs to
       steer just as much as an unboosted one. This check was only in solveStage,
       which let a Reliant core through the moment boosters were involved. */
    if (needGimbal && pSurf > 0.02 && !(c.gim > 0)) continue;

    if (c.fuelM !== 0 || !c.f.includes("Ox")) continue;
    for (const grp of poolsFor(c, tanks))
      cores.push({
        c,
        k: grp.k,
        usable: grp.usable,
        grp,
        cap: Math.min(4, maxCluster(c, unlocked, excluded)),
      });
  }
  if (!cores.length) return null;

  const mounts = [];
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
  const tankMounts = (coreEngine, grp) => {
    const out = [];
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

  const liquidMounts = (coreEngine, grp) => {
    const out = [];
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
  const viable = [];
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
          const { c, k, usable, grp, cap } = core;
          const mdotC = (nc * c.fv) / (c.iv * G0);
          /* Pressure comes from the body being left, not from Kerbin. Eve's
             surface is 5 atm, where the real curves put a Terrier at zero — its
             cutoff is 3 atm — while a Kickback still makes 51 s. The ranking does
             not just shift, it inverts. */
          const pR = pRef;
          const thr = (e, p) => e.fv * (ispAt(e, p) / e.iv); // thrust at pressure p
          const ispEff =
            (nb * b.fv * (ispAt(b, pR) / b.iv) +
              nc * c.fv * (ispAt(c, pR) / c.iv)) /
            ((nb * mdotB + mdotC) * G0);
          const ispCore = ispAt(c, pR);
          const stackD = grp.dia;
          const coup = couplerFor(c, nc, unlocked, excluded);
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
            plateAbove: false,
            hasStageBelow: false,
          });
          if (!fit) continue;
          const { coupM, adapt, dec, shroud } = fit;
          const fixed =
            payload + extra + nc * c.m + nb * RADIAL_DECOUPLER + fit.dry;

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

            const mp = tk.prop;
            if (mp <= burnA * 1.02) continue;
            const coreDry = fixed + tk.dryMass;
            const m0 = coreDry + mp + nb * b.m;
            const mA = m0 - nb * b.fuelM - coreBurnA;
            const mB0 = mA - nb * b.dry;
            const dvA = ispEff * G0 * Math.log(m0 / mA);
            const got = dvA + ispCore * G0 * Math.log(mB0 / coreDry);
            if (got < dv * 0.995) continue;

            const twr = (nb * thr(b, pSurf) + nc * thr(c, pSurf)) / (m0 * g);
            if (twr < twrMin) continue;
            /* The core has to keep flying once the boosters go. Without this the
             optimiser bolts on SRBs purely to pass the liftoff TWR check and
             leaves a sustainer that can't hold itself up. A real sustainer can
             sit a little under 1 by separation, already fast and climbing. */
            if ((nc * thr(c, pSurf)) / (mB0 * g) < 0.85) continue;
            /* Boosters that burn out in a handful of seconds are a crutch, not a stage. */
            if (dvA < dv * 0.08) continue;

            const cand = {
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
              boosters: { part: b, n: nb, burn: tB, dv: dvA, sepMass: mA },
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
function splitShares(k) {
  if (k === 1) return [[1]];
  const out = [];
  if (k === 2) {
    for (let a = 0.3; a <= 0.701; a += 0.1) out.push([a, 1 - a]);
  } else if (k === 3) {
    for (let a = 0.2; a <= 0.501; a += 0.1)
      for (let b = 0.2; b <= 0.501; b += 0.1) {
        const c = 1 - a - b;
        if (c >= 0.15 && c <= 0.6) out.push([a, b, c]);
      }
  } else {
    // even, plus tilts toward the bottom and toward the top
    const even = 1 / k;
    out.push(Array(k).fill(even));
    for (const tilt of [0.4, 0.2, -0.2, -0.4]) {
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

function solveGroup({
  dv,
  payload,
  engines,
  tanks,
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
  minK,
  maxK,
  bodyName,
  objective = "mass",
}) {
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
  let best = null;
  const byK = [];

  for (let k = minK; k <= maxK; k++) {
    for (const shares of splitShares(k)) {
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
      const clustered = {};
      for (const variant of objective === "cost" ? [0, 1, 2, 3] : [0]) {
        for (const pick of objective === "cost"
          ? ["cost", "parts"]
          : [objective]) {
          /* Nothing variant 0 clustered past the cap, so variant 3 would rebuild
             the same chain. See the note above for why that is exact. */
          if (variant === 3 && !clustered[pick]) continue;
          const chain = new Array(k),
            sub = [];
          let carried = payload,
            ok = true;
          for (let i = k - 1; i >= 0; i--) {
            // solve top down
            const bottom = i === 0;
            const sdv = dv * shares[i];
            const twrMin = bottom ? twrBottom : twrUpper;
            const pRef = pSurf * STAGE_PRESSURE[Math.min(i, 3)];
            const pSt = bottom ? pSurf : pRef; // it lights where it sits
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
              g,
              hasStageBelow: !bottom,
              noPlate: variant === 2,
              expansions,
              plateAbove,
              capCluster: variant === 3 ? 4 : 0,
              pRef,
              pSurf: pSt,
              extra,
              maxBurn: pSurf > 0.5 && bottom ? 200 : 420,
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
             configuration on the pad. */
            const wantMounts =
              boosters &&
              (kind === "launch" || kind === "land") &&
              (srbs.length ? pSt > 0.1 : false);
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
                g,
                extra,
                srbs,
                pRef,
                pSurf: pSt,
                objective: pick,
                noLiquid: variant === 1,
                noPlate: variant === 2,
                expansions,
                asparagus,
              });
              if (bs && (!s || bs.score < s.score)) s = bs;
            }
            if (!s) {
              ok = false;
              break;
            }
            chain[i] = { sol: s, want: sdv, payloadIn: carried, twrMin, g };
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
          const chainScore =
            objective === "mass"
              ? carried
              : sub.reduce(
                  (a, x) => a + (objective === "cost" ? x.cost : x.parts),
                  0,
                );
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
            const packedSol = {
              ...sol,
              packed: pk,
              dry: sol.dry + pk.mass,
              total: sol.total + pk.mass,
            };
            chain[q] = { ...chain[q], sol: packedSol };
          }
          const ar = stackGeometry(chain, payload).ar;
          TALLY.chains++;
          const cand = {
            chain,
            total: carried,
            k,
            chainScore,
            ar,
            slim: ar <= maxAspect,
          };
          const better = (x, y) =>
            !y || (x.slim !== y.slim ? x.slim : x.chainScore < y.chainScore);
          if (better(cand, best)) best = cand;
          if (better(cand, byK[k])) byK[k] = cand;
        }
      }
    }
  }
  return best && { ...best, byK: byK.filter(Boolean) };
}

/* Which parts each node actually unlocks. 27 of the 63 stock nodes carry nothing
   that can appear in a rocket — science, comms, robotics — so they are shown
   greyed rather than offered as though they mattered. */

export { boostedAscent, solveGroup, solveStage, splitShares };

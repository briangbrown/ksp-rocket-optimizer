import { TALLY } from "./tally.js";
import { BODY, atmoFor, cdOf, frontalArea, ispCurve } from "./atmosphere.js";
import { stageSize } from "./geometry.js";
import { diaOf } from "./parts.js";
import { ispCut } from "./performance.js";
import type { Atmo, AtmoBody } from "./atmosphere.js";
import type { Solution } from "./solution.js";

/* ------------------------- the vehicle, as it is flown -------------------------

   Not a solved stage: a solved stage knows what it is built from, and the
   simulator only needs what changes its trajectory. `buildVehicleFor` at the
   foot of this file is the one place the two meet. */
type FlightBoosters = {
  n: number;
  mdot: number;
  isp: (patm: number) => number;
  prop: number;
  dry: number;
  wet: number;
  dia: number;
  area: number;
  /* Asparagus sheds a pair at a time rather than the whole ring at once, and
     both the mass and the drag have to step down together — which is why it
     reaches the simulator at all and not just the rocket equation. */
  asparagus: boolean;
  pairProp: number;
  pairDry: number;
  pairArea: number;
  /* Whether the ring is solid motors, which the flight card has to know: a
     solid cannot be throttled or shut down, a liquid column can. The
     simulator itself flies every ring to burnout either way. */
  solid: boolean;
};

type FlightStage = {
  mdot: number;
  isp: (patm: number) => number;
  prop: number;
  dry: number;
  wet: number;
  dia: number;
  area: number;
  boosters: FlightBoosters | null;
};

type Vehicle = {
  body: AtmoBody;
  atmo: Atmo;
  bodyName: string;
  payload: number;
  stages: Array<FlightStage>;
  payloadArea: number;
};

/* The turn, and the two throttles. `limit` is the booster slider people
   actually reach for; `core` throttles the liquid core so the two finish
   together. */
type AscentOpt = {
  target: number;
  vKick: number;
  kick: number;
  limit?: number;
  core?: number;
  trace?: boolean;
};

/* A waypoint on the flight card. `nav` is the navball reading — degrees above
   the horizon — and is absent on the coast, where there is nothing to hold. */
type Mark = {
  t: number;
  h: number;
  v: number;
  nav?: number;
  meco?: boolean;
  coast?: boolean;
  apoMark?: boolean;
};

type TracePoint = {
  t: number;
  h: number;
  sr: number;
  pitch: number;
  apo: number;
  m: number;
  T: number;
  q: number;
};

/* Two outcomes, told apart by `ok`. The failure carries it as an absent
   optional rather than not at all, so `if (!r.ok)` reads the same on both. */
type AscentFail = {
  ok?: false;
  fail: string;
  t?: number;
  apo?: number;
  dvUsed?: number;
  trace?: Array<TracePoint> | null;
};

type AscentOk = {
  ok: true;
  marks: Array<Mark>;
  tApo: number;
  toApo: number;
  tMeco: number | null;
  t: number;
  dvUsed: number;
  circ: number;
  total: number;
  apo: number;
  handT: number;
  handV: number;
  handAlt: number;
  vApo: number;
  vCirc: number;
  circBurn: number | null;
  circProp: number | null;
  circShort: boolean;
  gLoss: number;
  dLoss: number;
  sLoss: number;
  maxQ: number;
  maxQalt: number;
  maxMach: number;
  propLeft: number;
  mass: number;
  /* Written on afterwards by plan.js, which re-solves against the flown cost
     and keeps what the design was built to carry next to what it turned out to
     need. */
  carried?: number;
};

type AscentResult = AscentOk | AscentFail;

/* A flown ascent with the turn that produced it, which is what the flight card
   is built from. */
type Turn = AscentOk & {
  vKick: number;
  kick: number;
  limit?: number;
  core?: number;
  fullThrottle?: number;
};

/* ---------- ascent integration ---------- */
/* How many of a crossfed ring are still bolted on after `spent` tonnes have
   gone through it.

   A pair at a time, because that is the arrangement: every attached stack feeds
   the ones still burning, so a pair empties long before it would alone, and it
   is dropped when it does. Never below two — the last pair burns to the end
   with the core, since there is nothing left to feed it from.

   Its own function because it is the part of asparagus that is actually
   distinctive, and it is four operations on three numbers where the walk it
   lives in is a simulation. #125 */
const boostersAfter = (n: number, pairProp: number, spent: number) =>
  n - Math.min(Math.floor(spent / pairProp) * 2, n - 2);

function flyAscent(veh: Vehicle, opt: AscentOpt): AscentResult {
  TALLY.flights++;
  const b = veh.body,
    atmo = veh.atmo,
    mu = b.g0 * b.R * b.R,
    w = (2 * Math.PI) / b.rot;
  const targetR = b.R + opt.target;
  let pos = [b.R, 0],
    vel = [0, w * b.R];
  let iS = 0,
    prop = veh.stages[0].prop,
    bProp = veh.stages[0].boosters
      ? veh.stages[0].boosters.n * veh.stages[0].boosters.prop
      : 0;
  /* How many side stacks are still attached. Under parallel staging this only
     ever goes from n to zero; under asparagus it steps down two at a time. */
  let bLeft = veh.stages[0].boosters ? veh.stages[0].boosters.n : 0;
  let mass =
    veh.stages.reduce(
      (s, x) => s + x.wet + (x.boosters ? x.boosters.n * x.boosters.wet : 0),
      0,
    ) + veh.payload;
  let kicked = false,
    coasting = false,
    handT = -1,
    handV = 0,
    handAlt = 0,
    t = 0,
    dvUsed = 0,
    gLoss = 0,
    dLoss = 0,
    sLoss = 0,
    maxQ = 0,
    maxQalt = 0,
    maxMach = 0;
  const dt = 0.1;
  /* Waypoints every 10 km. A flight card that only gives the opening pitch and a
     circularisation figure gives you no way to tell mid-ascent that you have
     drifted off the profile — and the profile is unforgiving, because arriving at
     apoapsis a few hundred m/s slow turns a 125 m/s circularisation into well
     over a thousand. */
  const trace: Array<TracePoint> | null = opt.trace ? [] : null;
  const marks: Array<Mark> = [];
  let tMeco: number | null = null;

  for (; t < 900; t += dt) {
    const r = Math.hypot(pos[0], pos[1]),
      h = r - b.R;
    if (h < -50) return { fail: "crashed", t };
    const up = [pos[0] / r, pos[1] / r],
      east = [-up[1], up[0]];
    const vAtm = [-w * pos[1], w * pos[0]];
    const vr = [vel[0] - vAtm[0], vel[1] - vAtm[1]],
      sr = Math.hypot(vr[0], vr[1]);

    if (!kicked && sr >= opt.vKick) kicked = true;
    let pitch = 0;
    if (kicked) {
      const pro = Math.atan2(
        vr[0] * east[0] + vr[1] * east[1],
        vr[0] * up[0] + vr[1] * up[1],
      );
      /* Hold the kick attitude until the velocity vector rotates up to meet it;
         from that moment on, prograde leads and the turn flies itself. That
         crossover is the handoff the pilot needs told to them. */
      if (handT < 0 && pro >= opt.kick) {
        handT = t;
        handV = sr;
        handAlt = h;
      }
      /* Never below the horizon on the way up. Following prograde without a floor
         lets a shallow stage nose down, descend, and drive its periapsis into the
         ground while its osculating apoapsis still reads high. */
      pitch = Math.min(Math.PI / 2, Math.max(pro, opt.kick));
    }
    const dir = [
      Math.cos(pitch) * up[0] + Math.sin(pitch) * east[0],
      Math.cos(pitch) * up[1] + Math.sin(pitch) * east[1],
    ];

    const st = veh.stages[iS];
    /* KSP's thrust limiter scales mass flow as well as thrust, so the stage simply
       burns longer at lower thrust. Applied to the boosters when there are any —
       that is the slider people actually reach for — otherwise to the core. */
    const lim = iS === 0 ? (opt.limit === undefined ? 1 : opt.limit) : 1;
    const bLim = st && st.boosters ? lim : 1;
    /* A separate throttle for the liquid core. With strap-on solids you cannot
       shut the boosters down, so the way to stop the apoapsis running away is to
       throttle the core until the two finish together — which is what a pilot
       does by hand and what the old model had no way to express. */
    const cLim =
      st && st.boosters
        ? iS === 0 && opt.core !== undefined
          ? opt.core
          : 1
        : lim;
    const pa = atmo.p(h) / 101.325; // absolute atmospheres — the Isp curve is keyed on Kerbin sea level, not local surface
    let T = 0,
      mdot = 0;
    if (st && prop > 0 && !coasting) {
      const isp = st.isp(pa);
      T += st.mdot * cLim * isp * 9.80665;
      mdot += st.mdot * cLim;
    }
    /* Solids keep burning through cutoff — there is no shutdown valve on an SRB.
       Modelling them as stoppable let the simulator report an apoapsis it could
       not actually stop at, and the flight card told you to cut engines while the
       boosters were still pushing. */
    if (st && st.boosters && bProp > 0) {
      const bo = st.boosters,
        isp = bo.isp(pa);
      T += bLeft * bo.mdot * bLim * isp * 9.80665;
      mdot += bLeft * bo.mdot * bLim;
    }

    // apoapsis check -> shut down
    const vv = Math.hypot(vel[0], vel[1]),
      en = (vv * vv) / 2 - mu / r,
      hm = pos[0] * vel[1] - pos[1] * vel[0];
    const a = -mu / (2 * en),
      e = Math.sqrt(Math.max(0, 1 + (2 * en * hm * hm) / (mu * mu))),
      apo = a * (1 + e);
    const climbing = pos[0] * vel[0] + pos[1] * vel[1] > 0;
    /* Cut off only while still rising. The apoapsis of the osculating orbit can
       read above target while the vehicle is descending toward a periapsis below
       the surface — that apoapsis is behind it on the ellipse and unreachable, so
       shutting down there means falling, not coasting. */
    /* Cutting the core while solids still burn does not end the burn, so hold the
       cutoff until they are spent — and record how far past target the apoapsis
       is carried in the meantime. */
    if (!coasting && apo >= targetR && climbing && bProp <= 0) {
      coasting = true;
      // the engine stops here — record it, rather than labelling the point where
      // the integration happens to hand over to the ballistic coast
      marks.push({
        t: Math.round(t),
        h: Math.round(h),
        v: Math.round(sr),
        nav: Math.round(90 - (pitch * 180) / Math.PI),
        meco: true,
      });
      tMeco = t;
    }
    if (coasting) {
      /* Reaching the top of the arc is not the same as reaching orbit. Cutoff is
         armed when the osculating apoapsis first reads above target, but the
         vehicle can then run dry, or lose apoapsis to drag, and arrive at a peak
         well below where it was aimed. Circularising there does not produce the
         requested orbit — it produces a lower one — so the flight has to be
         reported as short rather than as a success.

         This is what let a launch cut off at 51 km with 2 165 m/s (circular there
         is 2 329) and still return ok, with a 28-minute "coast" upward from what
         was already its apoapsis. */
      /* Arriving at the top of the arc below the target orbit is not success.
         Cutoff is armed the moment the osculating apoapsis first reads above
         target, but drag keeps eating it during the climb out of the atmosphere,
         so the peak actually reached can be kilometres lower. Circularising there
         produces a lower orbit than the one asked for, and the Δv reported is the
         cost of that lower orbit — cheaper, and not the mission.

         The tolerance is 1 km, which is inside what the turn search can resolve
         and well outside integration noise. Loosely checked, this let a launch
         peak at 76.6 km against an 80 km target and score as the cheapest ascent
         available, because falling short is always cheaper than not. */
      /* Two ways out of the coast: reach the top of the arc, or climb clear of
         the air. Either way the orbit is whatever the state says it is, so the
         apoapsis has to be checked on both paths — testing only at the peak let a
         flight that left the atmosphere 3.4 km short sail through and score as
         the cheapest ascent available, because falling short is always cheaper
         than not. */
      if (!climbing || h >= b.top) {
        // at apoapsis, or clear of the air
        if (apo < targetR - 1000)
          return { fail: "apoapsis short", t, apo: apo - b.R, dvUsed };
        const vApo = Math.sqrt(Math.max(0, mu * (2 / apo - 1 / a))),
          vC = Math.sqrt(mu / apo);
        /* The circularisation is not an impulse. Work out how long it actually
           takes on whatever stage is still live, so the burn can be centred on
           apoapsis rather than started there. */
        const live = veh.stages[iS];
        let circBurn: number | null = null,
          circProp: number | null = null,
          circShort = false,
          circDv = vC - vApo;
        if (live) {
          /* The circularisation is not an impulse, and on a lofted arrival it is
             nowhere near one: arriving slow means buying almost the whole orbital
             velocity, which on a small upper stage can run for minutes. Over a
             burn that long the vehicle travels a long way round, thrust that
             started horizontal is no longer horizontal, and the impulsive figure
             understates it badly.

             Integrate it instead. Thrust perpendicular to the radius — the
             attitude a pilot actually holds — and stop when the speed reaches
             circular. What that costs above the impulsive figure is the finite
             burn loss, and it is what makes a lofted ascent expensive. */
          let cr = apo,
            cv = vApo,
            cm = mass,
            cp = prop,
            spent = 0,
            t2 = 0;
          const dt2 = 0.5,
            ispV = live.isp(0),
            ve = ispV * 9.80665;
          for (; t2 < 1200; t2 += dt2) {
            const vCircHere = Math.sqrt(mu / cr);
            if (cv >= vCircHere) break;
            if (cp <= 0) {
              circShort = true;
              break;
            }
            const acc = (live.mdot * ve) / cm;
            const dv2 = acc * dt2;
            /* Only the component that is still adding orbital speed counts; the
               radial component fights the climb the burn itself induces. */
            cv += dv2;
            const excess = (cv * cv) / cr - mu / (cr * cr); // net outward accel
            cr += Math.max(0, excess) * dt2 * dt2 * 0.5 + 0;
            cm -= live.mdot * dt2;
            cp -= live.mdot * dt2;
            spent += dv2;
          }
          circDv = spent > 0 ? spent : vC - vApo;
          circProp = mass - cm;
          circBurn = t2;
        }
        /* Above the atmosphere the rest of the climb is a ballistic coast — no
           thrust, no drag — so the remaining waypoints follow from conservation of
           energy rather than more integration. Surface speed subtracts the ground
           rotating underneath. */
        /* Carry the profile through the coast and the circularisation, because
           cutoff is not the end of the job — it is the point at which the pilot
           has the least idea what to do next. Time to apoapsis comes from Kepler:
           true anomaly from the state, then eccentric and mean anomaly, then the
           remaining sweep to apoapsis divided by the mean motion. */
        const eOrb = (vv * vv) / 2 - mu / r;
        const nu = Math.atan2(
          ((pos[0] * vel[0] + pos[1] * vel[1]) /
            Math.sqrt(mu / (a * (1 - e * e)))) *
            1,
          (a * (1 - e * e)) / r - 1,
        );
        const EA =
          2 *
          Math.atan2(
            Math.sqrt(1 - e) * Math.sin(nu / 2),
            Math.sqrt(1 + e) * Math.cos(nu / 2),
          );
        const M = EA - e * Math.sin(EA);
        const n = Math.sqrt(mu / (a * a * a));
        let toApo = (Math.PI - M) / n;
        if (!isFinite(toApo) || toApo < 0) toApo = 0;

        // a handful of checkpoints, not a 30-second log of a twenty-minute coast
        const step = Math.max(30, Math.round(toApo / 4 / 10) * 10);
        for (let dtc = step; dtc < toApo - step / 2; dtc += step) {
          const frac = dtc / toApo;
          const hc = h + (apo - b.R - h) * Math.sin((frac * Math.PI) / 2); // eases into apoapsis
          const rc = b.R + hc;
          const vc = Math.sqrt(Math.max(0, 2 * (eOrb + mu / rc)));
          marks.push({
            t: Math.round(t + dtc),
            h: Math.round(hc),
            v: Math.round(Math.max(0, vc - w * rc)),
            coast: true,
          });
        }
        const tApo = Math.round(t + toApo);
        marks.push({
          t: tApo,
          h: Math.round(apo - b.R),
          v: Math.round(Math.max(0, vApo - w * apo)),
          apoMark: true,
        });
        return {
          ok: true,
          marks,
          tApo,
          toApo,
          tMeco,
          t,
          dvUsed,
          circ: circDv,
          total: dvUsed + circDv,
          apo: apo - b.R,
          handT,
          handV,
          handAlt,
          vApo,
          vCirc: vC,
          circBurn,
          circProp,
          circShort,
          gLoss,
          dLoss,
          sLoss,
          maxQ,
          maxQalt,
          maxMach,
          propLeft: prop,
          mass,
        };
      }
    }

    const rho = atmo.rho(h),
      q = 0.5 * rho * sr * sr,
      mach = sr / atmo.a(h);
    if (q > maxQ) {
      maxQ = q;
      maxQalt = h;
    }
    if (mach > maxMach) maxMach = mach;
    /* Keyed on time, not altitude. A low-TWR upper stage flattens out and will
       sit level or even nose-down while it builds horizontal speed, so it can
       pass 40 km, drop back to 38 km and cut off there — altitude is not
       monotonic and a table indexed by it puts the rows in the wrong order.
       `pitch` runs from straight up toward the horizon, so the navball reading —
       degrees above the horizon — is its complement. */
    // powered flight only; the coast gets its own sparse checkpoints below
    if (!coasting && t >= marks.length * 30 && marks.length < 20)
      marks.push({
        t: Math.round(t),
        h: Math.round(h),
        v: Math.round(sr),
        nav: Math.round(90 - (pitch * 180) / Math.PI),
      });
    const A = frontalArea(
        veh.stages,
        iS,
        bProp > 0,
        veh.payloadArea || 0,
        bLeft,
      ),
      D = (q * cdOf(mach, rho * sr) * A) / 1000; // N -> kN, masses are tonnes
    const g = mu / (r * r);

    const acc = [
      (dir[0] * T) / mass - up[0] * g - ((sr > 0 ? vr[0] / sr : 0) * D) / mass,
      (dir[1] * T) / mass - up[1] * g - ((sr > 0 ? vr[1] / sr : 0) * D) / mass,
    ];
    // loss accounting
    /* Losses are what the ENGINE has to overcome, so they only accrue while it is
       running. Accumulating gravity loss through the coast added a phantom
       1 200 m/s to a five-minute ascent with a nine-minute coast — the vehicle is
       still climbing and gravity is still slowing it, but no propellant is being
       spent to fight it. That is the coast trading speed for altitude, which the
       orbit already accounts for.

       Drag during the coast is real and still costs velocity, so it stays. */
    if (sr > 0) {
      const vh = [vr[0] / sr, vr[1] / sr];
      if (!coasting) gLoss += g * (vh[0] * up[0] + vh[1] * up[1]) * dt;
      dLoss += (D / mass) * dt;
      if (!coasting)
        sLoss += (T / mass) * (1 - (dir[0] * vh[0] + dir[1] * vh[1])) * dt;
    }
    dvUsed += (T / mass) * dt;

    if (trace && Math.abs(t % 10) < dt / 2)
      trace.push({
        t: +t.toFixed(0),
        h: +(h / 1000).toFixed(1),
        sr: +sr.toFixed(0),
        pitch: +(pitch * 57.3).toFixed(1),
        apo: +((apo - b.R) / 1000).toFixed(1),
        m: +mass.toFixed(1),
        T: +T.toFixed(0),
        q: +(q / 1000).toFixed(1),
      });
    vel = [vel[0] + acc[0] * dt, vel[1] + acc[1] * dt];
    pos = [pos[0] + vel[0] * dt, pos[1] + vel[1] * dt];
    mass -= mdot * dt;
    if (st) {
      if (st.boosters && bProp > 0) {
        const bo = st.boosters;
        /* Every attached engine draws from the pool, so it drains faster the
           more stacks are still burning — that is the point of the arrangement,
           and it is why a pair empties long before it would on its own. */
        const u = bLeft * bo.mdot * bLim * dt;
        bProp -= u;
        if (bo.asparagus && bLeft > 2) {
          /* Shed a pair each time one pair's worth has gone. */
          const spent = bo.n * bo.prop - bProp;
          const want = boostersAfter(bo.n, bo.pairProp, spent);
          while (bLeft > want) {
            mass -= bo.pairDry;
            bLeft -= 2;
          }
        }
        if (bProp <= 0) {
          mass -= bLeft * bo.dry;
          bProp = 0;
          bLeft = 0;
        }
      }
      if (!coasting) prop -= st.mdot * cLim * dt;
      if (prop <= 0) {
        mass -= st.dry;
        iS++;
        if (iS >= veh.stages.length)
          return { fail: "out of fuel", t, apo: apo - b.R, dvUsed, trace };
        prop = veh.stages[iS].prop;
        /* Read once. Three lookups through a variable index say the same thing
           three times, and only the name makes it plain that they are one
           booster pool rather than three. */
        const nb = veh.stages[iS].boosters;
        bProp = nb ? nb.n * nb.prop : 0;
        bLeft = nb ? nb.n : 0;
      }
    }
  }
  return { fail: "timeout" };
}

/* Search the turn. Unconstrained, the optimum is a violent early pitchover that
   trades gravity loss for dynamic pressure the vehicle could never survive or
   hold prograde through, so cap max Q at a level people actually fly.
   Coarse pass then a local refine — a full fine grid is ~550 trajectories and
   costs most of a second, which is too slow to sit inside a live recompute. */
function optimiseTurn(veh: Vehicle, target = 80000, qCap = 40000) {
  /* Held on an object rather than in two locals. `scan` below assigns both
     from inside a callback, and flow analysis cannot see through that — as
     plain `let`s they would still read as `null` at every use after it. */
  const found: { best: Turn | null; gentlest: Turn | null } = {
    best: null,
    gentlest: null,
  };
  const scan = (vs: Array<number>, ks: Array<number>) => {
    for (const vK of vs)
      for (const kd of ks) {
        const r = flyAscent(veh, {
          target,
          vKick: vK,
          kick: (kd * Math.PI) / 180,
        });
        if (!r.ok) continue;
        const c = { ...r, vKick: vK, kick: kd };
        /* If nothing meets the q cap, fall back to the calmest trajectory, not the
         cheapest — the cheapest is the most aggressive, which is the opposite of
         what you want when the vehicle is already fighting the air. */
        if (!found.gentlest || r.maxQ < found.gentlest.maxQ) found.gentlest = c;
        if (r.maxQ <= qCap && (!found.best || r.total < found.best.total))
          found.best = c;
      }
  };
  const range = (a: number, b: number, st: number) => {
    const o: Array<number> = [];
    for (let x = a; x <= b; x += st) o.push(x);
    return o;
  };
  scan(range(30, 140, 20), range(3, 25, 4));
  /* If nothing stays under the cap at full thrust, look for a limiter setting that
     does. Not a binary search from zero: throttle far enough back and the stack
     cannot leave the pad, so the workable range is an interval, not a half-line.
     Scan down from full thrust and take the first setting that both flies and
     stays under — the highest thrust that behaves. */
  if (!found.best && found.gentlest) {
    for (let lim = 0.95; lim >= 0.3; lim -= 0.05) {
      const r = flyAscent(veh, {
        target,
        vKick: found.gentlest.vKick,
        kick: (found.gentlest.kick * Math.PI) / 180,
        limit: lim,
      });
      if (r.ok && r.maxQ <= qCap) {
        found.best = {
          ...r,
          vKick: found.gentlest.vKick,
          kick: found.gentlest.kick,
          limit: lim,
        };
        break;
      }
    }
  }

  const seed = found.best || found.gentlest;
  if (seed)
    scan(
      range(Math.max(25, seed.vKick - 15), seed.vKick + 15, 5),
      range(Math.max(2, seed.kick - 3), seed.kick + 3, 1),
    );

  /* With solids aboard, try throttling the core as well. The pairing that lands
     the boosters' burnout near the target apoapsis is usually far better than any
     turn alone, because it stops the stack carrying its apoapsis past the mark
     with thrust it cannot switch off. */
  if (veh.stages[0] && veh.stages[0].boosters) {
    const seedTurn = found.best || found.gentlest;
    if (seedTurn)
      for (let cr = 1; cr >= 0.35; cr -= 0.05) {
        const r = flyAscent(veh, {
          target,
          vKick: seedTurn.vKick,
          kick: (seedTurn.kick * Math.PI) / 180,
          core: cr,
        });
        if (
          r.ok &&
          r.maxQ <= qCap &&
          (!found.best || r.total < found.best.total)
        )
          found.best = {
            ...r,
            vKick: seedTurn.vKick,
            kick: seedTurn.kick,
            core: cr,
            fullThrottle: seedTurn.total,
          }; // what it costs without throttling
      }
  }

  return found.best || found.gentlest;
}

const _simCache = new Map<string, Turn | null>();
function simCached(veh: Vehicle, target: number) {
  const key =
    veh.bodyName +
    "|" +
    target +
    "|" +
    veh.payload.toFixed(3) +
    "|" +
    veh.stages
      .map((x) =>
        [
          x.mdot.toFixed(4),
          x.prop.toFixed(3),
          x.dry.toFixed(3),
          x.area.toFixed(2),
          x.boosters ? x.boosters.n + ":" + x.boosters.prop.toFixed(2) : "-",
        ].join(","),
      )
      .join(";");
  if (_simCache.has(key)) return _simCache.get(key) ?? null;
  const r = optimiseTurn(veh, target, 40000);
  if (_simCache.size > 300) _simCache.clear();
  _simCache.set(key, r);
  return r;
}

/* Only what this reads of a stage in a plan. The whole thing is assembled in
   plan.js, and `payloadIn` is what that stage is carrying above it. */
type PlannedStage = { sol: Solution | null; payloadIn: number };

/* Generic in the stage, because the caller's is richer than this needs: the
   application hands whole plan stages and asks its question of those. Fixing
   the parameter to `PlannedStage` would make every such predicate unusable. */
function buildVehicleFor<S extends PlannedStage>(
  stages: ReadonlyArray<S>,
  pick: (s: S) => boolean,
  bodyName: string,
  payloadDia = 0,
): Vehicle | null {
  if (!BODY[bodyName]) return null; // airless, or no atmosphere data
  const keep = (s: S): s is S & { sol: Solution } => pick(s) && s.sol !== null;
  const sel = stages.filter(keep);
  if (!sel.length) return null;
  const simStages: Array<FlightStage> = sel.map((s) => {
    const sol = s.sol,
      e = sol.engine,
      b = sol.boosters;
    const bWet = b ? b.n * b.part.m : 0,
      bProp = b ? b.n * b.part.fuelM : 0;
    return {
      mdot: (sol.n * e.fv) / (e.iv * 9.80665),
      isp: ispCurve(e.iv, e.ia, ispCut(e)),
      prop: sol.prop - bProp,
      dry: sol.dry - s.payloadIn,
      wet: sol.total - s.payloadIn - bWet,
      dia: diaOf(e),
      area: stageSize(sol).area,
      boosters: b
        ? {
            n: b.n,
            mdot: b.part.fv / (b.part.iv * 9.80665),
            isp: ispCurve(b.part.iv, b.part.ia, ispCut(b.part)),
            prop: b.part.fuelM,
            dry: b.part.dry,
            wet: b.part.m,
            dia: diaOf(b.part),
            /* Real drag cubes put a solid booster's axial face 16% above a plain
           circle of its bore — the nozzle and fins stick out past the casing.
           Cylindrical tanks match the circle to within 1%, so only this needs
           correcting. */
            area: ((1.16 * Math.PI) / 4) * Math.pow(diaOf(b.part), 2),
            /* Asparagus changes what a booster pool is. Instead of one tank that all
           the side stacks share and empty together, it is a queue of pairs: the
           outermost pair feeds every engine on the rocket, empties, and leaves —
           taking its mass AND its drag with it — and then the next pair does the
           same. Both effects have to step down together, which is why this has to
           reach the simulator and not just the rocket equation. */
            asparagus: !!sol.asparagus,
            solid: !b.part.column && !b.part.dropTank,
            pairProp: b.part.fuelM * 2,
            pairDry: b.part.dry * 2,
            pairArea: ((2 * 1.16 * Math.PI) / 4) * Math.pow(diaOf(b.part), 2),
          }
        : null,
    };
  });
  return {
    body: BODY[bodyName],
    atmo: atmoFor(bodyName),
    bodyName,
    payload: sel[sel.length - 1].payloadIn,
    stages: simStages,
    payloadArea: payloadDia > 0 ? (Math.PI / 4) * payloadDia * payloadDia : 0,
  };
}

/* A save name for the craft. Deterministic — the same configuration always gives
   the same name, so it is stable while you tweak, and changes when the mission
   does. Built from where you are going and what you intend to do there, with the
   adjective and the suffix drawn from a hash of the rest of the settings. */

export { boostersAfter, buildVehicleFor, flyAscent, optimiseTurn, simCached };
export type {
  AscentFail,
  AscentOk,
  AscentOpt,
  AscentResult,
  FlightBoosters,
  FlightStage,
  Mark,
  PlannedStage,
  TracePoint,
  Turn,
  Vehicle,
};

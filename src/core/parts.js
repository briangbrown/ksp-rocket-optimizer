import couplersData from "../data/couplers.json";
import structureData from "../data/structure.json";

function compatible(engine, tank) {
  const needs = engine.f.filter((x) => x !== "El");
  if (needs.includes("SF")) return false;
  if (needs.includes("Xe")) return tank.xe > 0;
  if (needs.includes("Mono")) return tank.mono > 0;
  if (needs.includes("Ox")) return tank.lf > 0 && tank.ox > 0;
  if (needs.includes("LF")) return tank.lf > 0 && tank.ox === 0;
  return false;
}
const SZ_DIA = {
  0: 0.625,
  1: 1.25,
  1.5: 1.875,
  2: 2.5,
  3: 3.75,
  4: 5,
  Mk2: 2.5,
  Mk3: 3.75,
  R: 1.25,
};
/* "R" in a part's size list means it can be surface-attached — it is not a
   diameter. Treating it as 1.25 m put every 0.625 m tank that happens to be
   radially mountable (the whole Oscar line) into the 1.25 m group, so a stage
   could come out as FL-T400 + FL-T200 + Oscar-C + Oscar-A. Ignore it unless the
   part has no stack profile at all. */
/* Computed once per part and cached on it. A part's size classes never change,
   so this was recomputing the same answer millions of times — and doing it with
   a filter, a map and a spread, so three throwaway arrays each time. It was 23%
   of a solve on its own, with much of the garbage collection behind it. */
function computeDia(p) {
  let best = 0,
    sawStack = false;
  for (const z of p.sz)
    if (z !== "R") {
      sawStack = true;
      const d = SZ_DIA[z] || 1.25;
      if (d > best) best = d;
    }
  if (!sawStack)
    for (const z of p.sz) {
      const d = SZ_DIA[z] || 1.25;
      if (d > best) best = d;
    }
  return best || 1.25;
}
const diaOf = (p) => {
  const d = p._dia;
  return d !== undefined ? d : (p._dia = computeDia(p));
};

/* The stack diameters a part actually presents, ignoring surface attachment. A
   part spanning two of them is an adapter — which is how they must be spotted,
   because the name does not say so: "Kerbodyne ADTP-2-3" and "Mk2 Bicoupler" both
   bridge two sizes without the word "adapter" anywhere in them. Testing the name
   let those two through into the tank pool, so a stage could list the same part
   twice, once as tankage and once as its adapter. */
const stackDias = (p) =>
  [
    ...new Set(
      p.sz
        .filter((z) => z !== "R")
        .map((z) => SZ_DIA[z])
        .filter(Boolean),
    ),
  ].sort((x, y) => x - y);
const isAdapter = (p) => stackDias(p).length > 1;

/* A part with no stack profile at all can only be surface-attached — the R-11
   'Baguette' and R-4 'Dumpling' are ovoids that bolt to the side of something,
   not cylinders you can put in a stack. They were being offered as ordinary
   tankage because diaOf falls back to treating "R" as 1.25 m, which is fine for
   sizing a radial booster and wrong for deciding what can be stacked. Radial
   tanks are not modelled as side-mounted loads, so for now they are simply not
   available as a stage's tankage. */
const isRadialOnly = (p) => stackDias(p).length === 0;

/* An engine may sit under a stack its own width or wider — that is what adapters
   and engine plates are for, and it is how a Vector cluster ends up beneath a 5 m
   Kerbodyne tank. It may not feed off a stack narrower than itself. Radial
   engines hang off the side and take whatever they are bolted to.

   Tanks are then grouped by diameter below, so a stage stays one clean cylinder
   with a single adapter at the engine. Ungrouped, this rule produced stages
   mixing 5 m, 3.75 m, 1.25 m and 0.625 m tanks in one stack: a few percent
   lighter and nobody's idea of a rocket. */
const sizeMatch = (e, t) => e.sz.includes("R") || diaOf(t) >= diaOf(e);

/* How many of an engine you can realistically mount on a stack of its size. */
/* Clustering needs something to bolt the engines to, and the only stock parts
   that do it have 1.25 m outlets. So a 2.5 m or 3.75 m engine cannot be clustered
   at all without Making History's engine plates, and the old table — which
   cheerfully allowed seven engines on a 2.5 m stack — was describing parts that
   do not exist. Radial engines are the exception: they surface-attach and need
   no coupler. */
/* Shroud lengths, read from each variant's node_stack_bottom offset in the
   ReStock+ config, with the mass that goes with it. You fit the shortest that
   clears the engine — a 0.97 m Terrier needs Medium-Short on an EP-18, because
   Short only clears 0.675 m. Since engine heights are measured from the drag
   cubes, the tool can just pick rather than leaving it to you. */
const PLATE_SHROUD = couplersData.PLATE_SHROUD;

const shroudFor = (plateName, engineHeight) => {
  const vs = PLATE_SHROUD[plateName];
  if (!vs) return null;
  return vs.find((v) => v.len >= engineHeight) || vs[vs.length - 1];
};

/* Engine plates from ReStock+. Confirmed in game on the EP-12: single mounts one
   engine at the plate's own size, then double, triple and quad mount 0.625 m
   engines. The larger plates follow the same pattern one size down. A plate is a
   coupler that also decouples — it carries ModuleDecouple and a jettisonable
   shroud — so a stage using one needs no separate decoupler.

   This is what lets small engines cluster at all: every TVR coupler has 1.25 m
   outlets, so a Spark or an Ant could never be grouped before. */
const COUPLERS = couplersData.COUPLERS;
const isRadial = (e) =>
  e.sz.includes("R") && e.sz.filter((z) => z !== "R").length === 0;
function couplersFor(e, unlocked, excluded, expansions) {
  /* Engine plates ship with ReStock+; without it they are not in the game and
     must not appear in a design. */
  /* Hoisted: the engine does not change inside the filter, so asking for its
     diameter once per coupler was 35 lookups where one would do. */
  const ed = diaOf(e);
  return COUPLERS.filter(
    (c) =>
      c.dia === ed &&
      (!c.t || unlocked.has(c.t)) &&
      !(c.rs && expansions && !expansions.rs) &&
      !(excluded && excluded.has(c.n)),
  );
}
const maxCluster = (e, unlocked, excluded) => {
  if (isRadial(e)) return 8;
  const c = couplersFor(e, unlocked || new Set(), excluded);
  return c.length ? Math.max(...c.map((x) => x.out)) : 1;
};
/* The coupler must have exactly as many outlets as there are engines. Leaving a
   node empty is buildable but puts the thrust off-axis, and the craft torques —
   two engines on a tri-coupler is not a cluster, it is a design fault. So a
   cluster size with no matching coupler is simply not offered. */
/* A coupler that fans one node out to `n` columns of diameter `d`. Parallel
   stacks need one at the top to mate with whatever sits above, and another at the
   bottom to gather back to a single node when there is a stage below. Stock
   couplers only have 1.25 m outlets, so wider columns simply cannot be joined —
   which is the honest answer, not something to model around. */
const columnCoupler = (d, n, unlocked, excluded) => {
  const fit = COUPLERS.filter(
    (c) =>
      c.dia === d &&
      c.out === n &&
      (!c.t || unlocked.has(c.t)) &&
      !(excluded && excluded.has(c.n)),
  );
  return fit.length ? fit.sort((a, b) => a.m - b.m)[0] : null;
};

/* PROTOTYPE: per-roster result cache. Nested WeakMaps so a tech-tree change or
   a new exclusion set invalidates for free, the way poolsFor does it. */
const _coupCache = new WeakMap();
const couplerFor = (e, n, unlocked, excluded, noPlate, expansions) => {
  let byExcl = _coupCache.get(unlocked);
  if (!byExcl) {
    byExcl = new WeakMap();
    _coupCache.set(unlocked, byExcl);
  }
  let byEngine = byExcl.get(excluded);
  if (!byEngine) {
    byEngine = new WeakMap();
    byExcl.set(excluded, byEngine);
  }
  let byKey = byEngine.get(e);
  if (!byKey) {
    byKey = new Map();
    byEngine.set(e, byKey);
  }
  /* Numeric key, no string. Building `e.n + "|" + n + ...` allocated on every
     one of 54 million calls and cost more than the lookup saved. */
  const ck = n * 2 + (noPlate ? 1 : 0);
  const hit = byKey.get(ck);
  if (hit !== undefined) return hit;
  const val = _couplerFor(e, n, unlocked, excluded, noPlate, expansions);
  byKey.set(ck, val);
  return val;
};
const _couplerFor = (e, n, unlocked, excluded, noPlate, expansions) => {
  if (n <= 1 || isRadial(e)) return null;
  const fit = couplersFor(e, unlocked, excluded, expansions).filter(
    (c) => c.out === n && !(noPlate && c.plate),
  );
  return fit.length ? fit.sort((a, b) => a.cost - b.cost)[0] : null;
};

/* ---------------------------- structural parts ----------------------------
   An engine narrower than its stack needs an adapter, and stock adapters are
   themselves fuel tanks, so they add dry mass and carry propellant. Any part
   spanning two size classes is one; chain them where no single part bridges the
   gap (1.25 m to 3.75 m goes via the C7 and then the ADTP-2-3).

   Decouplers are not in the data set, so they are modelled on area, anchored to
   the TR-18A at 0.05 t on 1.25 m. Real figures would come from the part configs. */
/* Real structural parts, with the tech node each is gated behind. Masses and
   prices come straight from the configs; nothing here is modelled any more.
   Picking is by diameter among whatever is unlocked, cheapest first, so an early
   career design cannot quietly fit a part it has not researched. */
/* Every mass here is the part as it sits in the VAB: dry plus whatever it
   carries. KSP's config `mass` field is dry only, so a 2.5 m heat shield reads
   0.5 t there and weighs 1.3 t on the pad once its 800 units of ablator count.
   Same trap as the Castor booster. */
const STRUCT = structureData;
const pickStruct = (kind, unlocked, d, excluded) => {
  let ok = STRUCT[kind].filter(
    (x) => (!x.t || unlocked.has(x.t)) && !(excluded && excluded.has(x.n)),
  );
  // a drogue slows a descent, it does not land one — only fall back to it
  if (kind === "parachute" && ok.some((x) => !x.drogue))
    ok = ok.filter((x) => !x.drogue);
  if (!ok.length) return null;
  const fit = d == null ? ok : ok.filter((x) => x.d === d);
  const pool = fit.length
    ? fit
    : ok.filter((x) => x.d == null || x.d >= (d || 0));
  return (pool.length ? pool : ok).sort((a, b) => a.cost - b.cost)[0];
};
/* Memoised. The answer depends only on the diameter and what is researched, and
   neither changes during a solve — but fitStructure asks for it on every single
   candidate, and each call filtered and sorted the decoupler table into three
   fresh arrays. Keyed on diameter, thrown away when the roster changes. */
let _decCache = new Map(),
  _decFor = null,
  _decEx = null;
const decouplerFor = (unlocked, d, excluded) => {
  if (unlocked !== _decFor || excluded !== _decEx) {
    _decCache = new Map();
    _decFor = unlocked;
    _decEx = excluded;
  }
  const hit = _decCache.get(d);
  if (hit !== undefined) return hit;
  const v = pickStruct("decoupler", unlocked, d, excluded) || {
    n: "TD-12",
    m: 0.04,
    cost: 200,
    d,
  };
  _decCache.set(d, v);
  return v;
};

/* Hardware the mission needs that no stage pays for, picked from what is
   actually researched. The parachute case matters most: an atmospheric descent
   already takes an 82% discount "because chutes", so flying them free was a
   straight subsidy — and flying them before Survivability is researched is
   worse. */
/* What the mission needs fitted, as a reminder rather than a charge. Which
   parachute or heat shield you pick changes the mass by several hundred kilos,
   and that is your call — so these are listed against the payload and their mass
   is assumed to be inside the figure you entered. The tool adds nothing.

   That does mean the 82% discount the route takes on an atmospheric descent is
   granted on trust: it assumes chutes are fitted, and if you leave them off the
   descent budget is wrong. Hence saying so plainly. */
function missionHardware(route, payload, origin, unlocked, excluded) {
  const items = [];
  const has = unlocked || new Set();
  const landsAtm = route.some((l) => l.kind === "land" && l.atm);
  const landsAny = route.some((l) => l.kind === "land");
  const aeroHome = route.some((l) => l.kind === "aero" && l.free);
  /* Chutes are needed for any descent through air — including the one at the end
     of a return trip. The route calls that leg an aerobrake and charges nothing
     for it, but you still have to touch down: a Minmus round trip lands on an
     airless moon and then comes home through Kerbin's atmosphere, and only the
     second of those needs canopies. */
  if (landsAtm || aeroHome) {
    const c = pickStruct("parachute", has, null, excluded);
    items.push({
      name: c ? c.n : "parachutes",
      qty: Math.max(2, Math.ceil(payload / 1.5)),
      why: landsAtm
        ? "the descent budget assumes them"
        : `to land back on ${origin}`,
    });
  }
  if (landsAny) {
    const l = pickStruct("leg", has, null, excluded);
    items.push({
      name: l ? l.n : "landing legs",
      qty: 4,
      why: "to touch down on",
    });
  }
  if (aeroHome) {
    const d = Math.max(1.25, Math.cbrt(Math.max(payload, 0.1)) * 1.1);
    const h = pickStruct(
      "heatshield",
      has,
      d < 1.9 ? 1.25 : d < 3 ? 2.5 : 3.75,
      excluded,
    );
    items.push({
      name: h ? h.n : "a heat shield",
      qty: 1,
      why: "for re-entry",
    });
  }
  return { items, mass: 0 }; // your payload figure covers them
}

const RADIAL_DECOUPLER = 0.05; // TT-38K, one per booster

/* Radial stacks burn with the core and are never dropped on their own, so what
   holds them on does not have to separate — it only has to be structure. The
   lightest thing in the game that surface-attaches and offers a stack node is the
   Cubic Octagonal Strut at 1 kg, against 50 kg for a radial decoupler. Charging
   the decoupler was fifty times too heavy per join. */
const RADIAL_JOIN = {
  n: "Cubic Octagonal Strut",
  m: 0.001,
  cost: 16,
  t: "Precision Engineering",
};
const RADIAL_JOIN_FALLBACK = {
  n: "TT-38K Radial Decoupler",
  m: 0.05,
  cost: 600,
  t: "Advanced Construction",
};
const radialJoin = (unlocked, excluded) =>
  (!RADIAL_JOIN.t || unlocked.has(RADIAL_JOIN.t)) &&
  !(excluded && excluded.has(RADIAL_JOIN.n))
    ? RADIAL_JOIN
    : RADIAL_JOIN_FALLBACK;

/* Reading a pasted configuration. Each field is validated on its own and a bad
   or missing one is simply omitted, leaving that setting at its default — a
   config saved before a setting existed still restores everything else rather
   than failing whole. Kept separate from the component so it can be tested
   without one. */

export {
  COUPLERS,
  PLATE_SHROUD,
  RADIAL_DECOUPLER,
  RADIAL_JOIN,
  RADIAL_JOIN_FALLBACK,
  STRUCT,
  SZ_DIA,
  columnCoupler,
  compatible,
  computeDia,
  couplerFor,
  couplersFor,
  decouplerFor,
  diaOf,
  isAdapter,
  isRadial,
  isRadialOnly,
  maxCluster,
  missionHardware,
  pickStruct,
  radialJoin,
  shroudFor,
  sizeMatch,
  stackDias,
};

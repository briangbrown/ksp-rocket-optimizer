import { heightOf } from "./geometry.js";
import {
  compatible,
  couplerFor,
  decouplerFor,
  diaOf,
  isAdapter,
  isRadial,
  isRadialOnly,
  radialJoin,
  shroudFor,
  sizeMatch,
  stackDias,
} from "./parts.js";
import { TANK_FUNDS_DRY, TANK_FUNDS_PROP } from "./performance.js";

/* Keyed on the parts array, the way poolsFor is, so researching a node or
   toggling an expansion builds a new array and invalidates this for free. It
   used to be a bare `let`, computed once from whichever roster asked first and
   never rebuilt — and an empty Map is truthy, so a first roster with no
   adapters pinned it empty for the life of the module. */
const _adapterGraphs = new WeakMap();
function adapterGraph(tanks) {
  const cached = _adapterGraphs.get(tanks);
  if (cached) return cached;
  const edges = new Map(); // "from>to" -> lightest spanning part
  tanks.forEach((t) => {
    const ds = stackDias(t);
    if (ds.length < 2 || /Mk2|Mk3/.test(t.sz.join())) return;
    const key = ds[0] + ">" + ds[ds.length - 1];
    if (!edges.has(key) || t.dry < edges.get(key).dry) edges.set(key, t);
  });
  _adapterGraphs.set(tanks, edges);
  return edges;
}

/* Lightest chain of adapters taking an engine of diameter `from` up to a stack of
   diameter `to`. Returns null when no route exists. */
/* Strip an adapter chain's propellant down to what the engine can actually use.
   The parts stay — they are structurally needed — but fuel with no matching
   oxidiser aboard is mass, not range. */
function usableAdapterProp(chain, engine) {
  if (!chain || !chain.parts || !chain.parts.length) return chain;
  let prop = 0,
    dead = 0;
  for (const t of chain.parts) {
    if (compatible(engine, t)) prop += t.prop;
    else dead += t.prop;
  }
  if (dead === 0) return chain;
  return { ...chain, prop, dry: chain.dry + dead, deadProp: dead };
}

/* The structural parts a stage needs, in one place. Both solvers ask the same
   question — given an engine, how many of it, how many columns, and what tank
   diameter, what has to be fitted and what does it weigh — and each used to
   answer it separately. Five bugs in this session came from fixing one copy and
   not the other: couplers, the thrust limiter, the gimbal check, the cluster cap
   and a missing decoupler quantity. */
/* PROTOTYPE: keyed on the tanks array, which the app rebuilds whenever the
   roster, exclusions or expansions change, so it stands in for all of them. */
const _fitCache = new WeakMap();
function fitStructure(opt) {
  let byEngine = _fitCache.get(opt.tanks);
  if (!byEngine) {
    byEngine = new WeakMap();
    _fitCache.set(opt.tanks, byEngine);
  }
  let byD = byEngine.get(opt.engine);
  if (!byD) {
    byD = new Map();
    byEngine.set(opt.engine, byD);
  }
  let byKey = byD.get(opt.stackD);
  if (!byKey) {
    byKey = new Map();
    byD.set(opt.stackD, byKey);
  }
  const fk =
    (((opt.n * 8 + (opt.stacks || 1)) * 2 + (opt.noPlate ? 1 : 0)) * 2 +
      (opt.plateAbove ? 1 : 0)) *
      2 +
    (opt.hasStageBelow ? 1 : 0);
  if (byKey.has(fk)) return byKey.get(fk);
  const out = _fitStructure(opt);
  byKey.set(fk, out);
  return out;
}
function _fitStructure(opt) {
  const {
    engine,
    n,
    stacks = 1,
    stackD,
    tanks,
    unlocked,
    excluded,
    noPlate = false,
    expansions = null,
    plateAbove = false,
    hasStageBelow = false,
  } = opt;
  const perEng = n / stacks;

  // coupling is per column: engines on separate stacks need nothing to join them
  const coup = couplerFor(
    engine,
    perEng,
    unlocked,
    excluded,
    noPlate,
    expansions,
  );
  if (perEng > 1 && !coup && !isRadial(engine)) return null;

  const plated = !!(coup && coup.plate);
  const shroud = plated ? shroudFor(coup.n, heightOf(engine, 1)) : null;
  const coupM = shroud ? shroud.m : coup ? coup.m : 0;

  /* Node sizes are advisory in KSP, so a narrower engine bolts straight onto a
     wider tank. An adapter is only needed the other way round.

     The chain is walked narrow to wide — that is how adapterGraph keys its
     edges (small>large) and the only direction `walk` moves. So spanning a
     1.25 m tank down to a 1.875 m coupler means asking for stackD -> under,
     not under -> stackD. Asked the wrong way round it hit the `from >= to`
     guard and returned an empty chain every single time, which is why no
     design in the snapshot carried an adapter and why the whole subsystem
     looked like dead code. */
  const under = coup ? coup.top : diaOf(engine);
  const adapt =
    under > stackD
      ? usableAdapterProp(adapterChain(tanks, stackD, under), engine)
      : { parts: [], prop: 0, dry: 0, cost: 0 };
  if (!adapt) return null;

  /* A clustered stage presents one bottom node per engine and cannot mate to a
     single stack below without gathering them back — unless a plate is doing it,
     which already presents one node. */
  const split = coup && hasStageBelow;
  const rejoin = split && !plated ? coup : null;

  /* A plate on the stage above sits at that stage's bottom, which is this
     interface, so it separates the two and this stage buys nothing. */
  const dd = decouplerFor(unlocked, stackD, excluded);
  const nDec = plateAbove ? 0 : split ? perEng * stacks : stacks;
  const dec =
    nDec === 0
      ? { m: 0, n: null, cost: 0, d: stackD, qty: 0, viaPlateAbove: true }
      : { m: dd.m * nDec, n: dd.n, cost: dd.cost * nDec, d: stackD, qty: nDec };

  // radial stacks never separate alone, so structure holds them, not decouplers
  const joiner = stacks > 1 ? radialJoin(unlocked, excluded) : null;
  const joins = joiner ? (stacks - 1) * 2 * joiner.m : 0;

  return {
    coup,
    plated,
    shroud,
    coupM,
    adapt,
    rejoin,
    dec,
    joiner,
    joins,
    perEng,
    dry: adapt.dry + dec.m + coupM + (rejoin ? rejoin.m : 0) + joins,
  };
}

/* Also per-roster. Keyed on from>to alone, a span with no route under one
   roster stayed unroutable under every later one — so researching the adapter
   that would have spanned it changed nothing. */
const _chainMemos = new WeakMap();
function adapterChain(tanks, from, to) {
  if (from >= to) return { parts: [], dry: 0, prop: 0 };
  let memos = _chainMemos.get(tanks);
  if (!memos) {
    memos = new Map();
    _chainMemos.set(tanks, memos);
  }
  const memo = from + ">" + to;
  if (memos.has(memo)) return memos.get(memo);
  const edges = adapterGraph(tanks);
  const dias = [
    ...new Set([...edges.keys()].flatMap((k) => k.split(">").map(Number))),
  ].sort((a, b) => a - b);
  let best = null;
  const walk = (at, used, dry, prop) => {
    if (used.length > 3) return;
    if (at === to) {
      if (!best || dry < best.dry) best = { parts: [...used], dry, prop };
      return;
    }
    for (const nxt of dias) {
      if (nxt <= at || nxt > to) continue;
      const e = edges.get(at + ">" + nxt);
      if (!e) continue;
      walk(nxt, [...used, e], dry + e.dry, prop + e.prop);
    }
  };
  walk(from, [], 0, 0);
  memos.set(memo, best);
  return best;
}

/* The tank pool an engine can draw on depends only on the engine and the parts
   list — not on dv, payload or stage count. It was being rebuilt inside the
   cluster-size loop: 17 000 regex tests, 1 260 adapter walks and 1 260 sorts per
   solveStage call, times ~41 calls per solve. Built once and cached, keyed on
   the parts array itself so a tech-tree change invalidates it. */
const _poolCache = new WeakMap();
function poolsFor(engine, tanks) {
  let byEngine = _poolCache.get(tanks);
  if (!byEngine) {
    byEngine = new Map();
    _poolCache.set(tanks, byEngine);
  }
  let got = byEngine.get(engine.n);
  if (got) return got;
  const pool = tanks.filter(
    (t) =>
      compatible(engine, t) &&
      sizeMatch(engine, t) &&
      !isAdapter(t) &&
      !isRadialOnly(t),
  );
  const groups = new Map();
  pool.forEach((t) => {
    const key = diaOf(t) + "|" + t.k;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  got = [...groups.values()].map((g) => {
    const usable = [...g].sort((x, y) => y.prop - x.prop); // pre-sorted for pickTanks
    return {
      usable,
      k: usable[0].k,
      dia: diaOf(usable[0]),
      biggest: usable[0].prop,
      adapt: adapterChain(tanks, diaOf(engine), diaOf(usable[0])),
    };
  });
  byEngine.set(engine.n, got);
  return got;
}

/* Pick a real tank combination covering mp tonnes of propellant.
   Two candidates, because the right answer depends on what you are optimising:
     greedy   — largest tank while the shortfall still exceeds it, then the
                smallest that covers the remainder. Minimal overshoot, so minimal
                mass, but it can spend three tanks where two would do.
     fewest   — as few tanks as possible, accepting the overshoot.
   Asking for 14 t of 2.5 m tankage gave X200-16 + 2× X200-8 under the greedy
   alone: 16 t in three parts, where one X200-32 carries the same 16 t. */
/* Memo. The same tank group is asked for the same propellant over and over: the
   cost objective alone runs six passes over the identical engine × count ×
   column combinations, and different cluster counts often land on the same
   requirement. Keyed exactly — no rounding — so the answer is bit-identical to
   computing it, and cleared whenever the tank pool changes.

   The result is shared between callers. Nothing mutates it except liquidMounts
   adding a `funds` total, which is derived from the list and therefore the same
   value every time. */
/* The lookup was costing more than the work it saved: building
   `mp + "|" + maxTanks + "|" + objective` allocated a string on every one of a
   hundred and eighty thousand calls, then hashed it.

   Instead the memo hangs off the pool array itself — pools are cached, so the
   same array comes back every time — as a small fixed set of Maps, one per
   (objective, tank limit) pair. Those two have three and two possible values, so
   they index an array rather than forming part of a key. What is left is a
   property read, an array index, and a Map lookup on a plain number. */
const _OBJ_IX = { mass: 0, cost: 1, parts: 2 };
/* Capped. Propellant requirements are continuous, so a long search generates
   endless distinct keys — without a bound this grew until the heap gave out on a
   deep stack. Dropping the whole map when it fills is crude but right for this
   shape of access: entries are reused heavily within a pass and rarely after it,
   so the cost of a cold start is small and the memory is bounded. */
const TANK_MEMO_MAX = 20000;
let _tankHits = 0,
  _tankCalls = 0;
function pickTanksMemo(pool, mp, maxTanks, objective) {
  _tankCalls++;
  let slots = pool._memo;
  if (slots === undefined) {
    slots = pool._memo = [];
  }
  const ix = (_OBJ_IX[objective] || 0) * 2 + (maxTanks === 12 ? 1 : 0);
  let byProp = slots[ix];
  if (byProp === undefined) {
    byProp = slots[ix] = new Map();
  }
  const hit = byProp.get(mp);
  if (hit !== undefined) {
    _tankHits++;
    return hit;
  }
  const v = pickTanksRaw(pool, mp, maxTanks, objective);
  if (byProp.size >= TANK_MEMO_MAX) byProp.clear();
  byProp.set(mp, v);
  return v;
}

function pickTanksRaw(pool, mp, maxTanks = 12, objective = "mass") {
  const sorted = pool; // callers pass a descending-by-capacity list
  const smallestCovering = (need) => {
    for (let i = sorted.length - 1; i >= 0; i--)
      if (sorted[i].prop >= need - 1e-9) return sorted[i];
    return null;
  };
  /* One pass, no Map, no spread, no reduce closures. This is called four to six
     times per pickTanks and pickTanks runs for every engine × count × column ×
     tank group, so the allocations here were the largest single source of
     garbage in a solve. Tank lists are a dozen entries at most, so the linear
     scan for an existing entry beats hashing. */
  const build = (chosen) => {
    const n = chosen.length;
    if (!n || n > maxTanks) return null;
    const list = [];
    let prop = 0,
      dryMass = 0;
    for (let i = 0; i < n; i++) {
      const t = chosen[i];
      prop += t.prop;
      dryMass += t.dry;
      let found = null;
      for (let j = 0; j < list.length; j++)
        if (list[j].t === t) {
          found = list[j];
          break;
        }
      if (found) found.c++;
      else list.push({ t, c: 1 });
    }
    return { list, prop, dryMass, count: n };
  };

  const greedy = [];
  let left = mp;
  for (const t of sorted)
    while (left > t.prop * 0.999 && greedy.length < maxTanks) {
      greedy.push(t);
      left -= t.prop;
    }
  if (left > 1e-4) greedy.push(smallestCovering(left) || sorted[0]);

  const big = sorted[0];
  const whole = Math.max(0, Math.floor(mp / big.prop));
  const fewest = Array(whole).fill(big);
  const rest = mp - whole * big.prop;
  if (rest > 1e-6) fewest.push(smallestCovering(rest) || big);

  /* A third candidate for the cost objective: fill by best value rather than by
     size. Bigger stock tanks are genuinely cheaper per tonne — a Jumbo-64 is 180
     funds/t against an X200-8's 200 — so least-overshoot was the wrong proxy for
     cheapest. Some small tanks beat it outright: the R-11 'Baguette' is 185
     funds/t, which is why cost designs reach for handfuls of them. */
  const price = (t) =>
    t.cost != null ? t.cost : t.prop * TANK_FUNDS_PROP + t.dry * TANK_FUNDS_DRY;
  const byValue = [...sorted].sort(
    (x, y) => price(x) / x.prop - price(y) / y.prop,
  );
  const cheap = [];
  let owe = mp;
  for (const t of byValue)
    while (owe > t.prop * 0.999 && cheap.length < maxTanks) {
      cheap.push(t);
      owe -= t.prop;
    }
  if (owe > 1e-4) cheap.push(smallestCovering(owe) || byValue[0]);

  /* Greedy plus an early finish: take the largest tank while it still fits, but
     the moment one tank can cover what is left, use it and stop. Without this the
     greedy walks past a tank that would have finished the job — needing 23 t it
     took an X200-32 then two X200-8s, where an X200-32 and an X200-16 carry the
     same 24 t in one part fewer and for less money. */
  const tidy = [];
  let rem = mp;
  for (const t of sorted) {
    while (rem > t.prop * 0.999 && tidy.length < maxTanks) {
      tidy.push(t);
      rem -= t.prop;
      const cover = rem > 1e-4 && smallestCovering(rem);
      if (cover) {
        tidy.push(cover);
        rem = 0;
        break;
      }
    }
    if (rem <= 1e-4) break;
  }
  if (rem > 1e-4) {
    const c = smallestCovering(rem);
    if (c) tidy.push(c);
  }

  /* Consolidation pass. Whichever candidate wins, walk it once more and try to
     replace any two tanks with a single one carrying at least as much. Within a
     group every tank shares the same structural coefficient, so a single tank
     holding exactly the combined propellant weighs exactly the same — one part
     instead of two, for nothing. Where it would overshoot, only take it if the
     active objective says the trade is worth it. */
  const simplify = (set) => {
    if (!set) return set;
    /* Flatten with a loop; flatMap allocated an intermediate array per entry on
       top of the result. */
    const list = [];
    for (const x of set.list) for (let i = 0; i < x.c; i++) list.push(x.t);
    for (let pass = 0; pass < 6; pass++) {
      let swapped = false;
      outer: for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const combined = list[i].prop + list[j].prop;
          const one = smallestCovering(combined);
          if (!one || one === list[i] || one === list[j]) continue;
          const worthIt =
            objective === "parts"
              ? true
              : objective === "cost"
                ? price(one) <= price(list[i]) + price(list[j])
                : one.prop <= combined + 1e-9; // same mass, or lighter
          if (!worthIt) continue;
          /* Splice in place rather than filtering into a fresh array and
             concatenating — this runs up to six passes over a quadratic scan, so
             it was allocating a new list on every successful swap. */
          list.splice(j, 1);
          list.splice(i, 1);
          list.push(one);
          swapped = true;
          break outer;
        }
      if (!swapped) break;
    }
    return build(list);
  };

  const cands = [
    build(greedy),
    build(fewest),
    build(cheap),
    build(tidy),
  ].filter(Boolean);
  if (!cands.length) return null;
  const funds = (c) => c.list.reduce((a, x) => a + x.c * price(x.t), 0);
  const rank = (a, b) =>
    objective === "parts"
      ? a.count - b.count || a.prop - b.prop
      : objective === "cost"
        ? funds(a) - funds(b) || a.count - b.count
        : a.prop - b.prop || a.count - b.count;
  cands.sort(rank);
  const win = cands[0];
  const tidied = simplify(win);
  return tidied && rank(tidied, win) <= 0 ? tidied : win;
}

/* Solve one stage: returns the lightest engine/tank set meeting dv and TWR. */

export {
  TANK_MEMO_MAX,
  adapterChain,
  adapterGraph,
  fitStructure,
  pickTanksMemo,
  pickTanksRaw,
  poolsFor,
  usableAdapterProp,
};

import powerData from "../data/power.json";
import { TANK_FUNDS_DRY, TANK_FUNDS_PROP } from "./performance.js";
import type { Excluded, Roster } from "./constants.js";
import type { Objective } from "./performance.js";

/* ------------------------------ the power plant ------------------------------

   An electric engine is an engine flying on nothing until something makes the
   charge it burns. A Dawn draws 8.74 a second at full throttle, and seven of
   them draw 61 — which is a plant, and a plant is mass and money the stage has
   to carry like any other part. This sizes one. #414

   Three ways to make it, and which wins depends almost entirely on where the
   burn is:

   - **Panels** are far the lightest near the sun and fall off as the square of
     the distance. At Kerbin an OX-4L is 94 charge a second per tonne; at Eeloo
     the same panel is 2.2, and the plant that was a few kilograms is thirty
     tonnes.
   - **A generator** does not care where it is. It is heavy for what it makes,
     0.75 a second for 80 kg, and it costs 23,300 funds, which is what keeps it
     off anything but a mission where nothing else will do.
   - **A fuel cell** does not care either, and is lighter than a generator, but
     it burns liquid fuel and oxidiser the whole time it runs — so its real mass
     depends on how long the burn is, and a long enough burn hands the advantage
     back.

   Eclipse decides whether a solar plant needs batteries. A burn that fits in
   the sunlit part of one orbit can be timed to miss the shadow entirely, and
   most can: a 523 s burn in a 31-minute orbit is a third of it. A burn longer
   than that has to cross the dark side, which costs twice — panels big enough
   to run the engine and recharge at the same time, and a battery to carry the
   load while they are doing neither.

   One kind at a time. A plant mixing panels with a generator is buildable and
   is occasionally a little better than either alone, and it is not worth the
   combinations here: the search this sits inside is already a million
   candidates wide (lesson A1), and this runs once per engine and cluster
   count. */

type Draw = {
  /* Charge a second at full throttle, for the whole cluster. */
  ec: number;
  /* How long it has to run: the stage's burn, in seconds. */
  seconds: number;
  /* Sunlight where the burn is made, against the homeworld's. One at Kerbin,
     0.023 at Eeloo, and it is the farthest place the stage burns that counts
     — a plant that cannot run there cannot fly the mission. */
  flux: number;
  /* The fraction of that orbit spent in the body's shadow, and how long the
     orbit is. Both zero for a burn made out between the planets, where there
     is nothing to hide behind. */
  dark: number;
  period: number;
};

type PlantPart = { n: string; c: number };
type Plant = {
  parts: ReadonlyArray<PlantPart>;
  /* Tonnes, including the fuel a cell burns and the tank it rides in. */
  m: number;
  cost: number;
  /* Which of the three it came out as, for the card and for a reader working
     out why a design weighs what it does. */
  how: "panels" | "generator" | "cell";
};

/* Liquid fuel and oxidiser, in tonnes a unit. Both are 0.005 in stock, and
   they are read from the tables rather than written here so a rebalance moves
   them. */
const LF_DENSITY = 0.005;
/* What a tank of that fuel weighs empty, as a fraction of what it holds. The
   commonest figure in the tank table by a long way: 51 of the 62 liquid tanks
   are at an eighth, and the rest are close. */
const TANK_DRY_FRACTION = 0.125;

const unlockedFor = <T extends { n: string; t: string | null }>(
  parts: ReadonlyArray<T>,
  unlocked: Roster,
  excluded: Excluded,
): Array<T> =>
  parts.filter(
    (p) => (p.t === null || unlocked.has(p.t)) && !excluded?.has(p.n),
  );

const better = (a: Plant, b: Plant, objective: Objective) =>
  objective === "cost"
    ? a.cost <= b.cost
      ? a
      : b
    : objective === "parts"
      ? count(a) <= count(b)
        ? a
        : b
      : a.m <= b.m
        ? a
        : b;

const count = (p: Plant) => p.parts.reduce((a, x) => a + x.c, 0);

/* What a plant costs to make `ec` a second for `seconds`, one supply at a
   time. Null where nothing available can do it — an unresearched roster, or a
   demand no count of what is unlocked will meet. */
function sizePlant(
  draw: Draw,
  unlocked: Roster,
  excluded: Excluded,
  objective: Objective,
): Plant | null {
  if (!(draw.ec > 0)) return null;
  if (!isFinite(draw.ec) || !isFinite(draw.seconds)) return null;

  const data = powerData;
  let best: Plant | null = null;
  const take = (p: Plant) => {
    best = best === null ? p : better(best, p, objective);
  };

  /* Can the burn be timed to stay in the light? A burn no longer than the
     sunlit part of one orbit can; anything longer has to cross the shadow. */
  const sunlit = draw.period * (1 - draw.dark);
  const crossesDark = draw.dark > 0 && draw.seconds > sunlit;

  for (const panel of unlockedFor(data.panels, unlocked, excluded)) {
    const rate = panel.rate * draw.flux;
    if (!(rate > 0)) continue;
    /* Big enough to run the engine, and where the shadow is crossed, big
       enough to recharge what the shadow spent as well. */
    const needed = crossesDark ? draw.ec / (1 - draw.dark) : draw.ec;
    const n = Math.ceil(needed / rate);
    if (!isFinite(n) || n <= 0 || n > 10_000) continue;
    const parts: Array<PlantPart> = [{ n: panel.n, c: n }];
    let m = n * panel.m;
    let cost = n * panel.cost;
    if (crossesDark) {
      const store = draw.ec * draw.period * draw.dark;
      const cell = unlockedFor(data.batteries, unlocked, excluded).sort(
        (a, b) => b.stored / b.m - a.stored / a.m,
      )[0];
      if (!cell) continue; // nothing to carry the dark side with
      const b = Math.ceil(store / cell.stored);
      if (!isFinite(b) || b > 10_000) continue;
      parts.push({ n: cell.n, c: b });
      m += b * cell.m;
      cost += b * cell.cost;
    }
    take({ parts, m, cost, how: "panels" });
  }

  for (const gen of unlockedFor(data.generators, unlocked, excluded)) {
    const n = Math.ceil(draw.ec / gen.rate);
    if (!isFinite(n) || n <= 0 || n > 10_000) continue;
    take({
      parts: [{ n: gen.n, c: n }],
      m: n * gen.m,
      cost: n * gen.cost,
      how: "generator",
    });
  }

  for (const cell of unlockedFor(data.cells, unlocked, excluded)) {
    const n = Math.ceil(draw.ec / cell.rate);
    if (!isFinite(n) || n <= 0 || n > 10_000) continue;
    /* What it drinks while it runs, and the tank that holds it. A cell that
       burns monopropellant is priced the same way: the repository has one
       figure for propellant and one for tankage, and neither is per-resource. */
    const perSecond = cell.burns.reduce((a, b) => a + (b.rate ?? 0), 0);
    const fuel = n * perSecond * LF_DENSITY * draw.seconds;
    const tank = fuel * TANK_DRY_FRACTION;
    take({
      parts: [{ n: cell.n, c: n }],
      m: n * cell.m + fuel + tank,
      cost: n * cell.cost + fuel * TANK_FUNDS_PROP + tank * TANK_FUNDS_DRY,
      how: "cell",
    });
  }

  return best;
}

/* What a body's shadow costs an orbit round it: the fraction of one turn spent
   behind it, worst case, with the sun in the plane of the orbit. A burn out
   between the planets has none of this. */
const darkFraction = (bodyRadius: number, orbitRadius: number) =>
  orbitRadius > bodyRadius
    ? Math.asin(bodyRadius / orbitRadius) / Math.PI
    : 0.5;

/* What an engine draws at full throttle, by the name the catalogue knows it
   by, and zero for everything that burns only propellant. */
const drawOf = (engine: string) =>
  powerData.engines.find((e) => e.n === engine)?.draw ?? 0;

export { darkFraction, drawOf, sizePlant };
export type { Draw, Plant };

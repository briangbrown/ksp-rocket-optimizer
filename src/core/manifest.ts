import { PACK_BRACE, PACK_JOIN } from "./geometry.js";
import { RADIAL_DECOUPLER } from "./parts.js";
import { DECOUPLER_FUNDS } from "./performance.js";
import type { Coupler, Engine, Shroud, Tank } from "./catalogue.js";
import type {
  BoosterPart,
  DecouplerFit,
  Joiner,
  Solution,
} from "./solution.js";

/* What a row is: the job the part does in the stage, not the part's own kind.
   Two rows can be the same tank doing different work — a tank in the run and a
   tank hanging off a radial column are listed apart, because a build order
   needs them apart. */
type Role =
  | "decoupler"
  | "rejoin"
  | "joiner"
  | "pack-join"
  | "pack-brace"
  | "tank"
  | "adapter"
  | "coupler"
  | "engine"
  | "booster"
  | "booster-decoupler"
  | "booster-tank";

/* Whatever the row is about. Null where the row is a charge with no part behind
   it — the fallback decoupler, and the one every radial booster hangs on. */
type RowPart =
  | Tank
  | Engine
  | Coupler
  | Shroud
  | Joiner
  | DecouplerFit
  | BoosterPart
  | { n: string; m: number; cost: number }
  | null;

/* The visitor `eachRow` hands each row to. `cost` is allowed to be missing
   because a handful of tanks in the part tables carry no price. */
type AddRow = (
  role: Role,
  part: RowPart,
  qty: number,
  mass: number,
  cost: number | undefined,
  prop?: number,
) => void;

type ManifestRow = {
  role: Role;
  part: RowPart;
  qty: number;
  mass: number;
  cost: number | undefined;
  prop: number;
};

/* Everything a stage is made of, counted once.

   The mass, the cost and the part count were three separate sums over the same
   stage, and three sums can disagree — they did. The parts table charged a
   coupler per column while the solver's dry mass charged one per stage, and
   after #57 the packed brackets went the other way: mass and cost per column,
   part count per stage. Whichever was right, a rocket you cannot build from the
   list you are shown is the wrong answer.

   So this is the list, and `test/manifest.test.js` holds the other three to it.
   It is not on the hot path — solveStage sizes hundreds of millions of
   candidates and cannot afford to build an array for each — so the sums stay
   where they are and this checks them rather than replacing them.

   Quantities are absolute: what you would actually place in the VAB. Where a
   stage runs parallel columns the display divides back down and says "each of
   the following", which is a presentation choice and not this function's. */

/* The one enumeration. Everything a stage is made of, handed to `add` one row
   at a time and never collected — so a caller that only wants a total pays no
   array for it.

   That is what lets the hot path share this. `stageCost` and `stageParts` are
   called once per viable candidate, which is 1.9 million times across two of
   the grid's eighty-one cases alone; materialising ten row objects each would
   undo #26 and #51 several times over. Folding costs nothing but the walk. */
export function eachRow(sol: Solution | null | undefined, add: AddRow) {
  if (!sol) return;
  const S = sol.stacks || 1;

  /* The decoupler's mass and cost already cover its quantity. */
  if (sol.decoupler) {
    const q = sol.decoupler.qty || 1;
    add(
      "decoupler",
      sol.decoupler,
      q,
      sol.decoupler.m / q,
      (sol.decoupler.cost ?? DECOUPLER_FUNDS) / q,
    );
  } else add("decoupler", null, 1, 0, DECOUPLER_FUNDS);

  if (sol.rejoin) add("rejoin", sol.rejoin, 1, sol.rejoin.m, sol.rejoin.cost);

  /* Two per extra column, top and bottom. */
  if (sol.joiner && S > 1)
    add("joiner", sol.joiner, (S - 1) * 2, sol.joiner.m, sol.joiner.cost);

  /* One ring per column since #56, so its brackets are per column too. */
  if (sol.packed) {
    add(
      "pack-join",
      PACK_JOIN,
      sol.packed.cols * S,
      PACK_JOIN.m,
      PACK_JOIN.cost,
    );
    add(
      "pack-brace",
      PACK_BRACE,
      sol.packed.cols * S,
      PACK_BRACE.m,
      PACK_BRACE.cost,
    );
  }

  /* Tanks are held per column and multiplied out; `sol.tanks` is already the
     stage total, so it is not multiplied again. */
  if (sol.tanks)
    for (const x of sol.tanks.list)
      add("tank", x.t, x.c, x.t.dry, x.t.cost, x.t.prop);

  /* Between a column's tank and its engine, so once per column as well — and
     above the coupler, because that is the order they are assembled in: the
     tank narrows through the adapter onto the plate, and the plate carries the
     engines. Listing them the other way round described a stack nobody can
     build, and did it in two places at once. #77 */
  if (sol.adapters)
    for (const t of sol.adapters.parts)
      add("adapter", t, S, t.dry, t.cost, t.prop);

  /* A cluster is joined to the tank above it once per column — each column has
     its own engines to gather. The shroud replaces the coupler's own mass when
     an engine plate carries one. */
  if (sol.coupler) {
    const p = sol.shroud || sol.coupler;
    add("coupler", p, S, p.m, sol.coupler.cost ?? 0);
  }

  /* A solid booster's `m` carries its fuel; `dry` is what is left once it has
     burned, which is the mass the stage is sized on. Liquid engines have no
     fuel of their own, so the two agree there. */
  add(
    "engine",
    sol.engine,
    sol.n,
    sol.engine.dry ?? sol.engine.m,
    sol.engine.cost,
    sol.engine.fuelM,
  );

  if (sol.boosters) {
    const b = sol.boosters;
    /* A liquid radial column is carried as one composite part: its `dry`
       already contains the tanks hanging off it, while the cost and the part
       count add them separately. Listing the tanks as their own rows is what a
       build order wants, so take their mass back out of the composite rather
       than counting it twice. */
    const colDry = b.part.column
      ? b.part.column.list.reduce((a2, x) => a2 + x.c * x.t.dry, 0)
      : 0;
    /* Its propellant comes apart the same way its dry mass does: the composite
       carries the column's fuel, and the column's tanks are listed under it. */
    const colProp = b.part.column
      ? b.part.column.list.reduce((a2, x) => a2 + x.c * x.t.prop, 0)
      : 0;
    add(
      "booster",
      b.part,
      b.n,
      b.part.dry - colDry,
      b.part.cost,
      (b.part.fuelM || 0) - colProp,
    );
    add("booster-decoupler", null, b.n, RADIAL_DECOUPLER, DECOUPLER_FUNDS);
    if (b.part.column)
      for (const x of b.part.column.list)
        add("booster-tank", x.t, b.n * x.c, x.t.dry, x.t.cost, x.t.prop);
  }
}

/* The same walk, collected. Off the hot path by construction: anything that
   wants the rows themselves is showing them to someone. */
export function manifest(sol: Solution | null | undefined) {
  const rows: Array<ManifestRow> = [];
  eachRow(sol, (role, part, qty, mass, cost, prop) => {
    if (qty) rows.push({ role, part, qty, mass, cost, prop: prop || 0 });
  });
  return rows;
}

/* Folded with a visitor that is allocated once, not once per call.

   These run on the hot path — `stageCost` and `stageParts` are called for every
   viable candidate, 1.9 million times across two of the grid's eighty-one cases
   — and a fresh closure each time costs about 9% of the whole grid. A module
   level accumulator is not pretty and is not reentrant, and `eachRow` does not
   recurse, so it does not need to be. */
let _acc = 0;
const _mass: AddRow = (_role, _part, qty, mass) => {
  _acc += qty * mass;
};
const _cost: AddRow = (_role, _part, qty, _mass, cost) => {
  /* NaN rather than zero where a row has no price. What can be missing one is
     a tank: seventeen of them carry no figure, all Making History, which the
     app has off by default and neither baseline turns on. `stageCost` estimates
     a price for those and this does not, so the two would disagree on such a
     design — but only this one is read by a test, so nothing a user sees can
     reach it. Defaulting to zero here would hide the disagreement rather than
     fix it. */
  _acc += qty * (cost ?? NaN);
};
const _count: AddRow = (_role, _part, qty) => {
  _acc += qty;
};
const _prop: AddRow = (_role, _part, qty, _m, _c, prop) => {
  _acc += qty * (prop || 0);
};
const fold = (sol: Solution | null | undefined, visit: AddRow) => {
  _acc = 0;
  eachRow(sol, visit);
  return _acc;
};

export const manifestMass = (sol: Solution | null | undefined) =>
  fold(sol, _mass);
export const manifestCost = (sol: Solution | null | undefined) =>
  fold(sol, _cost);
export const manifestCount = (sol: Solution | null | undefined) =>
  fold(sol, _count);
export const manifestProp = (sol: Solution | null | undefined) =>
  fold(sol, _prop);

export type { AddRow, ManifestRow, Role, RowPart };

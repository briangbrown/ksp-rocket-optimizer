import type { Coupler, Engine, Shroud, Tank } from "./catalogue.js";

/* ---------------------------- what a solved stage is ----------------------------

   The shape every layer passes around: the solver builds it, the geometry
   measures it, the manifest enumerates it, the drawing draws it and the parts
   table lists it. It was described nowhere and agreed on by habit, which is how
   a field could be read in one place and never written in another.

   Types only — nothing here is emitted, so importing this module costs a bundle
   nothing. #11 */

/* `c` of tank `t`. The solver holds a run this way rather than as a flat list
   because a stage of five identical tanks is one line in the parts table and
   five cylinders in the drawing, and both need to be derivable. */
type TankLine = { c: number; t: Tank };

/* A run of tankage, per column where a stage has more than one. `funds` is
   filled in only for the drop-tank pools, which price their own tankage. */
type TankSet = {
  list: Array<TankLine>;
  prop: number;
  dryMass: number;
  count: number;
  funds?: number;
  /* Written as null where a stage's tankage is spread across columns and never
     read. Recorded because it is on the object, not because anything wants it. */
  columnLen?: number | null;
};

/* The adapters bridging an engine up to the stack above it. Stock adapters are
   themselves fuel tanks, so a chain carries propellant as well as dry mass —
   `deadProp` is the part of it the engine cannot burn, which is charged as
   mass instead. Null where no route exists. */
type AdapterChain = {
  parts: Array<Tank>;
  dry: number;
  prop: number;
  deadProp?: number;
};

/* The decoupler a stage buys at its top: one, on the axis, unless the stage
   above carries an engine plate — a plate decouples at its own node, so the
   joint is already paid for and this reads as a quantity of zero. #78 */
type DecouplerFit = {
  m: number;
  n: string | null;
  cost: number;
  d: number;
  qty: number;
  viaPlateAbove?: boolean;
};

/* What holds a ring of parallel stacks on. Structure rather than a decoupler:
   radial stacks burn with the core and are never dropped alone. */
type Joiner = { n: string; m: number; cost: number; t: string };

/* What the boosters are bolted to.

   A real engine most of the time — an SRB or a Twin-Boar. The liquid-column
   and drop-tank pools synthesise one instead, standing in for a whole radial
   column so the ascent simulator can fly it as though it were a single part.
   A synthesised one carries no gimbal, which is why an `Engine` will not do.
   It does carry a price: a stand-in that leaves one out is a hole in every sum
   it lands in, which is what #93 was — so `cost` is required here, and the
   pools that build one have to say what it is even when the answer is nothing. */
type BoosterPart = {
  n: string;
  t: string | null;
  sz: ReadonlyArray<string>;
  f: ReadonlyArray<string>;
  m: number;
  dry: number;
  fuelM: number;
  iv: number;
  ia: number;
  fv: number;
  fa?: number;
  gim?: number;
  cost: number;
  _dia?: number;
  /* Set on a synthesised column: the tankage it stands for, and how many
     engines are at the foot of it. A drop tank has none of the latter. */
  column?: TankSet;
  dropTank?: boolean;
  nEng?: number;
};

/* A booster pool as a stage carries it: how many, what they are, how long they
   burn and what the vehicle weighs when they go. */
type Boosters = {
  part: BoosterPart;
  n: number;
  burn: number;
  dv: number;
  sepMass: number;
};

/* A packed ring: `r` tanks around a centre column, `levels` levels deep. Height
   traded for width, which is free while the stage stays inside whatever is
   below it and very expensive the moment it does not. */
type Pack = {
  r: number;
  levels: number;
  cols: number;
  width: number;
  tank: Tank;
  packedCount: number;
  spare: number;
  mass: number;
  cost: number;
};

/* One stage, solved.

   `n` counts every engine on the stage, so a three-column stage with two
   engines each reads six — `stageGeom` divides by `stacks` to get the cluster.
   `tanks` is the whole stage's tankage and `perStack` one column's, which is
   why the geometry reads one or the other rather than scaling either. */
type Solution = {
  engine: Engine;
  n: number;
  tanks: TankSet | null;
  adapters: AdapterChain | null;
  coupler: Coupler | null;
  shroud: Shroud | null;
  decoupler: DecouplerFit | null;
  boosters: Boosters | null;
  /* Absent on a boosted stage, which never runs parallel columns: it is built
     from a single core with a ring bolted to the side of it, so there is no
     second column to size, rejoin or hold on. Every reader already writes
     `sol.stacks || 1` and tests the other three before use. */
  stacks?: number;
  perStack?: TankSet | null;
  /* The coupler gathering a ring of columns back onto one node below. */
  rejoin?: Coupler | null;
  joiner?: Joiner | null;
  packed?: Pack | null;
  asparagus?: boolean;
  dropTank?: boolean;
  total: number;
  wet: number;
  dry: number;
  prop: number;
  isp: number;
  dv: number;
  twr: number;
  twrBurnout: number;
  burn: number;
  /* What the search ranks on. Not part of the fit — a stage does not price
     itself — but every solution that leaves the solver carries all three, and
     the comparison that picks between two of them depends on it. */
  cost: number;
  parts: number;
  score: number;
};

export type {
  AdapterChain,
  BoosterPart,
  Boosters,
  DecouplerFit,
  Joiner,
  Pack,
  Solution,
  TankLine,
  TankSet,
};

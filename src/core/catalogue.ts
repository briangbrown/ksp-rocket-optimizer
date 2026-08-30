import partsData from "../data/parts.json";
import techData from "../data/tech.json";

/* ------------------------------ what a part is ------------------------------

   The schema of the tables in `src/data/`, declared once so every module that
   reads a part agrees about what is in one. These are measurements extracted
   from a specific KSP install, not configuration, so the types describe what
   the extractor wrote rather than what the solver would like.

   The assignments at the foot of this file are the check that matters: they are
   annotated, not asserted, so a key that is missing or mistyped in the JSON is
   a compile error here rather than an `undefined` that becomes a `NaN` and is
   swallowed by `fmt` on its way to the screen. That is the bug this conversion
   was for. #11

   `sz` and `f` stay arrays of plain strings. The values are drawn from small
   fixed sets — "0", "1", "1.5", "2", "3", "4", "Mk2", "Mk3", "R" for a size
   class, "LF", "Ox", "SF", "Xe", "Mono" for a propellant — but TypeScript
   widens both to `string` when it reads the JSON, and a union here would force
   an assertion at the import to get past it. An assertion checks nothing, which
   would trade the guarantee above for a narrower type of no proven value. */

/* Every part carries the name it has in the VAB, the tech node it is behind and
   the size classes it presents. `_dia` is not in the data: `diaOf` computes a
   part's stack diameter once and caches it here, because it was 23% of a solve
   when it did not.

   `t` is nullable because a handful of tanks are available from the start and
   the extractor wrote null for them. Every reader already guards it — `!x.t ||
   unlocked.has(x.t)` is the shape all through `parts.js` — so the type is
   recording what the callers already knew. Engines below narrow it back to a
   string, since every one of them is behind a node. */
type PartBase = {
  n: string;
  t: string | null;
  sz: ReadonlyArray<string>;
  _dia?: number;
  /* Present only on parts that come with an expansion, and only when they do. */
  mh?: number;
  rs?: number;
  /* ReStock's own part id, where the part is one of theirs. */
  slug?: string;
};

/* Masses in tonnes, thrust in kN, Isp in seconds. `iv`/`ia` and `fv`/`fa` are
   the vacuum and sea-level pairs. `fuelM` is the propellant a solid booster
   carries, and zero on a liquid engine — which is how the two are told apart. */
type Engine = PartBase & {
  t: string;
  m: number;
  dry: number;
  fuelM: number;
  cost: number;
  gim: number;
  iv: number;
  ia: number;
  fv: number;
  fa: number;
  f: ReadonlyArray<string>;
  /* Set where the part gimbals on one axis only. */
  gim1?: number;
};

/* `wet` and `dry` in tonnes; `lf`, `ox`, `mono` and `xe` in game units. `k` is
   the dry fraction and `prop` the propellant mass, both precomputed. A handful
   of tanks have no price in the source tables. */
type Tank = PartBase & {
  wet: number;
  dry: number;
  lf: number;
  ox: number;
  mono: number;
  xe: number;
  prop: number;
  k: number;
  cost?: number;
};

/* A coupler fans one stack node out to `out` columns of diameter `dia`, and
   presents `top` upwards. An engine plate is one of these with `plate` set — it
   decouples at its own node, which is why a stage carrying one buys no separate
   decoupler. `rs` marks the ones that ship with ReStock+. */
type Coupler = {
  n: string;
  out: number;
  dia: number;
  top: number;
  m: number;
  cost: number;
  t: string;
  plate?: number;
  rs?: number;
};

/* An engine plate's jettisonable shroud, in the lengths it comes in. Read from
   each variant's node_stack_bottom offset in the ReStock+ config. */
type Shroud = { v: string; len: number; m: number };

/* Decouplers, parachutes, heat shields and legs. `d` is the diameter the part
   is for, null where it fits anything; `drogue` is on parachutes alone. Masses
   are the part as it sits in the VAB — dry plus whatever it carries. */
type StructPart = {
  n: string;
  m: number;
  cost: number;
  d: number | null;
  t: string;
  drogue?: boolean;
};

type StructKind = "decoupler" | "parachute" | "heatshield" | "leg";

/* A tech tree node: which tier it sits at, and what has to be researched first. */
type TechNode = { lvl: number; deps: ReadonlyArray<string> };

const engines: ReadonlyArray<Engine> = partsData.engines;
const tanks: ReadonlyArray<Tank> = partsData.tanks;
const nodes: Readonly<Record<string, TechNode>> = techData.nodes;

export const DATA = { engines, tanks, nodes };
export type {
  Coupler,
  Engine,
  PartBase,
  Shroud,
  StructKind,
  StructPart,
  Tank,
  TechNode,
};

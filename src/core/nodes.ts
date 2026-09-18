import nodesData from "../data/nodes.json";
import { artName, tankRun } from "./geometry.js";
import type { BoosterPart } from "./solution.js";

/* Where each part joins its neighbours, from `src/data/nodes.json` — the
   install's own configs, by tools/part-nodes.mjs (#461). Read by the craft
   adapter to stand a rocket up node to node, and by nothing in the solve: the
   solver sizes on drag cubes, and a craft is placed on nodes, and the two are
   different measurements of the same part (`.claude/rules/part-data.md`).

   Which table is live follows the geometry's art — `useArt` picks stock or
   ReStock for the whole solve, and the nodes follow, since ReStock moves the
   nodes of the parts it remodels. */

type Vec3 = readonly [number, number, number];
type Node = { p: Vec3; d: Vec3; s: number };
type PartNodes = {
  /* The config name as a .craft spells it. */
  name: string;
  nodes: Readonly<Record<string, Node>>;
  attach: Node | null;
  rules: ReadonlyArray<number> | null;
  variant?: string | null;
  variants?: ReadonlyArray<string>;
  /* Stack nodes a variant moves, by variant then node id: an engine plate's
     `bottom` goes down with its shroud's length. */
  variantNodes?: Readonly<Record<string, Readonly<Record<string, Node>>>>;
  resources: Readonly<Record<string, number>>;
  mass: number;
  tech: string | null;
  command: boolean;
  modules: ReadonlyArray<string>;
  via?: string;
};

const TABLES = nodesData as unknown as {
  stock: Readonly<Record<string, PartNodes>>;
  restock: Readonly<Record<string, PartNodes>>;
};

/* A part's entry by its title, in the live art; undefined for a part the
   install did not describe (the engine plates' procedural shrouds are still
   parts with nodes — nothing the solver places is expected to be missing,
   and test/nodes.test.ts holds that). */
const nodesOf = (title: string): PartNodes | undefined =>
  TABLES[artName()][title];

/* Every command part the table knows, for the root that stands in for the
   payload: by the size of its stack node. */
const commandParts = (): Array<[string, PartNodes]> =>
  Object.entries(TABLES[artName()]).filter(([, e]) => e.command);

/* The title a config name belongs to, in the live art — the way back from
   a craft's `part =` to the part tables. */
const titleOf = (name: string): string | undefined => {
  const t = TABLES[artName()];
  for (const [title, e] of Object.entries(t)) if (e.name === name) return title;
  return undefined;
};

/* A tank nothing can stand on: no stack node on top. The FL-C1000 and the
   S3-3600 Nosecone are tanks with the nose built on, and the game will not
   stack under a part with no node there — while every tank a run here has is
   under something, a tank, a decoupler or the payload. So they are not in the
   pool. A title the table has not met is taken as stackable. #467 */
const topless = (title: string): boolean => {
  const e = nodesOf(title);
  return e !== undefined && !e.nodes.top;
};

export { commandParts, nodesOf, titleOf, topless };
export type { Node, PartNodes };

/* How far a booster's axis stands from the face it is bolted by: its
   surface-attach node's radius where the config has one — the Shrimp's is
   0.3125 m, a Kickback's 0.635 under fins 1.6 m across — and half `bd`, the
   drag-cube width, where it has not. The cube is the whole part, fins and
   nozzle included, and put probe 2's Shrimps 18 mm off their decouplers and
   probe 3's Kickbacks on TT-70s (#467). A liquid column is held by its
   tank. The solver sizes the holder by twice this; the model and the craft
   stand the ring off by it. */
export function attachHalf(p: BoosterPart, bd: number): number {
  const title = p.column ? tankRun(p.column)[0]?.t.n : p.n;
  const at = title ? nodesOf(title)?.attach : null;
  const r = at ? Math.hypot(at.p[0], at.p[2]) : 0;
  return r > 1e-3 ? r : bd / 2;
}

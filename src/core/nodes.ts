import nodesData from "../data/nodes.json";
import { artName } from "./geometry.js";

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

export { commandParts, nodesOf };
export type { Node, PartNodes };

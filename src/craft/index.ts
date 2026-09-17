/* The craft module's one door. Nothing in here imports from the rest of the
   application, and only the adapter in `src/core/craft.ts` imports this —
   `test/boundaries.test.ts` holds both — so the file format and the solver
   meet in exactly one place. #460 */
export { CraftError } from "./error.js";
export { checkCraft } from "./check.js";
export type { Problem } from "./check.js";
export { VERSION, readCraft, writeCraft } from "./craft.js";
export type {
  Craft,
  CraftPart,
  Quat,
  Resource,
  StackNode,
  Vec3,
} from "./craft.js";
export { parseNode, printNode } from "./node.js";
export type { ConfigNode } from "./node.js";

import { CraftError } from "./error.js";
import { bool, list, num, nums } from "./format.js";
import { childrenOf, parseNode, printNode, valueOf, valuesOf } from "./node.js";
import { checkCraft } from "./check.js";
import type { ConfigNode } from "./node.js";

/* A rocket as a .craft file sees it — and nothing else. No stage, no
   solution, no part table: parts, where they sit, how they join, when they
   fire. `writeCraft` turns one into the text KSP 1.12.5 loads in the VAB;
   `readCraft` turns any craft the game has written back into one, keeping
   what this type carries and dropping the rest. The two are inverse on
   everything the type holds, which `test/craft/property.test.ts` holds over
   generated crafts and the fixtures.

   The format, read off files the game wrote rather than off any write-up
   (the write-ups disagree with the files):

     part = <name>_<uid>       the part's config name and a unique number;
                               every other field names a part by this token
     pos, rot                  editor-world position and quaternion. Trusted
                               on load: the game re-derives nothing from the
                               nodes, so a wrong pos is a wrong rocket
     link = <token>            one per child. The parent lists its children;
                               a part with no link to it is the root
     attN = <node>,<token>_<p>_<d>_<p0>_<d0>
                               one per stack node the part has: the node's
                               id, the token of what is on it (`Null_0` for
                               nothing), then the node's position and
                               direction in the part's own frame and their
                               originals, `|`-separated. The pre-1.9 short
                               form `attN = top, <token>` is read too
     srfN = srfAttach,<token>,<collider>,<p>,<d>,<p0>
                               the part is bolted to that part's surface, by
                               its own attach node at p facing d; the
                               collider is left empty, as the game leaves it
                               on a craft it re-saves. The two-field form is
                               read too
     attm = 0 | 1              stack- or surface-attached
     istg, dstg                the stage the part activates in and the stage
                               it leaves in (0 where it stays to the end); a
                               part with no icon of its own carries its
                               stage's number as istg, the game's own way,
                               and the root −1. The launch stage is the
                               highest number
     sidx, sqor, sepI          the part's index within its stage and its stage
                               again, −1 where it has no icon — sqor is what
                               tells a staged part from one merely in a
                               stage; and the separation index, which is
                               dstg for every part but the root
     sym = <token>             one per other member of the symmetry group
     RESOURCE { … }            what the part holds
     MODULE { name = … }       each PartModule's saved state, in prefab order;
                               only the names are kept here

   Nothing here knows what any part is. A `name` is a string the game will
   look up; whether it exists is the game's answer, and it drops one it does
   not know without a word — which is why the description says what the
   craft needs installed. */

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

/* A stack node of a part: its id, where it is and which way it faces in the
   part's own frame, and the id of the part on it or null for an open one. */
type StackNode = {
  id: string;
  p: Vec3;
  d: Vec3;
  to: string | null;
};

type Resource = { name: string; amount: number; max: number };

type CraftPart = {
  /* Unique within the craft; the game uses a 32-bit number, written in
     decimal, and so does everything here. */
  id: string;
  /* The config name as a craft spells it: `fuelTank`, `liquidEngine3.v2`. */
  name: string;
  pos: Vec3;
  rot: Quat;
  /* What holds this part: by id, on a stack node (the two parts' `nodes`
     say which) or on the surface. Null for the root, and only the root. */
  parent: { id: string; via: "stack" | "surface" } | null;
  nodes: ReadonlyArray<StackNode>;
  stage: { ignite: number | null; drop: number };
  /* The other members of this part's symmetry group, by id. */
  symmetry: ReadonlyArray<string>;
  /* PartModule names in prefab order, written as `MODULE { name = … }`
     stubs; the game loads and launches on those (#467, probe 1). */
  modules: ReadonlyArray<string>;
  /* The variant a `ModulePartVariants` part shows, written into its stub as
     `selectedVariant`. Null where the part has none. Without it a ReStock
     engine, whose variants are whole meshes, draws nothing in the VAB
     (#467, probe 1). */
  variant: string | null;
  /* The part's own surface-attach node, for the long `srfN` form the game
     writes: position and direction in the part's frame. Null where not
     bolted on by one. */
  attach: { p: Vec3; d: Vec3 } | null;
  resources: ReadonlyArray<Resource>;
};

type Craft = {
  name: string;
  description: string;
  hangar: "VAB" | "SPH";
  vesselType: string;
  parts: ReadonlyArray<CraftPart>;
};

/* The game this writes for. */
const VERSION = "1.12.5";

/* A 32-bit FNV-1a, for the `persistentId`s the game wants on the ship and
   on each part: unique enough, and the same every time for the same
   craft, so the file is deterministic. */
const fnv = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

const token = (p: CraftPart) => `${p.name}_${p.id}`;

/* ---------------------------------------------------------------- write */
function writeCraft(craft: Craft): string {
  const problems = checkCraft(craft);
  if (problems.length)
    throw new CraftError(
      `refusing to write a craft the game would not load: ${problems[0].what}` +
        (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""),
    );
  const byId = new Map(craft.parts.map((p) => [p.id, p]));
  const kids = new Map<string, Array<CraftPart>>();
  for (const p of craft.parts)
    if (p.parent) {
      if (!kids.has(p.parent.id)) kids.set(p.parent.id, []);
      kids.get(p.parent.id)!.push(p);
    }
  /* The editor's bounding box, advisory: how far the parts reach, and a
     part's width either side. */
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (const p of craft.parts)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p.pos[k]);
      hi[k] = Math.max(hi[k], p.pos[k]);
    }
  const size = lo.map((l, k) => hi[k] - l + 1.25);

  const root: ConfigNode = { name: "", values: [], nodes: [] };
  root.values.push(
    ["ship", craft.name],
    ["version", VERSION],
    ["description", craft.description],
    ["type", craft.hangar],
    ["size", list(size)],
    ["steamPublishedFileId", "0"],
    ["persistentId", String(fnv(craft.name))],
    ["rot", "0,0,0,0"],
    ["missionFlag", "Squad/Flags/default"],
    ["vesselType", craft.vesselType],
    ["OverrideDefault", "False,False,False,False"],
    ["OverrideActionControl", "0,0,0,0"],
    ["OverrideAxisControl", "0,0,0,0"],
    ["OverrideGroupNames", ",,,"],
  );
  const sidx = new Map<number, number>();
  for (const p of craft.parts) {
    const ign = p.stage.ignite;
    let idx = -1;
    if (ign !== null) {
      idx = sidx.get(ign) ?? 0;
      sidx.set(ign, idx + 1);
    }
    const v: Array<[string, string]> = [
      ["part", token(p)],
      ["partName", "Part"],
      ["persistentId", String(fnv(token(p)))],
      ["pos", list(p.pos)],
      ["attPos", "0,0,0"],
      ["attPos0", list(p.pos)],
      ["rot", list(p.rot)],
      ["attRot", "0,0,0,1"],
      ["attRot0", "0,0,0,1"],
      ["mir", "1,1,1"],
      ["symMethod", "Radial"],
      /* Autostrut to the grandparent on every part, the way a builder braces
         a tall stack: the game applies the field on load whether or not
         Advanced Tweakables is on (it saved it back untouched on probes 1–6),
         Grandparent holds a stack of many short tanks without the joint
         changes Heaviest makes at staging, and rigid attachment is left off
         because it makes a joint brittle rather than stiff. #467 */
      ["autostrutMode", p.parent ? "Grandparent" : "Off"],
      ["rigidAttachment", bool(false)],
      ["istg", String(ign ?? (p.parent ? p.stage.drop : -1))],
      ["resPri", "0"],
      ["dstg", String(p.stage.drop)],
      ["sidx", String(idx)],
      ["sqor", String(ign ?? -1)],
      ["sepI", String(p.parent ? p.stage.drop : -1)],
      ["attm", p.parent?.via === "surface" ? "1" : "0"],
      ["sameVesselCollision", bool(false)],
      ["modCost", "0"],
      ["modMass", "0"],
      ["modSize", "0,0,0"],
    ];
    for (const c of kids.get(p.id) ?? []) v.push(["link", token(c)]);
    for (const n of p.nodes) {
      const on = n.to === null ? "Null_0" : token(byId.get(n.to)!);
      const pd = `${list(n.p, "|")}_${list(n.d, "|")}`;
      v.push(["attN", `${n.id},${on}_${pd}_${pd}`]);
    }
    if (p.parent?.via === "surface")
      /* The long form where the part's own node is known, the two-field
         form where it is not — the game fills the rest in when it saves. */
      v.push([
        "srfN",
        p.attach
          ? `srfAttach,${token(byId.get(p.parent.id)!)},,${list(p.attach.p, "|")},${list(p.attach.d, "|")},${list(p.attach.p, "|")}`
          : `srfAttach,${token(byId.get(p.parent.id)!)}`,
      ]);
    for (const s of p.symmetry) v.push(["sym", token(byId.get(s)!)]);
    const part: ConfigNode = { name: "PART", values: v, nodes: [] };
    for (const n of ["EVENTS", "ACTIONS", "PARTDATA"])
      part.nodes.push({ name: n, values: [], nodes: [] });
    for (const m of p.modules)
      part.nodes.push({
        name: "MODULE",
        values:
          m === "ModulePartVariants" && p.variant !== null
            ? [
                ["name", m],
                ["selectedVariant", p.variant],
              ]
            : [["name", m]],
        nodes: [],
      });
    for (const r of p.resources)
      part.nodes.push({
        name: "RESOURCE",
        values: [
          ["name", r.name],
          ["amount", num(r.amount)],
          ["maxAmount", num(r.max)],
          ["flowState", bool(true)],
          ["isTweakable", bool(true)],
          ["hideFlow", bool(false)],
          ["isVisible", bool(true)],
          ["flowMode", "Both"],
        ],
        nodes: [],
      });
    root.nodes.push(part);
  }
  return printNode(root);
}

/* ----------------------------------------------------------------- read */
/* `<name>_<uid>` apart. The game turns `_` in a config name into `.`, so
   the last underscore is the one. */
const split = (tok: string, what: string): { name: string; id: string } => {
  const i = tok.lastIndexOf("_");
  const id = tok.slice(i + 1);
  if (i <= 0 || !/^\d+$/.test(id))
    throw new CraftError(`${what} "${tok}" is not <name>_<number>`);
  return { name: tok.slice(0, i), id };
};

const vec3 = (v: Array<number>): Vec3 => [v[0], v[1], v[2]];

function readCraft(text: string): Craft {
  const root = parseNode(text);
  const name = valueOf(root, "ship");
  if (name === undefined) throw new CraftError("no `ship =` line: not a craft");
  /* Modern files put each part in a `PART` block; the first versions of the
     game wrote them as bare `{ … }` blocks. Both are parts. */
  const blocks = root.nodes.filter(
    (n) => n.name === "PART" || (n.name === "" && valueOf(n, "part")),
  );
  type Raw = {
    part: CraftPart;
    links: Array<string>;
    srf: string | null;
    attm: number;
  };
  const raws: Array<Raw> = [];
  for (const b of blocks) {
    const tok = valueOf(b, "part");
    if (tok === undefined) throw new CraftError("a PART with no `part =` line");
    const { name: pname, id } = split(tok, "part");
    const posV = valueOf(b, "pos");
    if (posV === undefined) throw new CraftError(`${tok} has no pos`);
    const rotV = valueOf(b, "rot");
    const istg = Number(valueOf(b, "istg") ?? -1);
    const dstg = Number(valueOf(b, "dstg") ?? 0);
    const sqorV = valueOf(b, "sqor");
    const sqor = sqorV === undefined ? null : Number(sqorV);
    if (
      !Number.isInteger(istg) ||
      !Number.isInteger(dstg) ||
      (sqor !== null && !Number.isInteger(sqor))
    )
      throw new CraftError(`${tok}: istg/dstg/sqor are not integers`);
    /* Staged where the game says so: sqor is the stage of a part with an
       icon and −1 otherwise, while istg carries the stage's number even for
       a part merely in it. The first versions wrote no sqor. */
    const staged = sqor === null ? istg >= 0 : sqor >= 0;
    const nodes: Array<StackNode> = [];
    for (const a of valuesOf(b, "attN")) {
      const c = a.indexOf(",");
      if (c < 0) throw new CraftError(`${tok}: attN "${a}" has no comma`);
      const nid = a.slice(0, c).trim();
      const rest = a
        .slice(c + 1)
        .trim()
        .split("_");
      let to: string | null;
      let at: number;
      if (rest[0] === "Null") {
        to = null;
        at = 2;
      } else {
        if (rest.length < 2 || !/^\d+$/.test(rest[1]))
          throw new CraftError(`${tok}: attN "${a}" names no part`);
        to = rest[1];
        at = 2;
      }
      const p =
        rest.length > at ? nums(rest[at], 3, "attN position", "|") : [0, 0, 0];
      const d =
        rest.length > at + 1
          ? nums(rest[at + 1], 3, "attN direction", "|")
          : [0, 0, 0];
      nodes.push({ id: nid, p: vec3(p), d: vec3(d), to });
    }
    const srfV = valueOf(b, "srfN");
    let srf: string | null = null;
    let attach: CraftPart["attach"] = null;
    if (srfV !== undefined) {
      const f = srfV.split(",").map((s) => s.trim());
      if (f.length < 2)
        throw new CraftError(`${tok}: srfN "${srfV}" names no part`);
      srf = split(f[1], "srfN").id;
      /* The long form: collider, position, direction, original position. */
      if (f.length >= 5)
        attach = {
          p: vec3(nums(f[3], 3, "srfN position", "|")),
          d: vec3(nums(f[4], 3, "srfN direction", "|")),
        };
    }
    const resources: Array<Resource> = childrenOf(b, "RESOURCE").flatMap(
      (r) => {
        const rn = valueOf(r, "name");
        const amount = Number(valueOf(r, "amount"));
        const max = Number(valueOf(r, "maxAmount"));
        if (
          rn === undefined ||
          !Number.isFinite(amount) ||
          !Number.isFinite(max)
        )
          throw new CraftError(
            `${tok}: a RESOURCE without name, amount and maxAmount`,
          );
        return [{ name: rn, amount, max }];
      },
    );
    raws.push({
      part: {
        id,
        name: pname,
        pos: vec3(nums(posV, 3, `${tok} pos`)),
        rot:
          rotV === undefined
            ? [0, 0, 0, 1]
            : (nums(rotV, 4, `${tok} rot`) as unknown as Quat),
        parent: null,
        nodes,
        stage: { ignite: staged ? istg : null, drop: dstg },
        symmetry: valuesOf(b, "sym").map((s) => split(s, "sym").id),
        modules: childrenOf(b, "MODULE").flatMap((m) => {
          const mn = valueOf(m, "name");
          return mn === undefined ? [] : [mn];
        }),
        variant:
          childrenOf(b, "MODULE")
            .filter((m) => valueOf(m, "name") === "ModulePartVariants")
            .map((m) => valueOf(m, "selectedVariant"))
            .find((v) => v !== undefined) ?? null,
        attach,
        resources,
      },
      links: valuesOf(b, "link").map((l) => split(l, "link").id),
      srf,
      attm: Number(valueOf(b, "attm") ?? 0),
    });
  }
  /* Parents from the links: the part that lists a child is its parent. A
     surface-attached part also names its parent itself, which wins where
     the two disagree — a link is bookkeeping, srfN is the joint. */
  const linkedBy = new Map<string, string>();
  for (const r of raws) for (const c of r.links) linkedBy.set(c, r.part.id);
  const parts = raws.map((r): CraftPart => {
    const pid = r.srf ?? linkedBy.get(r.part.id) ?? null;
    return {
      ...r.part,
      parent:
        pid === null
          ? null
          : {
              id: pid,
              via: r.srf !== null || r.attm === 1 ? "surface" : "stack",
            },
    };
  });
  return {
    name,
    description: valueOf(root, "description") ?? "",
    hangar: valueOf(root, "type") === "SPH" ? "SPH" : "VAB",
    vesselType: valueOf(root, "vesselType") ?? "Ship",
    parts,
  };
}

export { VERSION, readCraft, writeCraft };
export type { Craft, CraftPart, Quat, Resource, StackNode, Vec3 };

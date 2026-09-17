import type { Craft } from "./craft.js";

/* What has to hold for the game to load a craft as the rocket it describes.
   `writeCraft` refuses a craft with any of these, so a bad one fails here,
   with a name, rather than in the VAB with a hole in it. */
type Problem = { part: string | null; what: string };

const NAME = /^[A-Za-z0-9.-]+$/;
const ID = /^\d+$/;
const finite = (v: ReadonlyArray<number>) => v.every((x) => Number.isFinite(x));

function checkCraft(craft: Craft): Array<Problem> {
  const out: Array<Problem> = [];
  const bad = (part: string | null, what: string) => out.push({ part, what });

  if (!craft.name.trim()) bad(null, "the craft has no name");
  if (/[\r\n]/.test(craft.description))
    bad(null, "the description spans lines; the game reads one");
  if (craft.description.includes("//"))
    bad(
      null,
      "the description contains //, which the game reads as a comment and cuts",
    );
  if (!craft.parts.length) {
    bad(null, "no parts");
    return out;
  }

  const byId = new Map<string, (typeof craft.parts)[number]>();
  for (const p of craft.parts) {
    if (!ID.test(p.id)) bad(p.id, `id "${p.id}" is not a number`);
    if (byId.has(p.id)) bad(p.id, "two parts share this id");
    byId.set(p.id, p);
  }

  const roots = craft.parts.filter((p) => p.parent === null);
  if (roots.length !== 1)
    bad(null, `${roots.length} root parts; a craft has one`);
  else if (craft.parts[0].parent !== null)
    bad(craft.parts[0].id, "the first part is not the root");

  for (const p of craft.parts) {
    if (!NAME.test(p.name)) bad(p.id, `name "${p.name}" is not a config name`);
    if (!finite(p.pos)) bad(p.id, "pos is not finite");
    if (!finite(p.rot)) bad(p.id, "rot is not finite");
    else {
      const n = Math.hypot(...p.rot);
      if (Math.abs(n - 1) > 1e-5)
        bad(p.id, `rot is not a unit quaternion (|q| = ${n})`);
    }
    const seen = new Set<string>();
    for (const n of p.nodes) {
      if (seen.has(n.id)) bad(p.id, `node "${n.id}" appears twice`);
      seen.add(n.id);
      if (!finite(n.p) || !finite(n.d))
        bad(p.id, `node "${n.id}" is not finite`);
      if (n.to !== null) {
        const other = byId.get(n.to);
        if (!other)
          bad(p.id, `node "${n.id}" holds "${n.to}", which is no part`);
        else if (other.id === p.id)
          bad(p.id, `node "${n.id}" holds the part itself`);
        else if (!other.nodes.some((m) => m.to === p.id))
          bad(p.id, `node "${n.id}" holds ${n.to}, which has no node back`);
      }
    }
    if (p.parent) {
      const par = byId.get(p.parent.id);
      if (!par) bad(p.id, `parent "${p.parent.id}" is no part`);
      else if (par.id === p.id) bad(p.id, "is its own parent");
      else if (p.parent.via === "stack") {
        if (!par.nodes.some((n) => n.to === p.id))
          bad(
            p.id,
            `stack-attached to ${par.id}, which has no node holding it`,
          );
        if (!p.nodes.some((n) => n.to === par.id))
          bad(
            p.id,
            `stack-attached to ${par.id} with no node of its own on it`,
          );
      }
    }
    for (const s of p.symmetry) {
      if (s === p.id) bad(p.id, "is in symmetry with itself");
      else if (!byId.has(s))
        bad(p.id, `symmetry with "${s}", which is no part`);
    }
    const { ignite, drop } = p.stage;
    if (ignite !== null && (!Number.isInteger(ignite) || ignite < 0))
      bad(p.id, `ignite stage ${ignite} is not a stage`);
    if (!Number.isInteger(drop) || drop < 0)
      bad(p.id, `drop stage ${drop} is not a stage`);
    for (const r of p.resources) {
      if (!r.name.trim()) bad(p.id, "a resource with no name");
      if (
        !Number.isFinite(r.amount) ||
        !Number.isFinite(r.max) ||
        r.amount < 0 ||
        r.max < 0
      )
        bad(
          p.id,
          `resource ${r.name} has amounts that are not finite and non-negative`,
        );
      else if (r.amount > r.max)
        bad(p.id, `resource ${r.name} holds more than it can`);
    }
  }

  /* Acyclic: walk up from every part; a walk longer than the craft loops. */
  if (roots.length === 1)
    for (const p of craft.parts) {
      let q = p,
        steps = 0;
      while (q.parent && steps <= craft.parts.length) {
        const next = byId.get(q.parent.id);
        if (!next) break;
        q = next;
        steps++;
      }
      if (steps > craft.parts.length) {
        bad(p.id, "is on a loop of parents");
        break;
      }
    }

  /* Stages: whatever ignites is numbered 0 … launch with no gap, and a part
     leaves only in a stage where something fires — the decoupler. */
  const ign = new Set<number>();
  for (const p of craft.parts)
    if (p.stage.ignite !== null) ign.add(p.stage.ignite);
  if (ign.size) {
    const top = Math.max(...ign);
    for (let s = 0; s <= top; s++)
      if (!ign.has(s))
        bad(
          null,
          `nothing fires in stage ${s}; stages run 0 to ${top} without a gap`,
        );
    for (const p of craft.parts)
      if (p.stage.drop > 0 && !ign.has(p.stage.drop))
        bad(p.id, `leaves in stage ${p.stage.drop}, where nothing fires`);
  } else
    for (const p of craft.parts)
      if (p.stage.drop > 0)
        bad(p.id, `leaves in stage ${p.stage.drop}, but nothing is staged`);

  return out;
}

export { checkCraft };
export type { Problem };

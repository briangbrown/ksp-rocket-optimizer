import { checkCraft, readCraft, writeCraft } from "../src/craft/index.js";
import { craftOf } from "../src/core/craft.js";
import { artName, stageGeom } from "../src/core/geometry.js";
import geometry from "../src/data/geometry.json";
import { extentOf, modelOf } from "../src/core/model.js";
import { nodesOf } from "../src/core/nodes.js";
import nodesData from "../src/data/nodes.json";
import type { Craft, CraftPart, Quat, Vec3 } from "../src/craft/index.js";
import type { PlanInput, PlanStage } from "../src/core/plan.js";

/* What has to hold for a delivered plan's craft, run by the mission sweep on
   every plan it solves (test/mission-sweep.test.ts) so the adapter is checked
   on the rockets the application actually delivers without solving them a
   second time. Returns problems as strings — the sweep asserts the list is
   empty, naming the mission — and the craft's signature for `crafts.txt`. #464

   Four checks. The craft passes `checkCraft` and survives a write and read.
   Every part the model draws stands in the craft at the same x and z — by its
   attach point where it is bolted on, since a radial part's origin is its
   attach offset away from the bell the model draws — so the file and the
   picture agree about the plan; engines under a coupler are the exception,
   standing on the coupler's own nodes where the model spreads them by its
   cluster rule. Heights are the nodes', which the drag cube overhangs by the
   lip, so the total is held to a lip a part. And the masses reconcile: the
   parts' dry masses from the install's configs against the stage's own dry
   (its `dry` less what it carries), the propellant the tanks hold against the
   stage's, per stage, so a part left out or doubled shows. */

/* Tonnes a unit, KSP's resource densities. */
const UNIT: Record<string, number> = {
  LiquidFuel: 0.005,
  Oxidizer: 0.005,
  SolidFuel: 0.0075,
  MonoPropellant: 0.004,
  XenonGas: 0.0001,
  ElectricCharge: 0,
};

type Entry = {
  name: string;
  mass: number;
  nodes: Record<string, { p: number[] }>;
  attach: { p: number[] } | null;
};
const table = () =>
  (nodesData as unknown as Record<"stock" | "restock", Record<string, Entry>>)[
    artName()
  ];
const PART_H = (art: "stock" | "restock") =>
  (
    geometry as unknown as Record<
      "stock" | "restock",
      { PART_H: Record<string, number> }
    >
  )[art].PART_H;
const byConfigName = () => {
  const m = new Map<string, Entry>();
  for (const e of Object.values(table())) m.set(e.name, e);
  return m;
};

const rotate = (q: Quat, v: ReadonlyArray<number>): Vec3 => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
};

const propOf = (p: CraftPart) =>
  p.resources.reduce((a, r) => a + r.amount * (UNIT[r.name] ?? 0), 0);

export function craftChecks(
  name: string,
  stages: ReadonlyArray<PlanStage>,
  input: PlanInput,
): { problems: Array<string>; signature: string; craft: Craft } {
  const problems: Array<string> = [];
  const dest = stages[stages.length - 1]?.legs.at(-1)?.body ?? "somewhere";
  const craft = craftOf(stages, input, name, String(dest));
  const entries = byConfigName();
  const entry = (p: CraftPart) => entries.get(p.name);

  for (const p of checkCraft(craft))
    problems.push(`check: ${p.part ?? ""} ${p.what}`);

  try {
    const back = readCraft(writeCraft(craft));
    if (JSON.stringify(back) !== JSON.stringify(craft)) {
      const i = craft.parts.findIndex(
        (p, k) => JSON.stringify(p) !== JSON.stringify(back.parts[k]),
      );
      problems.push(
        `round trip: part ${i} (${craft.parts[i]?.name}) differs: ${JSON.stringify(craft.parts[i])} vs ${JSON.stringify(back.parts[i])}`.slice(
          0,
          400,
        ),
      );
    }
  } catch (e) {
    problems.push(`write: ${(e as Error).message}`);
  }

  const solved = stages.filter((s) => s.sol);
  if (!solved.length)
    return { problems, signature: `## ${name}\n  NO DESIGN\n`, craft };

  /* The picture and the file agree about the plan. */
  const model = modelOf(solved, input.payload, input.payloadDia);
  const byName = new Map<string, Array<CraftPart>>();
  for (const p of craft.parts) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name)!.push(p);
  }
  const clustered = solved.map((s) => {
    const g = stageGeom(s.sol!);
    return !!s.sol!.coupler && g.perEng > 1 && !g.radial;
  });
  const unplaced: Array<string> = [];
  for (const shape of model) {
    if (shape.role === "payload" || !("part" in shape) || !shape.part) continue;
    const title = "n" in shape.part ? shape.part.n : null;
    if (!title || shape.role === "coupler") continue;
    if (
      shape.role === "engine" &&
      shape.ring === undefined &&
      clustered[shape.stage ?? 0]
    )
      continue;
    const cfg = nodesOf(title)?.name;
    if (!cfg) {
      problems.push(`model: no config name for ${title}`);
      continue;
    }
    const near = (byName.get(cfg) ?? []).some((p) => {
      const at = entry(p)?.attach?.p ?? [0, 0, 0];
      const ap = rotate(p.rot, at);
      const close = (x: number, z: number) =>
        Math.abs(x - shape.x) < 2e-3 && Math.abs(z - shape.z) < 2e-3;
      if (
        close(p.pos[0], p.pos[2]) ||
        close(p.pos[0] + ap[0], p.pos[2] + ap[2])
      )
        return true;
      /* A radial engine's origin is on the wall and the bell the model
         draws hangs outboard of it: same azimuth, the shape's centre within
         a bell's width further out. */
      if (shape.role === "engine" && p.parent?.via === "surface") {
        const az = (x: number, z: number) => Math.atan2(z, x);
        const dAz = Math.abs(az(shape.x, shape.z) - az(p.pos[0], p.pos[2]));
        const dr =
          Math.hypot(shape.x, shape.z) - Math.hypot(p.pos[0], p.pos[2]);
        return (
          Math.min(dAz, 2 * Math.PI - dAz) < 0.01 &&
          dr > -1e-3 &&
          dr < 2 * shape.r + 1e-3
        );
      }
      return false;
    });
    if (!near)
      unplaced.push(`${title} at ${shape.x.toFixed(3)},${shape.z.toFixed(3)}`);
  }
  if (unplaced.length)
    problems.push(
      `model: ${unplaced.length} of ${model.length} drawn parts have no craft part at their x, z: ${unplaced.slice(0, 4).join("; ")}`,
    );
  /* Heights: the model stacks drag cubes, the craft stacks nodes, and the
     difference is exactly the sum over the stack of each part's box less
     its node span — a tank's lip, an engine's bells below its bottom node
     (the Mammoth's box is 4.14 m to its nodes' 2.73) — plus the payload's
     drawn height against the stand-in's span. Held to that, tightly. */
  let lo = { y: Infinity, at: "" },
    hi = { y: -Infinity, at: "" };
  for (const p of craft.parts) {
    const n = entry(p)?.nodes ?? {};
    for (const v of Object.values(n)) {
      const y = p.pos[1] + rotate(p.rot, v.p)[1];
      if (y < lo.y) lo = { y, at: p.name };
      if (y > hi.y) hi = { y, at: p.name };
    }
  }
  const height = hi.y - lo.y;
  const drawn = extentOf(model).height;
  const titleOf = new Map(Object.entries(table()).map(([t, e]) => [e.name, t]));
  const boxes = PART_H(artName());
  const span = (e: Entry) => {
    const ys = Object.values(e.nodes).map((v) => v.p[1]);
    return ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0;
  };
  /* Only the axis chain sets the height: a ring column's parts stand beside
     it. A clustered stage's engines are off the axis under their coupler;
     one of them counts, since the stage is as tall as one engine. */
  let lips = 0;
  const onAxis = (p: CraftPart) =>
    Math.abs(p.pos[0]) < 1e-3 && Math.abs(p.pos[2]) < 1e-3;
  const stack = craft.parts.filter(
    (p) => p.parent?.via !== "surface" && p !== craft.parts[0],
  );
  const lip = (p: CraftPart) => {
    const e = entry(p);
    const box = e && boxes[titleOf.get(p.name) ?? ""];
    return e && box !== undefined ? box - span(e) : 0;
  };
  const couplers = new Set(
    craft.parts
      .filter(
        (p) =>
          entries.get(p.name) &&
          /^bottom\d+$/.test(
            Object.keys(entry(p)!.nodes).find((k) => /^bottom\d+$/.test(k)) ??
              "",
          ),
      )
      .map((p) => p.id),
  );
  const counted = new Set<string>();
  for (const p of stack) {
    if (onAxis(p)) lips += lip(p);
    else if (
      p.parent &&
      couplers.has(p.parent.id) &&
      !counted.has(p.parent.id)
    ) {
      counted.add(p.parent.id);
      lips += lip(p);
    }
  }
  const payloadShape = model.find((m) => m.role === "payload");
  /* Two bounds rather than one number: the craft never stands taller than
     the drawing (a part placed too high would), and never shorter than the
     drawing less what the boxes overhang the nodes and the payload's drawn
     height (a part left out would). */
  if (height > drawn + 0.5)
    problems.push(
      `model: the craft stands ${height.toFixed(2)} m node to node (${lo.at} to ${hi.at}), taller than the drawing's ${drawn.toFixed(2)}`,
    );
  if (height < drawn - lips - (payloadShape?.h ?? 0) - 1.0)
    problems.push(
      `model: the craft stands ${height.toFixed(2)} m node to node (${lo.at} to ${hi.at}); the drawing ${drawn.toFixed(2)} less ${lips.toFixed(2)} of box over nodes and the payload is more than a metre taller`,
    );

  /* Masses, per stage, grouped by the stage each part leaves in. */
  const root = craft.parts[0];
  const holdNames = new Set(
    [
      "TT-38K Radial Decoupler",
      "TT-70 Radial Decoupler",
      "Hydraulic Detachment Manifold",
    ].map((t) => nodesOf(t)?.name),
  );
  const groups = new Map<number, Array<CraftPart>>();
  for (const p of craft.parts) {
    if (p === root) continue;
    if (!groups.has(p.stage.drop)) groups.set(p.stage.drop, []);
    groups.get(p.stage.drop)!.push(p);
  }
  const sum = (ps: Array<CraftPart>, f: (p: CraftPart) => number) =>
    ps.reduce((a, p) => a + f(p), 0);
  const dryOf = (p: CraftPart) => entry(p)?.mass ?? NaN;
  /* Which drop stage is which plan stage: the drop values descend with the
     plan's stages, the launch stage's core leaving first. Boosters leave in
     a stage of their own, one higher than their core's. */
  const drops = [...groups.keys()].sort((a, b) => b - a);
  const cores: Array<number> = [];
  const ringDrop = new Map<number, number>();
  let k = 0;
  for (const st of solved) {
    if (st.sol!.boosters) ringDrop.set(cores.length, drops[k++]);
    cores.push(drops[k++]);
  }
  solved.forEach((st, i) => {
    const sol = st.sol!;
    const ring = groups.get(ringDrop.get(i) ?? -1) ?? [];
    /* The ring's holders are the stage's, in the plan's accounting. */
    const holds = ring.filter((p) => holdNames.has(p.name));
    const core = [...(groups.get(cores[i]) ?? []), ...holds];
    const dry = sum(core, dryOf);
    const prop = sum(core, propOf);
    const wantDry = sol.dry - st.payloadIn;
    /* The stage's propellant less its ring's: a solid "engine" stage holds
       its own fuel and has no tanks at all. */
    const wantProp =
      sol.prop -
      (sol.boosters
        ? sol.boosters.n * (sol.boosters.part.m - sol.boosters.part.dry)
        : 0) +
      (sol.tanks ? sol.n * sol.engine.fuelM : 0);
    if (Number.isNaN(dry))
      problems.push(`mass: stage ${i} has a part with no mass in nodes.json`);
    else if (Math.abs(dry - wantDry) > Math.max(0.03, 0.03 * wantDry))
      problems.push(
        `mass: stage ${i} dry ${dry.toFixed(3)} t in the craft, ${wantDry.toFixed(3)} in the plan`,
      );
    if (Math.abs(prop - wantProp) > Math.max(0.02, 0.02 * wantProp))
      problems.push(
        `mass: stage ${i} holds ${prop.toFixed(3)} t of propellant, the plan ${wantProp.toFixed(3)}`,
      );
    if (sol.boosters) {
      const bodies = ring.filter((p) => !holdNames.has(p.name));
      const wet = sum(bodies, (p) => dryOf(p) + propOf(p));
      const want = sol.boosters.n * sol.boosters.part.m;
      if (Math.abs(wet - want) > Math.max(0.1, 0.03 * want))
        problems.push(
          `mass: stage ${i} ring weighs ${wet.toFixed(3)} t in the craft, ${want.toFixed(3)} in the plan`,
        );
    }
  });

  /* The signature: one line a part, in file order. */
  const lines = [`## ${name}`, `  parts=${craft.parts.length}`];
  for (const p of craft.parts)
    lines.push(
      `  ${p.name} @${p.pos.map((v) => v.toFixed(3)).join(",")} r${p.rot.map((v) => v.toFixed(4)).join(",")}` +
        ` ${p.parent ? `${p.parent.via}:${craft.parts.find((q) => q.id === p.parent!.id)?.name}` : "root"}` +
        ` istg=${p.stage.ignite ?? -1} dstg=${p.stage.drop} sym=${p.symmetry.length}` +
        (p.resources.length
          ? ` ${p.resources.map((r) => `${r.name}=${r.amount}`).join(" ")}`
          : ""),
    );
  return { problems, signature: lines.join("\n") + "\n", craft };
}

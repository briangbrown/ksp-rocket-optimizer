import {
  BOOSTER_HOLD,
  STACK_JOIN,
  clusterSpan,
  ringPositions,
  stageGeom,
  tankRun,
} from "./geometry.js";
import { boosterLayout, columnsOf, radialPhase } from "./model.js";
import { stagingOf } from "./staging.js";
import { DATA } from "./catalogue.js";
import { nodesOf, commandParts } from "./nodes.js";
import type { PlanInput, PlanStage } from "./plan.js";
import type { Solution } from "./solution.js";
import type { Tank } from "./catalogue.js";
import { writeCraft } from "../craft/index.js";
import type {
  Craft,
  CraftPart,
  Quat,
  StackNode,
  Vec3,
} from "../craft/index.js";
import type { PartNodes } from "./nodes.js";

/* The one place the solver's rocket and the craft file's meet: a delivered
   plan in, a `Craft` out. This is the only module that imports `src/craft/`
   (test/boundaries.test.ts), and `src/craft/` knows nothing of what is here.
   #460, #464

   Placement is the model's — the same `stageGeom`, `columnsOf`, `ringPositions`
   and `boosterLayout` that `modelOf` draws the rocket from decide where every
   part stands in the plan, so the craft cannot disagree with the picture — and
   the heights are the nodes'. KSP trusts `pos` on load and re-derives nothing,
   so along the stack each part sits where its top node meets the node above:
   `child.pos.y = parent.pos.y + parent.node.y − child.node.y`, from
   `nodes.json`. The drag cube the model stacks by is the part's box, which
   overhangs its nodes by the lip (`.claude/rules/part-data.md`), so the model's
   heights run a few centimetres a part over these; test/craft-adapter.test.ts
   holds the two to that.

   The tree is the game's: the command part at the top is the root and every
   part's parent is the one that holds it, so the links run downward through
   the stack — root, decoupler, tanks, adapters, coupler, engines, the next
   stage's decoupler — and outward to whatever is bolted on. */

type Vec = [number, number, number];

/* ------------------------------------------------------------ rotation */
const I: Quat = [0, 0, 0, 1];
/* Unity's left-handed turn about y: x̂ goes to (cos θ, 0, −sin θ). */
const aboutY = (th: number): Quat => [0, Math.sin(th / 2), 0, Math.cos(th / 2)];
/* Upside down: a half turn about z, for a coupler used as a rejoin. */
const FLIP: Quat = [0, 0, 1, 0];
const rotate = (q: Quat, v: Vec3): Vec => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  /* q v q*, expanded. */
  const tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
};
/* The turn about y that points a part's horizontal direction `d` along the
   horizontal `target`: angles measured as atan2(x, z), which the turn adds
   to. For a surface-attached part `d` is its attach node's direction — the
   outward normal at its own attach face — and the target is outward from
   the axis: the game sets the node anti-parallel to the wall it meets, so
   the part's face is toward the wall when its node points away from it.
   Pointed inward, probe 1's Thuds stood bells-out (#467). */
const faceWith = (d: Vec3, target: Vec3): Quat =>
  aboutY(Math.atan2(target[0], target[2]) - Math.atan2(d[0], d[2]));

const mm = (x: number) => Math.round(x * 1000) / 1000 || 0;
/* How high the lowest stack node stands above the VAB floor: room for the
   bell below it. The Mammoth's hangs 1.2 m past its bottom node. */
const FLOOR_CLEAR = 1.5;

/* A surface-attach node points away from what it is bolted to: the editor
   sets the node's direction along the wall's outward normal, one rule for
   every part, read off the parts the reader re-placed by hand in probe 2
   (a Twitch and a Shrimp, #467). What differs between parts is where the
   mesh sits about its node, which the game handles and we never see. */
const facing = (_title: string, outward: Vec3): Vec3 => outward;
/* Rotations to seven places: a unit quaternion to within 1e-6, and no more
   digits than the file carries, so a read-back is the same numbers. */
const q7 = (q: Quat): Quat =>
  q.map((v) => Math.round(v * 1e7) / 1e7 || 0) as unknown as Quat;
const pos3 = (x: number, y: number, z: number): Vec3 => [mm(x), mm(y), mm(z)];

/* Tonnes a unit, the game's densities, for filling an engine to what the
   plan flies it with. */
const UNIT: Record<string, number> = {
  LiquidFuel: 0.005,
  Oxidizer: 0.005,
  SolidFuel: 0.0075,
  MonoPropellant: 0.004,
  XenonGas: 0.0001,
};
const ENGINE_FUEL = new Map(DATA.engines.map((e) => [e.n, e.fuelM]));

/* What a part holds when it is placed: a tank full, as the solver sizes it;
   an engine what the part table says it carries (`fuelM`) — a solid's whole
   charge, the Twin-Boar's 32 t, and nothing where the table has nothing,
   however much the install's config puts in it. The plan is flown on the
   table, and the craft is the plan. #468 is the table against the install. */
const holdings = (title: string, info: PartNodes) => {
  const fuelM = ENGINE_FUEL.get(title);
  const entries = Object.entries(info.resources);
  if (fuelM === undefined)
    return entries.map(([name, max]) => ({ name, amount: max, max }));
  const total = entries.reduce(
    (a, [name, max]) => a + max * (UNIT[name] ?? 0),
    0,
  );
  const scale = total > 0 ? Math.min(1, fuelM / total) : 0;
  return entries.map(([name, max]) => ({
    name,
    amount: UNIT[name] ? Math.round(max * scale * 1000) / 1000 : max,
    max,
  }));
};

/* ------------------------------------------------------------- the parts */
/* Stable, distinct 32-bit ids from a part's place in the tree, so the same
   plan writes the same file (the same-link-same-result rule). */
const ids = () => {
  const taken = new Set<string>();
  return (path: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < path.length; i++) {
      h ^= path.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    let id = String(h || 1);
    while (taken.has(id)) id = String((Number(id) + 1) >>> 0 || 1);
    taken.add(id);
    return id;
  };
};

type Built = {
  part: CraftPart;
  /* Its stack nodes in world space, by id: where they are, and which way. */
  world: Record<string, { p: Vec; d: Vec }>;
  info: PartNodes;
};

class Builder {
  readonly parts: Array<Built> = [];
  readonly byId = new Map<string, Built>();
  readonly id = ids();

  info(title: string): PartNodes {
    const e = nodesOf(title);
    if (!e) throw new Error(`nodes.json has no entry for "${title}"`);
    return e;
  }

  /* A part standing at `pos` turned by `rot`, its nodes carried into the
     world. Nothing attached yet. */
  place(
    path: string,
    title: string,
    pos: Vec,
    rot: Quat,
    stage: { ignite: number | null; drop: number },
    over: { full?: boolean; entry?: PartNodes } = {},
  ): Built {
    const info = over.entry ?? this.info(title);
    const id = this.id(path);
    const world: Built["world"] = {};
    const nodes: Array<StackNode> = [];
    for (const [nid, n] of Object.entries(info.nodes)) {
      world[nid] = {
        p: rotate(rot, n.p).map((v, k) => v + pos[k]) as Vec,
        d: rotate(rot, n.d),
      };
      nodes.push({ id: nid, p: n.p, d: n.d, to: null });
    }
    const resources = over.full === false ? [] : holdings(title, info);
    const part: CraftPart = {
      id,
      name: info.name,
      pos: pos3(pos[0], pos[1], pos[2]),
      rot: q7(rot),
      parent: null,
      nodes,
      stage,
      symmetry: [],
      modules: info.modules,
      variant: info.modules.includes("ModulePartVariants")
        ? (info.variant ?? null)
        : null,
      attach: null,
      resources,
    };
    const b: Built = { part, world, info };
    this.parts.push(b);
    this.byId.set(id, b);
    return b;
  }

  /* `child` on `parent`'s stack node `pn`, by the child's node `cn`: sets
     the parent link and marks both nodes held. */
  stack(parent: Built, pn: string, child: Built, cn: string) {
    this.mark(parent, pn, child.part.id);
    this.mark(child, cn, parent.part.id);
    child.part = {
      ...child.part,
      parent: { id: parent.part.id, via: "stack" },
    };
    this.byId.set(child.part.id, child);
  }
  surface(parent: Built, child: Built) {
    child.part = {
      ...child.part,
      parent: { id: parent.part.id, via: "surface" },
      /* Its own attach node, for the long srfN form. */
      attach: child.info.attach
        ? { p: child.info.attach.p, d: child.info.attach.d }
        : null,
    };
    this.byId.set(child.part.id, child);
  }
  private mark(b: Built, nid: string, to: string) {
    if (!b.world[nid]) throw new Error(`${b.info.name} has no node "${nid}"`);
    b.part = {
      ...b.part,
      nodes: b.part.nodes.map((n) => (n.id === nid ? { ...n, to } : n)),
    };
    this.byId.set(b.part.id, b);
  }
  symmetry(group: Array<Built>) {
    for (const b of group) {
      b.part = {
        ...b.part,
        symmetry: group.filter((o) => o !== b).map((o) => o.part.id),
      };
      this.byId.set(b.part.id, b);
    }
  }

  /* The y a part must stand at for its node `nid` to meet world height `y`
     (identity or half-turn rotations only, where the node's y flips sign). */
  static yFor(info: PartNodes, nid: string, y: number, rot: Quat): number {
    const n = info.nodes[nid];
    if (!n) throw new Error(`${info.name} has no node "${nid}"`);
    return y - rotate(rot, n.p)[1];
  }
}

/* The stack nodes a coupler hands down to its engines: `bottom1…`,
   `bottom01…`, or its one `bottom`. In the order the game numbers them. */
const outputs = (info: PartNodes): Array<string> => {
  const many = Object.keys(info.nodes)
    .filter((k) => /^bottom\d+$/.test(k))
    .sort();
  return many.length ? many : info.nodes.bottom ? ["bottom"] : [];
};

/* KSP's node size for a diameter, for picking the payload's stand-in. */
const sizeOf = (dia: number) =>
  dia <= 0.7
    ? 0
    : dia <= 1.3
      ? 1
      : dia <= 1.9
        ? 1.5
        : dia <= 2.6
          ? 2
          : dia <= 3.8
            ? 3
            : 4;

/* -------------------------------------------------------------- staging */
type Stages = {
  ignite: (i: number) => number | null;
  boosterIgnite: (i: number) => number | null;
  drop: (i: number) => number;
  boosterDrop: (i: number) => number;
};
function stagesOf(stages: ReadonlyArray<PlanStage>): Stages {
  const st = stagingOf(stages);
  const find = (
    which: "ignite" | "decouple",
    stage: number,
    role: string,
  ): number | null => {
    const e = st.events.find((ev) =>
      ev[which].some((r) => r.stage === stage && r.role === role),
    );
    return e ? e.stage : null;
  };
  return {
    ignite: (i) => find("ignite", i, "engine"),
    boosterIgnite: (i) => find("ignite", i, "booster"),
    drop: (i) => find("decouple", i, "decoupler") ?? 0,
    boosterDrop: (i) => find("decouple", i, "boosterHold") ?? 0,
  };
}

/* ----------------------------------------------------------------- walk */
/* A run of tanks stacked upward from a part's top node, largest first as
   `tankRun` orders them; returns the topmost. */
function stackTanks(
  b: Builder,
  path: string,
  under: Built,
  underNode: string,
  tanks: ReadonlyArray<{ t: Tank }>,
  x: number,
  z: number,
  stage: CraftPart["stage"],
): Array<Built> {
  let below = under,
    belowNode = underNode;
  const out: Array<Built> = [];
  tanks.forEach((tk, k) => {
    const info = b.info(tk.t.n);
    const y = Builder.yFor(info, "bottom", below.world[belowNode].p[1], I);
    const t = b.place(`${path}/tank${k + 1}`, tk.t.n, [x, y, z], I, stage, {
      entry: info,
    });
    b.stack(t, "bottom", below, belowNode);
    below = t;
    belowNode = "top";
    out.push(t);
  });
  return out;
}

/* The tank of a column whose span holds height `y`: what a part bolted on
   at that height is bolted to. The nearest where none spans it. */
const tankAt = (tanks: ReadonlyArray<Built>, y: number): Built => {
  const span = (t: Built) => [
    t.world.bottom?.p[1] ?? -Infinity,
    t.world.top?.p[1] ?? Infinity,
  ];
  const hit = tanks.find((t) => {
    const [lo, hi] = span(t);
    return y >= lo - 1e-6 && y <= hi + 1e-6;
  });
  if (hit) return hit;
  return [...tanks].sort(
    (a, c) =>
      Math.abs((span(a)[0] + span(a)[1]) / 2 - y) -
      Math.abs((span(c)[0] + span(c)[1]) / 2 - y),
  )[0];
};

/* A radial holder — a TT-38K — on `wall`'s side at azimuth `a` and height
   `y`, turned to face the axis of the column at (cx, cz). Returns it. */
function holdOn(
  b: Builder,
  path: string,
  wall: Built,
  wallR: number,
  cx: number,
  cz: number,
  a: number,
  y: number,
  stage: CraftPart["stage"],
): Built {
  const info = b.info(BOOSTER_HOLD);
  const u: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  /* Faced outward: a surface node's direction is the outward normal at the
     part's own face, and the game sets it anti-parallel to the wall's —
     inward put probe 1's engines bells-out (#467). */
  const outward: Vec3 = u;
  const at = info.attach ?? {
    p: [0, 0, 0] as Vec3,
    d: [1, 0, 0] as Vec3,
    s: 1,
  };
  const rot = faceWith(at.d, facing(BOOSTER_HOLD, outward));
  /* Its attach point on the wall; the part's origin is that point less the
     attach offset, turned. */
  const ap = rotate(rot, at.p);
  const wallP: Vec = [cx + u[0] * wallR, y, cz + u[2] * wallR];
  const h = b.place(
    path,
    BOOSTER_HOLD,
    [wallP[0] - ap[0], y - ap[1], wallP[2] - ap[2]],
    rot,
    stage,
    {
      entry: info,
    },
  );
  b.surface(wall, h);
  return h;
}

/* Something bolted on by its own surface-attach node to a point in the
   world, facing inward toward (cx, cz). */
function boltOn(
  b: Builder,
  path: string,
  title: string,
  parent: Built,
  point: Vec,
  cx: number,
  cz: number,
  stage: CraftPart["stage"],
  attachY: number | null = null,
): Built {
  const info = b.info(title);
  const a = Math.atan2(point[2] - cz, point[0] - cx);
  const outward: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  const at = info.attach ?? {
    p: [0, 0, 0] as Vec3,
    d: [1, 0, 0] as Vec3,
    s: 1,
  };
  const rot =
    Math.hypot(at.d[0], at.d[2]) > 1e-6
      ? faceWith(at.d, facing(title, outward))
      : I;
  const ap = rotate(rot, at.p);
  /* The part's origin: the attach point sits at `point`, and where the
     caller wants the origin's own height set (`attachY`), the point's y is
     taken from there instead. */
  const y0 = attachY ?? point[1] - ap[1];
  const part = b.place(
    path,
    title,
    [point[0] - ap[0], y0, point[2] - ap[2]],
    rot,
    stage,
    {
      entry: info,
    },
  );
  b.surface(parent, part);
  return part;
}

/* One stage's column at (cx, cz), from its lowest part up to the top of its
   tanks. Returns the parts a caller needs to hang more on. */
type Column = {
  bottom: Built;
  bottomNode: string;
  topTank: Built;
  tankBaseY: number;
  tankTopY: number;
  tankR: number;
  tanks: Array<Built>;
  wallParts: Array<Built>;
};

function buildColumn(
  b: Builder,
  path: string,
  sol: Solution,
  g: ReturnType<typeof stageGeom>,
  cx: number,
  cz: number,
  th: number,
  yBottom: number,
  stage: CraftPart["stage"],
  engineStage: CraftPart["stage"],
  centre: boolean,
): Column {
  const e = sol.engine;
  const radial = g.radial;
  let bottom: Built | null = null,
    bottomNode = "";
  let below: Built | null = null,
    belowNode = "";
  let y = yBottom;

  if (!radial) {
    if (sol.coupler && g.perEng > 1) {
      /* Engines under a coupler's output nodes; the rejoin, where the stage
         has one, is the same coupler upside down beneath them. */
      const cInfo = b.info(sol.coupler.n);
      let outs = outputs(cInfo);
      /* An engine plate makes its engine nodes at run time (ModuleDynamicNodes),
         so the config carries only `top` and `bottom`. Its engines stand where
         the model's cluster rule puts them, on nodes named as the game names
         the plate's, `bottom01…`; whether the game takes them as written is
         probe 4 of #467. */
      const plate = !!sol.coupler.plate && outs.length < g.perEng;
      if (plate)
        outs = Array.from(
          { length: g.perEng },
          (_, k) => `bottom${String(k + 1).padStart(2, "0")}`,
        );
      if (outs.length < g.perEng)
        throw new Error(
          `${sol.coupler.n} has ${outs.length} outputs for ${g.perEng} engines`,
        );
      const eInfo = b.info(e.n);
      const eSpan =
        eInfo.nodes.top.p[1] -
        (eInfo.nodes.bottom?.p[1] ?? eInfo.nodes.top.p[1] - g.engine);
      let rejoin: Built | null = null;
      if (sol.rejoin && centre) {
        const rInfo = b.info(sol.rejoin.n);
        /* Flipped: its `top` faces down and is the stage's bottom node. */
        const ry = Builder.yFor(rInfo, "top", y, FLIP);
        rejoin = b.place(
          `${path}/rejoin`,
          sol.rejoin.n,
          [cx, ry, cz],
          FLIP,
          stage,
          { entry: rInfo },
        );
        bottom = rejoin;
        bottomNode = "top";
        y = Math.max(...outputs(rInfo).map((o) => rejoin!.world[o].p[1]));
      }
      const engineTop = y + eSpan;
      const cy = Builder.yFor(cInfo, plate ? "bottom" : outs[0], engineTop, I);
      const coupler = b.place(
        `${path}/coupler`,
        sol.coupler.n,
        [cx, cy, cz],
        I,
        stage,
        { entry: cInfo },
      );
      if (plate) {
        const spread = (clusterSpan(g.perEng, g.ed) - g.ed) / 2;
        const bottom = cInfo.nodes.bottom ?? {
          p: [0, 0, 0] as Vec3,
          d: [0, -1, 0] as Vec3,
          s: 1,
        };
        const made: Array<StackNode> = [];
        ringPositions(g.perEng).forEach(([ux, uz], k) => {
          const p: Vec3 = [mm(ux * spread), bottom.p[1], mm(uz * spread)];
          coupler.world[outs[k]] = {
            p: [cx + p[0], cy + p[1], cz + p[2]],
            d: [0, -1, 0],
          };
          made.push({ id: outs[k], p, d: [0, -1, 0], to: null });
        });
        coupler.part = {
          ...coupler.part,
          nodes: [...coupler.part.nodes, ...made],
        };
        b.byId.set(coupler.part.id, coupler);
      }
      const engines: Array<Built> = [];
      outs.slice(0, g.perEng).forEach((o, k) => {
        const w = coupler.world[o].p;
        const ey = Builder.yFor(eInfo, "top", w[1], I);
        const eng = b.place(
          `${path}/engine${k}`,
          e.n,
          [w[0], ey, w[2]],
          I,
          engineStage,
          { entry: eInfo },
        );
        b.stack(coupler, o, eng, "top");
        if (rejoin) {
          const ro = outputs(rejoin.info)[k];
          if (ro && eInfo.nodes.bottom) b.stack(eng, "bottom", rejoin, ro);
        }
        engines.push(eng);
      });
      if (engines.length > 1) b.symmetry(engines);
      if (!bottom) {
        bottom = engines[0];
        bottomNode = "bottom";
      }
      below = coupler;
      belowNode = "top";
    } else {
      /* One engine on the axis. */
      const eInfo = b.info(e.n);
      const ey = eInfo.nodes.bottom
        ? Builder.yFor(eInfo, "bottom", y, I)
        : Builder.yFor(eInfo, "top", y + g.engine, I);
      const eng = b.place(`${path}/engine`, e.n, [cx, ey, cz], I, engineStage, {
        entry: eInfo,
      });
      bottom = eng;
      bottomNode = eInfo.nodes.bottom ? "bottom" : "top";
      below = eng;
      belowNode = "top";
    }
    for (const [k, a] of (sol.adapters?.parts ?? []).entries()) {
      const aInfo = b.info(a.n);
      const ay = Builder.yFor(aInfo, "bottom", below!.world[belowNode].p[1], I);
      const ad = b.place(`${path}/adapter${k}`, a.n, [cx, ay, cz], I, stage, {
        entry: aInfo,
      });
      b.stack(ad, "bottom", below!, belowNode);
      below = ad;
      belowNode = "top";
    }
  }

  /* The tanks: a plain run, or the centre of a packed ring with the levels
     that moved out of it taken away. */
  const run = tankRun(g.S > 1 ? sol.perStack : sol.tanks);
  let centreRun = run;
  if (sol.packed) {
    let take = sol.packed.r * sol.packed.levels;
    centreRun = run.filter((tk) => {
      if (take > 0 && tk.t.n === sol.packed!.tank.n) {
        take--;
        return false;
      }
      return true;
    });
  }
  let tankBase: Built;
  let tankBaseNode: string;
  if (below) {
    tankBase = below;
    tankBaseNode = belowNode;
  } else {
    /* A radial engine's stage: the tanks start the column. */
    if (!centreRun.length)
      throw new Error("a stage with no tank to start its column");
    const info = b.info(centreRun[0].t.n);
    const ty = Builder.yFor(info, "bottom", y, I);
    tankBase = b.place(
      `${path}/tank0`,
      centreRun[0].t.n,
      [cx, ty, cz],
      I,
      stage,
      { entry: info },
    );
    bottom = tankBase;
    bottomNode = "bottom";
    tankBaseNode = "top";
    centreRun = centreRun.slice(1);
  }
  /* Where the tanks start: the top of what is under them, or the bottom of
     the first tank where nothing is. */
  const tankBaseY = below
    ? tankBase.world[tankBaseNode].p[1]
    : (tankBase.world.bottom?.p[1] ?? tankBase.world[tankBaseNode].p[1]);
  const stacked = stackTanks(
    b,
    path,
    tankBase,
    tankBaseNode,
    centreRun,
    cx,
    cz,
    stage,
  );
  const tanks = below ? stacked : [tankBase, ...stacked];
  const topTank = tanks.length ? tanks[tanks.length - 1] : tankBase;
  const wallParts: Array<Built> = [];

  /* Radial engines on the lowest tank's wall, half a step round from the
     boosters, as the model draws them. */
  if (radial) {
    const first = tanks[0] ?? tankBase;
    const R = Math.max(g.td, g.pack ? g.pack.w : 0) / 2;
    const group: Array<Built> = [];
    for (let j = 0; j < g.perEng; j++) {
      const a = radialPhase(sol, g).phase + (j / g.perEng) * 2 * Math.PI + th;
      /* Its attach node is at its origin, on the wall — the model's shape,
         a bell of radius r outboard of it, is what hangs off that point.
         Placed at the bell's centre the Twitches of probe 2 stood 17 cm off
         the tank (#467). */
      const point: Vec = [
        cx + Math.cos(a) * R,
        tankBaseY + Math.min(0.3, g.engineH / 2),
        cz + Math.sin(a) * R,
      ];
      group.push(
        boltOn(b, `${path}/radial${j}`, e.n, first, point, cx, cz, engineStage),
      );
    }
    if (group.length > 1) b.symmetry(group);
    wallParts.push(...group);
  }

  return {
    bottom: bottom!,
    bottomNode,
    topTank,
    tankBaseY,
    tankTopY: topTank.world.top?.p[1] ?? tankBaseY,
    tankR: g.td / 2,
    tanks,
    wallParts,
  };
}

/* ------------------------------------------------------------ the craft */
function craftOf(
  stages: ReadonlyArray<PlanStage>,
  input: Pick<PlanInput, "payload" | "payloadDia" | "expansions">,
  name: string,
  destination: string,
): Craft {
  const b = new Builder();
  const st = stagesOf(stages);
  const solved = stages
    .map((s, i) => ({ i, sol: s.sol }))
    .filter((s): s is { i: number; sol: Solution } => s.sol !== null);

  /* Bottom up along the axis: each stage's top is the next one's floor. */
  let y = 0;
  let belowTop: { part: Built; node: string } | null = null;
  for (const { i, sol } of solved) {
    const g = stageGeom(sol);
    const stage = { ignite: null, drop: st.drop(i) };
    const engineStage = { ignite: st.ignite(i), drop: st.drop(i) };
    const columns = columnsOf(g.S, g.ringR);
    const built: Array<Column> = [];
    columns.forEach(([cx, cz, th], k) => {
      built.push(
        buildColumn(
          b,
          `s${i}/c${k}`,
          sol,
          g,
          cx,
          cz,
          th,
          y,
          stage,
          engineStage,
          k === 0,
        ),
      );
    });
    const core = built[0];
    /* The stage below hangs from this stage's bottom node. */
    if (belowTop)
      b.stack(core.bottom, core.bottomNode, belowTop.part, belowTop.node);
    /* Ring columns are struts on the core's top tank, two each. */
    for (let k = 1; k < built.length; k++) {
      const col = built[k];
      const [cx, cz] = columns[k];
      const a = Math.atan2(cz, cx);
      const yj = (col.tankBaseY + col.tankTopY) / 2;
      const s1 = boltOn(
        b,
        `s${i}/join${k}a`,
        STACK_JOIN,
        tankAt(core.tanks, yj),
        [Math.cos(a) * core.tankR, yj, Math.sin(a) * core.tankR],
        0,
        0,
        stage,
      );
      /* The column hangs from its top tank — the root of its own chain,
         since the chain was built with each part holding the one below. */
      b.surface(s1, col.topTank);
      boltOn(
        b,
        `s${i}/join${k}b`,
        STACK_JOIN,
        tankAt(col.tanks, yj + 0.4),
        [cx - Math.cos(a) * col.tankR, yj + 0.4, cz - Math.sin(a) * col.tankR],
        cx,
        cz,
        stage,
      );
    }
    /* A packed ring: `r` tanks a level, `levels` deep, about the core's tank
       run — each tank its own part on a TT-38K from the core tank beside it,
       with a strut bracing it, which is what the plan bills (`cols` holders,
       one a tank, in geometry.ts). The tanks of a column stand node to node
       but hang from the core, not from each other. */
    if (sol.packed && g.pack) {
      const pk = sol.packed;
      const rk = (pk.width - g.td) / 2;
      const ringBase =
        core.tankBaseY +
        Math.max(
          0,
          g.tank - (pk.spare || 0) * g.pack.levelH - pk.levels * g.pack.levelH,
        );
      const tInfo = b.info(pk.tank.n);
      let levelBase = ringBase;
      for (let L = 0; L < pk.levels; L++) {
        const level: Array<Built> = [];
        const ty = Builder.yFor(tInfo, "bottom", levelBase, I);
        for (let r = 0; r < pk.r; r++) {
          const a = (r / pk.r) * 2 * Math.PI;
          const x = Math.cos(a) * rk,
            z = Math.sin(a) * rk;
          const rot = tInfo.attach
            ? faceWith(
                tInfo.attach.d,
                facing(pk.tank.n, [Math.cos(a), 0, Math.sin(a)]),
              )
            : I;
          const tank = b.place(
            `s${i}/pack${L}/${r}`,
            pk.tank.n,
            [x, ty, z],
            rot,
            stage,
            {
              entry: tInfo,
            },
          );
          const holdY = ty + (tInfo.attach?.p[1] ?? 0);
          const hold = holdOn(
            b,
            `s${i}/pack${L}/${r}/hold`,
            tankAt(core.tanks, holdY),
            core.tankR,
            0,
            0,
            a,
            holdY,
            stage,
          );
          b.surface(hold, tank);
          boltOn(
            b,
            `s${i}/pack${L}/${r}/brace`,
            STACK_JOIN,
            tank,
            [
              x - Math.cos(a) * (g.td / 2),
              ty + (tank.world.top?.p[1] ?? ty) - ty - 0.1,
              z - Math.sin(a) * (g.td / 2),
            ],
            x,
            z,
            stage,
          );
          level.push(tank);
        }
        if (level.length > 1) b.symmetry(level);
        levelBase = level[0].world.top?.p[1] ?? levelBase + g.pack.levelH;
      }
    }
    /* Boosters round the outside, on TT-38Ks at the height their own
       attach node asks for. */
    if (sol.boosters) {
      const bs = sol.boosters;
      const lay = boosterLayout(sol, g, core.tankBaseY);
      const bStage = { ignite: st.boosterIgnite(i), drop: st.boosterDrop(i) };
      const holdStage = { ignite: st.boosterDrop(i), drop: st.boosterDrop(i) };
      const holds: Array<Built> = [];
      const bodies: Array<Built> = [];
      for (let k = 0; k < bs.n; k++) {
        const a = (k / bs.n) * 2 * Math.PI;
        const x = Math.cos(a) * lay.br,
          z = Math.sin(a) * lay.br;
        const col = bs.part.column;
        if (!col) {
          /* A solid: one part, its bottom node at the foot, held at its
             own attach node's height. */
          const info = b.info(bs.part.n);
          const by = info.nodes.bottom
            ? Builder.yFor(info, "bottom", lay.foot, I)
            : lay.foot;
          const at = info.attach ?? {
            p: [0, 0, 0] as Vec3,
            d: [0, 0, 1] as Vec3,
            s: 1,
          };
          const rot =
            Math.hypot(at.d[0], at.d[2]) > 1e-6
              ? faceWith(at.d, facing(bs.part.n, [Math.cos(a), 0, Math.sin(a)]))
              : I;
          const body = b.place(
            `s${i}/boost${k}`,
            bs.part.n,
            [x, by, z],
            rot,
            bStage,
            { entry: info },
          );
          const attachY = by + rotate(rot, at.p)[1];
          const hold = holdOn(
            b,
            `s${i}/boost${k}/hold`,
            tankAt(core.tanks, attachY),
            lay.hold / 2,
            0,
            0,
            a,
            attachY,
            holdStage,
          );
          b.surface(hold, body);
          holds.push(hold);
          bodies.push(body);
          continue;
        }
        /* A liquid column or drop tank: an engine where it has one, then
           its tanks, held at the lowest tank's middle. */
        let under: Built | null = null,
          underNode = "";
        let yy = lay.foot;
        if (lay.eh > 0) {
          const eInfo = b.info(bs.part.n);
          const ey = eInfo.nodes.bottom
            ? Builder.yFor(eInfo, "bottom", yy, I)
            : Builder.yFor(eInfo, "top", yy + lay.eh, I);
          under = b.place(
            `s${i}/boost${k}/engine`,
            bs.part.n,
            [x, ey, z],
            I,
            bStage,
            { entry: eInfo },
          );
          underNode = "top";
          yy = under.world.top.p[1];
        }
        const run = tankRun(col);
        if (!run.length) throw new Error("a booster column with no tanks");
        const tInfo = b.info(run[0].t.n);
        const ty = Builder.yFor(tInfo, "bottom", yy, I);
        const first = b.place(
          `s${i}/boost${k}/tank0`,
          run[0].t.n,
          [x, ty, z],
          I,
          bStage,
          { entry: tInfo },
        );
        if (under) b.stack(first, "bottom", under, underNode);
        const above = stackTanks(
          b,
          `s${i}/boost${k}`,
          first,
          "top",
          run.slice(1),
          x,
          z,
          bStage,
        );
        const top = above.length ? above[above.length - 1] : first;
        const at = top.info.attach ?? {
          p: [g.td / 2, 0, 0] as Vec3,
          d: [1, 0, 0] as Vec3,
          s: 1,
        };
        /* Turn the whole column so its tanks' attach nodes point outward and their faces meet the hold —
           their nodes are on the axis, so nothing moves — and hold it by its
           top tank, the root of its chain, at that tank's attach height. */
        const rot = faceWith(
          at.d,
          facing(top.info.name, [Math.cos(a), 0, Math.sin(a)]),
        );
        for (const part of [under, first, ...above])
          if (part) {
            part.part = { ...part.part, rot: q7(rot) };
            b.byId.set(part.part.id, part);
          }
        const attachY = top.part.pos[1] + at.p[1];
        const hold = holdOn(
          b,
          `s${i}/boost${k}/hold`,
          tankAt(core.tanks, attachY),
          lay.hold / 2,
          0,
          0,
          a,
          attachY,
          holdStage,
        );
        b.surface(hold, top);
        holds.push(hold);
        bodies.push(top);
      }
      if (holds.length > 1) {
        b.symmetry(holds);
        b.symmetry(bodies);
      }
    }
    /* The decoupler at the top of the stage, on the axis; none where the
       plate above makes the joint. */
    let top: { part: Built; node: string } = {
      part: core.topTank,
      node: "top",
    };
    if (sol.decoupler?.n) {
      const dInfo = b.info(sol.decoupler.n);
      const dy = Builder.yFor(dInfo, "bottom", core.tankTopY, I);
      const dec = b.place(
        `s${i}/decoupler`,
        sol.decoupler.n,
        [0, dy, 0],
        I,
        { ignite: st.drop(i), drop: st.drop(i) },
        { entry: dInfo },
      );
      b.stack(dec, "bottom", core.topTank, "top");
      top = { part: dec, node: "top" };
    }
    belowTop = top;
    y = top.part.world[top.node].p[1];
  }

  /* The root: a command part standing in for the payload, at the top. */
  const dia = input.payloadDia || 1.25;
  const want = sizeOf(dia);
  const cands = commandParts()
    .filter(([, e]) => e.nodes.bottom)
    .sort(
      ([, a], [, c]) =>
        Math.abs((a.nodes.bottom.s ?? 1) - want) -
          Math.abs((c.nodes.bottom.s ?? 1) - want) || a.mass - c.mass,
    );
  if (!cands.length) throw new Error("nodes.json has no command part");
  const [rootTitle, rootInfo] = cands[0];
  const ry = Builder.yFor(rootInfo, "bottom", y, I);
  const root = b.place(
    "root",
    rootTitle,
    [0, ry, 0],
    I,
    { ignite: null, drop: 0 },
    { entry: rootInfo },
  );
  if (belowTop) b.stack(root, "bottom", belowTop.part, belowTop.node);

  /* Built from the bottom, but held from the top: every `stack` call named
     the upper part as the parent, so the tree already runs from the root
     down, as the game's does. Root first, as the file wants. */
  const parts = b.parts.map((p) => p.part);
  parts.sort((a, c) =>
    a.id === root.part.id ? -1 : c.id === root.part.id ? 1 : 0,
  );

  /* Stand it on the floor. The editor's origin is the VAB floor, and a
     craft hung from a root at the editor's spawn height ran seven metres
     under it on probe 3, the Thumpers' tops just showing (#467). The lowest
     stack node goes a bell's length above y = 0, since an engine hangs past
     its bottom node by up to about that. */
  let lowest = Infinity;
  for (const p of b.parts)
    for (const w of Object.values(p.world)) lowest = Math.min(lowest, w.p[1]);
  const shift = Number.isFinite(lowest)
    ? FLOOR_CLEAR - lowest
    : 15 - root.part.pos[1];
  const shifted = parts.map((p) => ({
    ...p,
    pos: pos3(p.pos[0], p.pos[1] + shift, p.pos[2]),
  }));

  const needs: Array<string> = [];
  if (input.expansions?.rs) needs.push("ReStock and ReStock+");
  if (input.expansions?.mh) needs.push("Making History");
  const description =
    `${destination}, by the KSP rocket optimizer. ` +
    `Add your ${input.payload} t payload on the top node; the ${rootTitle} stands in for it.` +
    (needs.length
      ? ` Needs ${needs.join(" and ")} installed — the game drops parts it does not know without a word.`
      : "");

  return {
    name,
    description,
    hangar: "VAB",
    vesselType: "Probe",
    parts: shifted,
  };
}

/* The file itself, for the application: the one door into `src/craft/` is
   this module, so the writer is reached through it rather than imported by
   the UI (test/boundaries.test.ts). Throws a CraftError on a craft the game
   would not load. */
const craftFile = (
  stages: ReadonlyArray<PlanStage>,
  input: Pick<PlanInput, "payload" | "payloadDia" | "expansions">,
  name: string,
  destination: string,
): string => writeCraft(craftOf(stages, input, name, destination));

export { craftFile, craftOf };

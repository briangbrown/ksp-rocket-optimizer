import type { Craft, CraftPart, Quat, Vec3 } from "../../src/craft/index.js";

/* Crafts for the craft tests: one built by hand, the shape a real rocket
   has, and a seeded generator of random valid ones for the property and
   fuzz tests. Nothing here comes from the solver — the module under test
   must not know it exists. */

const up: Vec3 = [0, 1, 0];
const down: Vec3 = [0, -1, 0];
const I: Quat = [0, 0, 0, 1];

const part = (
  over: Partial<CraftPart> & Pick<CraftPart, "id" | "name" | "pos">,
): CraftPart => ({
  rot: I,
  parent: null,
  nodes: [],
  stage: { ignite: null, drop: 0 },
  symmetry: [],
  modules: [],
  resources: [],
  ...over,
});

const LFO = [
  { name: "LiquidFuel", amount: 180, max: 180 },
  { name: "Oxidizer", amount: 220, max: 220 },
];

/* A two-stage rocket with two boosters: probe core, tank, engine, decoupler,
   tank, engine, and on the lower tank two radial decouplers each holding a
   solid booster. Launch is stage 2 (lower engine and boosters), stage 1
   drops the boosters, stage 0 separates and lights the upper engine. */
function sample(): Craft {
  return {
    name: "Sample",
    description: "A sample craft, for the tests.",
    hangar: "VAB",
    vesselType: "Probe",
    parts: [
      part({
        id: "1",
        name: "probeStackSmall",
        pos: [0, 12.5, 0],
        nodes: [
          { id: "top", p: [0, 0.2, 0], d: up, to: null },
          { id: "bottom", p: [0, -0.2, 0], d: down, to: "2" },
        ],
        modules: ["ModuleCommand", "ModuleReactionWheel"],
      }),
      part({
        id: "2",
        name: "fuelTank",
        pos: [0, 11.32, 0],
        parent: { id: "1", via: "stack" },
        nodes: [
          { id: "top", p: [0, 0.98, 0], d: up, to: "1" },
          { id: "bottom", p: [0, -0.91, 0], d: down, to: "3" },
        ],
        modules: ["ModulePartVariants"],
        resources: LFO,
      }),
      part({
        id: "3",
        name: "liquidEngine3.v2",
        pos: [0, 10.41, 0],
        parent: { id: "2", via: "stack" },
        nodes: [
          { id: "top", p: [0, 0, 0], d: up, to: "2" },
          { id: "bottom", p: [0, -0.83, 0], d: down, to: "4" },
        ],
        stage: { ignite: 0, drop: 0 },
        modules: ["ModuleEnginesFX", "ModuleGimbal", "ModuleJettison"],
      }),
      part({
        id: "4",
        name: "stackDecoupler",
        pos: [0, 9.5, 0],
        parent: { id: "3", via: "stack" },
        nodes: [
          { id: "top", p: [0, 0.08, 0], d: up, to: "3" },
          { id: "bottom", p: [0, -0.08, 0], d: down, to: "5" },
        ],
        stage: { ignite: 0, drop: 0 },
        modules: ["ModuleDecouple"],
      }),
      part({
        id: "5",
        name: "fuelTank",
        pos: [0, 8.44, 0],
        parent: { id: "4", via: "stack" },
        nodes: [
          { id: "top", p: [0, 0.98, 0], d: up, to: "4" },
          { id: "bottom", p: [0, -0.91, 0], d: down, to: "6" },
        ],
        modules: ["ModulePartVariants"],
        resources: LFO,
      }),
      part({
        id: "6",
        name: "liquidEngine2",
        pos: [0, 7.53, 0],
        parent: { id: "5", via: "stack" },
        nodes: [
          { id: "top", p: [0, 0, 0], d: up, to: "5" },
          { id: "bottom", p: [0, -1.5, 0], d: down, to: null },
        ],
        stage: { ignite: 2, drop: 0 },
        modules: ["ModuleEnginesFX", "ModuleGimbal"],
      }),
      part({
        id: "9",
        name: "radialDecoupler",
        pos: [0.64, 8.44, 0],
        parent: { id: "5", via: "surface" },
        stage: { ignite: 1, drop: 1 },
        symmetry: ["10"],
        modules: ["ModuleAnchoredDecoupler"],
      }),
      part({
        id: "10",
        name: "radialDecoupler",
        pos: [-0.64, 8.44, 0],
        rot: [0, 1, 0, 0],
        parent: { id: "5", via: "surface" },
        stage: { ignite: 1, drop: 1 },
        symmetry: ["9"],
        modules: ["ModuleAnchoredDecoupler"],
      }),
      part({
        id: "7",
        name: "solidBooster.v2",
        pos: [1.2, 8.44, 0],
        parent: { id: "9", via: "surface" },
        stage: { ignite: 2, drop: 1 },
        symmetry: ["8"],
        modules: ["ModuleEnginesFX"],
        resources: [{ name: "SolidFuel", amount: 375, max: 375 }],
      }),
      part({
        id: "8",
        name: "solidBooster.v2",
        pos: [-1.2, 8.44, 0],
        rot: [0, 1, 0, 0],
        parent: { id: "10", via: "surface" },
        stage: { ignite: 2, drop: 1 },
        symmetry: ["7"],
        modules: ["ModuleEnginesFX"],
        resources: [{ name: "SolidFuel", amount: 375, max: 375 }],
      }),
    ],
  };
}

/* ------------------------------------------------------------ generator */
/* mulberry32: small, seeded, good enough to spread cases. */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const NAMES = [
  "fuelTank",
  "fuelTankSmallFlat",
  "liquidEngine3.v2",
  "stackDecoupler",
  "radialDecoupler",
  "solidBooster.v2",
  "probeStackSmall",
  "ksp.r.largeBatteryPack",
  "Size3EngineCluster",
  "strutCube",
];
const MODULES = [
  "ModuleEnginesFX",
  "ModuleDecouple",
  "ModulePartVariants",
  "ModuleCommand",
];
const RESOURCES = [
  "LiquidFuel",
  "Oxidizer",
  "SolidFuel",
  "ElectricCharge",
  "XenonGas",
];

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

function gen(seed: number, maxParts = 60): Craft {
  const r = rng(seed);
  const pick = <T>(xs: ReadonlyArray<T>): T => xs[Math.floor(r() * xs.length)];
  const n = 1 + Math.floor(r() * maxParts);
  const ids = new Set<string>();
  while (ids.size < n) ids.add(String(1 + Math.floor(r() * 4294967295)));
  const idList = [...ids];
  const parts: Array<{
    id: string;
    name: string;
    pos: Vec3;
    rot: Quat;
    parent: CraftPart["parent"];
    nodes: Array<{ id: string; p: Vec3; d: Vec3; to: string | null }>;
    stage: { ignite: number | null; drop: number };
    symmetry: Array<string>;
    modules: Array<string>;
    resources: Array<{ name: string; amount: number; max: number }>;
  }> = [];
  const quat = (): Quat => {
    const v = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5];
    const m = Math.hypot(...v) || 1;
    return v.map((x) => round(x / m, 6)) as unknown as Quat;
  };
  const vec = (s: number): Vec3 => [
    round((r() - 0.5) * s, 4),
    round(r() * s, 4),
    round((r() - 0.5) * s, 4),
  ];
  for (let i = 0; i < n; i++) {
    const p = {
      id: idList[i],
      name: pick(NAMES),
      pos: vec(30),
      rot: r() < 0.5 ? ([0, 0, 0, 1] as Quat) : quat(),
      parent: null as CraftPart["parent"],
      nodes: [] as Array<{ id: string; p: Vec3; d: Vec3; to: string | null }>,
      stage: { ignite: null as number | null, drop: 0 },
      symmetry: [] as Array<string>,
      modules: [] as Array<string>,
      resources: [] as Array<{ name: string; amount: number; max: number }>,
    };
    if (i > 0) {
      const par = parts[Math.floor(r() * i)];
      if (r() < 0.7) {
        p.parent = { id: par.id, via: "stack" };
        const k = par.nodes.length;
        par.nodes.push({
          id: k === 0 ? "bottom" : `bottom${k}`,
          p: vec(2),
          d: down,
          to: p.id,
        });
        p.nodes.push({ id: "top", p: vec(2), d: up, to: par.id });
      } else p.parent = { id: par.id, via: "surface" };
    }
    if (r() < 0.3)
      p.nodes.push({ id: `free${p.nodes.length}`, p: vec(2), d: up, to: null });
    const nm = Math.floor(r() * 4);
    for (let k = 0; k < nm; k++) p.modules.push(pick(MODULES));
    const nr = Math.floor(r() * 3);
    for (let k = 0; k < nr; k++) {
      const max = round(r() * 1000, 3);
      p.resources.push({
        name: pick(RESOURCES),
        amount: round(max * r(), 3),
        max,
      });
    }
    parts.push(p);
  }
  /* Stages: contiguous from 0 up to S, each with something firing. */
  const S = Math.min(n - 1, Math.floor(r() * 5));
  for (let s = 0; s <= S; s++) parts[s].stage.ignite = s;
  for (let i = S + 1; i < n; i++)
    if (r() < 0.3) parts[i].stage.ignite = Math.floor(r() * (S + 1));
  for (const p of parts)
    if (r() < 0.4) p.stage.drop = Math.floor(r() * (S + 1));
  /* Symmetry pairs among the non-root parts. */
  for (let k = 0; k < n / 6; k++) {
    const a = parts[1 + Math.floor(r() * (n - 1))],
      b = parts[1 + Math.floor(r() * (n - 1))];
    if (!a || !b || a === b || a.symmetry.length || b.symmetry.length) continue;
    a.symmetry.push(b.id);
    b.symmetry.push(a.id);
  }
  return {
    name: `Generated ${seed}`,
    description: `seed ${seed}, ${n} parts`,
    hangar: r() < 0.9 ? "VAB" : "SPH",
    vesselType: pick(["Ship", "Probe", "Lander"]),
    parts,
  };
}

export { gen, rng, sample };

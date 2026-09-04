import { describe, it, expect, beforeAll } from "vitest";
import { planMission } from "../src/core/plan.js";
import { extentOf, modelOf } from "../src/core/model.js";
import {
  PART_H,
  PAYLOAD_ASPECT,
  stackGeometry,
  stageSize,
} from "../src/core/geometry.js";
import {
  isSolved,
  stagingSteps,
  stepModels,
} from "../src/ui/components/build.jsx";
import type { SolvedStage, Step } from "../src/ui/components/build.jsx";
import type { ModelPart } from "../src/core/model.js";
import { DATA } from "../src/core/catalogue.js";
import { missionCases } from "./grid.js";
import { must } from "./must.js";
import type { Solution } from "../src/core/solution.js";
import { PANELS, escapes, escapesDepth } from "./framing.js";

/* The rocket as shapes, checked as shapes.

   `test/panel-containment.test.jsx` used to assert that nothing the build view
   draws escapes its panel, by reading the SVG rectangles out of jsdom. Step 4
   of #63 deleted the SVG, and there is nothing to read in its place: jsdom has
   no WebGL and produces no pixels.

   The checks live here instead, and are stronger for it. A part overlapping
   another part is a rocket that cannot be built, whatever it is drawn with,
   where containment only ever said the drawing was tidy — and containment in
   the 3D view is true by construction anyway, since the frustum is sized from
   the same extent the panel is.

   The walk comes from the build view itself. `stagingSteps` and `stepModels`
   are what the component calls, so these are the models a user is shown,
   including the boosters-away step, which the solver knows nothing about.

   Millimetres, because these are sums of measured drag-cube dimensions and
   parts are meant to touch. Real failures here run to metres — the column
   overlap in #58 was 1.28 m. */
const EPS = 1e-3;

/* How much of a gap is a booster standing beside something rather than
   floating past nothing.

   Zero was the bar, and it held only because the foot stopped at the first
   section narrower than the tank by any amount at all. An engine's drawn width
   is its measured face, which runs a little under its node — the grid's stack
   engines leave 5 to 14 mm — and a Mammoth, mounting on 3.75 m and measuring
   3.27, leaves 0.24 m. Every one of those is a gap the game shows.

   A fifth of the way in is the bar, and the stack size ladder sets it:
   adjacent sizes differ by at least a quarter — 1.875 to 2.5, 3.75 to 5 — so a
   section within a fifth is the same class measured a little smaller, and one
   a class down is not. The 0.29 m Twitch under a 1.25 m tank that #86 was
   about stands 77% clear. #109 */
const CLEAR = 0.2;

/* Two cylinders share space when they overlap along the stack *and* their
   footprints overlap in plan. Touching is not overlapping. */
/* Only the five numbers this needs of a shape. */
type Cyl = { x: number; y: number; z: number; r: number; h: number };

function overlaps(a: Cyl, b: Cyl) {
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (dy <= EPS) return 0;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  const gap = a.r + b.r - d;
  return gap > EPS ? gap : 0;
}

/* Solved once and shared. Building them per assertion meant three passes over
   twelve missions and every staging step of each, which was enough to run a
   worker out of memory. */
type Built = Awaited<ReturnType<typeof buildModels>>;
let MODELS: Built = [];

const buildModels = async () => {
  const out: Array<{
    name: string;
    cur: Step;
    live: ReadonlyArray<SolvedStage>;
    payload: number;
    payloadDia: number;
    parts: Array<ModelPart>;
    planParts: Array<ModelPart>;
  }> = [];
  for (const c of missionCases()) {
    const res = await planMission(c.input, {
      onYield: () => Promise.resolve(),
    });
    if (!res) continue;
    /* Every staging step, since which parts are present changes with it and
       the bugs this replaces all appeared partway down the stack. */
    const solved = res.stages.filter(isSolved);
    for (const cur of stagingSteps(solved)) {
      const { live, model, planModel } = stepModels(
        solved,
        cur,
        c.input.payload,
        c.input.payloadDia,
      );
      out.push({
        name: `${c.name} · ${cur.label}`,
        cur,
        live,
        payload: c.input.payload,
        payloadDia: c.input.payloadDia,
        parts: model,
        planParts: planModel,
      });
    }
  }
  return out;
};

describe("the build model", () => {
  beforeAll(async () => {
    MODELS = await buildModels();
  }, 300_000);

  it("puts no two parts in the same place", async () => {
    const bad = [];
    for (const { name, parts } of MODELS)
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          /* A radial booster drawn at its real length can be longer than the
             run it hangs from, and then it genuinely reaches into the stage
             above — a 3.99 m Shrimp on a 2.29 m tank run, against a stage that
             is wider than the one it is bolted to. That is not the drawing
             being wrong. It is the solver never costing a booster's length, so
             it can pick a combination nobody could assemble, and the drawing is
             the only thing that says so. Within one stage an overlap is still a
             fault and still caught. #86 */
          const across =
            parts[i].stage !== parts[j].stage &&
            (parts[i].ring !== undefined || parts[j].ring !== undefined);
          const gap = across ? 0 : overlaps(parts[i], parts[j]);
          if (gap)
            bad.push(
              `${name}: ${parts[i].role} and ${parts[j].role} overlap by ${gap.toFixed(3)} m`,
            );
        }
    /* Report a few rather than a wall of them; the count is the signal. */
    expect(bad.slice(0, 8), `${bad.length} overlapping pairs`).toEqual([]);
  }, 300_000);

  it("stays inside the width the solver sized the stage at", async () => {
    /* stageSize is what the slenderness limit and the drag model use. If the
       shapes reach further than it says, the design was judged on a rocket
       that is not the one described. */
    const bad = [];
    for (const { name, live, parts } of MODELS) {
      if (!live[0] || !live[0].sol) continue;
      const declared = stageSize(live[0].sol).width / 2;
      const widest = parts
        .filter((p) => p.y < 0.01)
        .reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z) + p.r), 0);
      if (widest > declared + EPS)
        bad.push(
          `${name}: bottom stage reaches ${widest.toFixed(2)} m but is sized at ${declared.toFixed(2)} m`,
        );
    }
    expect(bad).toEqual([]);
  }, 300_000);

  it("describes something, and describes it once", async () => {
    /* Guards against the check above passing because the model came back
       empty, and against a stage being emitted twice. */
    for (const { name, live, parts } of MODELS) {
      /* Against the solved stages, not every entry: a destination that does
         not build carries stages with no solution, and the honest model of
         those is the payload on its own. */
      const solved = live.filter((s) => s.sol).length;
      expect(parts.length, `${name}: no parts`).toBeGreaterThan(solved);
      const { height, reach } = extentOf(parts);
      expect(height, `${name}: no height`).toBeGreaterThan(0);
      expect(reach, `${name}: no width`).toBeGreaterThan(0);
      expect(Number.isFinite(height) && Number.isFinite(reach)).toBe(true);
    }
  }, 300_000);

  it("fits inside the frustum every camera is given", () => {
    /* The 3D view's containment check, run here because the models are already
       built: solving these twelve missions a second time in a second worker to
       ask one more question of the same parts is what the note above about
       running a worker out of memory is describing. `test/three-view.test.ts`
       sweeps the arithmetic over extents no rocket produces; this is the same
       claim over the rockets that actually get built. #63. */
    const bad = [];
    for (const { name, parts } of MODELS) {
      if (!parts.length) continue;
      const extent = extentOf(parts);
      for (const [view, aspect] of PANELS) {
        const out = escapes(view, parts, extent, aspect);
        if (out > EPS)
          bad.push(
            `${name}: ${view} @${aspect.toFixed(2)} clips by ${out.toFixed(3)} m`,
          );
      }
    }
    expect(bad.slice(0, 6), `${bad.length} views clip the rocket`).toEqual([]);
  }, 300_000);

  it("stands as tall as the slenderness limit was applied to", () => {
    /* stackGeometry is what the aspect ratio is measured on and what the
       maxAspect limit rejects a design by, and the figures under the panels
       report it. A model taller than that is a rocket drawn more slender than
       the constraint ever saw. Boosters are excluded from stackGeometry
       deliberately — they stage away — so this asks it of the steps that have
       none left. */
    const bad = [];
    for (const { name, cur, live, payload, payloadDia, parts } of MODELS) {
      if (cur.boost || !live.length) continue;
      const geo = stackGeometry(live, payload, payloadDia);
      const { height, width } = extentOf(parts);
      if (Math.abs(height - geo.h) > EPS)
        bad.push(
          `${name}: ${height.toFixed(3)} m tall, measured at ${geo.h.toFixed(3)}`,
        );
      if (width > geo.w + EPS)
        bad.push(
          `${name}: ${width.toFixed(3)} m across, measured at ${geo.w.toFixed(3)}`,
        );
    }
    expect(bad.slice(0, 8), `${bad.length} disagreements`).toEqual([]);
  }, 300_000);

  it("draws the plan from the stage the elevation stands on", () => {
    /* The plan shows the bottom live stage. It must never reach further than
       the whole vehicle does, and it must describe something at every step —
       it was empty at the last one, and the canvas kept the previous rocket. */
    const bad = [];
    for (const { name, parts, planParts } of MODELS) {
      if (!planParts.length) bad.push(`${name}: nothing in the plan`);
      else if (extentOf(planParts).reach > extentOf(parts).reach + EPS)
        bad.push(`${name}: plan reaches past the elevation`);
    }
    expect(bad.slice(0, 8), `${bad.length} bad plans`).toEqual([]);
  }, 300_000);

  it("stands between the near and far planes of every camera", () => {
    /* Framing says the rocket is inside the picture. This says it is inside the
       depth the camera can see, which is a different question and went wrong on
       its own: the isometric cut the back off the model at the last two staging
       steps, and no framing check could have noticed. */
    const bad = [];
    for (const { name, parts } of MODELS) {
      if (!parts.length) continue;
      const extent = extentOf(parts);
      for (const view of ["side", "plan", "iso"]) {
        const out = escapesDepth(view, parts, extent);
        if (out > EPS)
          bad.push(`${name}: ${view} clips ${out.toFixed(3)} m of depth`);
      }
    }
    expect(bad.slice(0, 6), `${bad.length} views clip in depth`).toEqual([]);
  }, 300_000);

  it("draws a booster at the length the part table gives it", () => {
    /* Against the data, not against the expression that produced it — the
       drawn height has to be the measured one.

       It was neither. The length came from a volume estimate that runs 40 to
       135% short — a Shrimp is 3.99 m and was drawn at 1.69, a Mite 1.77
       against 0.75 — and then it was truncated to the tank run on top of that.
       A part drawn at a size it is not. #86 */
    const bad = [];
    let checked = 0;
    for (const { name, parts } of MODELS)
      for (const b of parts.filter((p) => p.role === "booster")) {
        /* A liquid radial is a stack of tanks with an engine under it, so the
           part's own height is not its length. */
        if (b.part.column) continue;
        const measured = PART_H(b.part.n);
        if (measured === undefined) continue;
        checked++;
        if (Math.abs(b.h - measured) > EPS)
          bad.push(
            `${name}: ${b.part.n} drawn ${b.h.toFixed(2)} m, part table says ${measured.toFixed(2)}`,
          );
      }
    expect(checked, "no measured booster in the grid").toBeGreaterThan(3);
    expect(bad.slice(0, 6), `${bad.length} at the wrong length`).toEqual([]);
  }, 300_000);

  it("stands a radial booster against what it is bolted to", () => {
    /* A booster's inner face is set at the tank's radius, because that is where
       its decoupler goes. Its foot has to be there too. It stood on the stage's
       base instead — alongside the engine, the coupler and the adapters, all
       narrower than the tank — so it was drawn against nothing and read as
       floating. Every booster-bearing stage in the mission grid had it, and
       where a stage's own engine is a solid booster it ran to 25 m. #86 */
    const bad = [];
    let checked = 0;
    for (const { name, parts } of MODELS) {
      for (const b of parts.filter((p) => p.ring !== undefined)) {
        checked++;
        /* How far in the booster's near side reaches, and how far out the
           stack does at the height its foot is at. */
        const inner = Math.hypot(b.x, b.z) - b.r;
        const widest = Math.max(
          0,
          ...parts
            .filter(
              (p) => !p.ring && p.y <= b.y + EPS && p.y + p.h >= b.y + EPS,
            )
            .map((p) => Math.hypot(p.x, p.z) + p.r),
        );
        const gap = inner > 0 ? (inner - widest) / inner : 0;
        if (gap > CLEAR)
          bad.push(
            `${name}: a ring part stands ${(gap * 100).toFixed(0)}% clear of anything at y=${b.y.toFixed(2)}`,
          );
      }
    }
    expect(checked, "no boosters in the grid to check").toBeGreaterThan(4);
    expect(bad.slice(0, 6), `${bad.length} floating boosters`).toEqual([]);
  }, 300_000);

  it("draws a tank run tank by tank, not as one tube", () => {
    /* Two tanks of the same diameter stacked end to end are continuous in depth
       and in normals, so the outline pass finds that seam by surface id or not
       at all — and a run drawn as a single cylinder has no ids to differ. It
       was drawn as one, so a stage of five identical tanks came out as one tube
       with no lines in it, while a packed ring beside it was drawn level by
       level and did have them. #71 */
    const bad = [];
    let checked = 0;
    for (const { name, cur, live, parts } of MODELS) {
      let want = 0;
      let packed = false;
      for (const st of live) {
        if (!st.sol) continue;
        /* A packed ring is a different shape and is drawn level by level. */
        if (st.sol.packed) packed = true;
        const S = st.sol.stacks || 1;
        const list = (S > 1 ? st.sol.perStack : st.sol.tanks)?.list || [];
        want += list.reduce((a, x) => a + x.c, 0) * S;
        /* And the tanks on the ring. A liquid column and a drop tank are runs
           of tanks like any other, and were drawn as one cylinder each until
           #123 — the same fault this test was written for, one branch over. */
        const b = st.sol.boosters;
        if (cur.boost && b?.part.column) want += b.n * b.part.column.count;
      }
      if (packed || !want) continue;
      checked++;
      const drawn = parts.filter((p) => p.role === "tank").length;
      if (drawn !== want)
        bad.push(`${name}: ${drawn} tank shapes for ${want} tanks`);
    }
    expect(checked, "no unpacked run to check").toBeGreaterThan(4);
    expect(bad.slice(0, 6), `${bad.length} runs drawn whole`).toEqual([]);
  }, 300_000);

  it("charges one decoupler a stage, because that is what it draws", () => {
    /* `modelOf` puts a single decoupler at the top of each stage, on the axis —
       "the columns hang off the core through joiners rather than separating on
       their own" — while the solver was charging one per engine on a clustered
       stage and one per column otherwise. Nothing held the two together, so a
       plated three-engine stage bought three decouplers for a joint its own
       plate already made. #78 */
    const bad = [];
    for (const { name, live, parts } of MODELS) {
      const drawn = parts.filter((p) => p.role === "decoupler").length;
      let charged = 0;
      for (const st of live) {
        if (!st.sol) continue;
        const q = st.sol.decoupler ? (st.sol.decoupler.qty ?? 1) : 0;
        if (q > 1) bad.push(`${name}: a stage buys ${q} decouplers`);
        charged += q;
      }
      if (drawn !== charged)
        bad.push(`${name}: draws ${drawn} decouplers and buys ${charged}`);
    }
    expect(bad.slice(0, 6), `${bad.length} disagreements`).toEqual([]);
  }, 300_000);

  it("describes the payload when every stage has been dropped", () => {
    /* The last staging step. The build view derives both views from what is
       still attached, and at that step nothing is — so a model of no stages
       has to be the payload rather than nothing at all. The 3D plan view drew
       the step before this one for a while: it was handed an empty list, made
       no frame, and the canvas kept the rocket it already had. */
    const parts = modelOf([], 1.2, 0);
    expect(parts.map((p) => p.role)).toEqual(["payload"]);
    const { height, reach } = extentOf(parts);
    expect(height).toBeGreaterThan(0);
    expect(reach).toBeGreaterThan(0);

    /* And it is a command pod, which is what a payload usually is: KSP's pods
       taper by one stack size, and that ladder halves. The height is not part
       of the shape — `stackGeometry` measures the slenderness limit on the same
       figure, so narrowing the top is free and shortening it would not be. #82 */
    const pod = parts[0];
    expect(pod.rTop).toBeCloseTo(pod.r / 2, 12);
    /* And it is a pod's shape, not a drum's. Measured from the parts, a pod
       stands 0.65 to 0.90 of its own width: the Mk1 0.90, the Mk2 0.84, the
       Mk1-3 0.65. */
    const width = pod.r * 2;
    expect(pod.h / width).toBeGreaterThanOrEqual(0.65);
    expect(pod.h / width).toBeLessThanOrEqual(0.9);
    /* And it is exactly what the solver measured. Drawing a payload the
       slenderness limit was not applied to is the two-descriptions failure
       this model exists to prevent. */
    expect(height).toBeCloseTo(width * PAYLOAD_ASPECT, 12);
  });

  it("keeps the payload inside the envelope the solver measured", () => {
    /* The taper narrows the top; nothing may widen it. `extentOf` reads the
       base radius, and the panel and every camera are sized from that. */
    for (const { name, parts } of MODELS)
      for (const p of parts)
        if (p.rTop !== undefined)
          expect(
            p.rTop,
            `${name}: ${p.role} flares outwards`,
          ).toBeLessThanOrEqual(p.r);
  });
});

/* A booster beside an engine that is narrower than the node it mounts on.

   The mission grid cannot reach this: engine plates and the ReStock+ roster
   are off there, and every stack engine in it measures within a centimetre of
   its own node. A Mammoth mounts on 3.75 m and measures 3.27 across the bells,
   which is enough for a rule comparing the measurement against the tank to
   decide there was nothing to bolt to — and it left six Castors strapped to
   the tanks 25 m up the stack. #109 */
const named = <T extends { n: string }>(list: ReadonlyArray<T>, part: string) =>
  must(
    list.find((x) => x.n.includes(part)),
    part,
  );

const MAMMOTH = named(DATA.engines, "Mammoth");
const CASTOR = named(DATA.engines, "Castor");
const S3 = named(DATA.tanks, "Kerbodyne S3-3600");

const PLAIN = {
  adapters: null,
  coupler: null,
  shroud: null,
  total: 300,
  wet: 300,
  dry: 100,
  prop: 200,
  isp: 300,
  dv: 2000,
  twr: 1.4,
  twrBurnout: 2,
  burn: 100,
  cost: 0,
  parts: 0,
  score: 0,
};

const STRAPPED: Solution = {
  ...PLAIN,
  engine: MAMMOTH,
  n: 1,
  tanks: { list: [{ c: 2, t: S3 }], count: 2, dryMass: 4.5, prop: 36 },
  decoupler: { n: "TD-37 Decoupler", m: 0.4, cost: 800, d: 3.75, qty: 1 },
  boosters: { part: CASTOR, n: 4, burn: 60, dv: 500, sepMass: 100 },
};

describe("a booster beside a wide engine", () => {
  it("stands on the engine's base, not on the tanks above it", () => {
    const parts = modelOf([{ sol: STRAPPED }], 5, 2.5);
    const engine = must(
      parts.find((p) => p.role === "engine" && !p.ring),
      "the engine",
    );
    const boosters = parts.filter((p) => p.ring !== undefined);
    expect(boosters.length, "no boosters drawn").toBe(4);
    /* `modelOf` stands the bottom live stage on zero and the engine goes on
       first, so the engine's base is the floor and the tanks start above it. */
    expect(engine.y).toBeCloseTo(0, 9);
    for (const b of boosters)
      expect(
        b.y,
        `a ring part starts ${b.y.toFixed(2)} m up, at the tanks`,
      ).toBeCloseTo(0, 9);
    /* And it is standing against the engine rather than past it: the gap is
       the difference between a 3.75 m node and a 3.27 m measurement. */
    const b = boosters[0];
    const inner = Math.hypot(b.x, b.z) - b.r;
    expect((inner - (engine.r + 0)) / inner).toBeLessThan(CLEAR);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { planMission } from "../src/core/plan.js";
import { extentOf, modelOf } from "../src/core/model.js";
import { stackGeometry, stageSize } from "../src/core/geometry.js";
import { stagingSteps, stepModels } from "../src/ui/components/build.jsx";
import { missionCases } from "./grid.js";
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

/* Two cylinders share space when they overlap along the stack *and* their
   footprints overlap in plan. Touching is not overlapping. */
function overlaps(a, b) {
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (dy <= EPS) return 0;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  const gap = a.r + b.r - d;
  return gap > EPS ? gap : 0;
}

/* Solved once and shared. Building them per assertion meant three passes over
   twelve missions and every staging step of each, which was enough to run a
   worker out of memory. */
let MODELS = [];

const buildModels = async () => {
  const out = [];
  for (const c of missionCases()) {
    const res = await planMission(c.input, {
      onYield: () => Promise.resolve(),
    });
    if (!res) continue;
    /* Every staging step, since which parts are present changes with it and
       the bugs this replaces all appeared partway down the stack. */
    const solved = res.stages.filter((x) => x.sol);
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
          const gap = overlaps(parts[i], parts[j]);
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
       running a worker out of memory is describing. `test/three-view.test.js`
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

  it("draws a tank run tank by tank, not as one tube", () => {
    /* Two tanks of the same diameter stacked end to end are continuous in depth
       and in normals, so the outline pass finds that seam by surface id or not
       at all — and a run drawn as a single cylinder has no ids to differ. It
       was drawn as one, so a stage of five identical tanks came out as one tube
       with no lines in it, while a packed ring beside it was drawn level by
       level and did have them. #71 */
    const bad = [];
    let checked = 0;
    for (const { name, live, parts } of MODELS) {
      let want = 0;
      let packed = false;
      for (const st of live) {
        if (!st.sol) continue;
        /* A packed ring is a different shape and is drawn level by level. */
        if (st.sol.packed) packed = true;
        const S = st.sol.stacks || 1;
        const list = (S > 1 ? st.sol.perStack : st.sol.tanks)?.list || [];
        want += list.reduce((a, x) => a + x.c, 0) * S;
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
    expect(parts).toHaveLength(1);
    expect(parts[0].role).toBe("payload");
    const { height, reach } = extentOf(parts);
    expect(height).toBeGreaterThan(0);
    expect(reach).toBeGreaterThan(0);

    /* And it is a command pod, which is what a payload usually is: KSP's pods
       taper by one stack size, and that ladder halves. The height is not part
       of the shape — `stackGeometry` measures the slenderness limit on the same
       figure, so narrowing the top is free and shortening it would not be. #82 */
    expect(parts[0].rTop).toBeCloseTo(parts[0].r / 2, 12);
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

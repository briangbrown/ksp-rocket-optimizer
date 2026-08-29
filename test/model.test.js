import { describe, it, expect, beforeAll } from "vitest";
import { planMission } from "../src/core/plan.js";
import { extentOf, modelOf } from "../src/core/model.js";
import { stageSize } from "../src/core/geometry.js";
import { missionCases } from "./grid.js";
import { PANELS, clips } from "./framing.js";

/* The rocket as shapes, checked as shapes.

   `test/panel-containment.test.jsx` asserts that nothing the build view draws
   escapes its panel. That is a statement about the picture, and it works only
   because SVG geometry survives jsdom — the 3D view in #63 has no pixels to
   read, and jsdom has no WebGL to make any.

   So the checks move to the model, where they are stronger anyway. A part
   overlapping another part is a rocket that cannot be built, whatever it is
   drawn with, and containment only ever said the drawing was tidy. #63 step 1.

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
    for (let drop = 0; drop < res.stages.length; drop++) {
      const live = res.stages.slice(drop);
      out.push({
        name: `${c.name} +${drop}`,
        live,
        parts: modelOf(live, c.input.payload, c.input.payloadDia),
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
      for (const [view, aspect] of PANELS)
        if (clips(view, extent, aspect))
          bad.push(`${name}: ${view} @${aspect.toFixed(2)} clips the rocket`);
    }
    expect(bad.slice(0, 6), `${bad.length} views clip the rocket`).toEqual([]);
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
  });
});

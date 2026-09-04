import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { extentOf } from "../src/core/model.js";
import { arrive, assembly, pose, separation } from "../src/ui/separation.js";
import { cameraFor, viewAxis } from "../src/ui/views.js";
import {
  isSolved,
  stagingSteps,
  stepModels,
} from "../src/ui/components/build.jsx";
import { missionCases } from "./grid.js";
import { must } from "./must.js";
import type { ModelPart } from "../src/core/model.js";
import type { BoosterPart } from "../src/core/solution.js";

/* Enough of a booster to hang on the side of something. */
const BOOSTER: BoosterPart = {
  n: "a booster",
  t: null,
  sz: ["R"],
  f: ["SF"],
  m: 1,
  dry: 0.2,
  fuelM: 0.8,
  iv: 200,
  ia: 170,
  fv: 200,
  cost: 100,
};

/* What a stage separation looks like, on numbers.

   Nothing in `test/` can watch an animation: jsdom has no WebGL, so the build
   view there is a line of text. What can be checked is the claim the whole
   thing rests on — that the choreography starts exactly where the step it
   leaves was drawn and ends exactly where the step it arrives at will be
   drawn. An animation that lands somewhere a cut would not have is worse than
   no animation, and it is arithmetic. #105 */

/* A stack of three: a stage of two parts with a booster on it, and a payload.
   Written out rather than solved for, so the assertions can be exact. */
const model: Array<ModelPart> = [
  { role: "tank", x: 0, z: 0, y: 0, r: 1, h: 4, stage: 0 },
  {
    role: "booster",
    ring: 1,
    x: 2,
    z: 0,
    y: 0,
    r: 0.5,
    h: 3,
    stage: 0,
    part: BOOSTER,
  },
  { role: "tank", x: 0, z: 0, y: 4, r: 1, h: 3, stage: 1 },
  { role: "payload", x: 0, z: 0, y: 7, r: 0.6, h: 1 },
];
/* The same rocket a step later: the bottom stage gone, so what is left stands
   on zero instead of on four. */
const next: Array<ModelPart> = [
  { role: "tank", x: 0, z: 0, y: 0, r: 1, h: 3, stage: 0 },
  { role: "payload", x: 0, z: 0, y: 3, r: 0.6, h: 1 },
];

const SPENT = separation(
  model,
  next,
  { drop: 0, boost: true },
  { drop: 1, boost: false },
);

describe("a stage separation", () => {
  it("starts where the step it leaves was drawn", () => {
    const f = pose(SPENT, 0);
    expect(f.offsets.every((o) => !o.x && !o.y && !o.z && !o.tilt)).toBe(true);
    expect(f.extent.height).toBeCloseTo(extentOf(model).height, 9);
    expect(f.extent.reach).toBeCloseTo(extentOf(model).reach, 9);
    expect(f.midY).toBeCloseTo(extentOf(model).height / 2, 9);
  });

  it("ends where the step it arrives at will be drawn", () => {
    const f = pose(SPENT, 1);
    /* What stays has not moved. The incoming model is these same parts with
       the origin under them instead of under the stage that left, and the
       camera carries that difference rather than the geometry. */
    SPENT.goes.forEach((go, i) => {
      if (go) return;
      const o = f.offsets[i];
      expect([o.x, o.y, o.z, o.tilt], `part ${i} moved`).toEqual([0, 0, 0, 0]);
    });
    expect(f.extent.height).toBeCloseTo(extentOf(next).height, 9);
    expect(f.extent.reach).toBeCloseTo(extentOf(next).reach, 9);
    /* The surviving stack stands four metres up in the frame it is drawn in. */
    expect(SPENT.dy).toBeCloseTo(4, 9);
    expect(f.midY).toBeCloseTo(4 + extentOf(next).height / 2, 9);
  });

  it("drops what is spent, and throws a booster out as well as down", () => {
    const f = pose(SPENT, 1);
    const tank = f.offsets[0];
    const boost = f.offsets[1];
    expect(tank.y, "the spent stage did not fall").toBeLessThan(-5);
    expect(tank.x).toBe(0);
    expect(boost.y).toBeCloseTo(tank.y, 9);
    expect(boost.x, "the booster was not thrown clear").toBeGreaterThan(1);
    expect(boost.tilt, "the booster did not tip").toBeGreaterThan(0.1);
    /* Radially: this one is on +x, so it goes that way and nowhere else. */
    expect(boost.z).toBe(0);
  });

  it("moves nothing before it starts and everything by the end", () => {
    /* Monotone in the middle, which is what stops a part arriving and then
       coming back. */
    let last = 0;
    for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
      const y = -pose(SPENT, t).offsets[0].y;
      expect(y, `at t=${t}`).toBeGreaterThan(last);
      last = y;
    }
  });

  it("leaves exactly what the next step draws", async () => {
    /* The synthetic models above say what the arithmetic does; this says the
       departing set is read off the steps correctly, on a rocket the solver
       actually built. */
    const c = must(
      missionCases().find((x) => x.name === "Mun-pay3.5"),
      "the Mun mission",
    );
    const res = must(
      await planMission(c.input, { onYield: () => Promise.resolve() }),
      "a design",
    );
    const solved = res.stages.filter(isSolved);
    const steps = stagingSteps(solved);
    expect(steps.length, "nothing to step through").toBeGreaterThan(1);

    const bad: Array<string> = [];
    for (let i = 0; i + 1 < steps.length; i++) {
      const a = stepModels(
        solved,
        steps[i],
        c.input.payload,
        c.input.payloadDia,
      );
      const b = stepModels(
        solved,
        steps[i + 1],
        c.input.payload,
        c.input.payloadDia,
      );
      const sep = separation(a.model, b.model, steps[i], steps[i + 1]);
      const stays = sep.goes.filter((g) => !g).length;
      if (stays !== b.model.length)
        bad.push(
          `${steps[i].label} -> ${steps[i + 1].label}: ${stays} stay, ${b.model.length} drawn`,
        );
    }
    expect(bad).toEqual([]);
  }, 300_000);
});

/* A column separates as one body.

   A liquid radial booster is an engine with a run of tanks above it, drawn part
   by part since #123 so its seams have lines. It is held on by one radial
   decoupler and comes off on it, so the pieces must keep their spacing all the
   way out. They did not: the renderer turns every mesh about its own centre, so
   each part pivoted where it sat and the column fanned open. #124 */
const COLUMN: Array<ModelPart> = [
  {
    role: "engine",
    ring: 1,
    x: 3,
    z: 0,
    y: 0,
    r: 0.5,
    h: 2,
    stage: 0,
    part: BOOSTER,
  },
  { role: "tank", ring: 1, x: 3, z: 0, y: 2, r: 0.5, h: 3, stage: 0 },
  { role: "tank", ring: 1, x: 3, z: 0, y: 5, r: 0.5, h: 3, stage: 0 },
  { role: "tank", x: 0, z: 0, y: 0, r: 1, h: 8, stage: 0 },
  { role: "payload", x: 0, z: 0, y: 8, r: 0.6, h: 1 },
];

describe("a column on its way out", () => {
  const sep = separation(
    COLUMN,
    [COLUMN[4]],
    { drop: 0, boost: true },
    { drop: 0, boost: false },
  );

  it("keeps its joints closed the whole way out", () => {
    /* Where a part's two ends are after the transform the renderer applies:
       turned about its own centre by `tilt`, about the tangent, then put where
       the offset says. A column is rigid exactly when the top of one part is
       still the bottom of the next. */
    const ends = (i: number, t: number) => {
      const p = COLUMN[i];
      const o = pose(sep, t).offsets[i];
      const r = Math.hypot(p.x, p.z) || 1;
      const dir = [p.x / r, 0, p.z / r] as const;
      /* Turning (0,1,0) about (z/r, 0, -x/r) by `tilt`. */
      const axis = [
        Math.sin(o.tilt) * dir[0],
        Math.cos(o.tilt),
        Math.sin(o.tilt) * dir[2],
      ] as const;
      const c = [p.x + o.x, p.y + p.h / 2 + o.y, p.z + o.z] as const;
      const half = p.h / 2;
      return {
        bottom: c.map((v, k) => v - half * axis[k]),
        top: c.map((v, k) => v + half * axis[k]),
      };
    };
    const bad: Array<string> = [];
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      for (const [lower, upper] of [
        [0, 1],
        [1, 2],
      ]) {
        const a = ends(lower, t).top;
        const b = ends(upper, t).bottom;
        const gap = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (gap > 1e-9)
          bad.push(
            `at t=${t} parts ${lower} and ${upper} are ${gap.toFixed(3)} m apart at the joint`,
          );
      }
    expect(bad).toEqual([]);
  });

  it("turns every part of the column by the same angle", () => {
    const o = pose(sep, 0.6).offsets;
    expect(o[1].tilt).toBeCloseTo(o[0].tilt, 12);
    expect(o[2].tilt).toBeCloseTo(o[0].tilt, 12);
    expect(o[0].tilt).toBeGreaterThan(0);
  });
});

/* The depth window has to reach round what the framing does not.

   The framing eases to the rocket that is left, on purpose: chasing the parts
   on their way out would push everything else off the panel. But they are still
   drawn, and a far plane measured on what stays cuts them in half in mid-air —
   which is what the isometric was doing to a booster as it went. Leaving the
   panel at its edge is the intent; being sliced is not. #124 */
describe("what the camera has to reach round", () => {
  const sep = separation(
    COLUMN,
    [COLUMN[4]],
    { drop: 0, boost: true },
    { drop: 0, boost: false },
  );

  it("sweeps wider than it frames, once anything is moving", () => {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const f = pose(sep, t);
      expect(
        f.sweep.reach,
        `at t=${t} the sweep is no wider than the framing`,
      ).toBeGreaterThan(f.extent.reach);
    }
  });

  it("puts every part inside the depth window it asks for", () => {
    const bad: Array<string> = [];
    for (const view of ["side", "plan", "iso"])
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const f = pose(sep, t);
        const cam = cameraFor(view, f.extent, 0.5, f.sweep);
        const a = viewAxis(view);
        for (const [i, p] of COLUMN.entries()) {
          const o = f.offsets[i];
          /* Depth along the axis the camera looks down, of the part's own
             bounding sphere — generous, which is the safe direction here. */
          const c = {
            x: p.x + o.x,
            y: p.y + p.h / 2 + o.y,
            z: p.z + o.z,
          };
          /* The camera stands `dist` along the axis from what it looks at,
             which is (0, midY, 0) — the same placement three-view makes. */
          const along = a.x * c.x + a.y * (c.y - f.midY) + a.z * c.z;
          const rad = Math.hypot(p.h / 2, p.r);
          const depth = cam.dist - along;
          if (depth - rad < cam.near || depth + rad > cam.far)
            bad.push(
              `${view} @t=${t}: part ${i} at depth ${depth.toFixed(2)} +/- ${rad.toFixed(2)}, window ${cam.near.toFixed(2)}..${cam.far.toFixed(2)}`,
            );
        }
      }
    expect(
      bad.slice(0, 6),
      `${bad.length} parts outside the depth window`,
    ).toEqual([]);
  });
});

/* What a new design does when it first appears: the parts settle onto the pad
   from a little above their places. The claim this rests on is the same as a
   separation's, from the other end — the last frame of the arrival is the
   still drawing exactly, so nothing jumps when the animation hands over to
   the frame that stays. The camera does not move at all. #138 */
describe("an arrival", () => {
  const asm = assembly(model);

  it("starts with every part above its place, and higher parts higher", () => {
    const f = arrive(asm, 0);
    for (const [i, o] of f.offsets.entries()) {
      expect(o.y, `part ${i} does not start above its place`).toBeGreaterThan(
        0,
      );
      expect(o.x).toBe(0);
      expect(o.z).toBe(0);
      expect(o.tilt).toBe(0);
    }
    /* The payload, at the top, starts the highest of all. */
    const top = model.findIndex((p) => p.role === "payload");
    for (const o of f.offsets)
      expect(f.offsets[top].y).toBeGreaterThanOrEqual(o.y);
    /* And not by much: it is a settle, not a launch played backwards. */
    expect(f.offsets[top].y).toBeLessThan(asm.extent.height / 4);
  });

  it("settles monotonically, and is still by the end", () => {
    let was = arrive(asm, 0).offsets.map((o) => o.y);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const now = arrive(asm, t).offsets.map((o) => o.y);
      now.forEach((y, i) =>
        expect(y, `part ${i} rose between frames at t=${t}`).toBeLessThan(
          was[i] + 1e-12,
        ),
      );
      was = now;
    }
    const last = arrive(asm, 1);
    expect(last.settled).toBe(1);
    for (const o of last.offsets)
      expect(o).toEqual({ x: 0, y: 0, z: 0, tilt: 0 });
  });

  it("frames the still drawing from the first instant to the last", () => {
    const still = extentOf(model);
    for (const t of [0, 0.5, 1]) {
      const f = arrive(asm, t);
      expect(f.extent).toEqual(still);
      expect(f.midY).toBe(still.height / 2);
    }
    /* At rest, the depth window is what the still drawing asks for too. */
    const rest = arrive(asm, 1);
    expect(rest.sweep.reach).toBe(still.reach);
    expect(rest.sweep.height).toBeGreaterThanOrEqual(still.height);
  });

  it("puts every raised part inside the depth window it asks for", () => {
    const bad: Array<string> = [];
    for (const view of ["side", "plan", "iso"])
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const f = arrive(asm, t);
        const cam = cameraFor(view, f.extent, 0.5, f.sweep);
        const a = viewAxis(view);
        for (const [i, p] of model.entries()) {
          const o = f.offsets[i];
          const c = { x: p.x + o.x, y: p.y + p.h / 2 + o.y, z: p.z + o.z };
          const along = a.x * c.x + a.y * (c.y - f.midY) + a.z * c.z;
          const rad = Math.hypot(p.h / 2, p.r);
          const depth = cam.dist - along;
          if (depth - rad < cam.near || depth + rad > cam.far)
            bad.push(
              `${view} @t=${t}: part ${i} at depth ${depth.toFixed(2)} +/- ${rad.toFixed(2)}, window ${cam.near.toFixed(2)}..${cam.far.toFixed(2)}`,
            );
        }
      }
    expect(
      bad.slice(0, 6),
      `${bad.length} parts outside the depth window`,
    ).toEqual([]);
  });
});

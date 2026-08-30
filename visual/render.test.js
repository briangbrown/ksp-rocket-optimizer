import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCALE, open, serve, settle } from "./browser.js";
import { LEAN, NEAR, READ, forCanvas } from "./pixels.js";
import { C } from "../src/ui/tokens.js";

/* What the build view actually draws.

   Everything in `test/` runs in jsdom, which implements no WebGL, so
   `canRender3D()` is false there and the panels fall through to the line of
   text. Nothing in that suite has ever compiled a shader or produced a pixel.
   These are the checks that need a context, and each one is here because
   something it would have caught reached a person instead. #73

   The elevation is canvas 0 and the plan is canvas 1, in the order the build
   view lays them out. */
const ELEVATION = 0;
const PLAN = 1;

let ctx;
let page;
let problems;

beforeAll(async () => {
  ctx = await serve();
  ({ page, problems } = await open(ctx.url));
  await settle(page);
}, 300_000);

afterAll(async () => {
  await page?.browser().close();
  await ctx?.close();
});

const read = (i) => forCanvas(page, READ, i);

/* The stage stepper, by the labels it generates. */
const steps = () =>
  page.$$eval("button", (bs) =>
    bs
      .map((b) => b.textContent.trim())
      .filter((t) =>
        /^(On the pad|Boosters away · core burns on|Stage \d+ spent|Payload alone)$/.test(
          t,
        ),
      ),
  );

async function step(label) {
  await page.evaluate((want) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === want,
    );
    if (!b) throw new Error("no step " + want);
    b.click();
  }, label);
  await settle(page);
}

describe("the build view, in a browser", () => {
  it("gets a real WebGL context rather than the fallback", async () => {
    const how = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const d = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return {
        webgl2: !!gl,
        renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null,
        canvases: document.querySelectorAll("canvas").length,
        fallback: document.body.textContent.includes("no WebGL"),
      };
    });
    /* If this fails, every other assertion below is meaningless rather than
       failing — they would all be measuring the text panel. */
    expect(how.webgl2, "no WebGL2 in the test browser").toBe(true);
    expect(how.fallback, "the app took the no-WebGL path").toBe(false);
    expect(how.canvases).toBeGreaterThanOrEqual(2);
  });

  it("draws something in both panels", async () => {
    /* A shader that will not compile draws nothing and throws nothing. What is
       left on screen is a panel-coloured rectangle, which is exactly what an
       empty build view looks like, so only the pixels can tell them apart.

       The bar is deliberately low on colour count, because the plan is
       legitimately nearly flat: looking straight up the axis, every face in
       sight is a cap whose normal points at the camera, so the cool-to-warm
       ramp has nothing to vary over and thirteen colours is a complete
       drawing. The elevation, seeing the tubes side-on, has around 480. */
    for (const [name, i] of [
      ["elevation", ELEVATION],
      ["plan", PLAN],
    ]) {
      const px = await read(i);
      expect(px.pixels, `${name}: empty canvas`).toBeGreaterThan(0);
      expect(px.distinct, `${name}: one flat colour`).toBeGreaterThan(4);
      /* However much of it is background, some of it must not be. */
      expect(
        px.top[0][1],
        `${name}: ${px.top[0][0]} covers the panel`,
      ).toBeLessThan(0.97);
    }
  });

  it("sizes each canvas for its panel, not for the pixel ratio", async () => {
    /* #66: `setSize(w, h, false)` leaves the canvas with no CSS size, so it
       lays out at its drawing buffer — devicePixelRatio times too big. At a
       ratio of 1 the two numbers agree and the bug is invisible, which is why
       the harness runs at 2. */
    for (const [name, i] of [
      ["elevation", ELEVATION],
      ["plan", PLAN],
    ]) {
      const { buffer, css } = await read(i);
      /* `Math.floor`, not a plain multiply: three sizes the buffer at
         `floor(css * pixelRatio)` and a panel's width is a fraction, so an
         80.5 px panel is a 161 px buffer and not 162. Rounding the css first
         made this pass on one browser and fail on another half a pixel away —
         the drawing was right in both. */
      expect(buffer[0], `${name}: buffer is not ${SCALE}x its css width`).toBe(
        Math.floor(css[0] * SCALE),
      );
      expect(buffer[1], `${name}: buffer is not ${SCALE}x its css height`).toBe(
        Math.floor(css[1] * SCALE),
      );
    }
  });

  it("keeps the drawing after the page repaints", async () => {
    /* #66: one frame is drawn on demand and never again, and a drawing buffer
       is cleared once it has been composited unless the context asked to keep
       it. Without `preserveDrawingBuffer` the schematic is right on the frame
       that draws it and blank the next time anything repaints the page. */
    const before = await read(ELEVATION);
    await page.evaluate(async () => {
      window.scrollTo(0, 200);
      document.body.getBoundingClientRect();
      for (let i = 0; i < 4; i++)
        await new Promise((r) => requestAnimationFrame(r));
      window.scrollTo(0, 0);
      for (let i = 0; i < 4; i++)
        await new Promise((r) => requestAnimationFrame(r));
    });
    const after = await read(ELEVATION);
    expect(after.hash, "the drawing did not survive a repaint").toBe(
      before.hash,
    );
    expect(after.distinct).toBeGreaterThan(24);
  });

  it("redraws the plan when a stage is dropped", async () => {
    /* #66 again, and the half no arithmetic reaches: the plan was built only
       when a live stage remained, so at the last step it was handed nothing,
       drew no frame, and the canvas kept the rocket from the step before. Both
       panels looked plausible; only holding them side by side showed it. */
    const labels = await steps();
    expect(labels.length, "no staging steps to walk").toBeGreaterThan(2);

    const seen = [];
    for (const label of labels) {
      await step(label);
      seen.push({ label, plan: (await read(PLAN)).hash });
    }
    const stale = seen
      .slice(1)
      .filter((s, i) => s.plan === seen[i].plan)
      .map((s) => s.label);
    expect(stale, `the plan did not change at: ${stale.join(", ")}`).toEqual(
      [],
    );
  });

  it("draws the outline the surface-id pass is for", async () => {
    /* #70: the seam between two tanks of the same diameter is continuous in
       depth and in normals, so it is found by surface id or not at all. If the
       id pass silently produced nothing, the drawing would still look like a
       rocket — flat-shaded cylinders with cap rims — and only the absence of
       the edge colour would say so. */
    await step("On the pad");
    const ink = await forCanvas(page, NEAR, ELEVATION, C.paper, 26);
    expect(ink, "no outline colour anywhere in the elevation").toBeGreaterThan(
      0.002,
    );
  });

  it("agrees with itself about which side is which", async () => {
    /* #69: the plan's up vector sent world +x to the left while the elevation
       sent it to the right, so a stage with three radial tanks leaned one way
       in one panel and the other way in the other. `viewRight` pins this as
       arithmetic in `test/three-view.test.js`; this pins it end to end, on the
       pixels a person would have had to notice. */
    await step("On the pad");
    const [side, plan] = await Promise.all([
      forCanvas(page, LEAN, ELEVATION, C.panel),
      forCanvas(page, LEAN, PLAN, C.panel),
    ]);
    expect(side.ink, "nothing drawn in the elevation").toBeGreaterThan(0);
    expect(plan.ink, "nothing drawn in the plan").toBeGreaterThan(0);
    /* A rocket on its axis is close to symmetric either way, so this cannot
       assert a lean — only that neither view is wholly on one side while the
       other is wholly on the opposite, which is what a mirrored basis on an
       asymmetric stage produces. */
    const bias = (v) => (v.right - v.left) / v.ink;
    expect(
      Math.abs(bias(side) - bias(plan)),
      `elevation leans ${bias(side).toFixed(2)}, plan ${bias(plan).toFixed(2)}`,
    ).toBeLessThan(1.2);
  });

  it("says nothing to the console", async () => {
    /* Last, so it reports what the whole walk above provoked. A shader that
       fails to link, a texture that is not renderable and a lost context are
       all console-only: nothing throws, and the panel just looks empty. */
    expect(
      ctx.missed,
      "the page asked for something the build has not",
    ).toEqual([]);
    expect(problems.slice(0, 5), `${problems.length} console errors`).toEqual(
      [],
    );
  });
});

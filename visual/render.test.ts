import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCALE, open, serve, settle } from "./browser.js";
import { LEAN, NEAR, READ, forCanvas } from "./pixels.js";
import { C } from "../src/ui/tokens.js";
import type { Page } from "puppeteer";

/* What `READ` hands back from inside the page: the canvas's two sizes, how
   many distinct colours it holds, the commonest few, and a hash of the lot. */
type Read = {
  buffer: [number, number];
  css: [number, number];
  distinct: number;
  pixels: number;
  top: Array<[string, number]>;
  hash: number;
};

/* And `LEAN`: how much ink each side of the panel's own centre line. */
type Lean = { left: number; right: number; ink: number };

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

/* Both panels, named, for the checks that ask the same thing of each. */
const PANELS: ReadonlyArray<[string, number]> = [
  ["elevation", ELEVATION],
  ["plan", PLAN],
];

let ctx: Awaited<ReturnType<typeof serve>>;
let page: Page;
let problems: Array<string>;

beforeAll(async () => {
  ctx = await serve();
  ({ page, problems } = await open(ctx.url));
  await settle(page);
}, 300_000);

afterAll(async () => {
  await page?.browser().close();
  await ctx?.close();
});

const read = (i: number) => forCanvas(page, READ, i) as Promise<Read>;

/* The stage stepper, by the labels it generates. The pattern is shared with
   `current` below, which has to tell a staging chip from every other lit chip
   in the application — the profile and the objective are chips too. */
const STEP_LABEL =
  "^(On the pad|Boosters away · core burns on|Stage \\d+ spent|Payload alone)$";

const steps = () =>
  page.$$eval(
    "button",
    (bs, pat) =>
      bs
        .map((b) => (b.textContent ?? "").trim())
        .filter((t) => new RegExp(pat).test(t)),
    STEP_LABEL,
  );

/* Which step the stepper is showing. During a transition that is the one being
   entered, so it lights before the motion has finished. */
const current = () =>
  page.$$eval(
    "button.chip",
    (bs, pat) =>
      bs
        .map((b) => ({
          text: (b.textContent ?? "").trim(),
          on: b.getAttribute("data-on") === "1",
        }))
        .filter((x) => x.on && new RegExp(pat).test(x.text))
        .map((x) => x.text)[0] ?? null,
    STEP_LABEL,
  );

async function press(label: string) {
  await page.evaluate((want: string) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) =>
        (x.textContent ?? "").trim() === want ||
        x.getAttribute("aria-label") === want,
    );
    if (!b) throw new Error("no button labelled " + want);
    b.click();
  }, label);
  await settle(page);
}

/* Long enough for one separation to run and settle. A step taken by clicking
   is `STEP_MS` in build.tsx, 800 ms — `settle` only waits for the solver,
   which has nothing to do with it, so sampling a panel before it has stopped
   moving reads a frame of the animation as though it were the step. */
const SEPARATION = 1000;

/* Ask for a step and wait until it is actually being shown.

   A jump of several steps plays each separation in turn, so asking for the pad
   from the payload is five of them and several seconds — waiting one
   transition leaves the next test driving a stepper that is still walking. */
async function step(label: string) {
  await press(label);
  for (let i = 0; i < 200; i++) {
    if ((await current()) === label) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, SEPARATION));
}

/* Where the three column labels sit. They have to sit on one line: the row
   used to bottom-align its columns, and the elevation's header is taller than
   the plan's, so the two labels landed at different heights. #99 */
const labelTops = () =>
  page.$$eval("span.eyebrow", (els) =>
    els
      .filter((e) =>
        ["Staging", "Elevation", "Plan"].includes((e.textContent ?? "").trim()),
      )
      .map((e) => Math.round(e.getBoundingClientRect().top)),
  );

/* Everything the drawings must stay inside. */
const windowBox = () =>
  page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    canvases: [...document.querySelectorAll("canvas")].map((c) => {
      const b = c.getBoundingClientRect();
      return { right: b.right, bottom: b.bottom };
    }),
  }));

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
    for (const [name, i] of PANELS) {
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
    for (const [name, i] of PANELS) {
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

    const seen: Array<{ label: string; plan: number }> = [];
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
    const [side, plan] = (await Promise.all([
      forCanvas(page, LEAN, ELEVATION, C.panel),
      forCanvas(page, LEAN, PLAN, C.panel),
    ])) as [Lean, Lean];
    expect(side.ink, "nothing drawn in the elevation").toBeGreaterThan(0);
    expect(plan.ink, "nothing drawn in the plan").toBeGreaterThan(0);
    /* A rocket on its axis is close to symmetric either way, so this cannot
       assert a lean — only that neither view is wholly on one side while the
       other is wholly on the opposite, which is what a mirrored basis on an
       asymmetric stage produces. */
    const bias = (v: Lean) => (v.right - v.left) / v.ink;
    expect(
      Math.abs(bias(side) - bias(plan)),
      `elevation leans ${bias(side).toFixed(2)}, plan ${bias(plan).toFixed(2)}`,
    ).toBeLessThan(1.2);
  });

  it("fills the window when asked, and gives it back", async () => {
    /* The panels were sized from constants — 300 tall at most for the
       elevation, 150 square for the plan — so however much room the page had
       they stayed a stamp in the middle of it. jsdom can see none of this: it
       has no ResizeObserver to report a box and no WebGL to draw in one. #99 */
    await step("On the pad");
    const small = await read(ELEVATION);
    const smallPlan = await read(PLAN);

    await press("Full screen");
    const big = await read(ELEVATION);
    const bigPlan = await read(PLAN);
    expect(
      big.css[1],
      `the elevation went from ${small.css[1]} to ${big.css[1]} px tall`,
    ).toBeGreaterThan(small.css[1] * 1.5);
    expect(bigPlan.css[0]).toBeGreaterThan(smallPlan.css[0]);
    /* Never wider than the elevation, and standing on the same line as it. */
    expect(bigPlan.css[0]).toBeLessThanOrEqual(big.css[0] + 1);

    /* The overlay is a second root, rendered through a portal to the body and
       outside the one the application sets its type stack on — `button {
       font-family: inherit }` reached the browser's default there, and every
       chip in it came out in Times. */
    const font = await page.$eval(
      '[aria-label="Leave full screen"]',
      (b) => getComputedStyle(b).fontFamily,
    );
    expect(font, "the overlay is not in the app's own type").toContain("Inter");

    const tops = await labelTops();
    expect(tops.length, "the rail is not up beside the drawings").toBe(3);
    expect(new Set(tops).size, `labels at ${tops.join(", ")}`).toBe(1);

    /* And inside the window, which is the whole of the promise: there is no
       scrolling out to the rest of it while this is up. */
    const box = await windowBox();
    for (const [i, c] of box.canvases.entries()) {
      expect(
        c.right,
        `canvas ${i} runs past the right edge`,
      ).toBeLessThanOrEqual(box.w + 1);
      expect(c.bottom, `canvas ${i} runs past the bottom`).toBeLessThanOrEqual(
        box.h + 1,
      );
    }

    /* Escape leaves, the same as the button. */
    await page.keyboard.press("Escape");
    await settle(page);
    const back = await read(ELEVATION);
    expect(back.css, "the panel did not go back to its inline size").toEqual(
      small.css,
    );
  });

  it("animates a separation, and settles where a cut would have", async () => {
    /* Stepping used to cut from one rocket to the next. It now plays the
       separation: the spent stage falls, radial boosters are thrown out and
       down, the camera eases between the two framings and the panel resizes
       with them. None of it is visible to jsdom, which has no WebGL to draw in
       and nothing to animate. #105 */
    await step("On the pad");
    const before = await read(ELEVATION);

    /* Mid-flight. The transition runs 800 ms, so a sample a third of the way
       in is neither end of it. */
    await press("Stage 1 spent");
    await new Promise((r) => setTimeout(r, 260));
    const mid = await read(ELEVATION);
    expect(mid.hash, "the drawing did not move").not.toBe(before.hash);

    /* And it stops. Two samples a good way apart, after it should be over. */
    await new Promise((r) => setTimeout(r, 1200));
    const done = await read(ELEVATION);
    await new Promise((r) => setTimeout(r, 300));
    const still = await read(ELEVATION);
    expect(still.hash, "it never settled").toBe(done.hash);
    expect(done.hash, "it settled where it started").not.toBe(before.hash);

    /* The panel is its own size again, not the larger buffer the transition
       was allocated in. A canvas left at the transition's size would draw the
       rocket in a box with room at the side of it for a rocket that has
       gone. */
    const box = await page.evaluate(() => {
      const c = document.querySelectorAll("canvas")[0];
      const p = c.parentElement;
      return [
        Math.round(c.getBoundingClientRect().width),
        p ? Math.round(p.getBoundingClientRect().width) : 0,
      ];
    });
    expect(box[0], "the buffer outlived the transition").toBe(box[1]);
  });

  it("plays the whole staging through", async () => {
    await step("On the pad");
    await press("Play the staging");
    /* Five separations at `PLAY_MS`, which is 1.6 s — play is the slower of
       the two paces, because it is asking to watch rather than to arrive. The
       control stops itself at the end. */
    await new Promise((r) => setTimeout(r, 10_000));
    expect(await current(), "the play control did not reach the end").toBe(
      "Payload alone",
    );
    await step("On the pad");
  }, 60_000);

  it("stops where it has got to", async () => {
    /* Stopping changes which step is wanted without changing which pair is in
       flight, so the separation running finishes at the pace it began and the
       stepper settles on the one it was heading for — rather than snapping out
       of a half-played transition. */
    await step("On the pad");
    await press("Play the staging");
    await new Promise((r) => setTimeout(r, 2600));
    await press("Stop");
    await new Promise((r) => setTimeout(r, 2200));
    const where = await current();
    expect(where, "it did not stop part-way").not.toBe("On the pad");
    expect(where, "it ran to the end anyway").not.toBe("Payload alone");
    await step("On the pad");
  }, 60_000);

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

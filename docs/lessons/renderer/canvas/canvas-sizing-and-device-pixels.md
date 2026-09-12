# Canvas sizing and device pixels

**Syllabus:** [L16](../../README.md#part-3--language-and-platform)

**Why it matters:** Canvas sizing matters because a canvas has two sizes, the
CSS box layout puts it in and the pixel array it paints into, and the two
agree only on a screen with one device pixel per CSS pixel: on a phone with
two, a canvas sized to its buffer and given no style lays out at twice the
panel, which looked right in every container the code was written in and
wrong on the device; and because the buffer is what render targets are
allocated against, so a panel that changes size every frame of a
transition would reallocate tens of megabytes sixty times a second unless
the buffer is sized once for the largest box and the visible panel clipped
out of its corner.

**Before this:**
[L11](../cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_, and
[L12](../passes/render-targets-and-multi-pass-rendering.md), _Render targets
and multi-pass rendering_.

## A worked case

Size a 300 by 200 pixel panel's canvas the two ways `renderer.setSize` can,
on a screen with one device pixel per CSS pixel and on one with two, and
measure what layout does with it:

| Device pixel ratio | Call                       | Buffer  | Laid out at    |
| ------------------ | -------------------------- | ------- | -------------- |
| 1                  | `setSize(300, 200, false)` | 300×200 | 300×200 CSS px |
| 1                  | `setSize(300, 200)`        | 300×200 | 300×200 CSS px |
| 2                  | `setSize(300, 200, false)` | 600×400 | 600×400 CSS px |
| 2                  | `setSize(300, 200)`        | 600×400 | 300×200 CSS px |

At a ratio of one the four rows agree and nothing can be learned from them.
At two, the buffer is twice the panel in both rows, as it should be, but the
canvas with no style lays out at its buffer: a 600 by 400 element in a 300
by 200 panel, drawn at twice the size, with three quarters of it clipped.
That is the bug from #66, and it was invisible on the desktop it was written
on.

Then the cost of following a changing panel with the buffer. During a
staging transition one panel goes from 278 by 1284 CSS pixels to 531 by 425. Counting every byte the passes carry per device pixel, the four-byte
id texture and its depth texture, the fill target's resolve texture plus its
four-sample colour and depth, and the hidden-line target and its depth:

| Panel, CSS px | Device px at ratio 2 | Bytes for all targets | At 60 frames a second |
| ------------- | -------------------- | --------------------- | --------------------- |
| 278×1284      | 1,427,808            | about 74 MB           | about 4.5 GB/s        |
| 531×425       | 902,700              | about 47 MB           | about 2.8 GB/s        |

Allocated once for the largest box the transition passes through, the same
targets cost that once, and the rest of the transition costs only the fill
rate of pixels nobody sees.

```js
// run at the repository root: node canvas-demo.cjs — a canvas's two sizes at two device pixel ratios
const puppeteer = require("puppeteer");
const { existsSync } = require("fs");
const exe =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "linux" && process.arch === "arm64"
    ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync)
    : undefined);
(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    args: [
      "--no-sandbox",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  for (const dpr of [1, 2]) {
    const p = await b.newPage();
    await p.setViewport({ width: 800, height: 600, deviceScaleFactor: dpr });
    await p.setContent(
      `<div style="width:300px;height:200px;overflow:hidden"><canvas id=a></canvas></div><div style="width:300px;height:200px;overflow:hidden"><canvas id=b></canvas></div>`,
    );
    console.log(
      await p.evaluate(() => {
        const dpr = window.devicePixelRatio;
        const setSize = (c, w, h, updateStyle = true) => {
          // what three.js's WebGLRenderer.setSize does, from its source
          c.width = Math.floor(w * dpr);
          c.height = Math.floor(h * dpr);
          if (updateStyle) {
            c.style.width = w + "px";
            c.style.height = h + "px";
          }
        };
        const a = document.getElementById("a"),
          bb = document.getElementById("b");
        setSize(a, 300, 200, false);
        setSize(bb, 300, 200);
        const gl = a.getContext("webgl2");
        const r = (c) => {
          const q = c.getBoundingClientRect();
          return `buffer ${c.width}x${c.height}, laid out at ${q.width}x${q.height} CSS px`;
        };
        const c3 = document.createElement("canvas");
        setSize(c3, 80.5, 200);
        return [
          `devicePixelRatio ${dpr}`,
          `  setSize(300, 200, false): ${r(a)}; drawingBuffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
          `  setSize(300, 200):        ${r(bb)}`,
          `  an 80.5 px panel: buffer ${c3.width} wide — floor(80.5 × ${dpr}); rounding the CSS width first would give ${Math.round(80.5) * dpr}`,
        ].join("\n");
      }),
    );
  }
  const bytesPerPx = 4 + 4 + (4 + 4 * 4 + 4 * 4) + 4 + 4; // id + depth; fill resolve + 4x colour + 4x depth; hid + depth
  for (const [w, h] of [
    [278, 1284],
    [531, 425],
  ]) {
    const n = Math.floor(w * 2) * Math.floor(h * 2);
    const mb = (n * bytesPerPx) / 1e6;
    console.log(
      `${w}x${h} CSS px at ratio 2: ${n.toLocaleString("en-US")} device px, ${mb.toFixed(0)} MB of targets, ${((mb * 60) / 1000).toFixed(1)} GB/s if reallocated at 60 Hz`,
    );
  }
  await b.close();
})();
```

## The idea

A **CSS pixel** is the unit layout is measured in: the `300px` a panel is
given, the `width` a bounding rectangle reports, the coordinates a click
arrives in. It is defined by how far away a screen is meant to be viewed
from, not by its hardware, so a `300px` panel is about the same size to the
eye on a phone held close and a monitor across a desk. A **device pixel** is
a physical screen pixel, and there are two or three of them to a CSS pixel
on a phone and most laptops now; `window.devicePixelRatio` is the ratio,
and it is also what a page's zoom changes.

A canvas has both. Its `width` and `height` attributes size its **drawing
buffer**, the pixel array it paints into, in device pixels if it is to be
sharp; its CSS `width` and `height` size the box layout puts it in. Nothing
ties them together. Set only the attributes and the box defaults to the
buffer's size in CSS pixels, one CSS pixel per buffer pixel, so a buffer
sized for a ratio of two lays out twice as large. Set the style too and the
browser scales the buffer into the box, and at the matching ratio each
buffer pixel lands on one device pixel. Three.js's `setSize(w, h)` does both,
`canvas.width = floor(w × ratio)` and `style.width = w + "px"`, and its third
argument, `false`, does only the first, for callers who lay the canvas out
themselves. It floors rather than rounds, so an 80.5 CSS pixel panel at a
ratio of two is a 161 pixel buffer and not 162.

The ratio is set once, `setPixelRatio(min(2, devicePixelRatio))`, capped
because a ratio of three is nine times the pixels of one for a schematic
whose lines are already a device pixel wide, and because the fill target is
multisampled on top. Everything measured in the buffer's grid has to be
scaled by it: a dash period of seven CSS pixels is fourteen device pixels
on the phone, or the dashes come out half the size they were designed at;
a texel is one over the buffer's width, not the panel's; the outline is
grown by device pixels.

The buffer is also what render targets are allocated against, and a render
target is memory on the card sized to the buffer. A still frame is one size
and allocates once. A transition is a different matter: the panel's box is
a function of the rocket's extent, the extent changes every frame as a
stage falls away, and a canvas resized every frame reallocates every target
behind it, tens of megabytes at a ratio of two, sixty times a second. The
resolution is to separate the buffer's size from the panel's. The buffer is
allocated once at the largest box the transition passes through, sampled
at nine instants because the panel size is not monotone in the extent; the
panel is a wrapper with `overflow: hidden` around the buffer's top-left
corner; and the camera's frustum is made asymmetric, its right and bottom
edges pushed out by the ratio of buffer to panel, so that corner frames
exactly what a symmetric camera would have framed in a buffer of the
panel's size. In a still frame the two boxes are equal, the ratios are one
and the frustum is the ordinary one.

```
   CSS px  ─── layout, clicks, `300px`                ratio 2 ───►  device px ─── the buffer, targets, dashes
   panel 300×200 ─────────────────────────────────────────────────►  buffer 600×400   (setSize floors w × ratio)

   still frame                          transition frame
   ┌─────────────┐ panel = buffer       ┌──────────────────────┐ buffer: largest box of the transition
   │             │                      │ panel      ┊         │
   │   rocket    │                      │  (visible) ┊         │  wrapper clips the corner;
   │             │                      ├┄┄┄┄┄┄┄┄┄┄┄┄┘         │  frustum: right = −halfW + 2·halfW·(bufW/width)
   └─────────────┘                      │        drawn, unseen  │           bottom = halfH − 2·halfH·(bufH/height)
                                        └──────────────────────┘
```

## In this codebase

[`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx)
takes `width` and `height`, the visible box, and an optional `buffer`, the
drawing buffer's box, and the two are the same in every still frame. The
renderer is created once with `preserveDrawingBuffer`, given
`setPixelRatio(Math.min(2, window.devicePixelRatio || 1))`, and sized in
CSS pixels with the style left to three.js:

```ts
/* Sized in CSS pixels, and the style left to three.js to set: the canvas
   is devicePixelRatio times bigger in device pixels, and without a style
   it would lay out at that size — twice the panel on a phone. */
renderer.setSize(bufW, bufH);
```

The targets are allocated from `bw = round(bufW × dpr)` and `bh`, the
texel is `1 / bw`, and the dash period is `DASH_PERIOD * dpr`, seven CSS
pixels scaled to the buffer's grid. The camera is the asymmetric
`OrthographicCamera(-halfW, -halfW + 2 * halfW * wide, halfH, halfH - 2 *
halfH * tall, near, far)` with `wide = bufW / width` and `tall = bufH /
height`, and the component's root is a `div` of the visible size with
`overflow: hidden` around the canvas. The largest box is computed in
[`src/ui/components/build.tsx`](../../../../src/ui/components/build.tsx),
the `buffers` memo, by posing the separation at nine instants and growing
each panel's box over them, once per transition. The rules are in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md):
_Resizing a canvas per frame reallocates every render target behind it_ and
_`renderer.setSize(w, h, false)` does not size the canvas_.

## What made it real

The layout table is the measurement, and its whole content is the two rows
at ratio two, because at ratio one the bug cannot be seen. That is why the
visual suite runs at `SCALE = 2` in
[`visual/browser.ts`](../../../../visual/browser.ts): a harness at one would
have passed #66 with the bug in place. `visual/render.test.ts` then holds
every panel's buffer at exactly `floor(css × 2)` on both axes, and the
`floor` is itself a record, because rounding the CSS width first made the
check pass on one browser and fail on another half a pixel away while the
drawing was right in both.

The reallocation was seen as frame time before it was counted as bytes: one
effect keyed on everything rebuilt the scene and the targets to move a part
a metre lower, and following the panel with `setSize` did the same sixty
times a second. The rule records the sizes, 278 by 1284 to 531 by 425, and
the arithmetic above puts them at tens of megabytes a frame; two
allocations instead of sixty is the number the fix is measured by.

## Where it breaks

- **A ratio-one development machine.** Buffer and box agree, and a canvas
  with no style looks right. Test at a ratio of two, in the harness or with
  the browser zoomed, before believing a canvas is sized.
- **`setSize(w, h, false)` without a style of your own.** The canvas lays
  out at its buffer, twice the panel on a phone. Let three.js set the style
  or set it yourself.
- **A CSS measure used in the buffer's grid.** A dash period, a texel, an
  outline width or a pick radius in CSS pixels is half its size at ratio
  two. Multiply by the renderer's pixel ratio where the shader uses it.
- **Following the panel with the buffer.** Every resize reallocates every
  target. Size the buffer once for the largest box and clip the panel from
  its corner, with the frustum made asymmetric to match.
- **Rounding where three.js floors.** A fractional panel width times the
  ratio is floored into the buffer; a check that rounds first is half a
  pixel off on some browsers.

## Try it

Run the script and read the ratio-two rows. Then, in the application on a
laptop with a ratio above one, open the developer tools, select a build-view
canvas and compare its `width` attribute with its CSS width in the computed
styles; zoom the page to 200 percent and watch the attribute double while
the CSS width holds. Then step a staging transition with the scrubber and
watch the panel change size while, in the elements panel, the canvas's
attributes do not.

## Check yourself

<details><summary>A canvas has its <code>width</code> attribute set to 600 and no style, in a 300 pixel panel on a phone with a ratio of two. How big does it appear?</summary>

Six hundred CSS pixels wide, twice the panel, with the excess clipped by
the wrapper. The attribute sizes the buffer; with no style the box defaults
to one CSS pixel per buffer pixel. The style has to say 300 pixels for the
buffer's 600 to land one per device pixel.

</details>

<details><summary>Why is the dash period stored in CSS pixels and multiplied by the pixel ratio where it is used?</summary>

Because it is a design decision about how the dashes look to the eye, and
the eye sees CSS pixels; the shader measures in the buffer's grid, which is
the ratio times finer. Seven CSS pixels is fourteen buffer pixels on the
phone, and without the multiply the dashes would come out half the size.

</details>

<details><summary>During a transition the panel changes size every frame. Why is the drawing buffer not resized to follow it?</summary>

Because every target is allocated against the buffer, and reallocating them
at a ratio of two is tens of megabytes a frame at sixty frames a second.
The buffer is sized once for the largest box the transition passes through,
the panel clips its top-left corner, and the frustum is made asymmetric so
that corner shows exactly what a panel of that size should.

</details>

## Further reading

- The HTML specification on the `canvas` element, for the `width` and
  `height` attributes and the intrinsic size they give the element.
- The CSS Values specification on the reference pixel, for what a CSS pixel
  is defined against and why it is not a hardware unit.
- The three.js documentation for `WebGLRenderer.setSize` and
  `setPixelRatio`, and the source of `setSize`, which is four lines.

## Key takeaway

A canvas has a buffer in device pixels and a box in CSS pixels, tied
together only by a style, so a buffer scaled for a ratio of two lays out
at twice the panel without one; and because every render target is
allocated against the buffer, the buffer is sized once for the largest box
a transition passes through and the visible panel is clipped out of its
corner, with the camera's frustum made asymmetric to match.

_As of 5451f84._

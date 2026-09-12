# What jsdom cannot see

**Syllabus:** [V2](../../README.md#part-4--verification)

**Why it matters:** Knowing what the test environment cannot see matters
because the main suite runs the whole application in jsdom, a document
model with no layout, no drawing and no worker, so every element there is
zero pixels wide, every canvas has no context and every measurement of the
interface is a number the environment made up; three rendering bugs shipped
past a green build that way and a person found each one, and the visual and
layout suites run a real browser precisely for the things the green build
could not have failed on.

**Before this:**
[L11](../../renderer/cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_.

## A worked case

Ask jsdom and a real headless browser the same questions about the same
page, a canvas and a 300 by 44 pixel `div` with the word "Solve" in it, the
browser emulating a 390-pixel phone at a device pixel ratio of two:

| Question                               | jsdom, in `npm test`     | Headless Chromium, in `npm run test:visual` |
| -------------------------------------- | ------------------------ | ------------------------------------------- |
| `canvas.getContext("webgl2")`          | `null`                   | `WebGL 2.0 (OpenGL ES 3.0 Chromium)`        |
| `canvas.getContext("2d")`              | `null`                   | a context                                   |
| `typeof Worker`                        | `undefined`              | `function`                                  |
| `typeof CompressionStream`             | `function`               | `function`                                  |
| `window.visualViewport`                | `undefined`              | 390×844                                     |
| `typeof matchMedia`, `ResizeObserver`  | `undefined`, `undefined` | `function`, `function`                      |
| `innerWidth × innerHeight`             | 1024×768, always         | 390×844                                     |
| `devicePixelRatio`                     | 1                        | 2                                           |
| The div's `getBoundingClientRect()`    | 0×0                      | 300×44                                      |
| The div's `offsetWidth`                | 0                        | 300                                         |
| `getComputedStyle(div).width`          | `300px`                  | `300px`                                     |
| `div.style.width = "NaNpx"` reads back | `"300px"`, unchanged     | `"300px"`, unchanged                        |
| `document.documentElement.scrollWidth` | 0                        | 390                                         |
| `matchMedia("(hover: none)")`          | not callable             | matches: headless answers `hover: none`     |

Read the rows in three groups. The first four are capabilities: jsdom has
no WebGL and no 2D canvas, so nothing can be drawn and `canRender3D()` is
false in every test under `test/`; it has no `Worker`, so every test solves
in-process and the worker protocol is tested on numbers; it does have
`CompressionStream`, because that comes from Node, so the share link is
real there. The middle rows are the viewport: jsdom's window is 1024 by 768
whatever the test says, at a ratio of one, with no visual viewport and no
media queries, so nothing about a phone can be asked of it. The last rows
are layout: an element with an explicit `width: 300px` has a computed width
of `300px` in both, because that is a string read back from the style, but
its rectangle is zero by zero in jsdom, because no layout was ever run, and
so is the page's scroll width. And one row is the same in both: the CSSOM
discards a value it cannot parse on assignment, so `NaNpx` leaves the width
at `300px` in a real browser as much as in jsdom, and no environment can
see a bad number in a CSS value after the fact.

```ts
// save as test/v2.test.tsx and run: npx vitest run test/v2.test.tsx --reporter=verbose — the jsdom column
// @vitest-environment jsdom
import { test } from "vitest";

test("what jsdom answers", () => {
  const c = document.createElement("canvas"); // one canvas holds one kind of context, so a second for 2d
  const c2 = document.createElement("canvas");
  document.body.appendChild(c);
  const el = document.createElement("div");
  el.style.cssText = "width:300px;height:44px;position:absolute";
  el.textContent = "Solve";
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  const probe: Record<string, unknown> = {
    "canvas.getContext('webgl2')": String(c.getContext("webgl2" as "2d")),
    "canvas.getContext('2d')": String(c2.getContext("2d")),
    "typeof Worker": typeof Worker,
    "typeof CompressionStream": typeof CompressionStream,
    "window.visualViewport": String(window.visualViewport),
    "typeof matchMedia": typeof window.matchMedia,
    "typeof ResizeObserver": typeof (globalThis as { ResizeObserver?: unknown })
      .ResizeObserver,
    "innerWidth x innerHeight": `${innerWidth}x${innerHeight}`,
    devicePixelRatio,
    "300x44 div getBoundingClientRect": `${r.width}x${r.height}`,
    offsetWidth: el.offsetWidth,
    "getComputedStyle(el).width": getComputedStyle(el).width,
    "el.style.width = 'NaNpx' reads back":
      ((el.style.width = "NaNpx"), JSON.stringify(el.style.width)),
    scrollWidth: document.documentElement.scrollWidth,
  };
  console.log(
    Object.entries(probe)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );
});
```

```js
// run at the repository root: node browser-probe.cjs — the same questions in the visual suite's browser
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
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      "--enable-unsafe-swiftshader",
    ],
  }); // visual/browser.ts's flags
  const p = await b.newPage();
  await p.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  }); // the layout suite's phone
  await p.setContent(
    `<meta name="viewport" content="width=device-width"><canvas id=c></canvas><canvas id=c2></canvas><div id=d style="width:300px;height:44px;position:absolute">Solve</div>`,
  );
  console.log(
    await p.evaluate(() => {
      const c = document.getElementById("c"),
        el = document.getElementById("d"),
        r = el.getBoundingClientRect(),
        gl = c.getContext("webgl2");
      const probe = {
        "canvas.getContext('webgl2')": gl
          ? gl.getParameter(gl.VERSION)
          : String(gl),
        "canvas.getContext('2d')": document
          .getElementById("c2")
          .getContext("2d")
          ? "a context"
          : "null", // a second canvas
        "typeof Worker": typeof Worker,
        "typeof CompressionStream": typeof CompressionStream,
        "window.visualViewport": `${visualViewport.width}x${visualViewport.height}`,
        "typeof matchMedia": typeof matchMedia,
        "typeof ResizeObserver": typeof ResizeObserver,
        "innerWidth x innerHeight": `${innerWidth}x${innerHeight}`,
        devicePixelRatio,
        "300x44 div getBoundingClientRect": `${r.width}x${r.height}`,
        offsetWidth: el.offsetWidth,
        "getComputedStyle(el).width": getComputedStyle(el).width,
        "el.style.width = 'NaNpx' reads back":
          ((el.style.width = "NaNpx"), JSON.stringify(el.style.width)),
        scrollWidth: document.documentElement.scrollWidth,
        hover: matchMedia("(hover: none)").matches ? "none" : "hover",
        "prefers-color-scheme": matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light",
      };
      return Object.entries(probe)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    }),
  );
  await b.close();
})();
```

## The idea

**jsdom** is a simulation of a browser's document model that runs in Node:
it parses HTML into a DOM, runs scripts against it, fires events, and
implements the object model React and the tests need to mount a component
and read its text. It does no layout and no drawing. There is no box model
behind `getBoundingClientRect`, so every rectangle is zero; no rasteriser
behind `canvas`, so every context is null; no compositor, no viewport, no
media, no worker thread. What it gives in return is speed and determinism:
the whole application mounts in milliseconds and the suite runs anywhere
Node does, which is why the render sweep can drive every destination,
objective and profile and scan the text for `NaN` in the time the design
snapshot takes to solve.

A **headless browser** is a real browser run without a window, driven by a
script: the same engine a user has, laying out the same boxes and compiling
the same shaders, with a viewport, a device pixel ratio and media features
the script sets. Here it is Chromium through puppeteer, with WebGL through
SwiftShader, ANGLE's software rasteriser, which has to be opted into by name
since Chromium stopped falling back to it on its own; without the flag a
recent Chrome creates no context at all and the tests would quietly be
checking the no-WebGL path, the exact thing they exist to escape. It costs
seconds where jsdom costs milliseconds, needs a browser binary the runner
has to fetch, and renders software pixels that are not promised stable
across versions, so it is a separate script and a separate CI job, and it
asserts properties of pixels rather than comparing golden images.

The division between the two follows from the table. Everything that is a
question about values goes to jsdom: does the app mount, do the numbers
parse, does a link round-trip, does a button's handler fire, does the text
contain `undefined`. Everything that is a question about pixels or the
platform goes to the browser: did a shader compile, was anything drawn, is
each canvas the size of its panel at a ratio above one, does the drawing
survive a repaint, does the plan redraw when a stage is dropped, does the
outline colour appear, did the console stay quiet; and the layout suite's
budgets, the page's height and word count, targets under 44 pixels, text
under 12, anything wider than its box, what a keyboard can reach, and what
axe objects to. Each browser check is a bug that shipped past a green
jsdom suite, and the rule records the proof: reintroduce `setSize(w, h,
false)` and one test fails, drop `preserveDrawingBuffer` and four do, break a
line of GLSL and three do, one naming the compiler error.

```
   question                          jsdom (npm test)        headless Chromium (npm run test:visual)
   ────────────────────────────────  ──────────────────────  ─────────────────────────────────────────
   does it mount, do values parse    yes: ms per mount        (also, but seconds)
   text contains NaN / undefined     yes: textContent         —
   worker protocol                   on numbers, in-process   the real worker, on the preview only
   shader compiled, pixels drawn     no context               yes: canvas pixels, console
   canvas sized for its panel        rect is 0×0              yes, at ratio 2
   page height, targets, type floor  every box is 0×0         yes: measure.ts inside the page
   a bad number in a CSS value       discarded on assignment  discarded on assignment — neither
   a real GPU, a thumb, a keyboard   —                        — : the device, by a person
```

Two things stay outside both. The CSSOM validates on assignment and
silently discards what it cannot parse, so `width: NaN%` reads back as the
old value in every environment, and only string-valued properties such as
`font-family` survive to be seen, which is why the `fmt` rule exists
upstream of the styles. And a real GPU, a phone's address bar and
on-screen keyboard, a thumb's reach and whether the words counted are the
right ones are checked on the Cloudflare preview by a person, on the device,
which is where mobile behaviour is decided.

## In this codebase

[`vitest.config.js`](../../../../vitest.config.js) collects `test/**` with
[`test/setup.ts`](../../../../test/setup.ts), which clears the roster and
the address before each test; the environment is jsdom per file. `canRender3D`
in [`src/ui/components/build.tsx`](../../../../src/ui/components/build.tsx)
asks whether the WebGL constructors exist before asking for a context, so
jsdom does not log a "not implemented" error on every mount, and takes the
text path when they do not.
[`vitest.visual.config.js`](../../../../vitest.visual.config.js) collects
`visual/**` alone, one browser, one page, walked in order, since parallel
workers would each launch a Chrome and software rendering makes the
launches cost more than the assertions. [`visual/browser.ts`](../../../../visual/browser.ts)
is the harness: the SwiftShader flags, the choice of binary, which on a
linux-arm64 dev container is Debian's `chromium` because Chrome for Testing
publishes no build for it, a static server for `dist/`, `open()` pinning the
dark theme before `goto` because headless answers `light`, and `settle()`,
which waits for the solver's pulse, two canvases and the build view's
`data-motion` to clear. [`visual/render.test.ts`](../../../../visual/render.test.ts)
is the WebGL half and [`visual/layout.test.ts`](../../../../visual/layout.test.ts)
the budgets, with [`visual/measure.ts`](../../../../visual/measure.ts)
running inside the page to count targets and text.
[`.claude/rules/verification.md`](../../../../.claude/rules/verification.md)
says what each suite does and what none of them reach.

## What made it real

The table is the measurement, taken on this machine in both environments.
The history is #66 and #73: three rendering bugs, a canvas laid out at
twice its panel, a drawing that went blank on the next repaint, and a
shader that failed to compile, each shipped past a green build because
`canRender3D()` was false in every test and the build view took a path no
user takes, and each found by a person. The visual suite was written to
close that gap, and the rule's counts, one, four and three failing tests
when each bug is reintroduced, are the proof that it did. The layout
suite's origin is the same shape: a 10-pixel label, a 16-pixel button, a
3,000-pixel table and a clickable `div` each passed jsdom, where every box
is zero, and each is now named.

## Where it breaks

- **Measuring layout in jsdom.** Every rectangle is 0×0 and every scroll
  width 0. A containment or overflow check there passes on anything; the
  model checks moved to `modelOf` for that reason, and the panel checks to
  the browser.
- **Believing `canRender3D()` in a test.** It is false under `test/`, so
  the 3D view is never built there and nothing about it is tested by the
  main suite.
- **Running the browser without the SwiftShader flags.** Recent Chrome
  creates no context and the suite quietly checks the no-WebGL path.
- **A golden image.** SwiftShader is not stable to the pixel across
  versions; the suite asserts properties of pixels instead.
- **Trusting the headless browser about a phone.** It answers `hover:
none` and will not emulate otherwise, has no address bar and no keyboard,
  and its `light` default has to be pinned. The device is the last check.
- **Sampling mid-animation.** A frame of a staging transition read as the
  step; `settle` waits on `data-motion` unless told the frame is what is
  wanted.

## Try it

Run both snippets and set the columns side by side. Then mount any
component in a jsdom test and log its `getBoundingClientRect()`; it is
zero. Then run `npm run test:visual` once, open `visual/.out/phone.png`,
and compare what you see with what the layout suite's numbers say about
it: the numbers are what a check can hold, the picture is what a person
reads.

## Check yourself

<details><summary>A jsdom test asserts that every part of the drawing lies inside its panel, and passes. What has it proved?</summary>

Nothing about the drawing. jsdom runs no layout, so every rectangle it
reports is zero by zero and every containment test passes vacuously; and
it has no WebGL, so the build view there never draws at all. The question
moved to the model, where overlap and height are arithmetic, and to the
browser, where the canvas has pixels.

</details>

<details><summary>Why does the visual suite assert properties of the pixels instead of comparing against a stored screenshot?</summary>

Because it renders through SwiftShader, which is not promised stable to the
pixel across versions, and a baseline whose diffs nobody can explain is a
cost this repository has already priced with the design snapshot. "Some
pixel is the outline colour" and "the buffer is twice the CSS size" survive
a renderer update; a golden image does not.

</details>

<details><summary>Both environments leave <code>width: 300px</code> unchanged after <code>el.style.width = "NaNpx"</code>. What follows for testing?</summary>

That no environment can see a bad number in a CSS value after it is
assigned: the CSSOM validates and discards on the way in, in a real
browser as much as in jsdom. Only string-valued properties survive to be
seen, so the check has to sit upstream, on the number before it is
formatted, which is what the `fmt` rule does.

</details>

## Further reading

- The jsdom project's README, its section on "Unimplemented parts of the
  web platform", which lists layout and navigation first.
- The puppeteer documentation on `launch` arguments and `setViewport`, and
  Chromium's notes on SwiftShader and `--enable-unsafe-swiftshader`.
- Kent C. Dodds, "Testing Implementation Details" and the Testing Library
  guiding principles, for what a DOM-level test is good at and what it is
  not.

## Key takeaway

jsdom is a document model with no layout, no drawing and no platform, so
it answers questions about values in milliseconds and answers every
question about pixels or the viewport with zero or null; the checks that
shipped bugs past it run in a real headless browser, cost seconds, assert
properties rather than golden images, and still stop short of a real GPU
and a real phone, which a person checks on the device.

_As of 1f70e94._

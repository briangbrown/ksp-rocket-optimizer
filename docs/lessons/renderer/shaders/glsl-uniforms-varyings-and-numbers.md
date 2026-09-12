# GLSL: uniforms, varyings, and numbers

**Syllabus:** [L13](../../README.md#part-3--language-and-platform)

**Why it matters:** The shading language matters because every pixel of the
build view is computed by small programs the GPU runs, one per vertex and
one per candidate pixel, written in a C-like language with rules its host
language does not have: there is no promotion from an integer to a float,
so `pow(v, 3)` does not compile where `pow(v, 3.0)` does, and JavaScript's
`${3.0}` is the string `3`, so tuning a constant from 2.6 to 3.0 broke the
outline pass and the only trace was a console message; and there is no
colour management inside a bare shader, so what is authored is what is
drawn, while the one call that does convert made the panel behind the
rocket a third as bright as the card around it.

**Before this:** [L11](../cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_.

## A worked case

Compile four fragment shaders in the visual suite's own Chromium and read
what the driver says:

| Fragment shader body                               | Result                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `gl_FragColor = vec4(pow(v, 3), 0.0, 0.0, 1.0);`   | FAILS: `'pow' : no matching overloaded function found`                                        |
| `gl_FragColor = vec4(pow(v, 3.0), 0.0, 0.0, 1.0);` | compiles                                                                                      |
| `gl_FragColor = vec4(pow(v, 2.6), 0.0, 0.0, 1.0);` | compiles                                                                                      |
| `int n = 3; float x = n * 0.5;`                    | FAILS: `'*' : wrong operand types - no operation '*' exists that takes … 'int' and … 'float'` |

The second and third rows are the trap. A constant interpolated into a
shader from JavaScript, `pow(v, ${K})`, produces `2.6` when `K` is 2.6 and
`3` when `K` is 3.0, because JavaScript has one number type and prints a
whole number without its point. GLSL has two, and `pow` takes floats. So
the shader compiled at 2.6, compiled at 3.4, and failed at 3.0; the pass it
belonged to drew nothing; nothing in the page reported it; and a person
tuning the constant saw the outline vanish at one value and not its
neighbours. Everything interpolated into a shader here now goes through one
function that writes a whole number as `3.0`.

```js
// run at the repository root: node glsl-demo.cjs — compiles four shaders in the visual suite's Chromium
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
  const p = await b.newPage();
  await p.setContent("<canvas id=c></canvas>");
  console.log(
    (
      await p.evaluate(() => {
        const c = document.getElementById("c"),
          gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return ["no WebGL context"];
        const compile = (src) => {
          const s = gl.createShader(gl.FRAGMENT_SHADER);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          return gl.getShaderParameter(s, gl.COMPILE_STATUS)
            ? "compiles"
            : "FAILS: " + gl.getShaderInfoLog(s).trim().split("\n")[0];
        };
        const frag = (k) =>
          `precision mediump float; uniform float v; void main() { gl_FragColor = vec4(pow(v, ${k}), 0.0, 0.0, 1.0); }`;
        const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n)); // the helper every interpolated number goes through
        return [
          `\${3.0} is the string "${3.0}"; f(3.0) is "${f(3.0)}"`,
          "pow(v, 3):   " + compile(frag(3.0)),
          "pow(v, 3.0): " + compile(frag(f(3.0))),
          "pow(v, 2.6): " + compile(frag(f(2.6))),
          "int * float: " +
            compile(
              "precision mediump float; void main() { int n = 3; float x = n * 0.5; gl_FragColor = vec4(x); }",
            ),
          gl.getParameter(gl.VERSION),
        ];
      })
    ).join("\n"),
  );
  await b.close();
})();
```

## The idea

A **shader** is a small program the GPU runs for every vertex or every
pixel: the vertex shader once per vertex of every triangle, producing its
position on screen and any values to carry along; the fragment shader once
per **fragment**, one candidate pixel and its data, producing a colour or
discarding the fragment. They run in parallel across thousands of cores and
know nothing of one another, which is why the language forbids most of what
makes a program hard to parallelise and why its values are of three kinds.

**GLSL** is the C-like language they are written in, and it is strict where
JavaScript is loose. It has `int` and `float` as distinct types with no
implicit conversion between them: `3` is an integer, `3.0` a float, and an
integer where a float is wanted is an error, not a widening. Its functions
are overloaded on exact types, so `pow(float, float)` exists and
`pow(float, int)` does not. It has precision qualifiers, `mediump` and
`highp`, that decide how many bits a float carries on a device. And it
compiles at run time on the user's device, so a program that fails to
compile fails there, with the driver's message, and the pass simply draws
nothing.

A **uniform** is a value the same for every vertex and every fragment of one
draw: the light direction, a part's id, the panel colour, the dash period,
the textures of the earlier passes. It is set from JavaScript before the
draw and read from the shader by name. Because uniforms are numbers,
`vec3(0.9, 0.93, 0.96)`, not names, the shaders cannot read the theme's
custom properties: `C.panel` is the string `var(--panel)`, meaningless to
three.js, so every material is built from `palette(theme)`, resolved
colours, and a theme change is a rebuild of the scene rather than a
stylesheet swap.

A **varying** is a value computed per vertex and interpolated to each
fragment: the vertex shader writes it, the rasteriser blends it across the
triangle, the fragment shader reads the blend. The Gooch fill carries the
normal, `vN`, so each fragment shades by its own interpolated orientation;
the hidden lines carry `along`, the arc length along the stroke, so each
fragment knows how far along its dash it is and `fract(vAlong / dash) >
0.55` discards the gap. That is the answer to a question a fragment cannot
otherwise ask: it knows where it is on the screen, not where it is on its
line, and a dash phased on screen position ran from two pixels to thirty
round one ellipse.

```
   JavaScript                        vertex shader (per vertex)          fragment shader (per pixel)
   ──────────                        ─────────────────────────          ───────────────────────────
   uniforms: { base: vec3, dash: 7 } ─────────────────────────────────► uniform vec3 base; uniform float dash;
   attribute along (per vertex)  ──► varying float vAlong = along; ──► varying float vAlong;   (interpolated)
   `${f(0.55)}` → "0.55"          ──► … ──────────────────────────────► if (fract(vAlong / dash) > 0.55) discard;
   `${3.0}`     → "3"              ──► pow(v, 3)  ✗ no overload          pow(v, 3.0) ✓
```

Colour is the other rule. Modern three.js manages colour: a hex handed to a
material is converted from the sRGB it was authored in to a linear working
space, and the output is converted back. A bare `ShaderMaterial` bypasses
both directions, and here that is wanted: the palette's mid-tones were
chosen by eye in sRGB, the Gooch ramp mixes toward them, and what is
authored is what is drawn. The trap is the one call that does not go
through a shader. `setClearColor(hex)` converts, so the clear behind the
rocket would be the linear value of the panel token, the same colour about a
third as bright, and the drawing would sit in a darker rectangle than the
card. `panelClear` names the working space so the conversion is a no-op.

## In this codebase

[`src/ui/components/shaders.ts`](../../../../src/ui/components/shaders.ts)
is every shader in the application, five materials with thirteen uniform
and six varying declarations between them, and the helper that writes
numbers:

```ts
/* A number as GLSL sees it. `${3.0}` is the string "3", and GLSL has no
   `pow(float, int)` — the shader fails to compile, the pass draws nothing, and
   the only trace is a console message. Anything interpolated into a shader
   goes through here. */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
```

`goochMaterial` is the fill: uniforms `base`, `cool` and `warm` as `vec3`s
from the resolved palette, a varying `vN` for the normal, the light as a
constant string fixed in view space so turning the model does not swing the
shading, and `f(COOL_MIX)` and `f(WARM_MIX)` interpolated into the mix.
`idMaterial` writes a two-byte id as a `vec2` uniform. `ghostLineMaterial`
takes the `along` attribute into the varying `vAlong` and discards by
`fract(vAlong / dash) > ${f(DASH_DUTY)}`, decoding ids from the peel texture
with `floor(t.r * 255.0 + 0.5)`. `compositeMaterial` samples four textures
through uniforms and cues depth with a `#define`. `panelClear` and `raw`
are the colour rules, and the `LIGHT` string is what a constant that will
never change looks like when it is not a uniform. The rules are in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md): _A
whole number interpolated into GLSL loses its decimal point_, _A bare
`ShaderMaterial` bypasses colour management in both directions_, and _A
theme change is a rocket change_.

## What made it real

The compile table is the measurement, reproducible on this machine's
Chromium: `pow(v, 3)` refused, `pow(v, 3.0)` and `pow(v, 2.6)` accepted,
`int * float` refused with the driver's own words. The rule records how it
was found: 2.6 and 3.4 compiled and 3.0 did not, "so tuning a constant broke
it," and `npm run test:visual` caught it by reading the console, which
nothing under `test/` can do because jsdom compiles no shaders.

The panel a third as bright is the measurement for colour: `setClearColor`
with the panel's hex cleared to its linear value, and the drawing sat in a
visibly darker rectangle. [`visual/render.test.ts`](../../../../visual/render.test.ts)
samples the clear colour and the outline under both themes and expects each
token's value to the bit, which is what holds both the no-op conversion and
the theme rebuild. And the dash phased on the screen diagonal is the
measurement for the varying: two to thirty pixels round one ellipse until
`along` carried the arc length in.

## Where it breaks

- **A whole number in a template string.** `${3.0}` is `3`, an integer to
  GLSL, and the shader will not compile at that value and only that value.
  Every interpolated number goes through `f()`.
- **Integer arithmetic with floats.** `n * 0.5` with `n` an `int` is a
  compile error; cast with `float(n)`, as the composite's loop does.
- **A hex through a managed call.** `setClearColor(C.panel)` converts to
  linear and the panel darkens by a third; the shaders convert nothing, so
  the clear must not either.
- **Uniforms holding a theme.** They are numbers, and a theme change is a
  rebuild of every material, not a stylesheet swap. `theme` is a prop of the
  view and a dependency of its build effect.
- **A silent failure.** A shader that does not compile draws nothing and
  says so only in the console. The visual suite reads the console; the unit
  suite cannot.

## Try it

Run the script at the repository root and read the six lines. Then change
`frag(f(2.6))` to `frag(${2.6 * 5})` and watch `pow(v, 13)` fail, because
the product is whole; then wrap it in `f()` again and it compiles. Then
open the application, change the theme, and note that the rocket redraws
rather than recolouring, because every uniform in it is a number.

## Check yourself

<details><summary>Why did the outline shader compile with a constant of 2.6 and 3.4 but not 3.0?</summary>

Because JavaScript prints 3.0 as `3`, and in GLSL `3` is an integer. `pow`
is overloaded on floats only, so `pow(v, 3)` has no matching function while
`pow(v, 2.6)` and `pow(v, 3.4)` do. The helper `f()` writes a whole number
as `3.0`, and every number interpolated into a shader goes through it.

</details>

<details><summary>A fragment knows its position on the screen. Why can it not dash a line by that alone?</summary>

Because a dash is measured along the stroke, and a fragment knows where it
is, not how far along its line it is. A dash phased on screen position ran
from two pixels to thirty round one ellipse, short where the stroke crossed
the phase direction and endless where it ran along it. The arc length is
computed on the geometry, written per vertex as `along`, and carried to
each fragment as a varying.

</details>

<details><summary>Why is a theme change a rebuild of the scene when the rest of the page re-themes through a stylesheet?</summary>

Because the page's colours are `var(--name)` references a stylesheet
resolves, and a shader's uniforms are numbers. `C.panel` is the string
`var(--panel)`, which is not a colour to three.js, so every material is
built from the resolved palette and a theme change makes new materials,
which is why `theme` is a dependency of the build effect.

</details>

## Further reading

- The OpenGL ES Shading Language 1.0 specification, sections on basic types
  and implicit conversions (there are none), and on precision qualifiers.
- The three.js manual, "Color management", for what a managed material
  converts and what a `ShaderMaterial` does not.
- Patricio Gonzalez Vivo and Jen Lowe, _The Book of Shaders_, for uniforms,
  varyings and the fragment shader's view of the world.

## Key takeaway

A shader is a small strict program run per vertex and per pixel: a uniform
is the same for the whole draw, a varying is written per vertex and
interpolated to each fragment, an integer is never a float so `${3.0}` must
be written as `3.0`, and a bare shader converts no colours, so the one call
that does must be told not to; each rule has a failure behind it that
compiled clean in JavaScript and drew nothing or the wrong shade on the
GPU.

_As of 882dbdb._

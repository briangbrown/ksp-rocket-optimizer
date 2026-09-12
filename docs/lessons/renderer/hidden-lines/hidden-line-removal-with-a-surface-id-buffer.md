# Hidden-line removal with a surface-id buffer

**Syllabus:** [L19](../../README.md#part-3--language-and-platform)

**Why it matters:** How a schematic is made from a solid render matters
because the build view is a line drawing, outlines heavy, inner lines light,
what is behind the rocket in dashes, and none of that is what a GPU
produces on its own: the outline comes from a pass that writes each part's
number into a pixel and looks for the number changing, the dashes come from
lines drawn through the fill's depth with the test reversed so only what is
hidden shows, and their pattern comes from arc length measured on the
geometry, because a pixel does not know how far along its stroke it is and
a dash phased on the screen ran from four pixels to thirty round one
ellipse.

**Before this:**
[L12](../passes/render-targets-and-multi-pass-rendering.md), _Render targets
and multi-pass rendering_,
[L13](../shaders/glsl-uniforms-varyings-and-numbers.md), _GLSL: uniforms,
varyings, and numbers_, and
[L14](../geometry/revolved-geometry-normals-creases-and-silhouettes.md),
_Revolved geometry, normals, creases and silhouettes_.

## A worked case

Take a ring seen at an angle, an ellipse sixty by thirty pixels on the
screen, 290.7 pixels round, and dash it at a fourteen-pixel period with
fifty-five percent inked, three ways:

| Dash phased on                      | Dashes | Shortest | Longest |
| ----------------------------------- | ------ | -------- | ------- |
| Screen position, `x + y`            | 19     | 4.4 px   | 29.2 px |
| Arc length along the curve          | 21     | 7.7 px   | 7.7 px  |
| Arc length, stretched to 21 periods | 21     | 7.6 px   | 7.6 px  |

The first row is what the drawing did for a while. Where the ellipse
crosses the screen diagonal, `x + y` changes fast and the dashes are short;
where it runs along the diagonal, `x + y` barely changes and one dash runs
for thirty pixels. The second row is the same curve dashed by distance along
itself, every dash the same length, which is what a drafter draws. The
third stretches the loop's arc length by 1.15 percent so it holds a whole
number of periods and the seam where the walk began does not show as one
odd dash; here the seam happened to fall in a gap, and the stretch removes
the luck.

Then the four small facts the passes rest on:

| Fact                                                       | Value                                         |
| ---------------------------------------------------------- | --------------------------------------------- |
| Part 300 written as two bytes, read back                   | (0.1725, 0.0039) → 300; the ceiling is 65,535 |
| A linear filter between parts 3 and 5 reads                | 4, a part that does not exist                 |
| Outline reach on the worst-angled edge, four rays vs eight | 0.707 vs 0.924 of the ray length              |
| Crease at depth 0.62 behind fill at 0.40                   | fails `LessEqual`, passes `GreaterDepth`      |

```ts
// save as test/l19.test.ts and run: npx vitest run test/l19.test.ts --reporter=verbose
import { test } from "vitest";

test("hidden lines", () => {
  const a = 60,
    b = 30,
    period = 14,
    duty = 0.55,
    N = 20000; // a ring seen at an angle; DASH_PERIOD 7 CSS px at ratio 2; DASH_DUTY
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (2 * Math.PI * i) / N;
    pts.push([a * Math.cos(t), b * Math.sin(t)]);
  }
  const s = [0];
  for (let i = 1; i <= N; i++)
    s.push(
      s[i - 1] +
        Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
    );
  const L = s[N];
  const runs = (phase: (i: number) => number) => {
    // the inked runs along the curve, in px of arc, for a dash phased on `phase`
    const out: number[] = [];
    let on = false,
      start = 0;
    for (let i = 0; i <= N; i++) {
      const inked = (((phase(i) / period) % 1) + 1) % 1 <= duty;
      if (inked && !on) {
        on = true;
        start = s[i];
      }
      if (!inked && on) {
        on = false;
        out.push(s[i] - start);
      }
    }
    return out;
  };
  const stat = (r: number[]) =>
    `${r.length} dashes, ${Math.min(...r).toFixed(1)} to ${Math.max(...r).toFixed(1)} px`;
  const k = (Math.round(L / period) * period) / L; // close(): stretch a loop to a whole number of periods
  console.log(
    `ellipse ${a}x${b}, perimeter ${L.toFixed(1)} px: on x+y → ${stat(runs((i) => pts[i][0] + pts[i][1]))}; on arc length → ${stat(runs((i) => s[i]))}; closed, k=${k.toFixed(4)} → ${stat(runs((i) => s[i] * k))}`,
  );
  const enc = (n: number): [number, number] => [
    (n & 255) / 255,
    (n >> 8) / 255,
  ]; // idMaterial
  const dec = (r: number, g: number) =>
    Math.floor(r * 255 + 0.5) + Math.floor(g * 255 + 0.5) * 256; // idAt() in the shaders
  const [r3, g3] = enc(3),
    [r5, g5] = enc(5);
  console.log(
    `id 300 → (${enc(300).map((v) => v.toFixed(4))}) → ${dec(...enc(300))}; a linear filter between ids 3 and 5 reads ${dec((r3 + r5) / 2, (g3 + g5) / 2)}; ceiling ${dec(1, 1)}`,
  );
  const reach = (rays: number[]) => {
    let worst = 1;
    for (let th = 0; th < Math.PI; th += 0.001) {
      let best = 0;
      for (const ra of rays) best = Math.max(best, Math.abs(Math.cos(th - ra)));
      worst = Math.min(worst, best);
    }
    return worst;
  };
  console.log(
    `outline reach on the worst-angled edge: four rays ${reach([0, Math.PI / 2]).toFixed(3)}, eight rays ${reach([0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]).toFixed(3)}`,
  );
  const front = 0.4,
    crease = 0.62,
    PEEL_EPS = 0.0002;
  console.log(
    `fill at ${front}, hidden crease at ${crease}: LessEqual ${crease <= front}, GreaterDepth ${crease > front}; the peel keeps it: ${crease > front + PEEL_EPS}`,
  );
});
```

## The idea

A **hidden line** is an edge behind a surface, drawn dashed in a schematic
so the reader sees the structure the surface hides: the tanks behind a core
seen side-on, the rim of a stage under a shroud. A solid render has no such
thing; the GPU's ordinary **depth test**, comparing a fragment's distance
with what is already drawn at its pixel and keeping the nearer, is exactly
the machinery that removes hidden surfaces, and a line behind the fill
fails it and vanishes. Making a schematic is therefore a matter of using
the same machinery differently, and the build view does it with four
passes over one geometry.

The **surface-id buffer** is the first. Every part is drawn once more with
a flat material that writes its number, and the background is cleared to
zero, so the buffer holds, per pixel, which part is in front. The
composite pass then reads it and looks for the number changing between a
pixel and its neighbours: a change is a boundary between two parts or
between a part and the background, one test, exact, and free of the
artefact a depth threshold has on curved surfaces, where the depth gradient
runs away near the rim and paints a band inside the silhouette. It is also
the only thing that finds the commonest join in the rocket, two tanks of
the same diameter, which have the same plane and the same normal on both
sides and are invisible to depth and to shading alike. The change is taken
on one side only, the lower number, so every line is one pixel and not two;
and the outer silhouette, where the lower number is zero, is grown
`OUTLINE` pixels into the background along eight rays, because four axis
rays reach a diagonal edge at only 0.707 of their length and a two-pixel
outline was 1.4 on every ellipse. The buffer has rules of its own. Its
numbers are written across two bytes, since one byte capped the model at
254 parts and the 255th silently clamped onto the first; and it is never
filtered or multisampled, because averaging part 3 with part 5 reads as
part 4, a part that does not exist, and every such pixel became an outline.

The dashes are the second and third passes, and they are geometry. The
lines to be dashed are found as
[L14](../geometry/revolved-geometry-normals-creases-and-silhouettes.md)
describes, creases once at build and silhouettes on every paint, chained
into polylines by shared endpoints. They are drawn into the fill's target
with the fill's depth still in it and the depth test reversed, `GreaterDepth`,
so a fragment is kept only where something already drawn is nearer: a
crease in front of the surface fails and is not drawn twice, a crease
behind it passes and shows through as a dash. Depth writing is off, so the
dashes do not occlude one another. Before them, a peel pass draws the ids
again, discarding every fragment no deeper than the front's depth at its
pixel plus a small margin, so a second buffer holds which part is behind
each pixel; the dash shader uses it to keep only the silhouette fragments
on the outline of a part's hidden footprint, since a mesh's every fold is a
silhouette edge and hidden they were a thicket where a drafter draws one
line, and to drop any within two pixels of the front's own linework, where
a hollow bell's inner wall would otherwise draw a dashed twin along the
visible outline.

**Arc length**, distance measured along a curve, is what the dashes are
phased on, and it is the reason they are geometry rather than a screen-space
effect. A fragment knows where it is on the screen and nothing else; any
per-pixel estimate of its stroke's direction multiplies an absolute
coordinate, so a degree of jitter is a phase jump of dozens of periods, and
no screen-space trick fixes it. So the arc length is computed once per
paint, on the CPU: each polyline's vertices are projected to device
pixels, the distance between successive projections is accumulated into an
`along` attribute, and a closed loop's values are stretched so the loop
holds a whole number of periods. The vertex shader passes `along` to the
fragment as a varying, the rasteriser interpolates it, and
`fract(vAlong / dash) > 0.55` discards the gaps. The period is seven CSS
pixels times the pixel ratio, so a dash is the same size to the eye on
every screen.

```
   pass 1  ids ──────────► id target      per pixel: which part is in front (two bytes; nearest, no samples)
   pass 2  fill + creases ► fill target   Gooch shading, visible creases, depth written
   pass 3  peel ids ─────► hid target     which part is *behind*: discard z ≤ front + ε
           dashed lines ─► fill target    GreaterDepth, depthWrite off, fract(along / dash) > duty → discard
   pass 4  composite ────► canvas         id changes → lines (outer grown along 8 rays); depth → cue; hid → wash
```

The fourth pass composes: the fill, cued toward the panel colour with
distance so the far side of the rocket sinks; a breath of tint wherever
the peel says something is behind, the same everywhere so it draws no shape
of its own; and the lines where the id changes, at full strength, since the
extremes belong to the linework.

## In this codebase

[`src/ui/components/shaders.ts`](../../../../src/ui/components/shaders.ts)
holds the materials. `idMaterial` writes `(n & 255) / 255` and `(n >> 8) /
255`; `peelIdMaterial` discards `gl_FragCoord.z <= front + PEEL_EPS` with
`PEEL_EPS` 0.0002; `ghostLineMaterial` takes the `along` attribute into
`vAlong`, sets `depthFunc: GreaterDepth` and `depthWrite: false`, discards
`fract(vAlong / dash) > DASH_DUTY` at 0.55, and when `contour` is set keeps
only fragments on the hidden footprint's edge and not within two texels of
the front's own id change; `compositeMaterial` decodes ids with
`floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0`, marks a
change against the four neighbours, grows the outer silhouette for
`r = 2 .. OUTLINE` along eight rays at multiples of 0.785 radians, cues by
`CUE` 0.33 and washes by `HIDDEN_WASH` 0.06. `OUTLINE` is 4 and
`LINE_ALPHA` 0.85.

[`src/ui/components/hidden-lines.ts`](../../../../src/ui/components/hidden-lines.ts)
computes the arc length: `alongCreases` for the creases chained once at
build, `fillSegments` for the silhouettes rebuilt each paint, both
projecting with `screen()` and accumulating, and `close()` for the
stretch:

```ts
const n = Math.max(1, Math.round(total / period));
const k = (n * period) / total;
for (const s of slots) along[s] *= k;
```

[`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx)
runs the passes in order in its paint effect: ids on black with the
creases hidden, fill and creases on `panelClear`, the peel into `hidTarget`
and the dashed lines into `fillTarget` with `autoClear` off, then the
composite quad to the canvas; the plan view peels nothing, because looking
up from underneath the engines hide the tanks by design. The `idTarget`
and `hidTarget` are `NearestFilter` with no samples and the `fillTarget`
has four. The record is in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md):
_Hidden lines are geometry, measured along themselves_, _The outer
silhouette is grown along eight rays_, _The surface-id buffer must not be
filtered or multisampled_ and _The id buffer is two bytes wide_.

## What made it real

The ellipse table is the measurement of the dash problem, four pixels to
twenty-nine on one curve at a fourteen-pixel period, against seven point
seven everywhere by arc length; the rule records the same thing as seen on
a screenshot, two pixels to thirty, before #85 moved the lines into
geometry. The id facts each have a screenshot behind them too: the 255th
part clamping onto the first when the buffer was one byte, the false
outlines where a multisampled id buffer averaged two parts into a third,
and the 1.4-pixel outline on every ellipse when four rays grew a two-pixel
one. And the seam between two tanks of the same diameter is the reason the
id pass exists at all, #70: `visual/render.test.ts` holds that the outline
colour appears somewhere in the elevation, because if the id pass silently
produced nothing the drawing would still look like a rocket and only the
absence of that colour would say so.

## Where it breaks

- **Finding edges in depth or normals.** A depth threshold paints a band
  inside a curved silhouette, and neither depth nor normals can see the
  seam between two equal tanks. Ids find both.
- **Dashing on screen position.** A pixel does not know how far along its
  stroke it is. Measure arc length on the geometry and carry it in as a
  varying.
- **Filtering or multisampling the id buffer.** An average of two ids is a
  third id. `NearestFilter`, no samples.
- **One byte of id.** 254 parts, then silent clamping. Two bytes give
  65,535.
- **Four outline rays.** A diagonal edge gets 0.707 of the width. Eight
  rays give 0.924 on the worst angle.
- **Hidden creases on a mesh, or silhouettes near the front's linework.** A
  simplified truss is edges all over, and a hollow bell's inner wall is one
  thickness behind its outer one; both draw a thicket or a dashed twin.
- **Peeling the plan.** Looking up, the engines hide the tanks by design;
  dashing the tanks through them draws what the view exists not to show.

## Try it

Run the snippet and change the ellipse to a circle, `b = 60`, then to a
line, `b = 1`, and watch the `x + y` row's spread change while the arc
length row does not. Then open the application in its side view, find a
dashed ring behind the core, and count the dashes round it; they will be a
whole number and all of one length. Then switch to the plan and note there
are none.

## Check yourself

<details><summary>Why is the outline found from a buffer of part numbers rather than from depth or normals?</summary>

Because a change of number is exact and means a change of part or the
background, where a depth threshold paints a band inside a curved silhouette
as the gradient runs away near the rim; and because the commonest join in
the rocket, two tanks of the same diameter, has the same depth and the same
normal on both sides and is found by the id change or not at all.

</details>

<details><summary>How does a line that is behind the fill get drawn at all, when the depth test exists to remove it?</summary>

By reversing the test. The dashed lines are drawn into the fill's target
with its depth still in it and `depthFunc: GreaterDepth`, so a fragment is
kept only where something already drawn is nearer than it. A visible crease
fails and is not drawn twice; a hidden one passes and shows through as a
dash.

</details>

<details><summary>Why are the dashes phased on arc length computed on the CPU each paint, rather than on something the fragment shader can compute?</summary>

Because a fragment knows its screen position and nothing about its stroke,
and a dash phased on screen position ran from four pixels to twenty-nine
round one ellipse; any per-pixel estimate of the stroke's direction
multiplies an absolute coordinate, so a degree of jitter is a phase jump of
dozens of periods. Arc length accumulated along the projected polyline and
carried in as a varying is the same everywhere on the curve.

</details>

## Further reading

- Saito and Takahashi, "Comprehensible Rendering of 3-D Shapes", SIGGRAPH
  1990: the G-buffer, edges found from per-pixel ids and depth, the origin
  of this family of techniques.
- Everitt, "Interactive Order-Independent Transparency" (2001), for depth
  peeling, the idea behind the peel pass.
- Any text on non-photorealistic rendering, for hidden-line and
  line-drawing conventions and what a drafter dashes.

## Key takeaway

A schematic is made from a solid render by writing each part's number into
a pixel and drawing lines where the number changes, by drawing the edges
again through the fill's depth with the test reversed so only what is hidden
shows, and by dashing those edges on arc length measured along the geometry
and carried in as a varying, because a pixel knows where it is and not how
far along its line.

_As of d7fd6e8._

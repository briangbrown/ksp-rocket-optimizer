# Render targets and multi-pass rendering

**Syllabus:** [L12](../../README.md#part-3--language-and-platform)

**Why it matters:** Multi-pass rendering matters because the build view's
schematic look, flat mid-tone fills, one crisp line at every silhouette and
seam, dashed lines where a part is behind another, is not something a single
draw of the scene can produce; it is four drawings of the same scene into
off-screen buffers, one carrying which part is at each pixel, one the
shading, one what the front hides, composited by a shader over a
full-screen rectangle, and each buffer's format and filtering is a decision
with a failure behind it: a filtered or multisampled id buffer blends two
parts into a third that does not exist and outlines it, a one-byte id caps
the model at 254 parts and fails silently, and reallocating the buffers as
a panel changes size costs tens of megabytes a frame.

**Before this:** [L11](../cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_.

## A worked case

One frame of the front elevation, drawn in four passes:

| Pass        | Draws                                                                              | Into                                      | Cleared to       | Format                                                |
| ----------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- | ----------------------------------------------------- |
| 1 ids       | every part in a flat colour that is its number                                     | `idTarget`, with a depth texture attached | black, id 0      | two bytes per id, nearest filtering, no multisampling |
| 2 fill      | every part Gooch-shaded, plus its creases                                          | `fillTarget`                              | the panel colour | four-sample multisampling                             |
| 3 peel      | ids again, dropping every fragment no deeper than pass 1's depth: the layer behind | `hidTarget`                               | black            | two bytes, nearest, no multisampling                  |
| 3b          | the hidden creases, dashed, through the fill's depth with `GreaterDepth`           | `fillTarget`                              |                  |                                                       |
| 4 composite | a rectangle covering the screen, sampling all four                                 | the canvas                                |                  | one shader: edges from ids, depth cue, outline        |

The plan view skips pass 3, because looking up from underneath the engines
hide the tanks by design. Every pass but the last draws the same scene with
the same camera and different materials; the last draws no scene at all.

Two numbers from the id pass. A part's id is `n` written as two bytes, `n
& 255` in red and `n >> 8` in green, each divided by 255 to fit a colour
channel, and read back as `floor(r × 255 + 0.5) + floor(g × 255 + 0.5) ×
256`; that carries 65,535 parts, and the largest model in the mission grid
is 78. One byte carried 254, and the way it failed was silent: the 255th
part's id clamped onto the first and its outlines stopped being drawn. And
a linearly filtered read of the id buffer at the boundary between part 3
and part 7 returns 5, which is a part that does not exist and would be
outlined on both sides:

```js
// ids as the id pass writes them, and what filtering does to them
const encode = (n) => [(n & 255) / 255, (n >> 8) / 255]; // red, green
const decode = ([r, g]) =>
  Math.floor(r * 255 + 0.5) + Math.floor(g * 255 + 0.5) * 256;
console.log(decode(encode(78)), decode(encode(300)), decode(encode(65535))); // 78 300 65535: two bytes carry the model
const oneByte = (n) => Math.min(255, n) / 255; // the old id: one channel, clamped
console.log(Math.round(oneByte(255) * 255), Math.round(oneByte(300) * 255)); // 255 255: the 300th part is the 255th, silently
const nearest = (a, b, t) => (t < 0.5 ? a : b); // NearestFilter: one texel or the other
const linear = (a, b, t) => a * (1 - t) + b * t; // LinearFilter: a blend of the two
const [id3, id7] = [encode(3)[0], encode(7)[0]];
console.log(
  decode([nearest(id3, id7, 0.5), 0]),
  decode([linear(id3, id7, 0.5), 0]),
); // 7 5: linear invents part 5 along the boundary
```

## The idea

A **render target** is an off-screen image a scene is drawn into: a texture
the size of the canvas, and optionally a depth buffer or a depth texture
beside it, that a later pass can sample like any other texture. Drawing into
one instead of the canvas is how a frame can be built from parts: the scene
is drawn several times with different materials, each drawing lands in its
own image, and a final shader reads them all and decides what the pixel
should be.

A **pass** is one drawing of the scene for one purpose. The id pass swaps
every part's material for one that writes its number and nothing else, so
the buffer answers "which part is here" at every pixel. The fill pass swaps
back to the shading material. The peel pass writes ids again but discards
any fragment no deeper than the id pass's depth at that pixel, so what
remains is the second layer, what the front surface hid, and the depth test
then keeps the nearest of that. Because the passes share the scene, the
camera and the depth, they line up pixel for pixel, and a fragment in one is
the same point in space as the fragment at the same address in another.

A **composite** is combining the passes into the final image, and a
**full-screen quad** is how it is done: a rectangle of two triangles that
covers the screen exactly, drawn with a shader that, for every pixel,
samples the pass textures at that pixel and writes the answer. Here the
composite reads the fill for colour, the ids for edges, a change of id
between neighbouring pixels being a line, the depth for cueing the far side
of the rocket toward the panel colour, and the hidden ids for the wash where
something is behind. Its vertex shader writes clip space straight out and
never reads the camera, which is why the mesh has to opt out of frustum
culling: three.js would otherwise cull it against a frustum it does not live
in and the panel would come back empty with nothing logged.

```
   scene ──► pass 1: idMaterial   ──► idTarget  (ids, nearest, + depth texture) ─┐
   scene ──► pass 2: gooch + creases ► fillTarget (4× multisampled)              ├──► composite shader
   scene ──► pass 3: peelIdMaterial ► hidTarget (ids of the layer behind)        │    on a full-screen quad
   scene ──► pass 3b: ghost lines through GreaterDepth ► fillTarget              ┘    ──► the canvas
```

**Texture filtering** is what happens when a texture is read between its
texels: linear filtering blends the neighbours, nearest filtering picks one.
For a colour image linear is what you want. For an image whose values are
labels, a blend of two labels is a third label, so the id buffer is
nearest-filtered, and it is not multisampled either, because a multisample
resolve averages the samples within a pixel exactly the way a linear filter
averages neighbours. The fill is multisampled, because that one does want a
smooth silhouette. That is why the ids and the fill are two targets rather
than one target with two attachments: they want opposite settings.

Format is a choice the same way. An id in one colour channel is a byte, 0
to 255, and the model has more parts than that only rarely, which is the
dangerous case: nothing warned when the 255th part appeared, it simply took
the first part's id. Two channels carry 65,535, and decoding by rounding
each channel back to its byte is what makes the value exact through the
texture.

Size is the last decision, and it is about time rather than correctness.
The buffers are allocated at the drawing buffer's size in device pixels,
the CSS size times the device pixel ratio capped at two; during a staging
transition the panel changes shape every frame, and reallocating two render
targets and a depth texture sixty times a second is tens of megabytes a
frame. So the buffers are allocated once at the largest box the transition
passes through, the visible panel is a wrapper clipping the top-left corner,
and the camera's frustum is made asymmetric so that corner frames exactly
what a panel of that size would ([L16](../../README.md#part-3--language-and-platform),
_Canvas sizing and device pixels_).

## In this codebase

The targets are made in the build effect of [`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx),
with the comment that says why there are two:

```ts
/* Ids and depth come off the same pass, unfiltered and unresolved: a
   multisampled id buffer averages two parts into a third that does not
   exist, and a linear filter does the same along every boundary. The fill
   is multisampled, because that one wants a smooth silhouette. */
const depth = new DepthTexture(bw, bh);
const idTarget = new WebGLRenderTarget(bw, bh, {
  minFilter: NearestFilter,
  magFilter: NearestFilter,
  depthTexture: depth,
});
const fillTarget = new WebGLRenderTarget(bw, bh, { samples: 4 });
const hidTarget = new WebGLRenderTarget(bw, bh, {
  minFilter: NearestFilter,
  magFilter: NearestFilter,
  depthTexture: hidDepth,
});
// ...
quadMesh.frustumCulled = false; // the composite writes clip space straight out and never looks at the camera
```

and the passes are the paint effect: `setRenderTarget(idTarget)`, clear to
black, render with the id materials and the creases hidden, because a line
drawn into the id buffer is a false part; `setRenderTarget(fillTarget)`,
clear to `panelClear(palette)`, render with the fill materials; the peel and
the ghost lines; then `setRenderTarget(null)` and render the quad scene. The
materials are in [`src/ui/components/shaders.ts`](../../../../src/ui/components/shaders.ts):
`idMaterial` with its two-byte comment, `peelIdMaterial` discarding
fragments no deeper than the front, and `compositeMaterial`, which reads
`tColor`, `tId`, `tDepth` and `tHid` and paints the panel colour itself
rather than leaving the canvas transparent, since straight alpha through two
targets, a resolve and a premultiplied canvas returns a fringe on the
silhouette. The rules are in [`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md):
_The surface-id buffer must not be filtered or multisampled_, _The id buffer
is two bytes wide_, _A full-screen quad has to opt out of frustum culling_,
and _Resizing a canvas per frame reallocates every render target behind it_.

## What made it real

The phantom parts are the measurement for filtering: with a linear filter or
a multisample resolve on the id buffer, every boundary between two parts
produced an intermediate id along it, and the composite outlined a part that
was not in the model on both sides of every seam. The snippet's 5 between 3
and 7 is that failure in one number.

The cap is the measurement for format: one byte, 254 parts, and the 255th
clamped onto the first with no error. The largest model in the mission grid
is 78 parts now that a tank run is drawn tank by tank, which the rule calls
"comfortable and not comfortable enough to leave a cliff in."

The reallocation is the measurement for size: full screen on a phone takes
one rocket from 278 by 1,284 to 531 by 425 pixels over a transition, and
following that with `setSize` rebuilt two render targets and a depth texture
sixty times a second. The empty panel is the measurement for culling: a quad
that never reads the camera, culled against the camera's frustum, drew
nothing and logged nothing. [`visual/render.test.ts`](../../../../visual/render.test.ts)
draws the view in a real browser and samples the clear colour and the
outline under each theme, expecting the token's value to the bit; jsdom
draws nothing and can see none of this.

## Where it breaks

- **Filtering or multisampling a label buffer.** A blend of two ids is a
  third id. Nearest filtering and no samples on the id and peel targets; the
  fill alone is multisampled.
- **One byte of id.** 254 parts and a silent clamp. Two channels, decoded by
  rounding each back to its byte.
- **Resizing the buffers with the panel.** Tens of megabytes a frame during
  a transition. Allocate once at the largest box, clip the corner, make the
  frustum asymmetric.
- **A culled quad.** The composite lives in clip space, not the camera's
  frustum; `frustumCulled = false` or the panel is empty with no message.
- **A line in the id buffer.** Creases drawn during the id pass are false
  parts with outlines of their own; they are hidden for that pass and shown
  for the fill.
- **Clearing to a managed colour.** `setClearColor(hex)` converts to the
  linear working space and the panel behind the rocket comes out a third as
  bright; `panelClear` names the space so the conversion is a no-op.

## Try it

Run the snippet and read the three lines. Then, in the build effect, change
the id target's filters to `LinearFilter` and run `npm run test:visual`: the
render test's outline sample no longer matches the token, and the screenshot
in `visual/.out` shows a second line inside every seam. Put it back. Then
set `samples: 0` on the fill target and compare the silhouette in the
screenshot: the stair-steps along every curve are what the four samples
were buying.

## Check yourself

<details><summary>Why are the ids and the fill drawn into two render targets rather than one target with two outputs?</summary>

Because they want opposite settings. The fill wants multisampling for a
smooth silhouette; the ids must not be multisampled or linearly filtered,
because averaging two part numbers yields a third part that is then
outlined. Two targets let each have its own format and filter, and the
passes still line up pixel for pixel because they share the scene, the
camera and the depth.

</details>

<details><summary>How did a one-byte id buffer fail, and why was the failure hard to see?</summary>

The 255th part's value clamped to 255, the same as the first part's, so the
composite saw one part where there were two and stopped drawing the second
one's outlines. Nothing errored: a clamp is a valid colour. Two channels
carry 65,535 ids and the decode rounds each channel back to its byte, so the
value survives the texture exactly.

</details>

<details><summary>The composite's mesh is a rectangle covering the screen. Why must it opt out of frustum culling?</summary>

Because its vertex shader writes clip space directly and never reads the
camera, so as far as three.js is concerned the mesh sits at the origin of a
scene the camera may not be looking at, and it is culled before the shader
runs. With `frustumCulled = false` the quad is always drawn, and the shader
paints every pixel from the pass textures.

</details>

## Further reading

- The three.js documentation for `WebGLRenderTarget`, `DepthTexture` and
  `WebGLRenderer.setRenderTarget`, for targets, attachments and samples.
- Tomas Akenine-Möller et al., _Real-Time Rendering_, the chapter on
  image-based effects, for deferred and multi-pass techniques and the
  full-screen pass.
- Amy Gooch et al., "A Non-Photorealistic Lighting Model for Automatic
  Technical Illustration" (SIGGRAPH 1998), the shading the fill pass uses.

## Key takeaway

The schematic is four drawings of one scene into off-screen buffers, ids,
shading, the layer behind and the hidden lines, composited by one shader on
a full-screen quad that must not be culled; the id buffers are two bytes,
nearest-filtered and unresolved because a blend of two labels is a third
part, the fill alone is multisampled, and all of them are allocated once at
the largest size a transition needs rather than resized with the panel.

_As of d146ca1._

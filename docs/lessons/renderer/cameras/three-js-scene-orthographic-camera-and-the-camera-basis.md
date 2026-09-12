# three.js: scene, orthographic camera, and the camera basis

**Syllabus:** [L11](../../README.md#part-3--language-and-platform)

**Why it matters:** The camera basis matters because the build view is four
orthographic drawings of one model, front, right, plan and isometric, and a
reader compares them: the columns of a parallel stage start at +x and go
round, the elevation draws that first pair left and right, and a view whose
camera sends +x to the left draws the same rocket mirrored against the one
beside it, which is what happened when the plan looked up from underneath
with the wrong `up`; three.js builds a camera's axes from its `up` vector
and its direction by two cross products, so which way is right on screen is
decided by `up`, not by where the camera stands, and it is checkable with
four multiplications and no GPU.

**Before this:** nothing.

## A worked case

Each locked view is a direction to stand in and an `up` to hold. Feed the
five below through the two cross products three.js uses and read off which
world axis lands on the right of the screen:

| View                  | Direction          | Up  | Screen right     | Screen up            |
| --------------------- | ------------------ | --- | ---------------- | -------------------- |
| Front elevation       | +z                 | +y  | +x               | +y                   |
| Right elevation       | +x                 | +y  | −z               | +y                   |
| Plan, from underneath | −y                 | +z  | +x               | +z                   |
| Isometric             | (0.72, 0.52, 0.72) | +y  | (0.71, 0, −0.71) | (−0.32, 0.89, −0.32) |
| Plan, with `up` = −z  | −y                 | −z  | **−x**           | −z                   |

The last row is the mirrored plan. Looking up from underneath, a camera can
have +x on the right or +z at the top of the panel, and not both; the SVG
plan the 3D view replaced had z running down the panel, and keeping that
put +x on the left, so a three-column stage leaned right in the elevation
and left in the plan. The model has one convention, columns start at +x,
and every view must agree with it; the plan therefore gives up z-down.
Standing the camera above the rocket instead would keep both, and is wrong
for a different reason: it would put the payload over the engines, and a
plan is read with the engines nearest.

The isometric row shows a second trap. Its direction is written (0.72, 0.52,
0.72) because those numbers read well, and that vector is 1.143 long.
Placing the camera at `dir × distance` stood it 14% further off than the
distance its near and far planes were told about, and the far plane cut the
back off the model, visibly at the last staging steps where the stand-off's
constant term dominates. Every use of a view's direction now goes through
one function that normalises it.

```js
// the camera basis as three.js builds it from lookAt: z = eye − target, x = up × z, y = z × x
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => {
  const m = Math.hypot(...v) || 1;
  return v.map((x) => +(x / m).toFixed(3));
};
const VIEWS = {
  side: { dir: [0, 0, 1], up: [0, 1, 0] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
  plan: { dir: [0, -1, 0], up: [0, 0, 1] }, // looking up from underneath
  iso: { dir: [0.72, 0.52, 0.72], up: [0, 1, 0] },
  "plan, up flipped": { dir: [0, -1, 0], up: [0, 0, -1] },
};
for (const [name, { dir, up }] of Object.entries(VIEWS)) {
  const right = unit(cross(up, dir)); // screen right: up × (eye − target), and eye − target is along dir
  const screenUp = unit(cross(unit(dir), right)); // screen up: z × x
  console.log(
    name.padEnd(17),
    "right",
    JSON.stringify(right),
    "up",
    JSON.stringify(screenUp),
    "|dir|",
    Math.hypot(...dir).toFixed(3),
  );
}
// plan             right [1,0,0]  up [0,0,1]   ← +x on the right, z up the panel
// plan, up flipped right [-1,0,0] up [0,0,-1]  ← the mirrored drawing
// iso              |dir| 1.143               ← 14% too far off if used unnormalised
```

## The idea

A **scene** is the tree of objects three.js draws: a root, groups under it,
meshes under those, each with a position, a rotation and a scale relative to
its parent. The build view's scene is a group holding one mesh per part of
the rocket, placed where the model says, plus the line geometry for the
creases. It is built once when the rocket changes and moved when a staging
transition plays, which is a distinction that matters enough to be the
first rule in the renderer's rules file: a transition paints sixty times a
second, and rebuilding the scene each frame would throw away every buffer
on the card to move a part a metre.

An **orthographic projection** is one in which parallel lines stay parallel:
there is no perspective, so a part does not shrink with distance and a
metre at the back of the rocket is the same length on screen as a metre at
the front. That is what a technical drawing is, and it is what lets the
panels be read as measurements. The camera is a box, not a pyramid: a left,
right, top and bottom in world units, and a near and far plane; whatever is
inside the box is drawn at one scale. Framing the model is therefore
arithmetic: the model is a set of cylinders about the y axis, so the whole
of it lies inside one cylinder of a known height and reach, and its extent
along any screen axis is half the height times how much of that axis points
along y, plus the reach times how much lies across it. Two terms, exact,
and the frustum is set from them, so nothing can fall outside the panel.

The **camera basis** is the three axes a camera's view is measured in:
right, up, and back, toward the eye. three.js does not take them; it takes a
position, a target and an `up` hint, and `lookAt` builds them. The back axis
z is the direction from the target to the eye. The right axis x is `up`
crossed with z. The screen-up axis y is z crossed with x, which is `up`
made perpendicular to the view. The consequence that decides the drawings
is in the second step: which way is right on the screen depends on the
`up` you hand in, and not on where the camera stands, and the same
position with a different `up` is a mirrored picture. The hint is a hint
only in the sense that its component along z is discarded; its sign is
kept.

```
                 up (hint)
                  │        z = eye − target        (back, toward the eye)
                  │  ╱     x = up × z              (screen right)
                  │╱       y = z × x               (screen up: the hint squared to the view)
       ──────────●──────────► x
                ╱│
              ╱  │           looking up from below (z = −y in the world):
            ╱    │             up = +z  →  x = +z × −y = +x   right   ✓
          eye                  up = −z  →  x = −z × −y = −x   right   mirrored
```

A **plan** is the drawing from above or below, along the stack's axis, and
an **elevation** is one from the side, across it. Third-angle projection,
the drafting convention the sheet follows, places the right elevation to the
right of the front, showing the rocket a quarter turn round with the face
the front shows on its left; its screen axis is z, so it is the one view the
+x rule does not apply to, and what it has to agree with is the front's up,
which is +y for both. The plan is drawn from underneath, engines nearest,
because that is how you read what is bolted where.

The invariant is one function, `viewRight`, and it is exported because it
can be checked without a renderer. Everything about the cameras is
arithmetic over an extent and two vectors: whether the frustum contains the
model, whether the depth window contains its whole depth, which way is
right. A test sweeps those over shapes no solver would produce and fails on
numbers, which is a wider net than twelve missions and costs no solve; and
a containment check that derives its expectation from the same arithmetic
it is testing proves only that the arithmetic agrees with itself, which is
how the unnormalised direction survived one test and was caught by a second
that placed the camera where the renderer does and normalised the direction
itself.

## In this codebase

[`src/ui/views.ts`](../../../../src/ui/views.ts) is the cameras without
three.js: `VIEWS` with each view's direction and up, `viewRight`, `viewUp`
and `viewAxis`:

```ts
/* `lookAt` builds the basis as z = eye - target, x = up x z, y = z x x, and the
   camera is placed along dir from what it looks at, so z is dir. Exported
   because two views disagreeing about which way is right is a mirrored
   drawing, and that is checkable without a GPU where the drawing is not. */
export function viewRight(view: string) {
  const { dir, up } = viewOf(view);
  return unit(cross(vec(up), vec(dir)));
}
export function viewAxis(view: string) {
  return unit(vec(viewOf(view).dir));
} // normalise once, here
```

`framing` and `fitOrtho` size the frustum from the extent, and `cameraFor`
returns the position, the frustum and the depth window together so the axis
that places the camera is the one its depth is measured along. The module
imports no three.js on purpose, because the build view sizes its panels from
`framing` and the renderer is half a megabyte lazy-loaded behind it; the
renderer imports this module and never the other way round, which
[`test/boundaries.test.ts`](../../../../test/boundaries.test.ts) holds.
[`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx)
is where three.js is finally asked: an `OrthographicCamera` built from
`cam.halfW` and `cam.halfH`, made asymmetric during a transition so a corner
of a larger buffer frames the panel, placed at `axis × dist` with
`camera.up.set(up)` and `camera.lookAt(0, mid, 0)`. The rules are in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md): _Every
camera must send world +x to the right of the screen_ and _`VIEWS` writes
its directions unnormalised, and `viewAxis` is the only way to use one_.

## What made it real

The mirrored plan is the measurement for the basis: a three-column stage
leaned right in the elevation and left in the plan until the plan's `up`
was chosen for +x on the right, and [`test/three-view.test.ts`](../../../../test/three-view.test.ts)
holds `viewRight` for every view without a renderer. The clipped isometric
is the measurement for normalisation: 1.143 for a length of 1 stood the
camera 14% too far off and the far plane cut the back off the model at the
last staging steps; the test "looks down a unit vector" requires every
view's axis to have length 1 to twelve decimals, and "keeps the whole
depth of the model between its planes" sweeps eight heights by six reaches
placing the camera where the renderer does.

The framing test is the measurement for the orthographic box: eight heights
from 0.5 to 200 m by six reaches from 0.15 to 25 m, every view at every
panel shape, sampling the rim circles of every part through the camera
basis and requiring nothing to escape; the loosest earlier version, a
bounding sphere for the three-quarter view, drew a 40 m pencil in a seventh
of its panel.

## Where it breaks

- **Reading `up` as a hint about position.** It is the one input that
  decides screen right. The same camera position with the sign of `up`
  flipped is a mirrored drawing, and the plan proved it.
- **Using a direction unnormalised.** `[0.72, 0.52, 0.72]` reads well and is
  14% long. Every distance multiplied by a direction goes through
  `viewAxis`, which normalises once.
- **Framing a bounding sphere.** A sphere is a poor fit for a stack of
  cylinders; the isometric drew in a seventh of its panel. Solve for the
  extent along each screen axis, which is two multiplications per axis.
- **Checking the arithmetic against itself.** A containment test that
  takes the camera position and the planes from the same call passes with
  the bug in place. Stand the camera where the renderer does and derive the
  expectation independently.
- **Pulling three.js into the sizing.** The panel sizes are needed before
  the renderer is, and `Vector3` would bring half a megabyte with it; the
  basis is four multiplications in plain numbers.

## Try it

Run the snippet and read the plan's two rows. Then change the isometric's
direction to `[0.63, 0.455, 0.63]`, the same direction at unit length, and
watch `|dir|` read 1.000 while right and up do not change: normalising alters
where the camera stands and nothing about which way it faces. Then run
`npx vitest run test/three-view.test.ts` and read the three checks that
hold the basis, the axis length and the containment on numbers.

## Check yourself

<details><summary>The plan looks up from underneath. Why can it not keep both +x on the right and z down the panel, as the old SVG plan did?</summary>

Because three.js builds screen right as `up × (eye − target)`, and from
underneath `eye − target` is −y. With `up` = +z, right is +x and z runs up
the panel; with `up` = −z, z runs down and right is −x, a mirror of the
elevation beside it. Columns start at +x in the model, so +x on the right
wins and z-down is given up.

</details>

<details><summary>Why did a direction of length 1.143 clip the back off the isometric only at the last staging steps?</summary>

Because the camera was placed at `dir × distance`, 14% further off than the
near and far planes were told, and the stand-off carries a constant term. On
a tall rocket the model's own depth dominated and the slack hid the error;
on the short stack left at the last steps the constant dominated, the 14%
became larger than the slack, and the far plane fell inside the model.

</details>

<details><summary>What does an orthographic camera buy a technical drawing that a perspective one would lose?</summary>

Measurability. Parallel lines stay parallel and a metre is the same length
on screen at the back of the rocket as at the front, so the panels can be
read as drawings to scale and compared with one another, and the frustum
that frames the model is a box whose sides are the model's own extent along
each screen axis.

</details>

## Further reading

- The three.js documentation for `Object3D.lookAt`, `Camera.up` and
  `OrthographicCamera`, for the basis construction and the box frustum.
- Any engineering drawing text on third-angle projection, for why the right
  elevation sits to the right of the front and shows the face the front
  shows on its left.
- Edward Angel and Dave Shreiner, _Interactive Computer Graphics_, the
  chapter on viewing, for the camera frame and orthographic projection.

## Key takeaway

three.js builds a camera's axes from its `up` and its direction, right is
`up × back` and screen-up is `back × right`, so which way is right on screen
is decided by `up` and not by position, every view must agree that world +x
goes right or the rocket mirrors between panels, and a direction must be
normalised before it places a camera; all of it is four multiplications in
plain numbers, checked without a GPU.

_As of 0a2dacb._

---
paths:
  - "src/ui/components/three-view.tsx"
  - "src/ui/components/shaders.ts"
  - "src/ui/views.ts"
  - "src/ui/separation.ts"
  - "src/ui/components/build.tsx"
---

# The build view, three.js and the shaders

Traps in the drawing. Most of these are invisible to `npm test` — jsdom has no
WebGL, so `canRender3D()` is false in every test under `test/` and the build
view there takes a path no user takes. `npm run test:visual` is what reaches
them.

- **A view that paints every frame must not rebuild every frame.** `ThreeView`
  drew one frame when the rocket changed, from a single effect keyed on
  everything it was handed — which is right until a staging transition paints
  sixty times a second, at which point moving a part a metre throws away every
  buffer on the card and builds them again. It is two effects now: one that
  builds the scene, the meshes and the render targets, and one that moves them
  and renders. The caller has to hold the model still for the transition too —
  `stepModels` returns fresh arrays on every call, and a new array is a new
  rocket as far as the build effect can tell.

- **Resizing a canvas per frame reallocates every render target behind it.**
  The panel changes size across a transition — full screen, one rocket goes
  from 278x1284 to 531x425 — and following that with `setSize` means two render
  targets and a depth texture rebuilt sixty times a second, tens of megabytes a
  frame. Instead the buffer is allocated once at the largest box the transition
  passes through, the visible box is a wrapper with `overflow: hidden` around
  its top-left corner, and the frustum is made asymmetric so that corner frames
  exactly what a panel of that size would. Two allocations instead of sixty,
  and it costs only the fill rate of pixels nobody sees.

- **A separation happens in the outgoing model's frame.** `modelOf` stands the
  bottom live stage on zero, so the same physical part sits at a different
  height in the two models a transition runs between — the surviving stack is
  four metres up in the frame it starts in and on the floor in the frame it
  ends in. Moving the geometry to match would move parts that are not going
  anywhere; `dy` in `src/ui/separation.ts` carries the difference and the
  camera absorbs it, which is why what stays has an offset of exactly zero at
  both ends.

- **A WebGL canvas drawn once needs `preserveDrawingBuffer`.** `ThreeView`
  renders a frame when the rocket or the view changes and never on a loop,
  because the cameras do not move. The drawing buffer is cleared once it has
  been composited, so without the flag the schematic is right on the frame that
  draws it and can come back blank on the next repaint. Nothing in the suite
  can see this: jsdom has no WebGL and never constructs a renderer. The other
  half of the same fact: a canvas holds its last frame until something else is
  drawn, so a render effect that returns early on an empty model leaves the
  previous rocket up. The plan view showed the step before the last one that
  way — the elevation, which always has a payload in it, was right alongside
  it. Clear rather than return.

- **`renderer.setSize(w, h, false)` does not size the canvas.** The third
  argument suppresses the CSS width and height, and the canvas is
  `devicePixelRatio` times bigger in device pixels — so it lays out at that
  size and draws at twice the panel on any screen with a ratio above 1. It
  looks correct in a container at ratio 1 and wrong on a phone. Let three.js
  set the style.

- **Every camera must send world +x to the right of the screen.** Columns start
  at +x and work round, and the elevation draws that first pair left and right,
  so a view that disagrees draws the same rocket mirrored against the one next
  to it — a three-column stage leaned right in the elevation and left in the
  plan. three.js builds its basis as `right = up x (eye - target)`, so the
  plan's up vector decides this, not its position. Looking up from underneath,
  +x on the right forces +z to the top: the SVG plan's z-down cannot be kept as
  well, and a camera above the rocket that keeps both puts the payload over the
  engines. `viewRight` in `src/ui/views.ts` is the invariant, and
  `test/three-view.test.ts` checks it without a renderer.

- **`src/ui/views.ts` must not import three.js.** The build view sizes its
  panels from `framing`, so whatever that module imports lands in the bundle
  that gets you to a solved rocket — and the renderer is half a megabyte of it,
  lazy-loaded for exactly that reason. The camera basis is four multiplications;
  it does not need `Vector3`. The renderer imports this module, never the other
  way round.

- **A full-screen quad has to opt out of frustum culling.** The composite pass
  writes clip space straight out of the vertex shader and never reads the
  camera, so three culls it against a frustum it does not live in and the panel
  comes back empty with nothing logged. `frustumCulled = false` on the mesh.

- **A bare `ShaderMaterial` bypasses colour management in both directions.**
  Nothing converts on the way in and nothing converts on the way out, so the
  palette token is what gets drawn — which is what the shaders here want. The
  trap is anything that does not go through them: `setClearColor(C.panel)`
  converts the hex into the linear working space, and the drawing would sit in a
  rectangle of the same colour about a third as bright as the card around it.
  `panelClear(pal)` names the working space so the conversion is a no-op.

- **A theme change is a rocket change.** The stylesheet reads the palette as
  custom properties and swaps them on `data-theme` or the media query, so the
  page re-themes without React noticing. The scene cannot: a `ShaderMaterial`
  was built with `vec3` uniforms from the hex values of the theme it was made
  under, and `C.panel` is the string `var(--panel)`, which is not a colour to
  three.js. So `ThreeView` takes `theme` as a prop, every shader in
  `shaders.ts` takes the resolved `palette(theme)`, and `theme` is a dependency
  of the build effect — a switch rebuilds the meshes as though the rocket had
  changed. `visual/render.test.ts` samples the clear colour and the outline
  under each theme and expects the token's value to the bit; jsdom draws
  nothing and cannot see any of this. #131

- **A whole number interpolated into GLSL loses its decimal point.** `${3.0}`
  is the string `3`, and there is no `pow(float, int)` in GLSL — the shader
  fails to compile, the pass it belongs to draws nothing, and the only trace is
  a console message. It is worse than it sounds, because it depends on the
  value: 2.6 and 3.4 compiled and 3.0 did not, so tuning a constant broke it.
  Everything interpolated into a shader goes through `f()` in `shaders.ts`.
  `npm run test:visual` is what caught it, by reading the console — nothing in
  `test/` can.

- **The surface-id buffer must not be filtered or multisampled.** A linear
  filter blends two ids into a third along every boundary, and a multisample
  resolve does the same; either invents parts that are not in the model and
  outlines them. Nearest filtering, no samples. The fill target is multisampled,
  because that one does want a smooth silhouette — which is why they are two
  targets rather than one.

- **`VIEWS` writes its directions unnormalised, and `viewAxis` is the only way
  to use one.** The isometric is `[0.72, 0.52, 0.72]`, which reads well and is
  1.143 long. Placing the camera at `dir * distance` therefore stood it 14%
  further off than its near and far planes were told, and the far plane cut the
  back off the model — visibly at the last staging steps, where the stand-off's
  constant term dominates, and invisibly behind other geometry everywhere else.
  `cameraFor` now returns the position, the frustum and the depth window
  together, so the axis that places the camera is the axis its depth is measured
  along.

- **A line exists only where the model has two parts.** Surface ids find the
  seam between two tanks of the same diameter, which nothing else can — but only
  if there are two of them to have ids. The drawing put a whole tank run down as
  a single cylinder, so a stage of five identical tanks came out as one tube
  with no seams, while a packed ring beside it was drawn level by level and had
  them. `stageGeom.run` is the run as the tanks it is made of; `tankStackLen`
  sums the same per-tank length, so the drawing and the slenderness limit cannot
  disagree about how long it is.

- **The id buffer is two bytes wide.** One capped the model at 254 parts and
  failed silently — the 255th clamps onto the first and its outlines stop being
  drawn. The largest model in the mission grid is 78.

- **Creases are geometry, silhouettes are screen space.** `EdgesGeometry` knows
  where a cap meets a tube — 90 degrees, in the model, the same from every
  angle. It cannot know a cylinder's side outline, which is an occluding contour
  and depends on where the camera stands. And neither depth nor normals can find
  the seam between two tanks of the same diameter, which is the commonest join
  in the rocket: same plane, same normal. Surface ids find that one. Three
  techniques, three jobs; do not try to make one of them do another's.

- **A closed form cannot check itself.** `framing` reduces the model to one
  cylinder and solves for its extent. The containment test used to assert that
  answer against the same reasoning, which proved only that the arithmetic was
  consistent with itself. It samples the rim circles of every part and projects
  them through the camera basis instead — independent, and it names the part
  and the metres when it fails.

  This is not a mistake you make once. The first depth-containment check took
  its camera position and its near and far planes from the same `cameraFor`
  call, so a direction of the wrong length inflated both together and the test
  passed with the bug it was written for still in place. It stands the camera
  where the renderer stands it and normalises the look direction itself.

- **An arrival ends where the still drawing is, to the bit.** A new design
  settles onto the pad from a little above its place — `arrive()` in
  `src/ui/separation.ts`, the same shape of thing as `pose()` — and at t = 1
  every offset is exactly zero, the extent is the still's and the camera has
  not moved, so the frame the animation hands over to is the one it ended on.
  `test/separation.test.ts` holds that on numbers and `visual/render.test.ts`
  on pixels. Do not let the camera take part: the arrival plays on every
  change to the brief that changes the design, and a frame that moves each
  time is a nervous drawing. Which design it is comes from `missionSignature`
  in `src/core/signature.ts` plus the payload diameter — a re-solve that
  returns the same rocket is not an arrival. #138

- **An engine is the game's own mesh, simplified, fetched when first drawn.**
  `engineMesh` in `three-view.tsx` keeps a module-level cache keyed by art
  and title; a miss starts the fetch (`public/engines/index.json`, then the
  file) and returns nothing, so the engine draws as the cylinder it always
  was, and when the file lands every mounted view is told (`onMeshes`) and
  re-keys its build effect on `meshTick`. `null` in the cache is an engine
  with no file — no asking again. Its normals are `toCreasedNormals` at
  `ENGINE_CREASE`, 70°: averaged where faces meet at less than that, so a
  bell shades as a curve, split where they meet at more, so a lip stays a
  line — and the crease pass draws edges at the same angle, so a line
  appears exactly where the shading breaks. Not the 30° a cylinder's cap
  wants: a ring of six facets meets at sixty, and no engine has a real edge
  shallower than a right angle. Scaled uniformly to the box the model gave it, hanging from the
  top; the model's height came from the same mesh's drag cube and its width
  from its face area, so the two fits agree within a few percent and the
  smaller keeps the drawing inside what the solver sized. jsdom never mounts
  a `ThreeView`, so nothing under `test/` fetches; the visual suite serves
  `dist/`, where `public/` has been copied. #85

- **A lathe faces its surface by the direction of travel.** Walked from the
  bottom up the outside, the triangles face out — `taperedProfile`'s
  convention. A bell is hollow so the plan view can look up into it, and its
  profile therefore starts on the axis inside the throat, comes down the
  inside, turns at the lip and goes back up the outside: down the inside
  faces in, up the outside faces out, and both are front faces to the camera
  that sees them. Reverse either run and that surface culls to nothing with
  no error. Zero-length segments — a plate of no height, a body as wide as
  its bell — make degenerate triangles the crease pass draws as stray lines;
  `tidy` drops them. #85

- **The scrubber and the stepper drive the same pair.** While the range
  input is held, `scrub` (a position in steps, `2.4` being forty percent of
  the way from step 2 to 3) replaces `anim` as the source of the motion, and
  `shot` is keyed on which pair is on screen either way. Letting go snaps to
  the nearer step and clears `anim` as well as `scrub`: a separation that was
  cancelled mid-flight leaves its last `anim` behind, and a stale `anim` is a
  drawing stuck between two steps. The arrow keys walk whole steps through
  `setGoal`, so the keyboard never rests between two. #138

---

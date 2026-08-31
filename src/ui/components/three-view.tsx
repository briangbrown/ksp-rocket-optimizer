import { useEffect, useRef } from "react";
import {
  CylinderGeometry,
  DepthTexture,
  LatheGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import type { ShaderMaterial } from "three";
import { extentOf } from "../../core/model.js";
import { cameraFor, viewOf } from "../views.js";
import { C } from "../tokens.js";
import {
  LINE,
  compositeMaterial,
  ghostMaterial,
  goochMaterial,
  idMaterial,
  panelClear,
} from "./shaders.js";
import type { ModelPart } from "../../core/model.js";
import type { Extent } from "../views.js";
import type { Offset } from "../separation.js";

/* The build model, drawn.

   One scene, one set of shapes, and a camera per view — so the plan and the
   elevation cannot describe the rocket differently. That is the whole point of
   #63: every geometry bug here has been two descriptions disagreeing, and a
   projection of one model has nothing to disagree with.

   Flat fill and a drawn edge, no lights and no shadows, because this is a
   schematic and not a render. MeshBasicMaterial ignores lighting entirely,
   which is what keeps it reading as a drawing rather than a grey lump.

   Nothing animates. A frame is drawn when the rocket or the view changes and
   never on a loop, because the cameras do not move. */

const FILL: Readonly<Record<string, string>> = {
  tank: C.tank,
  engine: C.engine,
  coupler: C.violet,
  adapter: C.violet,
  decoupler: C.dim,
  payload: C.payloadFill,
};

/* Enough segments to read as round at this size. The count used to be pulled
   two ways — fine enough to look round, coarse enough that its seams stayed
   under the edge threshold — and only has to satisfy the first now that the
   silhouette is found in screen space. At 40 the seams are 9 degrees apart,
   comfortably under the threshold below, which is there for the 90 degree
   crease where a cap meets the tube. That crease is the one line geometry
   knows and the screen does not: it is inside a single part, so no change of
   surface id marks it. */
const SEGMENTS = 40;
const CREASE_ANGLE = 30;

/* The profile of a part that tapers, revolved to make it.

   Read side-on a command pod is a trapezium with rounded corners, and the
   corners are the point — a sharp cone edge reads as a nose cone rather than
   as something with people in it. Each shoulder is a quarter circle in the
   profile, tangent to the face it leaves and to the taper it joins, so the
   silhouette turns smoothly and the outline pass has no crease to find there.
   The straight run between them is one segment, since a lathe interpolates
   between consecutive points. #82 */
const SHOULDER = 9;

function taperedProfile(rBase: number, rTop: number, h: number) {
  /* Small enough that the shoulders never meet in the middle of a squat pod,
     and small against the top face in particular: a fillet of much more than a
     third of the top radius closes it over and the pod reads as a bullet
     rather than as something with a hatch in it. */
  const f = Math.min(rBase * 0.16, h * 0.1, rTop * 0.34);
  const y0 = -h / 2;
  const y1 = h / 2;
  const arc = (cr: number, cy: number, from: number, to: number) =>
    Array.from({ length: SHOULDER + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / SHOULDER;
      return new Vector2(cr + Math.cos(a) * f, cy + Math.sin(a) * f);
    });
  return [
    new Vector2(0, y0),
    ...arc(rBase - f, y0 + f, -Math.PI / 2, 0),
    ...arc(rTop - f, y1 - f, 0, Math.PI / 2),
    new Vector2(0, y1),
  ];
}

/* The dash period of a hidden edge, in CSS pixels — scaled to device pixels
   where it is used, since the shader measures in the buffer's own grid and a
   phone would otherwise get dashes half the size. */
const DASH_PERIOD = 7;

/* `color` is the destination's own hue, which the boosters are drawn in.

   `width` and `height` are the visible box. `buffer` is the drawing buffer,
   which is the same thing in every still frame and larger during a staging
   transition: the panel changes size as it runs, and reallocating two render
   targets and a depth texture sixty times a second is tens of megabytes a
   frame. Instead the buffer is allocated once at the largest box the
   transition passes through, the visible box is clipped out of its top-left
   corner by the caller, and the frustum below is made asymmetric so that
   corner shows exactly what a panel of that size should. #105

   `extent` and `midY` say what to frame and what to look at, which is the
   parts' own extent in a still frame and an interpolation between two of them
   during a transition. `offsets` moves each part from where the model put it,
   index-aligned, and is what a separation actually looks like. */
type ThreeViewProps = {
  parts: ReadonlyArray<ModelPart>;
  view: string;
  width: number;
  height: number;
  color: string;
  buffer?: { w: number; h: number };
  extent?: Extent;
  midY?: number;
  offsets?: ReadonlyArray<Offset> | null;
};

/* Reused rather than allocated per part per frame. */
const AXIS = new Vector3();

/* Everything the paint step needs, built once per rocket. */
type Built = {
  scene: Scene;
  group: Group;
  ghost: Group | null;
  creases: Group;
  meshes: Array<Mesh>;
  lines: Array<LineSegments>;
  ghosts: Array<Mesh>;
  idMats: Array<ShaderMaterial>;
  fillMats: Array<ShaderMaterial>;
  quadScene: Scene;
  quadMat: ShaderMaterial;
  quad: OrthographicCamera;
  idTarget: WebGLRenderTarget;
  fillTarget: WebGLRenderTarget;
  depth: DepthTexture;
  bw: number;
  bh: number;
};

export default function ThreeView({
  parts,
  view,
  width,
  height,
  color,
  buffer,
  extent,
  midY,
  offsets,
}: ThreeViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const gl = useRef<WebGLRenderer | null>(null);
  const built = useRef<Built | null>(null);

  const bufW = buffer ? buffer.w : width;
  const bufH = buffer ? buffer.h : height;

  /* The renderer outlives the rocket. A browser allows a small number of live
     WebGL contexts — around sixteen — and building one per staging step would
     run through them in a couple of clicks, whatever dispose() is told. */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      /* Drawn once and left standing, so the buffer has to survive being
         composited. Without this the schematic is correct on the frame that
         draws it and blank the next time the page repaints. */
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      return; // no context; the caller keeps the drawing
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    gl.current = renderer;
    return () => {
      gl.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === el)
        el.removeChild(renderer.domElement);
    };
  }, []);

  /* ---------------------------- built once ----------------------------

     The scene, the meshes and the render targets. A transition repaints this
     sixty times a second and must not rebuild any of it — that was one effect
     keyed on everything, and moving a part would have thrown away every buffer
     on the card to draw it a metre lower. */
  useEffect(() => {
    const renderer = gl.current;
    if (!renderer) return;
    /* Sized in CSS pixels, and the style left to three.js to set: the canvas
       is devicePixelRatio times bigger in device pixels, and without a style
       it would lay out at that size — twice the panel on a phone. */
    renderer.setSize(bufW, bufH);
    /* Clear rather than return. A canvas holds the last frame drawn into it
       until something else is drawn — the more so with preserveDrawingBuffer —
       so bailing out on an empty model leaves the previous rocket on screen
       and it reads as a rocket that did not change. */
    if (!parts.length) {
      built.current = null;
      renderer.clear();
      return;
    }

    const scene = new Scene();
    const group = new Group();
    scene.add(group);

    /* three.js allocates GPU buffers a garbage collector cannot see, so every
       one is kept and handed back when the rocket changes. */
    const owned: Array<{ dispose: () => void }> = [];

    /* Each part is its own mesh already, so each can carry its own id. That is
       the whole cost of the surface-id outline: two materials per part instead
       of one, and a second pass over geometry that is a few thousand triangles.
       Depth and normals cannot find the seam between two tanks of the same
       diameter — same plane, same normal — and that is the commonest join in
       the rocket. #70 */
    const idMats: Array<ShaderMaterial> = [];
    const fillMats: Array<ShaderMaterial> = [];
    /* Kept alongside the group rather than read back out of `group.children`,
       which is a list of plain objects as far as anything can tell. The three
       are the same parts in the same order, which is what lets a separation
       move all three of a part's pieces together. */
    const meshes: Array<Mesh> = [];
    const lines: Array<LineSegments> = [];
    const ghosts: Array<Mesh> = [];
    /* Drawn only where the opaque pass was hidden, so this is the far side of
       the rocket and nothing else. Not built for the plan: looking up from
       underneath, the engines hide the tanks above them by design, and that is
       what the view is for. #71 */
    const ghost = view === "plan" ? null : new Group();
    if (ghost) {
      ghost.visible = false;
      scene.add(ghost);
    }
    /* Creases are their own group so the id pass can hide them in one call —
       and so the meshes stay index-aligned with their materials, which they
       would not be if lines were interleaved among them. */
    const creases = new Group();
    scene.add(creases);
    const creaseMat = new LineBasicMaterial({ color: LINE });
    owned.push(creaseMat);

    for (const [i, p] of parts.entries()) {
      const geo =
        p.rTop === undefined
          ? new CylinderGeometry(p.r, p.r, p.h, SEGMENTS)
          : new LatheGeometry(taperedProfile(p.r, p.rTop, p.h), SEGMENTS);
      const fill = goochMaterial(
        p.role === "booster" ? color : FILL[p.role] || C.dim,
      );
      /* The crease sits exactly on the surface it marks, so the two compete
         for the same depth and the line comes and goes along its length. Push
         the fill back a hair and it stops. */
      fill.polygonOffset = true;
      fill.polygonOffsetFactor = 1;
      fill.polygonOffsetUnits = 1;
      const mesh = new Mesh(geo, fill);
      meshes.push(mesh);
      group.add(mesh);
      const line = new LineSegments(
        new EdgesGeometry(geo, CREASE_ANGLE),
        creaseMat,
      );
      lines.push(line);
      creases.add(line);
      if (ghost) {
        const gm = ghostMaterial(
          p.role === "booster" ? color : FILL[p.role] || C.dim,
          DASH_PERIOD * renderer.getPixelRatio(),
        );
        const back = new Mesh(geo, gm);
        ghosts.push(back);
        ghost.add(back);
        owned.push(gm);
      }
      const id = idMaterial(i);
      idMats.push(id);
      fillMats.push(fill);
      owned.push(geo, fill, id, line.geometry);
    }

    /* Buffers at device resolution, not CSS pixels, or the outline is found at
       half the resolution it is drawn at and comes out soft on a phone. */
    const dpr = renderer.getPixelRatio();
    const bw = Math.max(1, Math.round(bufW * dpr));
    const bh = Math.max(1, Math.round(bufH * dpr));

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
    owned.push(idTarget, fillTarget, depth);

    const quadMat = compositeMaterial();
    const quadGeo = new PlaneGeometry(2, 2);
    const quadScene = new Scene();
    const quadMesh = new Mesh(quadGeo, quadMat);
    /* The composite writes clip space straight out and never looks at the
       camera, so three would cull it against a frustum it does not live in and
       the panel would come back empty. */
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);
    const quad = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    owned.push(quadMat, quadGeo);

    built.current = {
      scene,
      group,
      ghost,
      creases,
      meshes,
      lines,
      ghosts,
      idMats,
      fillMats,
      quadScene,
      quadMat,
      quad,
      idTarget,
      fillTarget,
      depth,
      bw,
      bh,
    };

    return () => {
      built.current = null;
      renderer.setRenderTarget(null);
      for (const o of owned) o.dispose();
    };
  }, [parts, view, color, bufW, bufH]);

  /* ---------------------------- painted often ----------------------------

     Where every part is and where the camera stands. Cheap enough to run on
     every frame of a transition: it moves objects that already exist and
     renders four passes over a few thousand triangles. */
  useEffect(() => {
    const renderer = gl.current;
    const b = built.current;
    if (!renderer || !b) return;

    const box = extent ?? extentOf(parts);
    const mid = midY ?? box.height / 2;
    const { up } = viewOf(view);
    /* Where it stands, what it can see and how deep it can see, all from one
       place — the axis that positions the camera is the axis its near and far
       planes are measured along, which is what stops the two disagreeing. */
    const cam = cameraFor(view, box, width / height);
    /* Asymmetric, so the visible box in the buffer's top-left corner frames
       exactly what a panel of that size would. Both ratios are 1 in a still
       frame and this is the ordinary symmetric frustum. */
    const wide = bufW / width;
    const tall = bufH / height;
    const camera = new OrthographicCamera(
      -cam.halfW,
      -cam.halfW + 2 * cam.halfW * wide,
      cam.halfH,
      cam.halfH - 2 * cam.halfH * tall,
      cam.near,
      cam.far,
    );
    camera.position.set(
      cam.axis.x * cam.dist,
      mid + cam.axis.y * cam.dist,
      cam.axis.z * cam.dist,
    );
    camera.up.set(up[0], up[1], up[2]);
    camera.lookAt(0, mid, 0);

    /* Every part where the separation has got it to. All three of a part's
       pieces — its surface, its creases and its ghost — move together, which
       is what the parallel arrays above are for. */
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const o = offsets?.[i];
      const x = p.x + (o ? o.x : 0);
      const y = p.y + p.h / 2 + (o ? o.y : 0);
      const z = p.z + (o ? o.z : 0);
      const tilt = o ? o.tilt : 0;
      /* About the tangent, so the top swings away from the stack rather than
         around it. A part on the axis has no direction to lean in. */
      const r = Math.hypot(p.x, p.z);
      if (tilt && r > 1e-9) AXIS.set(p.z / r, 0, -p.x / r);
      for (const obj of [b.meshes[i], b.lines[i], b.ghosts[i]]) {
        if (!obj) continue;
        obj.position.set(x, y, z);
        if (tilt && r > 1e-9) obj.quaternion.setFromAxisAngle(AXIS, tilt);
        else obj.quaternion.identity();
      }
    }

    /* Ids first, on black so the background reads as no part at all, and
       without the creases: a line drawn into the id buffer is a false part,
       and every one of them would come back as an outline of its own. */
    b.creases.visible = false;
    if (b.ghost) b.ghost.visible = false;
    for (let i = 0; i < parts.length; i++) b.meshes[i].material = b.idMats[i];
    renderer.setRenderTarget(b.idTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(b.scene, camera);

    /* Then the shading and the creases, on the panel colour the composite
       fades towards. */
    b.creases.visible = true;
    for (let i = 0; i < parts.length; i++) b.meshes[i].material = b.fillMats[i];
    renderer.setRenderTarget(b.fillTarget);
    renderer.setClearColor(panelClear(), 1);
    renderer.clear();
    renderer.render(b.scene, camera);

    /* Then what is behind it, over the top. A separate render rather than a
       group in the one above, because three sorts transparent objects after
       opaque ones but still writes them into the same depth pass — and this
       wants the finished depth buffer to test against, not a partial one. */
    if (b.ghost) {
      b.ghost.visible = true;
      b.group.visible = false;
      b.creases.visible = false;
      renderer.autoClear = false;
      renderer.render(b.scene, camera);
      renderer.autoClear = true;
      b.group.visible = true;
      b.ghost.visible = false;
    }

    /* And the lines, over the top, straight to the canvas. */
    b.quadMat.uniforms.tColor.value = b.fillTarget.texture;
    b.quadMat.uniforms.tId.value = b.idTarget.texture;
    b.quadMat.uniforms.tDepth.value = b.depth;
    b.quadMat.uniforms.texel.value.set(1 / b.bw, 1 / b.bh);
    b.quadMat.uniforms.camNear.value = cam.near;
    b.quadMat.uniforms.camFar.value = cam.far;
    /* Cue across the model's own depth, so a long rocket seen end-on fades
       over the same range as a short one rather than by its absolute size. */
    b.quadMat.uniforms.cueNear.value = cam.cueNear;
    b.quadMat.uniforms.cueSpan.value = cam.cueSpan;
    renderer.setRenderTarget(null);
    renderer.render(b.quadScene, b.quad);
  }, [parts, view, color, bufW, bufH, width, height, extent, midY, offsets]);

  /* The visible box, clipping the buffer's top-left corner. They are the same
     size in a still frame and the clip does nothing. */
  return (
    <div
      style={{ width, height, overflow: "hidden", lineHeight: 0 }}
      ref={host}
    />
  );
}

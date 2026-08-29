import { useEffect, useRef } from "react";
import {
  CylinderGeometry,
  DepthTexture,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { extentOf } from "../../core/model.js";
import { cameraFor, viewOf } from "../views.js";
import { C } from "../tokens.js";
import {
  compositeMaterial,
  goochMaterial,
  idMaterial,
  panelClear,
} from "./shaders.js";

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

const FILL = {
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

export default function ThreeView({ parts, view, width, height, color }) {
  const host = useRef(null);
  const gl = useRef(null);

  /* The renderer outlives the rocket. A browser allows a small number of live
     WebGL contexts — around sixteen — and building one per staging step would
     run through them in a couple of clicks, whatever dispose() is told. */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer;
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

  useEffect(() => {
    const renderer = gl.current;
    if (!renderer) return;
    /* Sized in CSS pixels, and the style left to three.js to set: the canvas
       is devicePixelRatio times bigger in device pixels, and without a style
       it would lay out at that size — twice the panel on a phone. */
    renderer.setSize(width, height);
    /* Clear rather than return. A canvas holds the last frame drawn into it
       until something else is drawn — the more so with preserveDrawingBuffer —
       so bailing out on an empty model leaves the previous rocket on screen
       and it reads as a rocket that did not change. */
    if (!parts.length) {
      renderer.clear();
      return;
    }

    const scene = new Scene();
    const group = new Group();
    scene.add(group);

    /* three.js allocates GPU buffers a garbage collector cannot see, so every
       one is kept and handed back when the rocket changes. */
    const owned = [];

    /* Each part is its own mesh already, so each can carry its own id. That is
       the whole cost of the surface-id outline: two materials per part instead
       of one, and a second pass over geometry that is a few thousand triangles.
       Depth and normals cannot find the seam between two tanks of the same
       diameter — same plane, same normal — and that is the commonest join in
       the rocket. #70 */
    const idMats = [];
    const fillMats = [];
    /* Creases are their own group so the id pass can hide them in one call —
       and so the meshes stay index-aligned with their materials, which they
       would not be if lines were interleaved among them. */
    const creases = new Group();
    scene.add(creases);
    const creaseMat = new LineBasicMaterial({ color: C.edge });
    owned.push(creaseMat);

    for (const [i, p] of parts.entries()) {
      const geo = new CylinderGeometry(p.r, p.r, p.h, SEGMENTS);
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
      /* The model puts a part's base at y; three.js centres a cylinder. */
      mesh.position.set(p.x, p.y + p.h / 2, p.z);
      group.add(mesh);
      const line = new LineSegments(
        new EdgesGeometry(geo, CREASE_ANGLE),
        creaseMat,
      );
      line.position.copy(mesh.position);
      creases.add(line);
      const id = idMaterial(i);
      idMats.push(id);
      fillMats.push(fill);
      owned.push(geo, fill, id, line.geometry);
    }

    const extent = extentOf(parts);
    const mid = extent.height / 2;
    const { up } = viewOf(view);
    /* Where it stands, what it can see and how deep it can see, all from one
       place — the axis that positions the camera is the axis its near and far
       planes are measured along, which is what stops the two disagreeing. */
    const cam = cameraFor(view, extent, width / height);
    const camera = new OrthographicCamera(
      -cam.halfW,
      cam.halfW,
      cam.halfH,
      -cam.halfH,
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

    /* Buffers at device resolution, not CSS pixels, or the outline is found at
       half the resolution it is drawn at and comes out soft on a phone. */
    const dpr = renderer.getPixelRatio();
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));

    /* Ids and depth come off the same pass, unfiltered and unresolved: a
       multisampled id buffer averages two parts into a third that does not
       exist, and a linear filter does the same along every boundary. The fill
       is multisampled, because that one wants a smooth silhouette. */
    const idTarget = new WebGLRenderTarget(bw, bh, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthTexture: new DepthTexture(bw, bh),
    });
    const fillTarget = new WebGLRenderTarget(bw, bh, { samples: 4 });
    owned.push(idTarget, fillTarget, idTarget.depthTexture);

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

    const paint = () => {
      /* Ids first, on black so the background reads as no part at all, and
         without the creases: a line drawn into the id buffer is a false part,
         and every one of them would come back as an outline of its own. */
      creases.visible = false;
      for (let i = 0; i < parts.length; i++)
        group.children[i].material = idMats[i];
      renderer.setRenderTarget(idTarget);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);

      /* Then the shading and the creases, on the panel colour the composite
         fades towards. */
      creases.visible = true;
      for (let i = 0; i < parts.length; i++)
        group.children[i].material = fillMats[i];
      renderer.setRenderTarget(fillTarget);
      renderer.setClearColor(panelClear(), 1);
      renderer.clear();
      renderer.render(scene, camera);

      /* And the lines, over the top, straight to the canvas. */
      quadMat.uniforms.tColor.value = fillTarget.texture;
      quadMat.uniforms.tId.value = idTarget.texture;
      quadMat.uniforms.tDepth.value = idTarget.depthTexture;
      quadMat.uniforms.texel.value.set(1 / bw, 1 / bh);
      quadMat.uniforms.camNear.value = cam.near;
      quadMat.uniforms.camFar.value = cam.far;
      /* Cue across the model's own depth, so a long rocket seen end-on fades
         over the same range as a short one rather than by its absolute size. */
      quadMat.uniforms.cueNear.value = cam.cueNear;
      quadMat.uniforms.cueSpan.value = cam.cueSpan;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quad);
    };

    paint();

    return () => {
      renderer.setRenderTarget(null);
      for (const o of owned) o.dispose();
    };
  }, [parts, view, width, height, color]);

  return <div ref={host} style={{ width, height, lineHeight: 0 }} />;
}

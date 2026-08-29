import { useEffect, useRef } from "react";
import {
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { extentOf } from "../../core/model.js";
import { C } from "../tokens.js";

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

/* Enough segments to read as round at this size, few enough that the edge pass
   stays cheap. The threshold keeps the vertical seams out of the outline —
   below it every segment boundary counts as an edge and a tank comes back
   looking like a paper lantern. */
const SEGMENTS = 28;
const EDGE_ANGLE = 30;

/* Where the camera stands and which way is up.

   Plan looks up from underneath, as the SVG one does — that is how you read
   what is bolted where, with the engines nearest the viewer.

   Every view must put world +x to the right of the screen. The columns of a
   parallel stage start at +x and work round, and the elevation draws that
   first pair left and right, so a view that disagrees on x draws the same
   rocket mirrored against the one beside it — three tanks leaning right in
   the elevation and left in the plan. three.js builds the basis as
   `right = up x (eye - target)`, so from underneath +x on the right forces +z
   to the top; you cannot have both that and the SVG plan's z-down. Above the
   rocket would give both and is wrong for a different reason: the payload
   would sit over the engines. `viewRight` below is the check. */
const VIEWS = {
  side: { dir: [0, 0, 1], up: [0, 1, 0] },
  plan: { dir: [0, -1, 0], up: [0, 0, 1] },
  iso: { dir: [0.72, 0.52, 0.72], up: [0, 1, 0] },
};

/* The world direction a view sends to the right of the screen, by the same
   arithmetic three.js uses to aim the camera. Exported because two views
   disagreeing about it is a mirrored drawing, and that is checkable without a
   GPU where the drawing itself is not. */
export function viewRight(view) {
  const { dir, up } = VIEWS[view] || VIEWS.side;
  return new Vector3(...up).cross(new Vector3(...dir)).normalize();
}

/* Half-extents the view has to cover, before the panel's own shape is applied.
   Straight from the model, which is what makes containment structural: the
   frustum is the rocket's extent, so nothing can fall outside the panel. */
export function framing(view, { height: H, reach }) {
  if (view === "plan") return { w: reach, h: reach };
  if (view === "iso") {
    /* Any rotation about the axis fits inside the bounding sphere, so frame
       that and accept a little air rather than solving for the angle. */
    const r = Math.hypot(reach, H / 2);
    return { w: r, h: r };
  }
  return { w: reach, h: H / 2 };
}

/* The frustum for a panel of a given shape.

   Fit whichever half-extent is the tighter against the panel's own aspect, so a
   pencil is limited by its height and a squat stage by its width, then leave a
   little air. Separate from the component and exported because it carries the
   claim worth checking — that nothing the model contains can fall outside the
   view — and checking it needs no GPU, which jsdom has none of. */
export function fitOrtho(view, extent, aspect) {
  const need = framing(view, extent);
  const halfH = Math.max(need.h, need.w / aspect) * 1.08;
  return { halfW: halfH * aspect, halfH };
}

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
    const edgeMat = new LineBasicMaterial({ color: C.edge });
    owned.push(edgeMat);

    for (const p of parts) {
      const geo = new CylinderGeometry(p.r, p.r, p.h, SEGMENTS);
      const mat = new MeshBasicMaterial({
        color: p.role === "booster" ? color : FILL[p.role] || C.dim,
      });
      const mesh = new Mesh(geo, mat);
      /* The model puts a part's base at y; three.js centres a cylinder. */
      mesh.position.set(p.x, p.y + p.h / 2, p.z);
      const edges = new LineSegments(
        new EdgesGeometry(geo, EDGE_ANGLE),
        edgeMat,
      );
      edges.position.copy(mesh.position);
      group.add(mesh, edges);
      owned.push(geo, mat, edges.geometry);
    }

    const extent = extentOf(parts);
    const mid = extent.height / 2;
    const { dir, up } = VIEWS[view] || VIEWS.side;
    const { halfW, halfH } = fitOrtho(view, extent, width / height);

    const reachOut = Math.max(extent.height, extent.reach * 2) * 3 + 10;
    const camera = new OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.01,
      reachOut * 4,
    );
    camera.position.set(
      dir[0] * reachOut,
      mid + dir[1] * reachOut,
      dir[2] * reachOut,
    );
    camera.up.set(up[0], up[1], up[2]);
    camera.lookAt(0, mid, 0);

    renderer.render(scene, camera);

    return () => {
      for (const o of owned) o.dispose();
    };
  }, [parts, view, width, height, color]);

  return <div ref={host} style={{ width, height, lineHeight: 0 }} />;
}

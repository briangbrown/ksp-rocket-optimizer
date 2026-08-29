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
  Fog,
  Scene,
  WebGLRenderer,
} from "three";
import { extentOf } from "../../core/model.js";
import { fitOrtho, viewOf } from "../views.js";
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
    /* Slightly short of solid. An outline at full strength on a shape whose
       fill is a near neighbour of it reads as a border rather than a drawn
       edge, and a rocket of thirty parts becomes a mesh of them. */
    const edgeMat = new LineBasicMaterial({
      color: C.edge,
      transparent: true,
      opacity: 0.8,
    });
    owned.push(edgeMat);

    for (const p of parts) {
      const geo = new CylinderGeometry(p.r, p.r, p.h, SEGMENTS);
      const mat = new MeshBasicMaterial({
        color: p.role === "booster" ? color : FILL[p.role] || C.dim,
        /* The outline sits exactly on the surface it outlines, so the two
           compete for the same depth and the edge comes and goes around the
           silhouette. Push the fill back a hair and it stops. */
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
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
    const { dir, up } = viewOf(view);
    const { halfW, halfH } = fitOrtho(view, extent, width / height);

    /* Depth cueing. Nothing is lit, so the only thing telling a viewer which
       column is nearer is that the far one sinks slightly towards the panel it
       is drawn on — the same trick as a pale distance in a drawing. Fog is
       linear in camera depth, so near and far are placed to leave the front of
       the rocket untouched and take about a third out of the back of it; more
       than that and the far columns stop reading as the same rocket. */
    const R = Math.hypot(extent.reach, extent.height / 2) || 1;
    const reachOut = Math.max(extent.height, extent.reach * 2) * 3 + 10;
    scene.fog = new Fog(C.panel, reachOut - R, reachOut + 5.7 * R);
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

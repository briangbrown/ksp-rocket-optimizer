import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DepthTexture,
  DynamicDrawUsage,
  LatheGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
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
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cameraFor, viewOf } from "../views.js";
import { artName } from "../../core/geometry.js";
import { fills, palette } from "../tokens.js";
import {
  compositeMaterial,
  ghostLineMaterial,
  goochMaterial,
  idMaterial,
  peelIdMaterial,
  lineOf,
  panelClear,
} from "./shaders.js";
import type { ModelPart } from "../../core/model.js";
import {
  alongCreases,
  chainEdges,
  fillSegments,
  revolvedSilhouette,
  silhouetteEdges,
  topologyOf,
  vertexIds,
} from "./hidden-lines.js";
import type { Chain, Topology } from "./hidden-lines.js";
import type { Theme } from "../tokens.js";
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

/* The fills come from `KIND`, the same table the parts legend draws from, so
   the drawing and the list cannot disagree about what colour a decoupler is —
   read through `fills` in the theme being drawn, because a shader is handed
   the number and not the custom property. Roles the table does not name — a
   shroud on a plate, mission hardware — fall back to `dim`. */

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
const ENGINE_CREASE = 70;

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

/* An engine from a simplified copy of the game's own mesh — one file an
   engine under public/engines/, made by tools/engine-meshes.mjs, fetched the
   first time an engine is drawn and kept. Millimetres with the top node at
   y = 0, so it hangs from the top of the box the model gave the engine,
   scaled uniformly to fit the box: the height the model measured from the
   same mesh's drag cube, the width from its face area, so the two scales
   agree within a few percent and the smaller keeps the drawing inside what
   the solver sized. A cluster is simply the mesh — two bells, four, off-axis,
   whatever the part has — which is what a profile revolved about the axis
   could never be. Until the file lands the engine is the cylinder it always was, and
   `onMeshes` is how the view learns to draw again. #85 */
type EngineMesh = {
  h: number;
  w: number;
  v: ReadonlyArray<number>;
  i: ReadonlyArray<number>;
};
type MeshIndex = {
  stock: Readonly<Record<string, string>>;
  restock: Readonly<Record<string, string>>;
};
/* Relative to the page, so the application and the gallery — both at the
   root — find the same files under public/. */
const meshes = new Map<string, EngineMesh | null>();
const meshIndexes = new Map<string, Promise<MeshIndex | null>>();
const meshListeners = new Set<() => void>();
const onMeshes = (cb: () => void) => {
  meshListeners.add(cb);
  return () => void meshListeners.delete(cb);
};
const meshUrl = async (folder: string, title: string) => {
  let ix = meshIndexes.get(folder);
  if (!ix) {
    ix = fetch(`${folder}/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<MeshIndex>) : null))
      .catch(() => null);
    meshIndexes.set(folder, ix);
  }
  const index = await ix;
  if (!index) return null;
  const file =
    (artName() === "restock" ? index.restock[title] : undefined) ??
    index.stock[title];
  return file ? `${folder}/${file}` : null;
};
/* The mesh if it has arrived; starts it on its way if not. `null` in the
   cache is an engine that has none — the drum, and no asking again. */
function engineMesh(title: string, folder: string): EngineMesh | undefined {
  const key = `${folder}/${artName()}/${title}`;
  if (meshes.has(key)) return meshes.get(key) ?? undefined;
  meshes.set(key, null);
  (async () => {
    const url = await meshUrl(folder, title);
    const m = url
      ? await fetch(url)
          .then((r) => (r.ok ? (r.json() as Promise<EngineMesh>) : null))
          .catch(() => null)
      : null;
    if (!m) return;
    meshes.set(key, m);
    for (const cb of meshListeners) cb();
  })();
  return undefined;
}

function enginePositions(R: number, H: number, m: EngineMesh, face?: number) {
  const s = Math.min(H / m.h, R / (m.w / 2)) / 1000;
  const pos = new Float32Array(m.v.length);
  for (let k = 0; k < m.v.length; k += 3) {
    pos[k] = m.v[k] * s;
    pos[k + 1] = m.v[k + 1] * s + H / 2;
    pos[k + 2] = m.v[k + 2] * s;
  }
  /* A radial engine's file is framed on its attach point with the wall at
     −x (tools/engine-meshes.mjs). Turn it to face the column it is bolted
     to and stand the origin on the tank's wall, which is the near edge of
     the cylinder that bounds the part. #164 */
  if (face !== undefined) {
    const th = face + Math.PI;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const ox = R * Math.cos(face);
    const oz = R * Math.sin(face);
    for (let k = 0; k < pos.length; k += 3) {
      const x = pos[k];
      const z = pos[k + 2];
      pos[k] = x * c - z * sn + ox;
      pos[k + 2] = x * sn + z * c + oz;
    }
  }
  return pos;
}
function engineGeometry(pos: Float32Array, m: EngineMesh) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex([...m.i]);
  /* Smooth across a curve, split at an edge: normals are averaged between
     faces that meet at less than the crease angle and kept apart at more,
     so a bell shades as a curve and its lip stays a line. Seventy degrees:
     no engine has a real edge that shallow, and a ring of six facets meets
     at sixty. The same angle decides which edges the crease pass
     draws. */
  const creased = toCreasedNormals(g, (ENGINE_CREASE * Math.PI) / 180);
  g.dispose();
  return creased;
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
  /* What the depth window must reach round, where that is more than what is
     framed — the parts on their way out of a staging transition. */
  sweep?: Extent;
  midY?: number;
  offsets?: ReadonlyArray<Offset> | null;
  /* The theme the drawing is built in. A change is a rebuild of the scene —
     every material holds the panel and the line colour as numbers — which is
     why it is a prop and a dependency of the build effect, not something the
     paint step reads. `.claude/rules/renderer.md` */
  theme: Theme;
  /* What the drawing is a picture of, for a reader who cannot see it: the
     view, the step and the figures beside it. A canvas has no text of its
     own, and jsdom never mounts one, so the render suite is what holds this.
     #141 */
  alt: string;
  /* Which folder under public/ the engine meshes come from: `engines`, the
     simplified ones the application draws, unless the gallery asks for the
     full ones beside them. */
  meshes?: string;
};

/* An engine on the axis, or a solid booster strapped beside it: both are
   one part with a file under public/engines, and the booster's drum — its
   casing and its nozzle together — is exactly the box its mesh is scaled
   into. A liquid column is drawn part by part and its engine arrives here
   as role "engine" already. */
const meshed = (p: ModelPart) => p.role === "engine" || p.role === "booster";

/* What a part's hidden silhouette is built from on each paint: a mesh's
   edge topology, or a revolved part's profile as radius-height pairs. */
type HiddenSource =
  | { kind: "mesh"; topo: Topology }
  | { kind: "revolved"; profile: Array<readonly [number, number]> };
/* A part's creases chained once, so their arc length can be re-measured on
   each paint without walking the edges again. */
type CreaseChains = { chains: Array<Chain>; ea: Int32Array; eb: Int32Array };

/* Reused rather than allocated per part per frame. */
const AXIS = new Vector3();
const DIR = new Vector3();
const LOCAL = new Vector3();
const PROJ = new Matrix4();
const VIEWPROJ = new Matrix4();

/* Everything the paint step needs, built once per rocket. */
type Built = {
  scene: Scene;
  group: Group;
  peelMats: Array<ShaderMaterial>;
  hidTarget: WebGLRenderTarget;
  ghostCrease: Array<ShaderMaterial>;
  ghostSil: Array<ShaderMaterial>;
  ghosts: Group;
  sils: Array<LineSegments>;
  hid: Array<HiddenSource>;
  creaseChains: Array<CreaseChains | null>;
  creaseMat: LineBasicMaterial;
  creases: Group;
  meshes: Array<Mesh>;
  lines: Array<LineSegments>;
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
  sweep,
  midY,
  offsets,
  theme,
  alt,
  meshes: meshSet = "engines",
}: ThreeViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const gl = useRef<WebGLRenderer | null>(null);
  const built = useRef<Built | null>(null);
  /* Bumped when an engine's mesh arrives, so the build below runs again
     with it. */
  const [meshTick, setMeshTick] = useState(0);
  useEffect(() => onMeshes(() => setMeshTick((t) => t + 1)), []);

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

    const pal = palette(theme);
    const fill = fills(pal);
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
    const peelMats: Array<ShaderMaterial> = [];
    /* Creases are their own group so the id pass can hide them in one call —
       and so the meshes stay index-aligned with their materials, which they
       would not be if lines were interleaved among them. */
    const creases = new Group();
    scene.add(creases);
    const creaseMat = new LineBasicMaterial({ color: lineOf(pal) });
    owned.push(creaseMat);

    /* The hidden lines are geometry of their own, rebuilt on each paint from
       these (hidden-lines.ts): a mesh's edges and faces, or a revolved
       part's profile. The line segments they are written into are sized
       here for the most a part can need. */
    const hid: Array<HiddenSource> = [];
    const creaseChains: Array<CreaseChains | null> = [];
    const sils: Array<LineSegments> = [];
    const ghosts = new Group();
    ghosts.visible = false;
    scene.add(ghosts);
    for (const [i, p] of parts.entries()) {
      const m = meshed(p) ? engineMesh(p.part.n, meshSet) : undefined;
      const pos = m ? enginePositions(p.r, p.h, m, p.face) : null;
      const profile = m
        ? null
        : p.rTop === undefined
          ? [
              [p.r, -p.h / 2],
              [p.r, p.h / 2],
            ]
          : taperedProfile(p.r, p.rTop, p.h).map((v) => [v.x, v.y]);
      const geo =
        m && pos
          ? engineGeometry(pos, m)
          : p.rTop === undefined
            ? new CylinderGeometry(p.r, p.r, p.h, SEGMENTS)
            : new LatheGeometry(taperedProfile(p.r, p.rTop, p.h), SEGMENTS);
      let capacity: number;
      if (m && pos) {
        const topo = topologyOf(pos, m.i);
        hid.push({ kind: "mesh", topo });
        capacity = 2 * topo.ea.length;
      } else {
        const prof = profile!.map((q) => [q[0], q[1]] as const);
        hid.push({ kind: "revolved", profile: prof });
        capacity = 4 * prof.length;
      }
      const silGeo = new BufferGeometry();
      silGeo.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(3 * capacity), 3).setUsage(
          DynamicDrawUsage,
        ),
      );
      silGeo.setAttribute(
        "along",
        new BufferAttribute(new Float32Array(capacity), 1).setUsage(
          DynamicDrawUsage,
        ),
      );
      silGeo.setDrawRange(0, 0);
      const sil = new LineSegments(silGeo);
      sil.frustumCulled = false;
      sils.push(sil);
      ghosts.add(sil);
      owned.push(silGeo);
      const mat = goochMaterial(
        p.role === "booster" ? color : fill[p.role] || pal.dim,
        pal,
      );
      /* The crease sits exactly on the surface it marks, so the two compete
         for the same depth and the line comes and goes along its length. Push
         the fill back a hair and it stops. */
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 1;
      mat.polygonOffsetUnits = 1;
      const mesh = new Mesh(geo, mat);
      meshes.push(mesh);
      group.add(mesh);
      /* A simplified mesh is creases all over; on an engine only the sharp
         ones — the lip, a plate's edge — are lines. */
      const edges = new EdgesGeometry(
        geo,
        meshed(p) ? ENGINE_CREASE : CREASE_ANGLE,
      );
      const epos = edges.getAttribute("position").array as Float32Array;
      edges.setAttribute(
        "along",
        new BufferAttribute(new Float32Array(epos.length / 3), 1).setUsage(
          DynamicDrawUsage,
        ),
      );
      /* Chained once: which segment follows which never changes, only how
         long each is on the screen. Not for a mesh, whose hidden creases
         are never drawn. */
      if (meshed(p)) creaseChains.push(null);
      else {
        const ids = vertexIds(epos);
        const n = ids.length / 2;
        const ea = new Int32Array(n);
        const eb = new Int32Array(n);
        for (let k = 0; k < n; k++) {
          ea[k] = ids[2 * k];
          eb[k] = ids[2 * k + 1];
        }
        const all = Array.from({ length: n }, (_, k) => k);
        creaseChains.push({ chains: chainEdges(ea, eb, all), ea, eb });
      }
      const line = new LineSegments(edges, creaseMat);
      lines.push(line);
      creases.add(line);
      const id = idMaterial(i);
      idMats.push(id);
      fillMats.push(mat);
      owned.push(geo, mat, id, line.geometry);
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
    /* The layer behind: ids again, of what the front hid, with a depth of
       its own so the nearest of it wins. */
    const hidDepth = new DepthTexture(bw, bh);
    const hidTarget = new WebGLRenderTarget(bw, bh, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthTexture: hidDepth,
    });
    for (let i = 0; i < parts.length; i++) {
      const pm = peelIdMaterial(i, depth);
      pm.uniforms.size.value.set(bw, bh);
      peelMats.push(pm);
      owned.push(pm);
    }
    /* One pair per part: the shader compares the peeled id with its own. */
    const texel = new Vector2(1 / bw, 1 / bh);
    const period = DASH_PERIOD * dpr;
    const ghostCrease: Array<ShaderMaterial> = [];
    const ghostSil: Array<ShaderMaterial> = [];
    for (let i = 0; i < parts.length; i++) {
      const gc = ghostLineMaterial(
        pal,
        i,
        false,
        hidTarget.texture,
        idTarget.texture,
        texel,
        period,
      );
      const gs = ghostLineMaterial(
        pal,
        i,
        true,
        hidTarget.texture,
        idTarget.texture,
        texel,
        period,
      );
      ghostCrease.push(gc);
      ghostSil.push(gs);
      sils[i].material = gs;
      owned.push(gc, gs);
    }
    owned.push(idTarget, fillTarget, depth, hidTarget, hidDepth);

    const quadMat = compositeMaterial(pal);
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
      creases,
      meshes,
      lines,
      idMats,
      peelMats,
      hidTarget,
      ghostCrease,
      ghostSil,
      ghosts,
      sils,
      hid,
      creaseChains,
      creaseMat,
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
  }, [parts, view, color, bufW, bufH, theme, meshTick, meshSet]);

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
    const cam = cameraFor(view, box, width / height, sweep ?? box);
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
       pieces — its surface and its creases — move together, which
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
      for (const obj of [b.meshes[i], b.lines[i], b.sils[i]]) {
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
    renderer.setClearColor(panelClear(palette(theme)), 1);
    renderer.clear();
    renderer.render(b.scene, camera);

    /* Then the layer behind: ids of what the front hid, peeled against the
       front's depth, into a buffer of their own. The plan looks up from
       underneath, where the engines hide the tanks by design and that is what
       the view is for; it draws no hidden lines. */
    const peel = view !== "plan";
    renderer.setRenderTarget(b.hidTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    if (peel) {
      b.creases.visible = false;
      for (let i = 0; i < parts.length; i++)
        b.meshes[i].material = b.peelMats[i];
      renderer.render(b.scene, camera);
      /* And the hidden creases, dashed, through the fill's depth: a crease
         behind the surface that hid it fails the ordinary test and passes
         this one. */
      b.creases.visible = true;
      b.group.visible = false;
      /* The hidden lines, measured along themselves. The camera's matrices
         are what `render` would compute; they are needed a moment earlier. */
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      b.scene.updateMatrixWorld(true);
      VIEWPROJ.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      DIR.set(0, mid, 0).sub(camera.position).normalize();
      const period = DASH_PERIOD * renderer.getPixelRatio();
      for (let i = 0; i < parts.length; i++) {
        const carrier = b.lines[i];
        PROJ.multiplyMatrices(VIEWPROJ, carrier.matrixWorld);
        /* The view direction in the part's own frame, tilt and all. */
        LOCAL.copy(DIR).applyQuaternion(carrier.quaternion.clone().invert());
        const cc = b.creaseChains[i];
        if (cc)
          alongCreases(
            cc.chains,
            carrier.geometry.getAttribute("position").array,
            carrier.geometry.getAttribute("along") as BufferAttribute,
            PROJ,
            b.bw,
            b.bh,
            period,
          );
        const src = b.hid[i];
        const sil = b.sils[i];
        let drawn = 0;
        if (src.kind === "mesh") {
          const edges = silhouetteEdges(src.topo, LOCAL);
          drawn = fillSegments(
            chainEdges(src.topo.ea, src.topo.eb, edges),
            src.topo.ea,
            src.topo.eb,
            src.topo.pos,
            sil.geometry.getAttribute("position") as BufferAttribute,
            sil.geometry.getAttribute("along") as BufferAttribute,
            PROJ,
            b.bw,
            b.bh,
            period,
          );
        } else {
          const r = revolvedSilhouette(src.profile, LOCAL);
          if (r) {
            const all = Array.from({ length: r.ea.length }, (_, k) => k);
            drawn = fillSegments(
              chainEdges(r.ea, r.eb, all),
              r.ea,
              r.eb,
              r.vert,
              sil.geometry.getAttribute("position") as BufferAttribute,
              sil.geometry.getAttribute("along") as BufferAttribute,
              PROJ,
              b.bw,
              b.bh,
              period,
            );
          }
        }
        sil.geometry.setDrawRange(0, drawn);
      }
      /* The cylinders' creases — a tank seam, a cap — and not the meshes':
         a simplified truss is edges all over, and every hidden one dashed
         was a thicket where a bell should be. The silhouettes of every part,
         which the shader trims to the outline of its hidden footprint. */
      for (let i = 0; i < parts.length; i++) {
        b.lines[i].material = b.ghostCrease[i];
        b.lines[i].visible = !meshed(parts[i]);
      }
      b.ghosts.visible = true;
      renderer.setRenderTarget(b.fillTarget);
      renderer.autoClear = false;
      renderer.render(b.scene, camera);
      renderer.autoClear = true;
      b.ghosts.visible = false;
      for (const l of b.lines) {
        l.material = b.creaseMat;
        l.visible = true;
      }
      b.group.visible = true;
    }

    /* And the lines, over the top, straight to the canvas. */
    b.quadMat.uniforms.tColor.value = b.fillTarget.texture;
    b.quadMat.uniforms.tId.value = b.idTarget.texture;
    b.quadMat.uniforms.tDepth.value = b.depth;
    b.quadMat.uniforms.tHid.value = b.hidTarget.texture;
    b.quadMat.uniforms.texel.value.set(1 / b.bw, 1 / b.bh);
    b.quadMat.uniforms.camNear.value = cam.near;
    b.quadMat.uniforms.camFar.value = cam.far;
    /* Cue across the model's own depth, so a long rocket seen end-on fades
       over the same range as a short one rather than by its absolute size. */
    b.quadMat.uniforms.cueNear.value = cam.cueNear;
    b.quadMat.uniforms.cueSpan.value = cam.cueSpan;
    renderer.setRenderTarget(null);
    renderer.render(b.quadScene, b.quad);
  }, [
    parts,
    view,
    color,
    bufW,
    bufH,
    width,
    height,
    extent,
    midY,
    offsets,
    theme,
    /* A mesh that lands rebuilds the scene above; without this it was not
       drawn until something else repainted — a view toggle, an animation
       frame — and the gallery, which animates nothing, showed cylinders. */
    meshTick,
  ]);

  /* The visible box, clipping the buffer's top-left corner. They are the same
     size in a still frame and the clip does nothing. */
  return (
    <div
      role="img"
      aria-label={alt}
      style={{ width, height, overflow: "hidden", lineHeight: 0 }}
      ref={host}
    />
  );
}

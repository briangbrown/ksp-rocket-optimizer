/* The hidden lines, as geometry.

   A dashed line is measured along itself: a drafter's dashes are the same
   length whether the stroke runs across the sheet or round an ellipse. The
   screen has no such measure — a fragment knows where it is, not how far
   along its stroke it is — so a dash phased on the pixel grid (it was
   `x + y`, the screen diagonal) ran from two pixels to thirty round one
   ellipse, short where the stroke crossed the diagonal and endless where it
   ran along it. Arc length has to come from the geometry. This module gives
   every hidden line a polyline to belong to and writes its screen-space arc
   length into an `along` attribute the ghost shader dashes by.

   Two kinds of hidden line, both drawn through the fill's depth with
   `GreaterDepth` so only what is behind something shows:

   - **Creases** — the rings of a revolved part, from `EdgesGeometry`, which
     hands back unordered segments. They are chained once, at build, by
     shared endpoints.
   - **Silhouettes** — where a surface turns away from the camera. For a
     revolved part that is its profile stood at the two azimuths square to
     the view; for a mesh it is every edge whose two faces face opposite
     ways, and every open boundary. Both depend on the view, so they are
     rebuilt on each paint and chained then. The mesh's folds — a rib, a
     strut — are silhouettes too, and hidden they would be a thicket; the
     ghost shader keeps only the ones on the outline of the part's hidden
     footprint (`contour`), which is what a drafter draws.

   A closed loop is stretched to a whole number of dashes, so the seam where
   the walk began and ended does not show as one odd dash. #85 */
import { Matrix4, Vector3 } from "three";
import type { BufferAttribute } from "three";

/* Edges end to end: which, in what order, and each one's direction along
   the walk. `flip` says the walk enters the edge at its `b` end. */
export type Chain = {
  edges: Array<number>;
  flip: Array<boolean>;
  closed: boolean;
};

/* Walk `edges` (indices into `ea`/`eb`, which name each edge's two vertex
   ids) into chains through shared vertices. Where three or more edges meet
   the walk takes the first unused one, which is a fine answer for a dash
   phase: the other branches start chains of their own. */
export function chainEdges(
  ea: ArrayLike<number>,
  eb: ArrayLike<number>,
  edges: ArrayLike<number>,
): Array<Chain> {
  const at = new Map<number, Array<number>>();
  const add = (v: number, k: number) => {
    const l = at.get(v);
    if (l) l.push(k);
    else at.set(v, [k]);
  };
  for (let n = 0; n < edges.length; n++) {
    const k = edges[n];
    if (ea[k] === eb[k]) continue;
    add(ea[k], k);
    add(eb[k], k);
  }
  const used = new Set<number>();
  const next = (v: number) => {
    const l = at.get(v);
    if (l) for (const k of l) if (!used.has(k)) return k;
    return -1;
  };
  const chains: Array<Chain> = [];
  for (let n = 0; n < edges.length; n++) {
    const k0 = edges[n];
    if (used.has(k0) || ea[k0] === eb[k0]) continue;
    used.add(k0);
    const es = [k0];
    const fl = [false];
    let closed = false;
    /* Forward from the far end. */
    let v = eb[k0];
    for (;;) {
      const k = next(v);
      if (k < 0) break;
      used.add(k);
      const f = eb[k] === v;
      es.push(k);
      fl.push(f);
      v = f ? ea[k] : eb[k];
      if (v === ea[k0]) {
        closed = true;
        break;
      }
    }
    if (!closed) {
      /* Then back from the near end, and those go in front. */
      v = ea[k0];
      const bes: Array<number> = [];
      const bfl: Array<boolean> = [];
      for (;;) {
        const k = next(v);
        if (k < 0) break;
        used.add(k);
        const f = ea[k] === v;
        bes.push(k);
        bfl.push(f);
        v = f ? eb[k] : ea[k];
      }
      bes.reverse();
      bfl.reverse();
      es.unshift(...bes);
      fl.unshift(...bfl);
    }
    chains.push({ edges: es, flip: fl, closed });
  }
  return chains;
}

/* Vertex ids for a non-indexed position buffer, so `EdgesGeometry`'s
   segments — which share endpoints by value only — can be chained. Rounded
   to a tenth of a millimetre, which is well under any edge here and well
   over float noise. */
export function vertexIds(pos: ArrayLike<number>): Int32Array {
  const ids = new Int32Array(pos.length / 3);
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const key = `${Math.round(pos[3 * i] * 1e4)}|${Math.round(pos[3 * i + 1] * 1e4)}|${Math.round(pos[3 * i + 2] * 1e4)}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = seen.size;
      seen.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

/* A mesh's edges, each with the two faces it joins (`fb` is −1 on an open
   boundary), and every face's normal — unnormalised, since only its sign
   against the view is asked. Built once per mesh. */
export type Topology = {
  pos: Float32Array;
  ea: Int32Array;
  eb: Int32Array;
  fa: Int32Array;
  fb: Int32Array;
  fn: Float32Array;
};

export function topologyOf(
  pos: Float32Array,
  index: ArrayLike<number>,
): Topology {
  const nv = pos.length / 3;
  const nf = index.length / 3;
  const fn = new Float32Array(nf * 3);
  const emap = new Map<number, number>();
  const ea: Array<number> = [];
  const eb: Array<number> = [];
  const fa: Array<number> = [];
  const fb: Array<number> = [];
  for (let f = 0; f < nf; f++) {
    const i = index[3 * f];
    const j = index[3 * f + 1];
    const k = index[3 * f + 2];
    const ux = pos[3 * j] - pos[3 * i];
    const uy = pos[3 * j + 1] - pos[3 * i + 1];
    const uz = pos[3 * j + 2] - pos[3 * i + 2];
    const vx = pos[3 * k] - pos[3 * i];
    const vy = pos[3 * k + 1] - pos[3 * i + 1];
    const vz = pos[3 * k + 2] - pos[3 * i + 2];
    fn[3 * f] = uy * vz - uz * vy;
    fn[3 * f + 1] = uz * vx - ux * vz;
    fn[3 * f + 2] = ux * vy - uy * vx;
    for (const [u, w] of [
      [i, j],
      [j, k],
      [k, i],
    ]) {
      if (u === w) continue;
      const lo = Math.min(u, w);
      const hi = Math.max(u, w);
      const key = lo * nv + hi;
      const e = emap.get(key);
      if (e === undefined) {
        emap.set(key, ea.length);
        ea.push(lo);
        eb.push(hi);
        fa.push(f);
        fb.push(-1);
      } else if (fb[e] < 0) fb[e] = f;
      /* A third face on an edge — the game's meshes are not manifold — is
         left out of the pair; the first two decide. */
    }
  }
  return {
    pos,
    ea: Int32Array.from(ea),
    eb: Int32Array.from(eb),
    fa: Int32Array.from(fa),
    fb: Int32Array.from(fb),
    fn,
  };
}

/* The edges where the surface turns away from a view along `d` (in the
   mesh's own frame), and the open boundaries. */
export function silhouetteEdges(t: Topology, d: Vector3): Array<number> {
  const nf = t.fn.length / 3;
  const facing = new Uint8Array(nf);
  for (let f = 0; f < nf; f++)
    facing[f] =
      t.fn[3 * f] * d.x + t.fn[3 * f + 1] * d.y + t.fn[3 * f + 2] * d.z < 0
        ? 1
        : 0;
  const out: Array<number> = [];
  for (let e = 0; e < t.ea.length; e++)
    if (t.fb[e] < 0 || facing[t.fa[e]] !== facing[t.fb[e]]) out.push(e);
  return out;
}

const P = new Vector3();
const Q = new Vector3();

/* Where a local point lands on the buffer, in device pixels. `proj` takes
   the part's frame to clip space; orthographic, so no divide to worry
   about. */
function screen(
  out: Vector3,
  x: number,
  y: number,
  z: number,
  proj: Matrix4,
  bw: number,
  bh: number,
) {
  out.set(x, y, z).applyMatrix4(proj);
  out.x *= bw / 2;
  out.y *= bh / 2;
  return out;
}

/* Stretch a closed loop's arc lengths to a whole number of periods, so the
   dash pattern meets itself where the walk began. */
function close(
  along: Float32Array,
  slots: Array<number>,
  total: number,
  period: number,
) {
  if (total < period / 2) return;
  const n = Math.max(1, Math.round(total / period));
  const k = (n * period) / total;
  for (const s of slots) along[s] *= k;
}

/* Arc length for `EdgesGeometry` creases, whose segments sit in the buffer
   as they were built: edge k is vertices 2k and 2k + 1. Writes `along`. */
export function alongCreases(
  chains: Array<Chain>,
  pos: ArrayLike<number>,
  along: BufferAttribute,
  proj: Matrix4,
  bw: number,
  bh: number,
  period: number,
) {
  const a = along.array as Float32Array;
  for (const c of chains) {
    let acc = 0;
    const slots: Array<number> = [];
    for (let j = 0; j < c.edges.length; j++) {
      const k = c.edges[j];
      const s = c.flip[j] ? 2 * k + 1 : 2 * k;
      const e = c.flip[j] ? 2 * k : 2 * k + 1;
      screen(P, pos[3 * s], pos[3 * s + 1], pos[3 * s + 2], proj, bw, bh);
      screen(Q, pos[3 * e], pos[3 * e + 1], pos[3 * e + 2], proj, bw, bh);
      const len = Math.hypot(Q.x - P.x, Q.y - P.y);
      a[s] = acc;
      a[e] = acc + len;
      slots.push(s, e);
      acc += len;
    }
    if (c.closed) close(a, slots, acc, period);
  }
  along.needsUpdate = true;
}

/* Lay chained edges out as line segments — positions and arc length — from
   a table of vertex positions. Returns how many vertices were written. */
export function fillSegments(
  chains: Array<Chain>,
  ea: ArrayLike<number>,
  eb: ArrayLike<number>,
  vert: ArrayLike<number>,
  position: BufferAttribute,
  along: BufferAttribute,
  proj: Matrix4,
  bw: number,
  bh: number,
  period: number,
) {
  const p = position.array as Float32Array;
  const a = along.array as Float32Array;
  let slot = 0;
  for (const c of chains) {
    let acc = 0;
    const slots: Array<number> = [];
    for (let j = 0; j < c.edges.length; j++) {
      if (2 * slot + 6 > p.length) break;
      const k = c.edges[j];
      const s = c.flip[j] ? eb[k] : ea[k];
      const e = c.flip[j] ? ea[k] : eb[k];
      for (let d = 0; d < 3; d++) {
        p[3 * slot + d] = vert[3 * s + d];
        p[3 * slot + 3 + d] = vert[3 * e + d];
      }
      screen(P, vert[3 * s], vert[3 * s + 1], vert[3 * s + 2], proj, bw, bh);
      screen(Q, vert[3 * e], vert[3 * e + 1], vert[3 * e + 2], proj, bw, bh);
      const len = Math.hypot(Q.x - P.x, Q.y - P.y);
      a[slot] = acc;
      a[slot + 1] = acc + len;
      slots.push(slot, slot + 1);
      acc += len;
      slot += 2;
    }
    if (c.closed) close(a, slots, acc, period);
  }
  position.needsUpdate = true;
  along.needsUpdate = true;
  return slot;
}

/* A revolved part's silhouette: its profile — pairs of radius and height,
   the flat cap runs already left out — stood at the two azimuths square to
   the view's horizontal component. Nothing when the view is straight along
   the axis, which is the plan, and the plan hides nothing anyway. Returns
   the vertex table and the edge lists to chain. */
export function revolvedSilhouette(
  profile: ReadonlyArray<readonly [number, number]>,
  d: Vector3,
) {
  const h = Math.hypot(d.x, d.z);
  const n = profile.length;
  if (h < 1e-6 || n < 2) return null;
  const phi = Math.atan2(d.z, d.x) + Math.PI / 2;
  const vert = new Float32Array(2 * n * 3);
  for (let side = 0; side < 2; side++) {
    const c = Math.cos(phi + side * Math.PI);
    const s = Math.sin(phi + side * Math.PI);
    for (let i = 0; i < n; i++) {
      const [r, y] = profile[i];
      const o = 3 * (side * n + i);
      vert[o] = r * c;
      vert[o + 1] = y;
      vert[o + 2] = r * s;
    }
  }
  const ea: Array<number> = [];
  const eb: Array<number> = [];
  for (let side = 0; side < 2; side++)
    for (let i = 0; i + 1 < n; i++) {
      /* A run along a cap is a radius on a flat face, not a silhouette. */
      if (Math.abs(profile[i][1] - profile[i + 1][1]) < 1e-9) continue;
      ea.push(side * n + i);
      eb.push(side * n + i + 1);
    }
  return { vert, ea, eb };
}

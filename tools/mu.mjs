/* The .mu model and .cfg readers shared by the tools: tools/engine-meshes.mjs
   draws engines from them, tools/radial-standoff.mjs measures a holder's
   collider. Plain Node, no dependencies. Split out of engine-meshes.mjs for
   #467; the readers are unchanged apart from keeping the colliders. */

/* ------------------------------------------------------------------ .mu */
/* Entry types in a .mu, as PartTools writes them. */
const ET = {
  CHILD_START: 0,
  CHILD_END: 1,
  ANIMATION: 2,
  MESH_COLLIDER: 3,
  SPHERE_COLLIDER: 4,
  CAPSULE_COLLIDER: 5,
  BOX_COLLIDER: 6,
  MESH_FILTER: 7,
  MESH_RENDERER: 8,
  SKINNED_MESH_RENDERER: 9,
  MATERIALS: 10,
  TEXTURES: 12,
  MESH_START: 13,
  MESH_VERTS: 14,
  MESH_UV: 15,
  MESH_UV2: 16,
  MESH_NORMALS: 17,
  MESH_TANGENTS: 18,
  MESH_TRIANGLES: 19,
  MESH_BONE_WEIGHTS: 20,
  MESH_BIND_POSES: 21,
  MESH_END: 22,
  LIGHT: 23,
  TAG_AND_LAYER: 24,
  MESH_COLLIDER2: 25,
  SPHERE_COLLIDER2: 26,
  CAPSULE_COLLIDER2: 27,
  BOX_COLLIDER2: 28,
  WHEEL_COLLIDER: 29,
  CAMERA: 30,
  PARTICLES: 31,
  MESH_VERTEX_COLORS: 32,
};
/* Legacy (version < 4) material layouts, by shader type: which fields follow. */
const LEGACY_MATERIAL = {
  1: ["tex"],
  2: ["tex", "c4", "f"],
  3: ["tex", "tex"],
  4: ["tex", "tex", "c4", "f"],
  5: ["tex", "tex", "c4"],
  6: ["tex", "c4", "f", "tex", "c4"],
  7: ["tex", "tex", "c4", "f", "tex", "c4"],
  8: ["tex", "f"],
  9: ["tex", "tex", "f"],
  10: ["tex"],
  11: ["tex", "f", "c4", "f"],
  12: ["tex", "c4"],
  13: ["tex", "c4"],
  14: ["tex", "c4", "f"],
  15: ["tex", "c4", "f"],
};

class MuReader {
  constructor(buf) {
    this.b = buf;
    this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.p = 0;
  }
  int() {
    const x = this.v.getInt32(this.p, true);
    this.p += 4;
    return x;
  }
  uint() {
    const x = this.v.getUint32(this.p, true);
    this.p += 4;
    return x;
  }
  f() {
    const x = this.v.getFloat32(this.p, true);
    this.p += 4;
    return x;
  }
  byte() {
    return this.b[this.p++];
  }
  floats(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(this.f());
    return a;
  }
  skip(n) {
    this.p += n;
  }
  str() {
    let len = 0,
      mult = 1,
      c;
    do {
      c = this.byte();
      len += (c & 127) * mult;
      mult *= 128;
    } while (c >= 128);
    const s = this.b.toString("utf8", this.p, this.p + len);
    this.p += len;
    return s;
  }
  mesh() {
    if (this.int() !== ET.MESH_START) throw new Error("mesh start");
    const nv = this.int();
    this.int(); // submesh count
    const verts = [],
      tris = [];
    for (;;) {
      const t = this.int();
      if (t === ET.MESH_END) break;
      else if (t === ET.MESH_VERTS)
        for (let i = 0; i < nv; i++) verts.push(this.floats(3));
      else if (t === ET.MESH_UV || t === ET.MESH_UV2) this.skip(nv * 8);
      else if (t === ET.MESH_NORMALS) this.skip(nv * 12);
      else if (t === ET.MESH_TANGENTS) this.skip(nv * 16);
      else if (t === ET.MESH_BONE_WEIGHTS) this.skip(nv * 32);
      else if (t === ET.MESH_BIND_POSES) this.skip(this.int() * 64);
      else if (t === ET.MESH_TRIANGLES) {
        const n = this.int();
        const sub = [];
        for (let i = 0; i < n; i += 3)
          sub.push([this.int(), this.int(), this.int()]);
        tris.push(sub);
      } else if (t === ET.MESH_VERTEX_COLORS) this.skip(nv * 4);
      else throw new Error(`mesh entry ${t}`);
    }
    return { verts, tris };
  }
  material(version) {
    this.str(); // name
    if (version >= 4) {
      this.str(); // shader
      let n = this.int();
      while (n-- > 0) {
        this.str();
        const type = this.int();
        if (type === 0 || type === 1) this.skip(16);
        else if (type === 2 || type === 3) this.skip(4);
        else if (type === 4) this.skip(20);
        else throw new Error(`material property ${type}`);
      }
    } else {
      const type = this.int();
      const fields = LEGACY_MATERIAL[type];
      if (!fields) throw new Error(`material type ${type}`);
      for (const f of fields) this.skip(f === "tex" ? 20 : f === "c4" ? 16 : 4);
    }
  }
  animation() {
    let clips = this.int();
    while (clips-- > 0) {
      this.str();
      this.skip(24 + 4); // bounds, wrap
      let curves = this.int();
      while (curves-- > 0) {
        this.str();
        this.str();
        const type = this.int();
        const wrap0 = this.int();
        const wrap1 = this.int();
        /* A bad PartTools export leaves the type unwritten; the key count
           has then landed in the second wrap slot. */
        const keys = type === 8 ? wrap1 : this.int();
        void wrap0;
        this.skip(keys * 20);
      }
    }
    this.str(); // clip
    this.byte(); // autoplay
  }
  /* An object: its transform, then entries until the child-end marker. */
  object(version, root = false) {
    const name = this.str();
    const pos = this.floats(3);
    const rot = this.floats(4);
    const scale = this.floats(3);
    const obj = {
      name,
      pos: root ? [0, 0, 0] : pos,
      rot,
      scale,
      meshes: [],
      colliders: [],
      children: [],
    };
    for (;;) {
      if (this.p >= this.b.length) break;
      const t = this.int();
      if (t === ET.CHILD_START) obj.children.push(this.object(version));
      else if (t === ET.CHILD_END) break;
      else if (t === ET.TAG_AND_LAYER) {
        this.str();
        this.int();
      } else if (t === ET.MESH_COLLIDER || t === ET.MESH_COLLIDER2) {
        /* Kept, not skipped: the collider is the face the game snaps a
           surface-attached part to, which the drag cube overstates
           (tools/radial-standoff.mjs, #467). The layouts are taniwha's
           mu.py: for a box its size and centre, for a sphere its radius and
           centre, a trigger flag ahead of each in the newer entry types and
           a convex flag as well on a mesh collider. */
        if (t === ET.MESH_COLLIDER2) this.byte();
        this.byte();
        obj.colliders.push({ kind: "mesh", ...this.mesh() });
      } else if (t === ET.SPHERE_COLLIDER || t === ET.SPHERE_COLLIDER2) {
        if (t === ET.SPHERE_COLLIDER2) this.byte();
        const radius = this.f();
        obj.colliders.push({ kind: "sphere", radius, center: this.floats(3) });
      } else if (t === ET.CAPSULE_COLLIDER || t === ET.CAPSULE_COLLIDER2) {
        if (t === ET.CAPSULE_COLLIDER2) this.byte();
        const radius = this.f();
        const height = this.f();
        const direction = this.int();
        obj.colliders.push({
          kind: "capsule",
          radius,
          height,
          direction,
          center: this.floats(3),
        });
      } else if (t === ET.BOX_COLLIDER || t === ET.BOX_COLLIDER2) {
        if (t === ET.BOX_COLLIDER2) this.byte();
        const size = this.floats(3);
        obj.colliders.push({ kind: "box", size, center: this.floats(3) });
      } else if (t === ET.WHEEL_COLLIDER) this.skip(4 * 3 + 12 + 12 + 20 + 20);
      else if (t === ET.MESH_FILTER) obj.meshes.push(this.mesh());
      else if (t === ET.MESH_RENDERER) {
        if (version > 0) this.skip(2);
        this.skip(this.int() * 4);
      } else if (t === ET.SKINNED_MESH_RENDERER) {
        this.skip(this.int() * 4);
        this.skip(24 + 4 + 1);
        let bones = this.int();
        while (bones-- > 0) this.str();
        obj.meshes.push(this.mesh());
      } else if (t === ET.ANIMATION) this.animation();
      else if (t === ET.CAMERA) this.skip(4 + 16 + 4 + 1 + 16);
      else if (t === ET.PARTICLES)
        this.skip(
          1 +
            4 +
            12 +
            8 +
            4 +
            16 +
            1 +
            8 +
            8 +
            8 +
            36 +
            12 +
            1 +
            1 +
            80 +
            24 +
            4 +
            24 +
            4 +
            2 +
            12 +
            4 +
            12 +
            4,
        );
      else if (t === ET.LIGHT)
        this.skip(4 + 4 + 4 + 16 + 4 + (version > 1 ? 4 : 0));
      else if (t === ET.MATERIALS) {
        let n = this.int();
        while (n-- > 0) this.material(version);
      } else if (t === ET.TEXTURES) {
        let n = this.int();
        while (n-- > 0) {
          this.str();
          this.int();
        }
      }
      /* An entry type this reader does not know. The oldest stock files
         (version 1) carry a few words after the root transform that no
         version of the format documents; skipping a word at a time resyncs
         on the first child, which is what taniwha's reader does too, and the
         trees it yields for those files are the right ones. */
      else if (this.p < this.b.length) continue;
      else break;
    }
    return obj;
  }
}

function readMu(buf) {
  const r = new MuReader(buf);
  const magic = r.int();
  const version = r.int();
  if (magic !== 76543 || version < 0 || version > 5)
    throw new Error("not a .mu");
  r.str(); // model name
  return r.object(version, true);
}

/* ------------------------------------------------------------------ cfg */
/* A KSP config as a tree: { name, kv: [[op, key, value, comment]], kids }. */
function parseCfg(text) {
  text = text.replace(/^﻿/, "");
  const root = { name: "", kv: [], kids: [] };
  const stack = [root];
  let pending = null;
  for (let raw of text.split(/\r?\n/)) {
    let comment = "";
    const c = raw.indexOf("//");
    if (c >= 0) {
      comment = raw.slice(c + 2).trim();
      raw = raw.slice(0, c);
    }
    let line = raw.trim();
    while (line) {
      if (line.startsWith("{")) {
        const node = { name: pending ?? "", kv: [], kids: [] };
        stack[stack.length - 1].kids.push(node);
        stack.push(node);
        pending = null;
        line = line.slice(1).trim();
      } else if (line.startsWith("}")) {
        if (stack.length > 1) stack.pop();
        line = line.slice(1).trim();
      } else if (
        line.includes("=") &&
        !line.split("=")[0].includes("[") &&
        /^[@%!&$#-]?[A-Za-z_]/.test(line)
      ) {
        const i = line.indexOf("=");
        let key = line.slice(0, i).trim();
        let op = "";
        if ("@%!&$#-".includes(key[0])) {
          op = key[0];
          key = key.slice(1);
        }
        stack[stack.length - 1].kv.push([
          op,
          key.trim(),
          line.slice(i + 1).trim(),
          comment,
        ]);
        line = "";
      } else if (line.includes("{")) {
        const i = line.indexOf("{");
        pending = line.slice(0, i).trim();
        line = line.slice(i);
      } else {
        pending = line;
        line = "";
      }
    }
  }
  return root;
}
const kids = (node, name) =>
  node.kids.filter(
    (k) =>
      k.name.split(":")[0].replace(/^[@%!$+-]/, "") === name || k.name === name,
  );
const kv = (node, key, dflt = null) => {
  const e = node.kv.find((x) => x[1] === key);
  return e ? e[2] : dflt;
};
const kvComment = (node, key) => {
  const e = node.kv.find((x) => x[1] === key);
  return e ? e[3] : "";
};

/* ------------------------------------------------------------------ geometry */
const quatMat = ([x, y, z, w]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
];
function trs(pos, rot, scale) {
  const R = quatMat(rot);
  const M = [0, 1, 2].map((i) => [
    R[i][0] * scale[0],
    R[i][1] * scale[1],
    R[i][2] * scale[2],
    pos[i],
  ]);
  M.push([0, 0, 0, 1]);
  return M;
}
const mul = (A, B) =>
  A.map((row) =>
    [0, 1, 2, 3].map(
      (j) =>
        row[0] * B[0][j] +
        row[1] * B[1][j] +
        row[2] * B[2][j] +
        row[3] * B[3][j],
    ),
  );
const apply = (M, [x, y, z]) => [
  M[0][0] * x + M[0][1] * y + M[0][2] * z + M[0][3],
  M[1][0] * x + M[1][1] * y + M[1][2] * z + M[1][3],
  M[2][0] * x + M[2][1] * y + M[2][2] * z + M[2][3],
];
/* Unity Euler degrees, applied Z then X then Y, as a quaternion. */
function eulerQuat([dx, dy, dz]) {
  const [rx, ry, rz] = [dx, dy, dz].map((d) => (d * Math.PI) / 180);
  const qx = [Math.sin(rx / 2), 0, 0, Math.cos(rx / 2)];
  const qy = [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)];
  const qz = [0, 0, Math.sin(rz / 2), Math.cos(rz / 2)];
  const qm = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  return qm(qm(qy, qx), qz);
}

export {
  ET,
  MuReader,
  readMu,
  parseCfg,
  kids,
  kv,
  kvComment,
  quatMat,
  trs,
  mul,
  apply,
  eulerQuat,
};

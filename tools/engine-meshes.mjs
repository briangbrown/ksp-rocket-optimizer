#!/usr/bin/env node
/* Simplified meshes of every engine, from a KSP install's own.

     node tools/engine-meshes.mjs ksp-engine-models.zip          # writes public/engines/
     node tools/engine-meshes.mjs ksp-engine-models.zip --check  # exits 1 if the committed files differ

   The zip is what tools/pack-engines.ps1 makes from the install: the `.mu`
   meshes and `.cfg` configs on every path with "Engine" in it, ReStock's
   patches, and PartDatabase.cfg. No textures.

   For each engine in src/data/parts.json, under stock art and again under
   ReStock's patches: find its part config (by the `slug` parts.json carries,
   else by title, else by nickname); read which meshes the part uses at what
   scale, which variant is the default and which objects that variant hides, and
   which objects are a jettisonable shroud; walk each mesh's transform tree with
   the root's own placement dropped (it is where the prefab sat in the Unity
   scene, and the game discards it); take every visible triangle in world space
   with the top node at y = 0; and simplify by clustering vertices onto a grid
   sized so a few hundred remain, which keeps the silhouette and the bells —
   two, four, off-axis, whatever the part has — and drops the panel lines.
   Millimetres, as integers. .claude/rules/part-data.md has the story.

   Plain Node, no dependencies: the zip is read with zlib, the .mu with a
   DataView. #85 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
/* Vertices to keep per engine. Enough for a bell to read as a bell at the
   sixty or so pixels the drawing gives it, and for four to read as four. */
const TARGET = 300;

/* ------------------------------------------------------------------ zip */
function unzip(buf) {
  /* The central directory is at the end; walk it for names and offsets. */
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50)
      throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    /* PowerShell writes backslashes; everything here is forward. */
    const name = buf
      .toString("utf8", p + 46, p + 46 + nlen)
      .replace(/\\/g, "/");
    if (!name.endsWith("/")) {
      const lnlen = buf.readUInt16LE(local + 26);
      const lxlen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnlen + lxlen;
      files.set(name, { method, start, csize });
    }
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: [...files.keys()],
    read(name) {
      const f = files.get(name);
      if (!f) return null;
      const raw = buf.subarray(f.start, f.start + f.csize);
      return f.method === 8 ? inflateRawSync(raw) : f.method === 0 ? raw : null;
    },
  };
}

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
        if (t === ET.MESH_COLLIDER2) this.byte();
        this.byte();
        this.mesh();
      } else if (t === ET.SPHERE_COLLIDER || t === ET.SPHERE_COLLIDER2) {
        if (t === ET.SPHERE_COLLIDER2) this.byte();
        this.skip(16);
      } else if (t === ET.CAPSULE_COLLIDER || t === ET.CAPSULE_COLLIDER2) {
        if (t === ET.CAPSULE_COLLIDER2) this.byte();
        this.skip(24);
      } else if (t === ET.BOX_COLLIDER || t === ET.BOX_COLLIDER2) {
        if (t === ET.BOX_COLLIDER2) this.byte();
        this.skip(24);
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

function modelOf(m, gd, cfgDir) {
  let model = kv(m, "model");
  if (!model.endsWith(".mu")) model += ".mu";
  const sc = kv(m, "scale", "1,1,1");
  const scale = sc.includes(",")
    ? sc.split(",").map(Number)
    : [Number(sc), Number(sc), Number(sc)];
  return {
    model: posix.normalize(model),
    scale,
    position: kv(m, "position", "0,0,0").split(",").map(Number),
    rotation: kv(m, "rotation", "0,0,0").split(",").map(Number),
  };
}
const variantsOf = (mod) =>
  kids(mod, "VARIANT").map((v) => ({
    name: kv(v, "name"),
    toggles: Object.fromEntries(
      kids(v, "GAMEOBJECTS").flatMap((g) =>
        g.kv.map(([, k, val]) => [k, val.toLowerCase() === "true"]),
      ),
    ),
  }));

function partOf(node, path) {
  const dir = posix.dirname(path);
  const p = {
    name: kv(node, "name"),
    path,
    title: null,
    hidden: (kv(node, "TechHidden") ?? "").toLowerCase() === "true",
    models: [],
    rescale: Number(kv(node, "rescaleFactor", "1.25")),
    scale: Number(kv(node, "scale", "1")),
    nodeTop: null,
    nodeBottom: null,
    jettison: [],
    variants: [],
    base: null,
    thrust: ["thrustTransform"],
  };
  const t = kv(node, "title") ?? "";
  const c = kvComment(node, "title");
  p.title = c.includes("=") ? c.split("=").slice(1).join("=").trim() : t;
  let mesh = kv(node, "mesh");
  if (mesh) {
    if (!mesh.endsWith(".mu")) mesh += ".mu";
    p.models.push({
      model: posix.join(dir, mesh),
      scale: [1, 1, 1],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    });
  }
  for (const m of kids(node, "MODEL")) p.models.push(modelOf(m));
  for (const key of ["node_stack_top", "node_stack_bottom"]) {
    const v = kv(node, key);
    if (v)
      p[key.endsWith("top") ? "nodeTop" : "nodeBottom"] = Number(
        v.split(",")[1],
      );
  }
  for (const mod of kids(node, "MODULE")) {
    const mn = kv(mod, "name");
    if (mn === "ModuleJettison")
      p.jettison.push(
        ...(kv(mod, "jettisonName") ?? "").split(/[,\s]+/).filter(Boolean),
      );
    else if (mn === "ModulePartVariants") {
      p.base = kv(mod, "baseVariant");
      p.variants = variantsOf(mod);
    } else if (mn === "ModuleEngines" || mn === "ModuleEnginesFX")
      p.thrust = [kv(mod, "thrustVectorTransformName", "thrustTransform")];
  }
  return p;
}

function loadParts(zip) {
  const parts = new Map();
  const roots = [
    "Squad/Parts/Engine/",
    "SquadExpansion/MakingHistory/Parts/Engine/",
    "ReStockPlus/Parts/Engine/",
  ];
  for (const name of zip.names) {
    if (!name.endsWith(".cfg") || !roots.some((r) => name.startsWith(r)))
      continue;
    const tree = parseCfg(zip.read(name).toString("utf8"));
    for (const node of kids(tree, "PART")) {
      const p = partOf(node, name);
      if (p.name) parts.set(p.name, p);
    }
  }
  return parts;
}

/* ReStock's @PART patches: model swap, rescale, variants, jettison, thrust.
   The subset of ModuleManager these files use. */
function applyRestock(zip, parts) {
  const patched = new Map();
  for (const name of zip.names
    .filter(
      (n) => n.startsWith("ReStock/Patches/Engine/") && n.endsWith(".cfg"),
    )
    .sort()) {
    const tree = parseCfg(zip.read(name).toString("utf8"));
    for (const node of tree.kids) {
      const m = /^@PART\[([^\]]+)\]/.exec(node.name);
      if (!m || !parts.has(m[1])) continue;
      const p = structuredClone(parts.get(m[1]));
      const modelNodes = node.kids.filter((k) => k.name === "MODEL");
      if (
        node.kids.some((k) => k.name.startsWith("!MODEL")) ||
        node.kv.some(([op, k]) => op === "!" && k === "mesh")
      )
        p.models = [];
      for (const mm of modelNodes) p.models.push(modelOf(mm));
      for (const [, k, v] of node.kv) {
        if (k === "rescaleFactor") p.rescale = Number(v);
        if (k === "scale") p.scale = Number(v);
      }
      /* ReStock models are authored at 1.0; a stock part left at 1.25 would
         draw a quarter too big. Set unless the patch says. */
      if (modelNodes.length && !node.kv.some(([, k]) => k === "rescaleFactor"))
        p.rescale = 1.0;
      for (const mod of node.kids) {
        if (mod.name.startsWith("!MODULE")) {
          if (mod.name.includes("ModulePartVariants")) {
            p.variants = [];
            p.base = null;
          }
          if (mod.name.includes("ModuleJettison")) p.jettison = [];
          continue;
        }
        const mn =
          kv(mod, "name") ??
          mod.name.replace(/^[@%!$+-]?MODULE\[([^\]]+)\].*/, "$1");
        if (mn === "ModulePartVariants") {
          const vs = variantsOf(mod);
          if (vs.length) p.variants = vs;
          const b = kv(mod, "baseVariant");
          if (b) p.base = b;
        } else if (mn === "ModuleJettison") {
          const j = kv(mod, "jettisonName");
          if (j !== null) p.jettison = j.split(/[,\s]+/).filter(Boolean);
        } else if (mn === "ModuleEngines" || mn === "ModuleEnginesFX") {
          const t = kv(mod, "thrustVectorTransformName");
          if (t) p.thrust = [t];
        }
      }
      patched.set(m[1], p);
    }
  }
  return patched;
}

/* ------------------------------------------------------------------ matching */
const norm = (s) =>
  s
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const nick = (title) =>
  /["']([^"']+)["']/.exec(title)?.[1].toLowerCase() ?? null;
function match(engine, parts) {
  if (engine.slug && parts.has(engine.slug)) return parts.get(engine.slug);
  const n = norm(engine.n);
  const exact = [...parts.values()].filter(
    (p) => p.title && norm(p.title) === n,
  );
  if (exact.length) return exact.find((p) => !p.hidden) ?? exact[0];
  const k = nick(engine.n);
  if (!k) return null;
  const same = [...parts.values()].filter(
    (p) => p.title && !p.title.startsWith("#") && nick(p.title) === k,
  );
  if (same.length) return same.find((p) => !p.hidden) ?? same[0];
  const slug = k.replace(/[^a-z0-9]+/g, "-");
  const core = (name) =>
    name
      .replace(/^restock-(engine|srb)-/, "")
      .replace(/^(0625|125|1875|25|375)-/, "")
      .replace(/-\d+$/, "");
  const cands = [...parts.values()].filter(
    (p) =>
      p.title?.startsWith("#LOC") &&
      (core(p.name) === slug || slug.endsWith("-" + core(p.name))),
  );
  return cands.length === 1 ? cands[0] : null;
}

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

/* Walk the tree, collecting every visible triangle in world space. */
function walk(obj, M, hidden, out, parentHidden = false) {
  const W = mul(M, trs(obj.pos, obj.rot, obj.scale));
  const off = parentHidden || hidden.has(obj.name);
  if (!off)
    for (const mesh of obj.meshes) {
      const wv = mesh.verts.map((v) => apply(W, v));
      const base = out.verts.length;
      out.verts.push(...wv);
      for (const sub of mesh.tris)
        for (const [a, b, c] of sub)
          out.tris.push([base + a, base + b, base + c]);
    }
  for (const ch of obj.children) walk(ch, W, hidden, out, off);
}

/* Vertex clustering: every vertex snaps to the cell of a grid, each cell
   becomes one vertex at the mean of what fell in it, and a triangle whose
   corners share a cell is gone. The grid pitch is searched for the one that
   leaves about TARGET vertices. Crude beside an edge-collapse decimator, and
   right for this: the shapes are drawn a few pixels wide and what matters is
   that the silhouette and the count of bells survive, which a grid keeps. */
function cluster(verts, tris, pitch) {
  const cell = new Map();
  const index = new Array(verts.length);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i];
    const key = `${Math.floor(x / pitch)},${Math.floor(y / pitch)},${Math.floor(z / pitch)}`;
    let c = cell.get(key);
    if (!c) {
      c = { i: cell.size, sum: [0, 0, 0], n: 0 };
      cell.set(key, c);
    }
    c.sum[0] += x;
    c.sum[1] += y;
    c.sum[2] += z;
    c.n++;
    index[i] = c.i;
  }
  const out = new Array(cell.size);
  for (const c of cell.values()) out[c.i] = c.sum.map((v) => v / c.n);
  const seen = new Set();
  const faces = [];
  for (const [a, b, c] of tris) {
    const [i, j, k] = [index[a], index[b], index[c]];
    if (i === j || j === k || i === k) continue;
    /* The same three corners in any order is the same face. */
    const key = [i, j, k].sort((p, q) => p - q).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push([i, j, k]);
  }
  /* Drop vertices no face uses, renumbering. */
  const used = new Map();
  const v2 = [];
  const f2 = faces.map((f) =>
    f.map((i) => {
      if (!used.has(i)) {
        used.set(i, v2.length);
        v2.push(out[i]);
      }
      return used.get(i);
    }),
  );
  return { verts: v2, faces: f2 };
}

function simplify(verts, tris, extent) {
  let lo = extent / 400,
    hi = extent / 4,
    best = null;
  for (let it = 0; it < 24; it++) {
    const pitch = Math.sqrt(lo * hi);
    const r = cluster(verts, tris, pitch);
    if (r.verts.length > TARGET) lo = pitch;
    else {
      hi = pitch;
      best = r;
    }
  }
  return best ?? cluster(verts, tris, hi);
}

function measure(part, zip) {
  const hidden = new Set(part.jettison);
  if (part.variants.length) {
    const base = part.base ?? part.variants[0].name;
    const v = part.variants.find((x) => x.name === base) ?? part.variants[0];
    for (const [k, on] of Object.entries(v.toggles)) if (!on) hidden.add(k);
  }
  const out = { verts: [], tris: [] };
  for (const m of part.models) {
    const buf = zip.read(m.model);
    if (!buf) {
      if (/shroud/i.test(m.model)) continue; // jettisoned; hidden with nothing below
      if (m !== part.models[0]) continue; // an endcap from another folder
      return { error: `no mesh ${m.model}` };
    }
    const rs = part.rescale;
    walk(
      readMu(buf),
      trs(
        m.position.map((c) => c * rs),
        eulerQuat(m.rotation),
        m.scale.map((x) => x * rs),
      ),
      hidden,
      out,
    );
  }
  if (!out.verts.length) return { error: "no visible vertices" };
  const ys = out.verts.map((v) => v[1]);
  const ymax = Math.max(...ys),
    ymin = Math.min(...ys);
  /* The top node is where the tank sits; the model is drawn from it down. */
  const top =
    part.nodeTop === null
      ? ymax
      : Math.min(ymax, part.nodeTop * part.rescale * part.scale);
  const verts = out.verts.map(([x, y, z]) => [x, y - top, z]);
  const extent = Math.max(
    top - ymin,
    2 * Math.max(...verts.map(([x, , z]) => Math.hypot(x, z))),
  );
  const s = simplify(verts, out.tris, extent);
  /* What shows, measured on the simplified mesh so the drawing fills the box
     it is scaled into: the height from the node down, and the radius of
     anything below the node. Clustering moves the extremes a little. */
  let w = 0,
    low = 0;
  for (const [x, y, z] of s.verts) {
    /* Judged as the file will carry it, in millimetres: a vertex that rounds
       to the node is below it. */
    if (Math.round(y * 1000) <= 0) w = Math.max(w, Math.hypot(x, z));
    low = Math.min(low, y);
  }
  return { h: -low, w: 2 * w, ...s };
}

/* ------------------------------------------------------------------ export */
const mm = (v) => Math.round(v * 1000);
function exportOne(m) {
  return {
    h: Math.round(m.h * 1000) / 1000,
    w: Math.round(m.w * 1000) / 1000,
    /* x, y, z per vertex, millimetres; y is 0 at the top node and negative below. */
    v: m.verts.flatMap(([x, y, z]) => [mm(x), mm(y), mm(z)]),
    i: m.faces.flat(),
  };
}

/* A title as a file name: lower case, hyphens. */
const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function main() {
  const [zipPath, ...flags] = process.argv.slice(2);
  if (!zipPath) {
    console.error(
      "usage: node tools/engine-meshes.mjs <ksp-engine-models.zip> [--check]",
    );
    process.exit(2);
  }
  const zip = unzip(readFileSync(zipPath));
  const parts = loadParts(zip);
  const restock = applyRestock(zip, parts);
  const engines = JSON.parse(
    readFileSync(join(REPO, "src/data/parts.json"), "utf8"),
  ).engines;
  const tables = { stock: {}, restock: {} };
  const unmeasured = [];
  for (const e of engines) {
    const p = match(e, parts);
    if (!p) {
      unmeasured.push(`${e.n}: no part`);
      continue;
    }
    for (const art of ["stock", "restock"]) {
      const q = art === "restock" ? (restock.get(p.name) ?? p) : p;
      const m = measure(q, zip);
      if (m.error) {
        unmeasured.push(`${e.n} (${art}): ${m.error}`);
        continue;
      }
      tables[art][e.n] = exportOne(m);
    }
  }
  /* One file an engine, and the ReStock file only where ReStock remodelled
     it; index.json says which titles have which. */
  const files = new Map();
  const index = { stock: {}, restock: {} };
  for (const [k, v] of Object.entries(tables.stock).sort()) {
    index.stock[k] = `stock/${slug(k)}.json`;
    files.set(index.stock[k], JSON.stringify(v));
  }
  for (const [k, v] of Object.entries(tables.restock).sort()) {
    if (JSON.stringify(v) === JSON.stringify(tables.stock[k])) continue;
    index.restock[k] = `restock/${slug(k)}.json`;
    files.set(index.restock[k], JSON.stringify(v));
  }
  files.set(
    "index.json",
    JSON.stringify({
      about:
        "Simplified copies of the install's engine meshes, by tools/engine-meshes.mjs: per file, vertices in millimetres with the top node at y = 0, triangle indices, and the height and width of what shows below the node. The renderer fetches an engine's file when it first draws it. restock lists only the engines ReStock remodels.",
      ...index,
    }),
  );
  const dir = join(REPO, "public/engines");
  for (const u of unmeasured) console.error("unmeasured:", u);
  const bytes = [...files.values()].reduce((a, t) => a + t.length, 0);
  console.error(
    `stock ${Object.keys(index.stock).length}, restock ${Object.keys(index.restock).length} remodelled, ${files.size} files, ${(bytes / 1024).toFixed(0)} KB`,
  );
  if (flags.includes("--check")) {
    let differ = 0;
    for (const [name, text] of files) {
      const path = join(dir, name);
      if (
        !existsSync(path) ||
        JSON.stringify(JSON.parse(readFileSync(path, "utf8"))) !== text
      ) {
        console.error("differs:", name);
        differ++;
      }
    }
    if (differ) process.exit(1);
    console.error("public/engines matches the install");
    return;
  }
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  for (const [name, text] of files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text + "\n");
  }
  console.error(`wrote ${files.size} files under ${dir}`);
}

main();

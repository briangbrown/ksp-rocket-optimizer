#!/usr/bin/env node
/* Measure every engine's shape from a KSP install's meshes.

     node tools/engine-profiles.mjs ksp-engine-models.zip          # writes src/data/engine-profiles.json
     node tools/engine-profiles.mjs ksp-engine-models.zip --check  # exits 1 if the committed file differs

   The zip is what tools/pack-engines.ps1 makes from the install: the `.mu`
   meshes and `.cfg` configs on every path with "Engine" in it, ReStock's
   patches, and PartDatabase.cfg. No textures.

   For each engine in src/data/parts.json, under stock art and again under
   ReStock's patches: find its part config (by the `slug` parts.json carries,
   else by title, else by nickname); read which meshes it uses at what scale,
   which variant is the default and which objects that variant hides, and which
   objects are a jettisonable shroud; walk each mesh's transform tree with the
   root's own placement dropped (it is where the prefab sat in the Unity scene,
   and the game discards it); sample the triangle edges — a tube has vertices
   only on its end rings — into height bins below the top node, keeping the
   outermost radius in each; find the bells by the thrust transforms in the
   lower half whose hull shows notches between them at the base, and measure
   each about its own axis. Metres. .claude/rules/part-data.md has the story.

   Plain Node, no dependencies: the zip is read with zlib, the .mu with a
   DataView. #85 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const BINS = 32;
const ANG = 36;

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

/* Walk the tree, collecting world-space points and thrust transforms. With
   `step` set, every triangle edge is sampled at that pitch as well as its
   ends — a tube has vertices only on its end rings. */
function walk(obj, M, hidden, thrustNames, out, step, parentHidden = false) {
  const W = mul(M, trs(obj.pos, obj.rot, obj.scale));
  const off = parentHidden || hidden.has(obj.name);
  if (!off && thrustNames.has(obj.name)) out.thrusts.push(apply(W, [0, 0, 0]));
  if (!off)
    for (const mesh of obj.meshes) {
      const wv = mesh.verts.map((v) => apply(W, v));
      out.pts.push(...wv);
      if (step === null) continue;
      const seen = new Set();
      for (const sub of mesh.tris)
        for (const [a, b, c] of sub)
          for (const [i, j] of [
            [a, b],
            [b, c],
            [c, a],
          ]) {
            const key = i < j ? i * 1e7 + j : j * 1e7 + i;
            if (seen.has(key)) continue;
            seen.add(key);
            const p = wv[i],
              q = wv[j];
            const n = Math.trunc(Math.abs(q[1] - p[1]) / step);
            for (let k = 1; k <= n; k++) {
              const t = k / (n + 1);
              out.pts.push([
                p[0] + (q[0] - p[0]) * t,
                p[1] + (q[1] - p[1]) * t,
                p[2] + (q[2] - p[2]) * t,
              ]);
            }
          }
    }
  for (const ch of obj.children)
    walk(ch, W, hidden, thrustNames, out, step, off);
}

function measure(part, zip) {
  const hidden = new Set(part.jettison);
  if (part.variants.length) {
    const base = part.base ?? part.variants[0].name;
    const v = part.variants.find((x) => x.name === base) ?? part.variants[0];
    for (const [k, on] of Object.entries(v.toggles)) if (!on) hidden.add(k);
  }
  const models = [];
  for (const m of part.models) {
    const buf = zip.read(m.model);
    if (!buf) {
      if (/shroud/i.test(m.model)) continue; // jettisoned; hidden with nothing below
      if (m !== part.models[0]) continue; // an endcap from another folder
      return { error: `no mesh ${m.model}` };
    }
    const rs = part.rescale;
    models.push({
      obj: readMu(buf),
      M: trs(
        m.position.map((c) => c * rs),
        eulerQuat(m.rotation),
        m.scale.map((s) => s * rs),
      ),
    });
  }
  const collect = (step) => {
    const out = { pts: [], thrusts: [] };
    for (const { obj, M } of models)
      walk(obj, M, hidden, new Set(part.thrust), out, step);
    return out;
  };
  let { pts } = collect(null);
  if (!pts.length) return { error: "no visible vertices" };
  const ys0 = pts.map((p) => p[1]);
  const span0 = Math.max(...ys0) - Math.min(...ys0);
  const out = collect(Math.max(1e-6, span0 / BINS / 2));
  pts = out.pts;
  const ys = pts.map((p) => p[1]);
  const y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const span = Math.max(1e-9, y1 - y0);
  const bin = (y) => Math.min(BINS - 1, Math.trunc(((y - y0) / span) * BINS));
  const prof = new Array(BINS).fill(0);
  const hull = Array.from({ length: BINS }, () => new Array(ANG).fill(0));
  for (const [x, y, z] of pts) {
    const b = bin(y);
    const r = Math.hypot(x, z);
    if (r > prof[b]) prof[b] = r;
    const a =
      Math.trunc(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * ANG) % ANG;
    if (r > hull[b][a]) hull[b][a] = r;
  }
  /* One ring at this height, or notches between bells? */
  const continuity = (b) => {
    const rs = hull[b].filter((r) => r > 0);
    return rs.length >= ANG / 2 && Math.max(...rs) > 0
      ? Math.min(...rs) / Math.max(...rs)
      : 1.0;
  };
  const seen = new Map();
  for (const t of out.thrusts) {
    if ((t[1] - y0) / span > 0.45) continue;
    seen.set(`${t[0].toFixed(2)},${t[2].toFixed(2)}`, t);
  }
  let bells = [...seen.values()];
  let split = null;
  if (bells.length > 1) {
    const notched = Array.from(
      { length: BINS },
      (_, b) => continuity(b) < 0.72,
    );
    for (let b = BINS - 1; b >= 0; b--) {
      let all = true;
      for (let i = 0; i <= b; i++)
        if (prof[i] > 0 && !notched[i]) {
          all = false;
          break;
        }
      if (all) split = b;
    }
    if (split === null || split >= BINS - 2) {
      bells = bells.slice(0, 1);
      split = null;
    }
  }
  const yOf = (i) => y1 - (y0 + (i + 0.5) * (span / BINS));
  const perBell = [];
  if (split !== null)
    for (const [bx, , bz] of bells) {
      const pb = new Array(BINS).fill(0);
      for (const [x, y, z] of pts) {
        const b = bin(y);
        if (b > split) continue;
        let k = 0;
        for (let i = 1; i < bells.length; i++)
          if (
            Math.hypot(x - bells[i][0], z - bells[i][2]) <
            Math.hypot(x - bells[k][0], z - bells[k][2])
          )
            k = i;
        if (bells[k][0] !== bx || bells[k][2] !== bz) continue;
        const d = Math.hypot(x - bx, z - bz);
        if (d > pb[b]) pb[b] = d;
      }
      const profile = [];
      for (let i = split; i >= 0; i--) profile.push([yOf(i), pb[i]]);
      perBell.push({ x: bx, z: bz, profile });
    }
  const profile = [];
  for (let i = BINS - 1; i >= 0; i--) profile.push([yOf(i), prof[i]]);
  return {
    ymin: y0,
    ymax: y1,
    height: y1 - y0,
    nodeTop:
      part.nodeTop === null ? null : part.nodeTop * part.rescale * part.scale,
    n: Math.max(1, bells.length),
    bellTop: split === null ? null : y1 - (y0 + (split + 1) * (span / BINS)),
    profile,
    bells: perBell,
  };
}

/* ------------------------------------------------------------------ export */
/* Rounded to the centimetre, as Python's round() would: half to even is the
   same as half away from zero except on exact halves, which a float rarely is. */
const R = (v) => Math.round(v * 100) / 100 + 0;
function exportOne(v) {
  const cut = v.nodeTop !== null && v.nodeTop < v.ymax ? v.ymax - v.nodeTop : 0;
  const profile = v.profile
    .filter(([y]) => y >= cut - 1e-9)
    .map(([y, r]) => [R(y - cut), R(r)]);
  const h = R(v.height - cut);
  profile[0][0] = 0;
  profile[profile.length - 1][0] = h;
  const out = {
    h,
    w: R(2 * Math.max(...profile.map(([, r]) => r))),
    n: v.n,
    profile,
  };
  if (v.n > 1 && v.bells.length) {
    out.bellTop = R(v.bellTop - cut);
    out.bells = v.bells.map((b) => ({
      x: R(b.x),
      z: R(b.z),
      profile: b.profile
        .filter(([y]) => y >= cut - 1e-9)
        .map(([y, r]) => [R(y - cut), R(r)]),
    }));
  }
  return out;
}

function main() {
  const [zipPath, ...flags] = process.argv.slice(2);
  if (!zipPath) {
    console.error(
      "usage: node tools/engine-profiles.mjs <ksp-engine-models.zip> [--check]",
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
  const sortKeys = (o) =>
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    );
  const stock = sortKeys(tables.stock);
  const rs = {};
  for (const [k, v] of Object.entries(tables.restock))
    if (!(k in stock) || JSON.stringify(v) !== JSON.stringify(stock[k]))
      rs[k] = v;
  const data = {
    about:
      "Measured from the install's .mu meshes by tools/engine-profiles.mjs: each engine's outer radius against height below its top node, in metres, and each bell of a cluster on its own axis. `restock` holds only the engines ReStock remodels.",
    stock,
    restock: sortKeys(rs),
  };
  const text = JSON.stringify(data);
  const target = join(REPO, "src/data/engine-profiles.json");
  for (const u of unmeasured) console.error("unmeasured:", u);
  console.error(
    `stock ${Object.keys(stock).length}, restock ${Object.keys(rs).length} remodelled`,
  );
  if (flags.includes("--check")) {
    const have = JSON.stringify(JSON.parse(readFileSync(target, "utf8")));
    if (have !== text) {
      console.error("src/data/engine-profiles.json differs from the install");
      process.exit(1);
    }
    console.error("src/data/engine-profiles.json matches the install");
    return;
  }
  writeFileSync(target, text + "\n");
  console.error(`wrote ${target} — run \`npm run format\` to lay it out`);
}

main();

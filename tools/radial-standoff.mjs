#!/usr/bin/env node
/* How far a radially attached part stands off what holds it, from a KSP
   install's own files.

     node tools/radial-standoff.mjs <files or folders...>          # writes STANDOFF into src/data/geometry.json
     node tools/radial-standoff.mjs <files or folders...> --check  # exits 1 if the committed table differs

   Anything bolted to the side of a stack is held off it by the part that
   holds it: a booster on a TT-38K stands the decoupler's thickness proud of
   the tank, a tank in a packed ring the same, a radial stack the cubic strut
   that joins it. The model placed every one of them flush (#422).

   The thickness is not in any one file. The part's config carries
   `node_attach`: where on the part it touches its parent, and which way the
   parent lies. The face a booster is then bolted to is the part's collider,
   which only its `.mu` model carries: the game snaps a surface-attached part
   to the collider under the cursor. Along the attach direction, the standoff
   is the distance from the attach point to the collider's far face. Where no
   model is given for a part, `PartDatabase.cfg` — the drag cube the game
   measured off the model on first launch — stands in, and overstates it: the
   cube is the whole mesh, 3 cm past the TT-38K's collider and about 25 cm
   past the TT-70's, which is where probe 5's Thoroughbreds floated (#467).

   Hand this every PartDatabase.cfg you have (one per art: stock and ReStock
   measure the same part differently, and the two are told apart by the
   heights geometry.json already carries), something with the part configs
   in it — the `.cfg` files from tools/pack-radial.ps1, unzipped, or a
   ModuleManager.ConfigCache, which holds every part as the game loaded it,
   ReStock's model swaps applied — and the holders' `.mu` files, which the
   same script packs. A stock part's model is the `mesh` beside its config;
   ReStock's is the `MODEL` its patch put in the cache, so a config from
   under `ReStock/` measures the ReStock art and any other the stock one.
   Plain Node, no dependencies. #422 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readMu, trs, mul, apply, eulerQuat } from "./mu.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "data", "geometry.json");

/* The parts that hold something on the side of a stack, by the id their
   config carries and the name structure.json and geometry.ts know them by.
   Nothing else is measured: the table is what the model reads, and a part
   the model never places needs no standoff. */
const PARTS = {
  "restock-decoupler-radial-tiny-1": "TT-14 Radial Decoupler",
  radialDecoupler: "TT-38K Radial Decoupler",
  radialDecoupler2: "TT-70 Radial Decoupler",
  "radialDecoupler1-2": "Hydraulic Detachment Manifold",
  strutCube: "Cubic Octagonal Strut",
};

/* ------------------------------------------------------------ the files */
function* walk(path) {
  if (statSync(path).isDirectory())
    for (const f of readdirSync(path)) yield* walk(join(path, f));
  else yield path;
}

/* Every PART block's id, `node_attach`, models and rescale, from any text
   that has PART blocks in it: a single .cfg, or the whole ConfigCache. The
   cache wraps each part in a UrlConfig whose `parentUrl` is the config's
   path under GameData, which is where a `mesh =` model lives; a loose .cfg
   is placed by its own path (`cfgDir`). Braces are not balanced: the values
   wanted are read by line, and MODEL blocks by a shallow match. */
function partsFrom(text, cfgDir) {
  const out = [];
  const blocks = text.split(/^\s*PART\s*\r?\n\s*\{/m);
  for (let k = 1; k < blocks.length; k++) {
    const body = blocks[k];
    const id = body.match(/^\s*name\s*=\s*(\S+)/m)?.[1];
    if (!id || !(id in PARTS)) continue;
    const na = body.match(/^\s*node_attach\s*=\s*([^\n]+)/m);
    if (!na) continue;
    const v = na[1].split(",").map((x) => Number(x.trim()));
    if (v.length < 6 || v.some((x) => !Number.isFinite(x))) continue;
    /* The folder the block's config is in: the cache says, a file is. */
    const parent = blocks[k - 1].match(/parentUrl\s*=\s*(\S+)/g)?.at(-1);
    const dir = parent
      ? parent.replace(/^parentUrl\s*=\s*/, "").replace(/\/[^/]*$/, "")
      : cfgDir;
    const models = [];
    for (const m of body.matchAll(/^\s*MODEL\s*\r?\n\s*\{([^}]*)\}/gm)) {
      const model = m[1].match(/^\s*model\s*=\s*(\S+)/m)?.[1];
      if (!model) continue;
      const vec = (key, dflt) =>
        (
          m[1].match(new RegExp(`^\\s*${key}\\s*=\\s*([^\\n]+)`, "m"))?.[1] ??
          dflt
        )
          .split(",")
          .map((x) => Number(x.trim()));
      const sc = vec("scale", "1,1,1");
      models.push({
        path: model.replace(/\.mu$/, "") + ".mu",
        scale: sc.length === 1 ? [sc[0], sc[0], sc[0]] : sc,
        position: vec("position", "0,0,0"),
        rotation: vec("rotation", "0,0,0"),
      });
    }
    const mesh = body.match(/^\s*mesh\s*=\s*(\S+)/m)?.[1];
    if (!models.length && mesh && dir !== undefined)
      models.push({
        path: `${dir}/${mesh.replace(/\.mu$/, "")}.mu`,
        scale: [1, 1, 1],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });
    out.push({
      id,
      at: v.slice(0, 3),
      dir: v.slice(3, 6),
      models,
      rescale: Number(
        body.match(/^\s*rescaleFactor\s*=\s*(\S+)/m)?.[1] ?? 1.25,
      ),
    });
  }
  return out;
}

/* The far face of a part's colliders along its attach direction, in the
   part's frame: every collider vertex through its object's transforms, the
   MODEL's placement and the part's rescale, projected on the direction.
   Returns null where none of the models named is among the files given. */
function colliderStandoff(part, meshes) {
  const d = part.dir;
  const dot = (v) => v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  let least = Infinity;
  let found = false;
  for (const m of part.models) {
    const file = meshes.find((f) => f.endsWith(m.path.split("/").join(sep)));
    if (!file) continue;
    found = true;
    const root = readMu(readFileSync(file));
    const M0 = trs(m.position, eulerQuat(m.rotation), m.scale);
    const take = (v) => {
      least = Math.min(least, dot(v) * part.rescale);
    };
    const walk = (obj, M) => {
      const W = mul(M, trs(obj.pos, obj.rot, obj.scale));
      for (const c of obj.colliders) {
        if (c.kind === "mesh") for (const v of c.verts) take(apply(W, v));
        else if (c.kind === "box") {
          for (const sx of [-0.5, 0.5])
            for (const sy of [-0.5, 0.5])
              for (const sz of [-0.5, 0.5])
                take(
                  apply(W, [
                    c.center[0] + sx * c.size[0],
                    c.center[1] + sy * c.size[1],
                    c.center[2] + sz * c.size[2],
                  ]),
                );
        } else {
          /* A sphere or capsule: its centre a radius either way along the
             direction, the capsule's length ignored — none of the holders
             has one. */
          const cw = apply(W, c.center);
          take([
            cw[0] - d[0] * c.radius,
            cw[1] - d[1] * c.radius,
            cw[2] - d[2] * c.radius,
          ]);
          take([
            cw[0] + d[0] * c.radius,
            cw[1] + d[1] * c.radius,
            cw[2] + d[2] * c.radius,
          ]);
        }
      }
      for (const ch of obj.children) walk(ch, W);
    };
    walk(root, M0);
  }
  if (!found || !Number.isFinite(least)) return null;
  return dot(part.at) * part.rescale - least;
}

/* Every part's drag cube from a PartDatabase.cfg: the six faces, then the
   centre and the size of the box, all in the part's own axes. */
function cubesFrom(text) {
  const out = new Map();
  const re =
    /url\s*=\s*\S*\/([^\/\s]+)\s*\n\s*DRAG_CUBE\s*\{\s*cube\s*=\s*Default,\s*([^\n]+)/g;
  for (const m of text.matchAll(re)) {
    const id = m[1];
    if (!(id in PARTS)) continue;
    const v = m[2].split(",").map((x) => Number(x.trim()));
    if (v.length < 24) continue;
    out.set(id, { centre: v.slice(18, 21), size: v.slice(21, 24) });
  }
  return out;
}

/* The standoff: from the attach point to the box's far face, along the
   direction the parent lies in. The direction points from the part towards
   its parent, so the part extends the other way, and the far face is the
   box's least extent along that direction. */
function standoff(node, cube) {
  const d = node.dir;
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  const half =
    (Math.abs(d[0]) * cube.size[0] +
      Math.abs(d[1]) * cube.size[1] +
      Math.abs(d[2]) * cube.size[2]) /
    2;
  return dot(node.at) - (dot(cube.centre) - half);
}

/* ----------------------------------------------------------------- main */
function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const paths = args.filter((a) => a !== "--check");
  if (!paths.length) {
    console.error(
      "usage: node tools/radial-standoff.mjs <PartDatabase.cfg, .cfg files, .mu files, folders, ConfigCache...> [--check]",
    );
    process.exit(2);
  }
  const geometry = JSON.parse(readFileSync(OUT, "utf8"));
  /* Every reading of every holder: a stock config, and the cache's patched
     one where ReStock is installed. */
  const parts = [];
  const meshes = [];
  const databases = [];
  for (const p of paths)
    for (const f of walk(p)) {
      if (f.endsWith(".mu")) {
        meshes.push(f);
        continue;
      }
      if (!/\.(cfg|ConfigCache)$/i.test(f) && !/ConfigCache/.test(f)) continue;
      const text = readFileSync(f, "utf8");
      /* A PartDatabase is nothing but `url` lines each followed by a
         DRAG_CUBE; a config has cubes of its own, under the part. */
      if (/^\s*url\s*=\s*\S+\s*\r?\n\s*DRAG_CUBE/m.test(text)) {
        databases.push({ f, cubes: cubesFrom(text) });
        continue;
      }
      const cfgDir = statSync(p).isDirectory()
        ? relative(p, dirname(f)).split(sep).join("/")
        : undefined;
      parts.push(...partsFrom(text, cfgDir));
    }
  /* A holder's reading for an art: ReStock's is the one whose model lives
     under ReStock/, stock's any other; the attach node is the same in both. */
  const readingFor = (id, art) =>
    parts.find(
      (x) =>
        x.id === id &&
        x.models.some(
          (m) => (art === "restock") === m.path.startsWith("ReStock/"),
        ),
    ) ?? parts.find((x) => x.id === id);
  for (const id of Object.keys(PARTS))
    if (!parts.some((x) => x.id === id)) {
      console.error(`no node_attach found for ${id} (${PARTS[id]})`);
      process.exit(1);
    }

  /* Which art a database measured: the one whose recorded heights it agrees
     with. A database matching neither is one this repository has not seen
     and is refused rather than guessed at. */
  const heightOf = (cubes, id) => cubes.get(id)?.size[1];
  const artOf = (cubes) => {
    for (const art of Object.keys(geometry)) {
      const table = geometry[art].PART_H;
      const agree = Object.entries(PARTS).every(([id, name]) => {
        const h = heightOf(cubes, id);
        return (
          h === undefined ||
          table[name] === undefined ||
          Math.abs(h - table[name]) < 1e-3
        );
      });
      const any = Object.entries(PARTS).some(
        ([id, name]) =>
          heightOf(cubes, id) !== undefined && table[name] !== undefined,
      );
      if (agree && any) return art;
    }
    return null;
  };

  const next = JSON.parse(JSON.stringify(geometry));
  const seen = new Set();
  for (const { f, cubes } of databases) {
    const art = artOf(cubes);
    if (!art) {
      console.error(`${f}: its cubes match neither art's heights; not used`);
      continue;
    }
    const table = {};
    const how = {};
    for (const [id, name] of Object.entries(PARTS)) {
      const cube = cubes.get(id);
      if (!cube) {
        /* A part the install this database came from does not have — the
           TT-14 is ReStock+'s and a stock database has no cube for it. It
           is left out of that art's table, where `standoffOf` reads zero,
           and the solver never offers it there (#467). */
        console.error(`${f}: no cube for ${id} (${name}); left out`);
        continue;
      }
      const part = readingFor(id, art);
      const byCube = standoff(part, cube);
      const byCollider = colliderStandoff(part, meshes);
      table[name] = Number((byCollider ?? byCube).toFixed(4));
      how[name] =
        byCollider === null
          ? "cube (no model given)"
          : `collider; cube ${byCube.toFixed(3)}`;
    }
    next[art].STANDOFF = table;
    seen.add(art);
    console.log(
      `${art.padEnd(8)} from ${f}\n` +
        Object.entries(table)
          .map(([n, v]) => `  ${n.padEnd(32)} ${v.toFixed(3)} m  ${how[n]}`)
          .join("\n"),
    );
  }
  for (const art of Object.keys(geometry))
    if (!seen.has(art)) {
      console.error(
        `no PartDatabase.cfg for the ${art} art among the files given`,
      );
      process.exit(1);
    }

  const text = JSON.stringify(next, null, 2) + "\n";
  if (check) {
    if (readFileSync(OUT, "utf8") !== text) {
      console.error(
        "geometry.json's STANDOFF differs from what these files produce",
      );
      process.exit(1);
    }
    console.log("geometry.json matches");
    return;
  }
  writeFileSync(OUT, text);
  console.log(`-> ${OUT}`);
}

main();

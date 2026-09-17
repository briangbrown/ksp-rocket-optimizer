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
   parent lies. `PartDatabase.cfg`, which the game writes on first launch,
   carries the drag cube: the bounding box the game measured off the model.
   Along the attach direction, the standoff is the distance from the attach
   point to the box's far face — the face the booster is then bolted to.

   Hand this every PartDatabase.cfg you have (one per art: stock and ReStock
   measure the same part differently, and the two are told apart by the
   heights geometry.json already carries) and something with the part
   configs in it — the `.cfg` files from tools/pack-radial.ps1, unzipped, or
   a ModuleManager.ConfigCache, which holds every part as the game loaded it.
   Plain Node, no dependencies. #422 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "data", "geometry.json");

/* The parts that hold something on the side of a stack, by the id their
   config carries and the name structure.json and geometry.ts know them by.
   Nothing else is measured: the table is what the model reads, and a part
   the model never places needs no standoff. */
const PARTS = {
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

/* Every PART block's id, title and `node_attach`, from any text that has
   PART blocks in it: a single .cfg, or the whole ConfigCache. A block is read
   as far as its own `node_attach`, so the reader does not have to balance
   braces through a MODULE tree it has no interest in. */
function nodesFrom(text) {
  const out = new Map();
  /* Split at every PART header; the first piece is whatever came before the
     first block. The game's files are CRLF, which `\s` takes in its stride. */
  const blocks = text.split(/^\s*PART\s*\r?\n\s*\{/m).slice(1);
  for (const body of blocks) {
    const id = body.match(/^\s*name\s*=\s*(\S+)/m)?.[1];
    if (!id || !(id in PARTS) || out.has(id)) continue;
    const na = body.match(/^\s*node_attach\s*=\s*([^\n]+)/m);
    if (!na) continue;
    const v = na[1].split(",").map((x) => Number(x.trim()));
    if (v.length < 6 || v.some((x) => !Number.isFinite(x))) continue;
    out.set(id, { at: v.slice(0, 3), dir: v.slice(3, 6) });
  }
  return out;
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
      "usage: node tools/radial-standoff.mjs <PartDatabase.cfg, .cfg files, folders, ConfigCache...> [--check]",
    );
    process.exit(2);
  }
  const geometry = JSON.parse(readFileSync(OUT, "utf8"));
  const nodes = new Map();
  const databases = [];
  for (const p of paths)
    for (const f of walk(p)) {
      const text = readFileSync(f, "utf8");
      /* A PartDatabase is nothing but `url` lines each followed by a
         DRAG_CUBE; a config has cubes of its own, under the part. */
      if (/^\s*url\s*=\s*\S+\s*\r?\n\s*DRAG_CUBE/m.test(text)) {
        databases.push({ f, cubes: cubesFrom(text) });
        continue;
      }
      for (const [id, n] of nodesFrom(text))
        if (!nodes.has(id)) nodes.set(id, n);
    }
  for (const id of Object.keys(PARTS))
    if (!nodes.has(id)) {
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
    for (const [id, name] of Object.entries(PARTS)) {
      const cube = cubes.get(id);
      if (!cube) {
        console.error(`${f}: no cube for ${id} (${name})`);
        process.exit(1);
      }
      table[name] = Number(standoff(nodes.get(id), cube).toFixed(4));
    }
    next[art].STANDOFF = table;
    seen.add(art);
    console.log(
      `${art.padEnd(8)} from ${f}\n` +
        Object.entries(table)
          .map(([n, v]) => `  ${n.padEnd(32)} ${v.toFixed(3)} m`)
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

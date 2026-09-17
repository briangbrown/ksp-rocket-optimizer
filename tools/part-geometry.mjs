#!/usr/bin/env node
/* The heights and axial face areas in src/data/geometry.json, from a KSP
   install's own files.

     node tools/part-geometry.mjs <files or folders...>          # writes PART_H and PART_A
     node tools/part-geometry.mjs <files or folders...> --check  # exits 1 if the committed tables differ

   `PART_H` is the slenderness limit and the elevation; `PART_A` is drag and
   the width a part presents. Both are read off the drag cube the game
   measured from the part's model and wrote to `PartDatabase.cfg` on first
   launch: the box's height, and the area of its +Y face — the face the
   airflow meets on a stack. The parts measured are the ones the solver can
   place, which is every title in parts.json, structure.json and
   couplers.json; a part with no cube (the Nerv and the engine plates, which
   the game computes at runtime) is left out and falls back.

   Hand this every PartDatabase.cfg you have — one per art, since stock and
   ReStock measure the same part differently; a database with ReStock's cubes
   in it is the ReStock art — and one ModuleManager.ConfigCache, which holds
   every part as the game loaded it and is the only file that carries both a
   part's id and its title. A title is not a unique key: the game keeps the
   superseded model of a revised part under the same title, hidden behind
   `TechHidden = true` and `category = none`, so the visible part is
   preferred (#120). Plain Node, no dependencies. #316

   The check. A drag cube can fail to describe its own part — ReStock's
   Mammoth, Twin-Boar and RAPIER ship no cube and the game generated garbage
   from the models: a Mammoth 499 × 25.1 × 741 m (#110, #112). The test
   that needs nothing but the file is the fill factor: the +Y face's area
   over the footprint the box claims, `YP / (π/4 · size_x · size_z)`. A
   cylinder fills its own bounding box, so across 524 parts that is 0.983;
   the three bad ones read 0.00003, 0.014 and 0.055. A cube under `FILL_MIN`
   is refused and reported, and the part takes the value of the same title
   from another art given on the command line — a stock install's cube of a
   part ReStock remodelled is the wrong shape, but it is a shape. With no
   other art to fall back on the run fails. */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "src", "data");
const OUT = join(DATA, "geometry.json");

/* Below this the cube is not describing its part. Across everything in a
   database the honest cubes run from 0.09 (a dish) through 0.15 (an
   asteroid) and 0.2 (flags, a radial panel) up to a median of 0.98; among
   the parts the solver places the lowest is the TT-70 at 0.29, a bracket
   on a wide plate. The three bad ones are a decade and more below the
   dish. */
const FILL_MIN = 0.1;

/* ------------------------------------------------------------ the files */
function* walk(path) {
  if (statSync(path).isDirectory())
    for (const f of readdirSync(path)) yield* walk(join(path, f));
  else yield path;
}

/* The titles the tables are keyed by: every part the solver can place. */
function wanted() {
  const titles = new Set();
  for (const f of ["parts.json", "structure.json", "couplers.json"]) {
    const walkJson = (x) => {
      if (Array.isArray(x)) x.forEach(walkJson);
      else if (x && typeof x === "object") {
        if (typeof x.n === "string") titles.add(x.n);
        Object.values(x).forEach(walkJson);
      }
    };
    walkJson(JSON.parse(readFileSync(join(DATA, f), "utf8")));
  }
  return titles;
}

/* Every PART block's id, title and whether the game shows it, from any text
   with PART blocks in it — a ConfigCache or a folder of .cfg files. A block
   is read as far as its own fields; the MODULE tree below is not balanced.
   A part's id in the game has `_` where its config has `.`, and the
   database's url carries the config's spelling, so both are kept. */
function partsFrom(text) {
  const out = [];
  const blocks = text.split(/^\s*PART\s*\r?\n\s*\{/m).slice(1);
  for (const body of blocks) {
    const id = body.match(/^\s*name\s*=\s*(\S+)/m)?.[1];
    const title = body.match(/^\s*title\s*=\s*([^\r\n]+)/m)?.[1]?.trim();
    if (!id || !title) continue;
    const hidden =
      /^\s*TechHidden\s*=\s*[Tt]rue/m.test(body) ||
      /^\s*category\s*=\s*none/m.test(body);
    out.push({ id, title, hidden });
  }
  return out;
}

/* Every part's first drag cube from a PartDatabase.cfg, by the id at the end
   of its url: the +Y face's area and the box's size. A part with variants
   carries one cube a variant, the default variant's first; a part with a
   shroud carries `Fairing` and `Clean`, and the shrouded one first. */
function cubesFrom(text) {
  const out = new Map();
  /* A url is a path and can carry a space — the Spider's folder is
     `liquidEngineLV-1R _v2` — so it is read to the end of its line. */
  const re =
    /url\s*=\s*([^\r\n]*)\/([^\/\r\n]+?)[ \t]*\r?\n\s*DRAG_CUBE\s*\{\s*cube\s*=\s*\w+,\s*([^\r\n]+)/g;
  for (const m of text.matchAll(re)) {
    const id = m[2];
    if (out.has(id)) continue;
    const v = m[3].split(",").map((x) => Number(x.trim()));
    if (v.length < 24) continue;
    out.set(id, {
      yp: v[6],
      size: v.slice(21, 24),
      restock: /^ReStock/.test(m[1]),
    });
  }
  return out;
}

/* The fill factor: how much of the footprint the box claims the +Y face
   covers. */
const fill = (c) => c.yp / ((Math.PI / 4) * c.size[0] * c.size[2]);

/* The game's numbers to four significant figures, as the file has always
   carried them: the cube itself is written that way. */
const sig4 = (x) => Number(x.toPrecision(4));

/* ----------------------------------------------------------------- main */
function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const paths = args.filter((a) => a !== "--check");
  if (!paths.length) {
    console.error(
      "usage: node tools/part-geometry.mjs <PartDatabase.cfg..., ModuleManager.ConfigCache or .cfg folder> [--check]",
    );
    process.exit(2);
  }
  const parts = [];
  const databases = [];
  for (const p of paths)
    for (const f of walk(p)) {
      const text = readFileSync(f, "utf8");
      if (/^\s*url\s*=\s*\S+\s*\r?\n\s*DRAG_CUBE/m.test(text)) {
        const cubes = cubesFrom(text);
        const art = [...cubes.values()].some((c) => c.restock)
          ? "restock"
          : "stock";
        databases.push({ f, art, cubes });
      } else parts.push(...partsFrom(text));
    }
  if (!parts.length) {
    console.error("no part configs given: a ConfigCache or a folder of .cfg");
    process.exit(1);
  }
  if (!databases.length) {
    console.error("no PartDatabase.cfg given");
    process.exit(1);
  }

  /* Which parts a title names, the visible ones first. The same part comes
     up once per config that patches it in a ConfigCache; one entry each. */
  const byTitle = new Map();
  const seenId = new Set();
  for (const p of parts) {
    if (seenId.has(p.id)) continue;
    seenId.add(p.id);
    if (!byTitle.has(p.title)) byTitle.set(p.title, []);
    byTitle.get(p.title).push(p);
  }
  for (const list of byTitle.values())
    list.sort((a, b) => Number(a.hidden) - Number(b.hidden));

  const titles = wanted();
  const geometry = JSON.parse(readFileSync(OUT, "utf8"));
  const next = JSON.parse(JSON.stringify(geometry));

  /* First pass: each art's honest cubes, and the ones refused. */
  const measured = {};
  const refused = [];
  for (const { f, art, cubes } of databases) {
    if (measured[art]) {
      console.error(`${f}: a second ${art} database; the first is used`);
      continue;
    }
    const table = { PART_H: {}, PART_A: {} };
    let n = 0;
    for (const title of titles) {
      const ids = (byTitle.get(title) ?? []).map((p) => p.id);
      if (!ids.length) continue;
      /* The visible part with a cube in this install; a title only the
         hidden part carries a cube for is still that part. */
      const id = ids.find(
        (i) => cubes.has(i) || cubes.has(i.replace(/_/g, ".")),
      );
      if (id === undefined) continue;
      const cube = cubes.get(id) ?? cubes.get(id.replace(/_/g, "."));
      n++;
      if (fill(cube) < FILL_MIN) {
        refused.push({ art, title, id, cube });
        continue;
      }
      table.PART_H[title] = sig4(cube.size[1]);
      table.PART_A[title] = sig4(cube.yp);
    }
    measured[art] = { f, table, n };
  }

  /* Second pass: a refused cube takes the other art's honest value. */
  for (const r of refused) {
    const other = Object.keys(measured).find(
      (a) => a !== r.art && measured[a].table.PART_H[r.title] !== undefined,
    );
    const c = r.cube;
    const line =
      `${r.art.padEnd(8)} refused ${r.title} (${r.id}): fill ${fill(c).toPrecision(2)}, ` +
      `box ${c.size.map((x) => x.toPrecision(3)).join(" × ")} m`;
    if (!other) {
      console.error(`${line}\n  and no other art was given to read it from`);
      process.exit(1);
    }
    measured[r.art].table.PART_H[r.title] =
      measured[other].table.PART_H[r.title];
    measured[r.art].table.PART_A[r.title] =
      measured[other].table.PART_A[r.title];
    console.log(`${line}\n  → the ${other} cube`);
  }

  const sorted = (o) =>
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    );
  for (const [art, { f, table, n }] of Object.entries(measured)) {
    next[art] ??= {};
    next[art].PART_H = sorted(table.PART_H);
    next[art].PART_A = sorted(table.PART_A);
    const missing = [...titles].filter((t) => table.PART_H[t] === undefined);
    console.log(
      `${art.padEnd(8)} from ${f}: ${n} parts measured; no cube for ${missing.length}: ${missing.join(", ")}`,
    );
  }

  const text = JSON.stringify(next, null, 2) + "\n";
  if (check) {
    const before = JSON.parse(readFileSync(OUT, "utf8"));
    const diffs = [];
    for (const art of Object.keys(measured))
      for (const k of ["PART_H", "PART_A"]) {
        const a = before[art]?.[k] ?? {};
        const b = next[art][k];
        for (const t of new Set([...Object.keys(a), ...Object.keys(b)]))
          if (a[t] !== b[t]) diffs.push(`${art} ${k} ${t}: ${a[t]} → ${b[t]}`);
      }
    if (diffs.length) {
      console.error(
        `geometry.json differs from what these files produce:\n  ${diffs.join("\n  ")}`,
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

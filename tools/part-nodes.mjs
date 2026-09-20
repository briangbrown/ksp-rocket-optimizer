#!/usr/bin/env node
/* Where each part joins its neighbours, from a KSP install's own configs.

     node tools/part-nodes.mjs <ModuleManager.ConfigCache ...>          # writes src/data/nodes.json
     node tools/part-nodes.mjs <ModuleManager.ConfigCache ...> --check  # exits 1 if the committed file differs

   A .craft file names parts by their config `name` and trusts every `pos` it
   carries, so a writer has to know, for every part the solver places, what
   the game calls it and where its attachment nodes sit — the drag cube in
   geometry.json is the part's bounding box, and an engine's top node is not
   at the top of its box. This reads it all off ModuleManager.ConfigCache,
   which holds every part as the game loaded it, patches applied, and is the
   one file carrying a part's id, its title and its nodes together. #461

   Per part: the config name as a craft spells it (the game turns `_` into
   `.` when it loads a part, so `ksp_r_largeBatteryPack` in the cache is
   `ksp.r.largeBatteryPack` in a craft); every stack node by its id, position,
   direction and size; the surface-attach node; the attach rules; the default
   variant and the variants there are; the resources it holds full; its dry
   mass, tech node, and whether it can command a vessel. A title names two
   parts where the game keeps a superseded model hidden; the visible one is
   taken (#120).

   One table per art, as geometry.json: ReStock remodels parts that already
   exist and can move a node when it does. A cache with ReStock's patches in
   it is the ReStock art; one without is stock. Making History's parts are
   absent from a plain stock cache and MH adds parts without remodelling any,
   so a stock entry missing there is filled from the ReStock cache and marked
   `via`. Plain Node, no dependencies. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "src", "data");
const OUT = join(DATA, "nodes.json");

/* Parts the solver places but the part tables do not list by title: the
   command parts that stand in for a payload, by stack size, and the strut
   that braces a packed ring. By config name, since that is the key here. */
const EXTRA = [
  "probeCoreSphere_v2", // Stayputnik, 0.625
  "probeCoreOcto2_v2", // OKTO2, 0.625
  "probeStackSmall", // RC-001S, 1.25
  "probeStackLarge", // RC-L01, 2.5
  "strutCube", // Cubic Octagonal Strut
  "strutConnector", // EAS-4 Strut Connector, the brace between a column and the core (#483)
];

/* ------------------------------------------------------- ConfigNode text */
/* The game's own format: `key = value` lines and `NAME { … }` blocks. The
   cache is written by ModuleManager one construct a line, tab-indented, so
   this reads that and the two variants a hand-written config allows — a
   brace on the name's line, and `//` comments. */
function parse(text) {
  const root = { name: "", values: [], nodes: [] };
  const stack = [root];
  let pending = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const c = line.indexOf("//");
    if (c === 0) continue;
    if (!line) continue;
    if (line === "{") {
      const node = { name: pending ?? "", values: [], nodes: [] };
      stack[stack.length - 1].nodes.push(node);
      stack.push(node);
      pending = null;
      continue;
    }
    if (line === "}") {
      if (stack.length === 1) throw new Error(`line ${i + 1}: unmatched }`);
      stack.pop();
      continue;
    }
    if (pending !== null) {
      /* A name with no brace after it is a bare value in the game's reader;
         nothing in a cache does this, so it is an error here. */
      throw new Error(`line ${i + 1}: expected { after ${pending}`);
    }
    const eq = line.indexOf("=");
    if (eq < 0) {
      if (line.endsWith("{")) {
        const node = {
          name: line.slice(0, -1).trim(),
          values: [],
          nodes: [],
        };
        stack[stack.length - 1].nodes.push(node);
        stack.push(node);
      } else pending = line;
      continue;
    }
    stack[stack.length - 1].values.push([
      line.slice(0, eq).trim(),
      line.slice(eq + 1).trim(),
    ]);
  }
  if (stack.length !== 1) throw new Error("unclosed block at end of file");
  return root;
}
const value = (node, key) => node.values.find(([k]) => k === key)?.[1];
const children = (node, name) => node.nodes.filter((n) => n.name === name);

/* ---------------------------------------------------------------- parts */
const nums = (s) =>
  s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));

/* A node line: position, direction, and a size where one is given (the
   game's default is 1, a 1.25 m node). */
const nodeOf = (s) => {
  const v = nums(s);
  if (v.length < 6) return null;
  return { p: v.slice(0, 3), d: v.slice(3, 6), s: v.length > 6 ? v[6] : 1 };
};

function partOf(cfg) {
  const id = value(cfg, "name");
  if (!id) return null;
  const nodes = {};
  for (const [k, v] of cfg.values)
    if (k.startsWith("node_stack_")) {
      const n = nodeOf(v);
      if (n) nodes[k.slice("node_stack_".length)] = n;
    }
  const attachV = value(cfg, "node_attach");
  const attach = attachV ? nodeOf(attachV) : null;
  const rules = value(cfg, "attachRules");
  const variants = children(cfg, "MODULE").find(
    (m) => value(m, "name") === "ModulePartVariants",
  );
  const resources = {};
  for (const r of children(cfg, "RESOURCE")) {
    const n = value(r, "name"),
      max = Number(value(r, "maxAmount"));
    if (n && Number.isFinite(max) && max > 0) resources[n] = max;
  }
  const modules = children(cfg, "MODULE")
    .map((m) => value(m, "name"))
    .filter(Boolean);
  const hidden =
    /^true$/i.test(value(cfg, "TechHidden") ?? "") ||
    value(cfg, "category") === "none";
  return {
    id,
    title: value(cfg, "title") ?? id,
    hidden,
    entry: {
      name: id.replace(/_/g, "."),
      nodes,
      attach,
      rules: rules ? nums(rules) : null,
      ...(variants
        ? {
            variant: value(variants, "baseVariant") ?? null,
            variants: children(variants, "VARIANT")
              .map((v) => value(v, "name"))
              .filter(Boolean),
            /* Where a variant moves a stack node — an engine plate's
               `bottom` goes down with the length of its shroud, 1.25 m on
               Short to 5 on Long — the moved nodes by variant, so a craft
               written in a variant hangs the stage below from where that
               variant's node is (#467). Left out where no variant moves one. */
            ...variantNodesOf(variants),
          }
        : {}),
      resources,
      mass: Number(value(cfg, "mass")),
      tech: value(cfg, "TechRequired") ?? null,
      command: modules.includes("ModuleCommand"),
      modules,
    },
  };
}

/* A ModulePartVariants block's node overrides: `{ variantName: { nodeId:
   node } }` for every VARIANT with a NODES child that moves a stack node. */
function variantNodesOf(variants) {
  const out = {};
  for (const v of children(variants, "VARIANT")) {
    const name = value(v, "name");
    const moved = {};
    for (const ns of children(v, "NODES"))
      for (const [k, val] of ns.values ?? [])
        if (k.startsWith("node_stack_")) {
          const n = nodeOf(val);
          if (n) moved[k.slice("node_stack_".length)] = n;
        }
    if (name && Object.keys(moved).length) out[name] = moved;
  }
  return Object.keys(out).length ? { variantNodes: out } : {};
}

/* Every part in a cache, by title, the visible one first. */
function partsFrom(text) {
  const root = parse(text);
  const byTitle = new Map();
  const byId = new Map();
  for (const u of children(root, "UrlConfig"))
    for (const cfg of children(u, "PART")) {
      const p = partOf(cfg);
      if (!p || byId.has(p.id)) continue;
      byId.set(p.id, p);
      if (!byTitle.has(p.title)) byTitle.set(p.title, []);
      byTitle.get(p.title).push(p);
    }
  for (const l of byTitle.values())
    l.sort((a, b) => Number(a.hidden) - Number(b.hidden));
  return {
    byTitle,
    byId,
    restock: children(root, "UrlConfig").some((u) =>
      /^ReStock/.test(value(u, "parentUrl") ?? ""),
    ),
  };
}

/* The titles the tables place, plus the extra names. */
function wanted() {
  const titles = new Set();
  for (const f of [
    "parts.json",
    "structure.json",
    "couplers.json",
    "power.json",
  ]) {
    const walk = (x) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") {
        if (typeof x.n === "string") titles.add(x.n);
        Object.values(x).forEach(walk);
      }
    };
    walk(JSON.parse(readFileSync(join(DATA, f), "utf8")));
  }
  return titles;
}

/* ----------------------------------------------------------------- main */
function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const paths = args.filter((a) => a !== "--check");
  if (!paths.length) {
    console.error(
      "usage: node tools/part-nodes.mjs <ModuleManager.ConfigCache ...> [--check]",
    );
    process.exit(2);
  }
  const caches = {};
  for (const f of paths) {
    const parts = partsFrom(readFileSync(f, "utf8"));
    const art = parts.restock ? "restock" : "stock";
    if (caches[art]) {
      console.error(`${f}: a second ${art} cache; the first is used`);
      continue;
    }
    caches[art] = { f, ...parts };
    console.log(`${art.padEnd(8)} ${f}: ${parts.byId.size} parts`);
  }
  if (!caches.restock) {
    console.error("no cache with ReStock's patches in it was given");
    process.exit(1);
  }
  const titles = wanted();
  const geometry = JSON.parse(
    readFileSync(join(DATA, "geometry.json"), "utf8"),
  );

  const tables = {};
  const missing = {};
  for (const art of ["stock", "restock"]) {
    const table = {};
    const otherArt = art === "stock" ? "restock" : "stock";
    const own = caches[art];
    const other = caches[otherArt];
    const miss = [];
    const pick = (list) => list?.[0] ?? null;
    const place = (title, p, via) => {
      if (!p) return false;
      table[title] = via ? { ...p.entry, via } : p.entry;
      return true;
    };
    /* By title, then by config name: power.json keys three ReStock+ parts by
       their name, since their titles in the cache are unresolved
       localisation keys. */
    const find = (cache, key) =>
      pick(cache.byTitle.get(key)) ?? cache.byId.get(key) ?? null;
    for (const title of [...titles].sort()) {
      if (own && place(title, find(own, title))) continue;
      if (other && place(title, find(other, title), otherArt)) continue;
      miss.push(title);
    }
    for (const id of EXTRA) {
      const p = own?.byId.get(id) ?? other?.byId.get(id);
      if (!p) {
        miss.push(id);
        continue;
      }
      place(p.title, p, own?.byId.has(id) ? undefined : otherArt);
    }
    tables[art] = Object.fromEntries(
      Object.keys(table)
        .sort()
        .map((k) => [k, table[k]]),
    );
    missing[art] = miss;
  }
  if (!caches.stock)
    console.error(
      "no stock cache given: the stock table is the ReStock one throughout, marked via",
    );

  /* What to look at. */
  for (const art of ["stock", "restock"]) {
    if (missing[art].length)
      console.log(`${art}: no part for ${missing[art].join(", ")}`);
    const t = tables[art];
    const via = Object.entries(t).filter(([, e]) => e.via).length;
    const noStack = Object.entries(t)
      .filter(([, e]) => e.rules?.[0] === 1 && !e.nodes.top && !e.nodes.bottom)
      .map(([k]) => k);
    console.log(
      `${art}: ${Object.keys(t).length} entries, ${via} filled from the other art` +
        (noStack.length
          ? `; stackable with no stack node: ${noStack.join(", ")}`
          : ""),
    );
    /* A tank's nodes span its box; where they do not, say so — the adapter's
       cross-check needs to know which parts to expect it of. */
    const off = [];
    for (const [title, e] of Object.entries(t)) {
      const h = geometry[art]?.PART_H?.[title];
      if (h === undefined || !e.nodes.top || !e.nodes.bottom) continue;
      const span = e.nodes.top.p[1] - e.nodes.bottom.p[1];
      if (Math.abs(span - h) / h > 0.05)
        off.push(`${title} nodes ${span.toFixed(3)} box ${h}`);
    }
    console.log(
      `${art}: ${off.length} parts whose node span is not their box height (engines, decouplers, plates expected)`,
    );
  }
  const moved = Object.keys(tables.restock).filter((k) => {
    const a = tables.stock[k],
      b = tables.restock[k];
    return (
      a && b && !a.via && JSON.stringify(a.nodes) !== JSON.stringify(b.nodes)
    );
  });
  console.log(
    `ReStock moves the nodes of ${moved.length} parts: ${moved.join(", ")}`,
  );

  const out = {
    about:
      "Where each part joins its neighbours, by tools/part-nodes.mjs from a KSP install's ModuleManager.ConfigCache. `name` is the config name as a .craft spells it; `nodes` the stack nodes by id with position p, direction d and size s in the part's own frame, metres, y up; `attach` the surface-attach node; `rules` the attachRules; `variant` the default variant; `resources` what the part holds full; `mass` dry, tonnes; `command` whether it can command a vessel. One table per art, as geometry.json; an entry marked `via` is read from the other art's cache because the part is not in this one.",
    stock: tables.stock,
    restock: tables.restock,
  };
  /* Compared as data, not text: prettier lays the committed file out. */
  const text = JSON.stringify(out, null, 2) + "\n";
  if (check) {
    const before = JSON.parse(readFileSync(OUT, "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(out)) {
      console.error("nodes.json differs from what these caches produce");
      process.exit(1);
    }
    console.log("nodes.json matches");
    return;
  }
  writeFileSync(OUT, text);
  console.log(`-> ${OUT}; run npm run format to lay it out`);
}

main();

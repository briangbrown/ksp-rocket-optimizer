#!/usr/bin/env node
/* The parts that make and store electric charge, from a KSP install's own
   configs.

     node tools/power-parts.mjs ksp-power-parts.zip          # writes src/data/power.json
     node tools/power-parts.mjs ksp-power-parts.zip --check  # exits 1 if the committed file differs

   The zip is what tools/pack-power.ps1 makes; tools/README.md is the
   procedure. Ion propulsion is refused by the solver today because none of
   this is modelled — an ion stage that does not carry its own power plant is
   an engine flying on nothing — and this is the data half of lifting that.

   What it reads, per part: the title, mass, cost and tech node every part
   carries, and then whichever of these says what the part does — a panel's
   `chargeRate`, a battery's stored `ElectricCharge`, a generator's output
   `rate`, a converter's input and output rates. And for an engine that burns
   electric charge, what it draws at full throttle, which is not in the file
   as a rate: it is a propellant ratio, and turning it into charge per second
   is the arithmetic KSP itself does.

   Plain Node, no dependencies. The zip reader is the one in
   tools/engine-meshes.mjs, which is this repository's own. #413 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const OUT = join(REPO, "src/data/power.json");
/* ------------------------------------------------------------------ zip */
/* The most one entry may inflate to. A .mu of a whole engine is a few
   megabytes; a header that says otherwise is a corrupt or hostile zip, and
   the answer is a named error rather than the process running out of
   memory. #178 */
const MAX_ENTRY = 256 * 1024 * 1024;

function unzip(buf) {
  /* The central directory is at the end; walk it for names and offsets.
     Every offset the file claims is checked against the file before it is
     read: Node would throw a RangeError rather than read past the buffer,
     but "bad central directory" says what happened. */
  const within = (at, len, what) => {
    if (at < 0 || at + len > buf.length) throw new Error(`bad zip: ${what}`);
  };
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    within(p, 46, "central directory entry");
    if (buf.readUInt32LE(p) !== 0x02014b50)
      throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    within(p + 46, nlen, "entry name");
    /* PowerShell writes backslashes; everything here is forward. */
    const name = buf
      .toString("utf8", p + 46, p + 46 + nlen)
      .replace(/\\/g, "/");
    if (!name.endsWith("/")) {
      within(local, 30, "local header");
      const lnlen = buf.readUInt16LE(local + 26);
      const lxlen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnlen + lxlen;
      within(start, csize, `data of ${name}`);
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
      return f.method === 8
        ? inflateRawSync(raw, { maxOutputLength: MAX_ENTRY })
        : f.method === 0
          ? raw
          : null;
    },
  };
}

/* ------------------------------------------------------------------ cfg */
/* A KSP config is a brace tree of `key = value` lines with `//` comments.
   Only the shape matters here, so this is a reader rather than a parser: it
   walks a part's text keeping the brace depth, and hands back the nodes it was
   asked about with their own key/value pairs. Nothing here has to survive a
   malformed file — the game would not have loaded it either. */
function nodesOf(text, wanted) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let depth = 0;
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (line === "{") continue;
    if (line === "}") {
      depth--;
      const open = stack[stack.length - 1];
      if (open && open.depth === depth) {
        stack.pop();
        if (wanted.includes(open.name)) out.push(open);
      }
      continue;
    }
    if (/^[A-Z_]+$/.test(line) || /^@?[A-Za-z_]+$/.test(line)) {
      /* A node header: the name on its own line, the brace on the next. */
      if ((lines[i + 1] ?? "").trim().startsWith("{")) {
        stack.push({ name: line, depth, keys: new Map() });
        depth++;
        continue;
      }
    }
    const eq = line.indexOf("=");
    if (eq > 0 && stack.length) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      const top = stack[stack.length - 1];
      if (!top.keys.has(k)) top.keys.set(k, v);
    }
  }
  return out;
}

/* The English of a title. The files carry a localisation key and the string
   itself in the comment after it, which is the only place the words are. */
const titleOf = (text) => {
  const m = text.match(/^\s*title\s*=\s*(.+)$/m);
  if (!m) return null;
  const raw = m[1];
  const c = raw.match(/\/\/\s*#[\w.]+\s*=\s*(.+?)\s*$/);
  if (c) return c[1];
  return raw.replace(/\/\/.*$/, "").trim();
};

const num = (v) => (v === undefined ? null : Number(String(v).split(/\s/)[0]));

/* The same field under two spellings. A generator writes `name` and `rate`; a
   converter writes `ResourceName` and `Ratio`, and both ship in stock. */
/* The configs name a tech node by its id; `src/data/tech.json` keys on the
   tree's own title, and the two are not a transformation of each other —
   `largeElectrics` is "High-Power Electrics", not "Large Electrics". The gates
   fail closed, so a name the tree does not have hides the part forever rather
   than erroring, which is how a coupler stayed hidden for months (#191). An id
   not in this table stops the run; `test/power-data.test.ts` holds every name
   in it against the tree. */
const TECH = {
  basicScience: "Basic Science",
  electrics: "Electrics",
  advElectrics: "Advanced Electrics",
  largeElectrics: "High-Power Electrics",
  specializedElectrics: "Specialized Electrics",
  experimentalElectrics: "Experimental Electrics",
  ionPropulsion: "Ion Propulsion",
};

const res = (node) => node.keys.get("ResourceName") ?? node.keys.get("name");
const amountOf = (node) => num(node.keys.get("Ratio") ?? node.keys.get("rate"));

/* ---------------------------------------------------------------- parts */
/* KSP works out what an engine consumes from its propellant ratios and the
   densities of what it burns, not from a rate in the file. The engine needs a
   mass flow of `thrust / (Isp · g0)`; the mixture's density is the ratio-
   weighted sum of the propellants' own, so the volumetric flow is the one
   divided by the other, and each propellant's rate is that times its ratio.

   Electric charge is massless, so it contributes nothing to the density and
   everything to the draw: the Dawn's 1.8 against xenon's 0.1 at a density of
   0.0001 comes out at 8.74 charge a second, which is what the game shows. */
const G0 = 9.80665;
function drawOf(props, thrust, ispVac, densities) {
  const mix = props.reduce((a, p) => a + p.ratio * (densities[p.name] ?? 0), 0);
  if (!(mix > 0) || !(thrust > 0) || !(ispVac > 0)) return null;
  const flow = thrust / (ispVac * G0) / mix; // units a second
  const ec = props.find((p) => p.name === "ElectricCharge");
  return ec ? +(flow * ec.ratio).toFixed(4) : null;
}

/* The resource densities the game ships, so the arithmetic above uses the
   install's numbers rather than remembered ones. */
function densitiesFrom(zip) {
  const out = {};
  for (const n of zip.names) {
    if (!/Resources.*\.cfg$/i.test(n)) continue;
    const text = zip.read(n)?.toString("utf8");
    if (!text) continue;
    for (const d of nodesOf(text, ["RESOURCE_DEFINITION"])) {
      const name = d.keys.get("name");
      const density = num(d.keys.get("density"));
      if (name && density !== null) out[name] = density;
    }
  }
  return out;
}

/* One part, reduced to what a power plant is sized and priced from. Returns
   null where the file is a patch, a variant or anything with no PART of its
   own — the pack collects on content and over-collects on purpose. */
function partOf(text, densities) {
  const parts = nodesOf(text, ["PART"]);
  if (!parts.length) return null;
  const p = parts[0];
  const name = p.keys.get("name");
  if (!name) return null;
  /* ReStock+ keeps its strings in a Localization folder the pack does not
     collect, so a few titles arrive as their key. The part's own id is a
     better name than a key nobody can read, and the tool says which. */
  const title = titleOf(text);
  const base = {
    id: name,
    n: title && !title.startsWith("#") ? title : name,
    m: num(p.keys.get("mass")),
    cost: num(p.keys.get("cost")),
    t: p.keys.get("TechRequired") ?? null,
  };
  if (base.m === null || base.cost === null) return null;

  const mods = nodesOf(text, ["MODULE"]);
  const named = (what) => mods.find((m) => m.keys.get("name") === what) ?? null;

  const panel = named("ModuleDeployableSolarPanel");
  if (panel) {
    const rate = num(panel.keys.get("chargeRate"));
    if (rate === null) return null;
    /* A tracking panel turns to face the sun and makes its rated output
       whatever attitude the craft is in; a flat one takes the angle it is
       bolted at and averages less. The field is written only where it is
       false — the OX-STAT and the OX-STAT-XL — so absent means tracking. */
    const tracks = (panel.keys.get("isTracking") ?? "true") !== "false";
    /* A panel that can break is stowed through an ascent and produces nothing
       until it is out; the flat ones are bolted on and ride up extended. */
    const breakable = (panel.keys.get("isBreakable") ?? "true") !== "false";
    return { kind: "panel", ...base, rate, tracks, breakable };
  }

  /* A launch stability enhancer carries a generator too, and is ground
     support rather than a power plant: it is left behind on the pad. */
  const gen = named("ModuleGenerator");
  if (gen && !named("LaunchClamp")) {
    const out = nodesOf(text, ["OUTPUT_RESOURCE"]).find(
      (o) => res(o) === "ElectricCharge",
    );
    const rate = out ? amountOf(out) : null;
    if (rate === null) return null;
    return { kind: "generator", ...base, rate };
  }

  /* A fuel cell burns propellant to make power, which is a different trade
     from a panel and the one that wins where the sun does not reach. It also
     carries a small charge store, so it has to be recognised before the
     battery below would claim it. Only converters that actually make
     electric charge: the same module drives the ore refineries. */
  const conv = named("ModuleResourceConverter");
  const makesPower = nodesOf(text, ["OUTPUT_RESOURCE"]).find(
    (o) => res(o) === "ElectricCharge",
  );
  if (conv && makesPower) {
    const rate = amountOf(makesPower);
    if (rate === null) return null;
    const burns = nodesOf(text, ["INPUT_RESOURCE"]).map((i) => ({
      r: res(i),
      rate: amountOf(i),
    }));
    return { kind: "cell", ...base, rate, burns };
  }

  const store = nodesOf(text, ["RESOURCE"]).find(
    (r) => r.keys.get("name") === "ElectricCharge",
  );
  if (store && !named("ModuleCommand") && !named("ModuleEnginesFX")) {
    const amount = num(store.keys.get("maxAmount"));
    if (amount === null) return null;
    return { kind: "battery", ...base, stored: amount };
  }

  const eng = named("ModuleEnginesFX") ?? named("ModuleEngines");
  if (eng) {
    const props = nodesOf(text, ["PROPELLANT"]).map((x) => ({
      name: x.keys.get("name"),
      ratio: num(x.keys.get("ratio")) ?? 0,
    }));
    if (!props.some((x) => x.name === "ElectricCharge")) return null;
    /* `key = 0 4200` is pressure then Isp, and the first key is the vacuum
       one — the second number on the line, not the first. */
    const curve = nodesOf(text, ["atmosphereCurve"])[0];
    const first = curve?.keys.get("key");
    const ispVac = first ? num(String(first).trim().split(/\s+/)[1]) : null;
    const draw = drawOf(
      props,
      num(eng.keys.get("maxThrust")),
      ispVac,
      densities,
    );
    if (draw === null) return null;
    return { kind: "engine", ...base, draw };
  }
  return null;
}

/* ----------------------------------------------------------------- main */
function main() {
  const [zipPath, ...flags] = process.argv.slice(2);
  if (!zipPath) {
    console.error(
      "usage: node tools/power-parts.mjs <ksp-power-parts.zip> [--check]",
    );
    process.exit(2);
  }
  const zip = unzip(readFileSync(zipPath));
  const densities = densitiesFrom(zip);

  const found = new Map();
  for (const name of zip.names) {
    if (!name.endsWith(".cfg")) continue;
    /* ReStock's patches repaint these parts and rescale a few; none of them
       moves a charge rate, a mass or a price, and a patch has no PART of its
       own to read. */
    if (/\/Patches\//.test(name)) continue;
    const text = zip.read(name)?.toString("utf8");
    if (!text) continue;
    let part = null;
    try {
      part = partOf(text, densities);
    } catch (e) {
      console.error(`  ${name}: ${e.message}`);
      continue;
    }
    /* Whose part it is, from where it sits: the two expansions the app can
       switch off ship their parts under their own folders, and a part the
       install does not offer is refused by `offered` in core/constants.ts
       exactly as a tank or an engine from the same folder is. Without the
       flag a ReStock+ battery was chosen for a plant with ReStock off. #415 */
    const owner = /^ReStockPlus\//.test(name)
      ? { rs: 1 }
      : /^SquadExpansion\/MakingHistory\//.test(name)
        ? { mh: 1 }
        : {};
    if (part && !found.has(part.id))
      found.set(part.id, { ...part, ...owner, src: name });
  }

  const unnamed = [...found.values()].filter((x) => x.n === x.id);
  if (unnamed.length)
    console.log(
      `  ${unnamed.length} parts named by their id, their strings being in a Localization folder this pack does not collect: ${unnamed.map((x) => x.id).join(", ")}`,
    );

  /* Resolved here rather than as each part is read: the pack over-collects on
     purpose, so the reader walks docking ports and wheels too, and their tech
     nodes are no business of this table. Only what is kept has to map. */
  const unknownTech = new Set();
  const byKind = (k) =>
    [...found.values()]
      .filter((x) => x.kind === k)
      .sort((a, b) => a.n.localeCompare(b.n))
      .map(({ kind, src, ...rest }) => {
        if (rest.t && !TECH[rest.t]) unknownTech.add(rest.t);
        return { ...rest, t: rest.t ? (TECH[rest.t] ?? rest.t) : null };
      });

  /* What a panel's rate is quoted at. Physics.cfg gives the flux at the
     homeworld's orbital distance, which is where a panel makes its rated
     output; everywhere else it falls as the square of the distance. */
  const physics = zip.read("Physics.cfg")?.toString("utf8") ?? "";
  const sun = {};
  for (const k of ["solarLuminosityAtHome", "solarInsolationAtHome"]) {
    const m = physics.match(new RegExp(`^\\s*${k}\\s*=\\s*([\\d.]+)`, "m"));
    if (m) sun[k] = Number(m[1]);
  }

  const out = {
    about:
      "Electric power parts, by tools/power-parts.mjs from a KSP install's own configs. " +
      "Mass in tonnes, cost in funds, rates in units of ElectricCharge a second, " +
      "stored in units. A panel's rate is its output at the homeworld's orbital " +
      "distance; solar flux falls as the square of distance from the sun, which is " +
      "what solarLuminosityAtHome in Physics.cfg is quoted at.",
    sun,
    panels: byKind("panel"),
    cells: byKind("cell"),
    batteries: byKind("battery"),
    generators: byKind("generator"),
    engines: byKind("engine"),
  };

  if (unknownTech.size) {
    console.error(
      `tech nodes with no name in TECH: ${[...unknownTech].join(", ")}\n` +
        "Add each to the table in this file with the tree's own spelling from src/data/tech.json.",
    );
    process.exit(1);
  }

  const text = JSON.stringify(out, null, 2) + "\n";
  if (flags.includes("--check")) {
    const have = readFileSync(OUT, "utf8");
    if (have !== text) {
      console.error("power.json differs from what this install produces");
      process.exit(1);
    }
    console.log("power.json matches");
    return;
  }
  writeFileSync(OUT, text);
  for (const k of ["panels", "cells", "batteries", "generators", "engines"])
    console.log(`  ${k.padEnd(11)} ${out[k].length}`);
  console.log(`-> ${OUT}`);
}

main();

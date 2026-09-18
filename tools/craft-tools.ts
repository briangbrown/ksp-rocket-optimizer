import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { planMission } from "../src/core/plan.js";
import { craftOf } from "../src/core/craft.js";
import { billOfCraft } from "../src/core/bill.js";
import {
  CraftError,
  checkCraft,
  parseNode,
  readCraft,
  writeCraft,
} from "../src/craft/index.js";
import { sweepCases } from "../test/grid.js";
import type { Craft, CraftPart } from "../src/craft/index.js";
import type { ConfigNode } from "../src/craft/index.js";

/* The .craft writer against the game (#467). Built through vite, as perf/
   run.ts is, for the JSON imports, and run under node:

     npm run craft:probes -- <outdir>        the probe ladder, to copy into saves/<save>/Ships/VAB/
     npm run craft:diff -- ours.craft saved.craft
                                             the game's saved copy against what we wrote
     npm run craft:log -- KSP.log            what the game said while loading crafts
     npm run craft:conformance -- <dir>      readCraft over every .craft under a folder

   Nothing here runs in CI: the game is the other half of every check, and
   tools/README.md is the protocol. */

const argv = process.argv.slice(2);
const cmd = argv[0];

/* ---------------------------------------------------------------- probes */
/* A ladder of crafts, each adding one construct, from the plans the sweep
   already delivers — the same adapter and writer the app uses, so a probe
   that loads is the app's file loading. The first rung is written twice:
   with the MODULE stubs the writer emits, and with none, which is the open
   question about the minimum body the game launches (#462). */
async function probes(outdir: string) {
  mkdirSync(outdir, { recursive: true });
  /* Each rung names the sweep missions that may stand for it, tried in
     order; the first whose plan has what the rung is for is written. The
     asparagus rung wants a liquid drop-tank ring, and in ReStock's art the
     mass objective solves without one. */
  type Res = NonNullable<Awaited<ReturnType<typeof planMission>>>;
  type Try = { name: string; payload?: number };
  const want: Array<[string, Array<Try>, (r: Res) => boolean]> = [
    ["01-stack", [{ name: "Low orbit-pay3.5" }], () => true], // tanks, one engine, two stages
    ["02-boosters", [{ name: "Low orbit-pay0.8" }], () => true], // radial engines, SRBs on TT-38Ks
    ["03-cluster", [{ name: "Mun-pay3.5" }], () => true], // a cluster on a coupler, a rejoin
    ["04-columns", [{ name: "Tylo-pay0.8" }], () => true], // parallel columns on struts, a packed ring
    [
      "05-asparagus",
      /* The sweep's three at 20 t, then the mass one heavier: the ring is
         where the gain lives once the side stacks are large. */
      [
        { name: "Minmus-pay20-asparagus-mass" },
        { name: "Minmus-pay20-asparagus-cost" },
        { name: "Minmus-pay20-asparagus-parts" },
        { name: "Minmus-pay20-asparagus-mass", payload: 40 },
        { name: "Minmus-pay20-asparagus-mass", payload: 60 },
      ],
      (r: Res) => r.stages.some((s) => s.sol?.boosters?.part.column), // a drop-tank ring
    ],
    ["06-cut", [{ name: "Eeloo-pay2.5-cut" }], () => true], // a cut mission, many stages
  ];
  const cases = sweepCases();
  const index: Array<string> = [];
  for (const [rung, names, fits] of want) {
    let made = false;
    for (const { name, payload } of names) {
      const c = cases.find((x) => x.name === name);
      if (!c) {
        console.error(`no sweep case ${name}`);
        continue;
      }
      /* In ReStock's art: the probes are checked in an install that has it,
         and the holders' standoffs and the parts' heights are its. The sweep
         solves the same missions in stock's, and a TT-38K is 19 mm thinner
         here (#467). */
      const input = {
        ...c.input,
        payload: payload ?? c.input.payload,
        expansions: { mh: c.input.expansions?.mh ?? false, rs: true },
      };
      const res = await planMission(input, {
        onYield: () => Promise.resolve(),
      });
      if (!res || !res.stages.some((s) => s.sol)) {
        console.error(`${name}: nothing solved`);
        continue;
      }
      if (!fits(res)) {
        console.error(`${name}: not what ${rung} is for; trying the next`);
        continue;
      }
      made = true;
      const craft = craftOf(res.stages, input, `Probe ${rung}`, name);
      const file = join(outdir, `${rung}.craft`);
      writeFileSync(file, writeCraft(craft));
      index.push(
        `${rung}.craft  ${craft.parts.length} parts  ${name}${payload ? ` at ${payload} t` : ""}`,
      );
      if (rung === "01-stack") {
        const bare: Craft = {
          ...craft,
          name: `Probe ${rung}a bare`,
          parts: craft.parts.map((p): CraftPart => ({ ...p, modules: [] })),
        };
        writeFileSync(join(outdir, `${rung}a-bare.craft`), writeCraft(bare));
        index.push(`${rung}a-bare.craft  the same with no MODULE stubs`);
      }
      break;
    }
    if (!made) console.error(`${rung}: no mission stood for it`);
  }
  writeFileSync(
    join(outdir, "README.txt"),
    [
      "Probe crafts from the KSP rocket optimizer (#467).",
      "",
      "Copy this folder's .craft files into saves/<your save>/Ships/VAB/.",
      "For each, in the VAB: open it — is it whole? — press Ctrl+S to let the",
      "game save it back, then launch and space through the stages. Note",
      "loaded / launched / staged / fell apart. Then run tools/pack-craft.ps1",
      "from the KSP root and upload the zip; tools/craft-tools diff and log",
      "read the rest.",
      "",
      ...index,
      "",
    ].join("\n"),
  );
  console.log(index.join("\n"));
  console.log(`-> ${outdir}`);
}

/* ------------------------------------------------------------------ diff */
/* What the game changed when it saved our craft back — nothing, if it took
   the geometry as written — and what its file carries that ours does not,
   which is the list of fields the writer should add. */
function diff(oursPath: string, savedPath: string) {
  const oursText = readFileSync(oursPath, "utf8");
  const savedText = readFileSync(savedPath, "utf8");
  const ours = readCraft(oursText);
  const saved = readCraft(savedText);
  const out: Array<string> = [];
  const byToken = (c: Craft) =>
    new Map(c.parts.map((p) => [`${p.name}_${p.id}`, p]));
  const a = byToken(ours),
    b = byToken(saved);
  for (const k of a.keys())
    if (!b.has(k)) out.push(`dropped by the game: ${k}`);
  for (const k of b.keys()) if (!a.has(k)) out.push(`added by the game: ${k}`);
  for (const [k, p] of a) {
    const q = b.get(k);
    if (!q) continue;
    const d = Math.hypot(...p.pos.map((v, i) => v - q.pos[i]));
    if (d > 1e-3)
      out.push(`${k}: moved ${(d * 1000).toFixed(0)} mm (${p.pos} → ${q.pos})`);
    /* Two quaternions are the same turn when their dot is ±1; comparing
       components by size hid a half turn, where only signs change. */
    const dot = Math.abs(p.rot.reduce((a, v, i) => a + v * q.rot[i], 0));
    if (Math.abs(dot - 1) > 1e-6)
      out.push(
        `${k}: turned ${((2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI).toFixed(0)}° (${p.rot} → ${q.rot})`,
      );
    if ((p.parent?.id ?? null) !== (q.parent?.id ?? null))
      out.push(`${k}: parent ${p.parent?.id} → ${q.parent?.id}`);
    if (p.stage.ignite !== q.stage.ignite || p.stage.drop !== q.stage.drop)
      out.push(
        `${k}: stage ${p.stage.ignite}/${p.stage.drop} → ${q.stage.ignite}/${q.stage.drop}`,
      );
    for (const r of p.resources) {
      const s = q.resources.find((x) => x.name === r.name);
      if (!s) out.push(`${k}: ${r.name} gone`);
      else if (Math.abs(s.amount - r.amount) > 1e-3)
        out.push(`${k}: ${r.name} ${r.amount} → ${s.amount}`);
    }
  }
  /* Fields the game writes that we do not, header and per part. */
  const keys = (n: ConfigNode) => new Set(n.values.map(([k]) => k));
  const ourRoot = parseNode(oursText),
    savedRoot = parseNode(savedText);
  const headerMissing = [...keys(savedRoot)].filter(
    (k) => !keys(ourRoot).has(k),
  );
  if (headerMissing.length)
    out.push(
      `header fields the game writes and we do not: ${headerMissing.join(", ")}`,
    );
  const ourPart = ourRoot.nodes.find((n) => n.name === "PART");
  const savedPart = savedRoot.nodes.find((n) => n.name === "PART");
  if (ourPart && savedPart) {
    const missing = [...keys(savedPart)].filter((k) => !keys(ourPart).has(k));
    if (missing.length)
      out.push(
        `PART fields the game writes and we do not: ${missing.join(", ")}`,
      );
    const blocks = (n: ConfigNode) => new Set(n.nodes.map((c) => c.name));
    const missingBlocks = [...blocks(savedPart)].filter(
      (k) => !blocks(ourPart).has(k),
    );
    if (missingBlocks.length)
      out.push(
        `PART blocks the game writes and we do not: ${missingBlocks.join(", ")}`,
      );
  }
  const billSame =
    JSON.stringify(billOfCraft(ours)) === JSON.stringify(billOfCraft(saved));
  out.push(
    billSame
      ? "bill: the same rocket"
      : "bill: DIFFERS — the game's copy is a different rocket",
  );
  console.log(
    out.length ? out.join("\n") : "identical in everything a Craft carries",
  );
  return out.filter(
    (l) =>
      !l.startsWith("header fields") &&
      !l.startsWith("PART ") &&
      !l.startsWith("bill: the same"),
  ).length;
}

/* ------------------------------------------------------------------- log */
/* The lines in KSP.log that say a craft did not load clean: a part the
   game does not know, an exception while the ship was built or launched,
   a joint that broke on the pad. Grouped by the craft being loaded where
   the log names it. */
function log(path: string) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const WATCH = [
    /PartLoader.*not found|Part.*not found|Cannot find part|NoParentPart|Could not find/i,
    /NullReferenceException|ArgumentOutOfRange|IndexOutOfRange|InvalidCast/,
    /ShipConstruct|EditorLogic|LoadShip|GetPartName|FinalizeAnalytics/,
    /Kraken|structural failure|Joint between|broke apart|collided into/i,
    /\.craft/,
  ];
  let craft = "?";
  const hits: Array<string> = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/([\w.'-]+\.craft)/);
    if (m) craft = basename(m[1]);
    if (WATCH.some((re) => re.test(l)))
      hits.push(
        `${String(i + 1).padStart(7)}  [${craft}]  ${l.trim().slice(0, 200)}`,
      );
  }
  console.log(
    hits.length
      ? hits.join("\n")
      : "nothing in the log about a craft failing to load",
  );
  return hits.length;
}

/* ----------------------------------------------------------- conformance */
/* Every .craft under a folder — the game's own stock ships, a save's —
   through readCraft: a file the game wrote that we cannot read, or that
   reads as a craft checkCraft refuses, is a gap in the reader. */
function conformance(dir: string) {
  const files: Array<string> = [];
  const walk = (p: string) => {
    for (const f of readdirSync(p)) {
      const q = join(p, f);
      if (statSync(q).isDirectory()) walk(q);
      else if (f.endsWith(".craft")) files.push(q);
    }
  };
  walk(dir);
  /* A file the reader cannot read is the failure; a file it reads that
     `checkCraft` would refuse is a note — the game writes forms our writer
     does not (a `link` pointing at the first part, in one 1.12.5 file), and
     the check holds our writer, not the game. */
  let unread = 0,
    noted = 0;
  for (const f of files) {
    try {
      const c = readCraft(readFileSync(f, "utf8"));
      const problems = checkCraft(c);
      if (problems.length) {
        noted++;
        console.log(
          `${f}: reads, ${c.parts.length} parts; checkCraft would refuse it: ${problems
            .slice(0, 3)
            .map((p) => p.what)
            .join("; ")}`,
        );
      }
    } catch (e) {
      unread++;
      console.log(
        `${f}: CANNOT READ — ${e instanceof CraftError ? e.message : `not a CraftError: ${(e as Error).message}`}`,
      );
    }
  }
  console.log(
    `${files.length} crafts, ${unread} unreadable, ${noted} the writer would not have written`,
  );
  return unread;
}

/* ------------------------------------------------------------------ main */
(async () => {
  if (cmd === "probes" && argv[1]) await probes(argv[1]);
  else if (cmd === "diff" && argv[2])
    process.exitCode = diff(argv[1], argv[2]) ? 1 : 0;
  else if (cmd === "log" && argv[1]) process.exitCode = log(argv[1]) ? 1 : 0;
  else if (cmd === "conformance" && argv[1])
    process.exitCode = conformance(argv[1]) ? 1 : 0;
  else {
    console.error(
      "usage: craft-tools probes <outdir> | diff <ours.craft> <saved.craft> | log <KSP.log> | conformance <dir>",
    );
    process.exitCode = 2;
  }
})();

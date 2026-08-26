import React, { useState, useMemo, useEffect, useRef } from "react";
import { buildVehicleFor, simCached } from './core/ascent.js';
import { BODY, orbitAlt } from './core/atmosphere.js';
import { DATA } from './core/catalogue.js';
import { PACK_BRACE, PACK_JOIN, PART_H, clusterSpan, engineLen, stackGeometry, stageGeom, tankStackLen, widthOf } from './core/geometry.js';
import { DEST, PROFILES, SYS, bodyKey, buildRoute, defaultCuts, hasSync } from './core/orbits.js';
import { PLATE_SHROUD, diaOf, missionHardware } from './core/parts.js';
import { stageCost, stageParts } from './core/performance.js';
import { planMission } from './core/plan.js';
import { TALLY, boostedAscent, resetTally, solveGroup, solveStage } from './core/solver.js';
import { NODE_PARTS, TIERS, withDeps } from './core/tech.js';

/* ============================== STOCK + DLC PART DATA ==============================
   Extracted from niobos/ksp-tools and verified against stock KSP 1.12.5 values.
   Engines store mass-flow; thrust = Isp * g0 * mdot, which is how KSP computes it.
   f = fuel types, iv/ia = Isp vacuum/ASL, fv/fa = thrust vacuum/ASL (kN),
   m = wet mass, dry = mass without integrated propellant (SRBs), t = tech node.
   Tanks: k = structural (dry) mass per tonne of propellant. Stock LF/Ox tanks = 0.125.
=================================================================================== */


/* ------------------------------- design tokens ------------------------------- */
/* Single palette. Every colour in the app comes from here or is derived from a
   body hue, so the whole thing can be retoned by editing this block.
   Contrast is checked against WCAG: body text clears 4.5:1 on every surface it
   sits on, interactive borders and drawn shapes clear 3:1. */
const C = {
  // surfaces, darkest first
  ink: "#0A1017", panel: "#111A25", panel2: "#16212F",
  // lines: rule divides, edge outlines anything you can click or must see
  rule: "#2E4258", edge: "#52708F",
  // type
  paper: "#E6EDF6",   // 14.9:1 on panel
  muted: "#7E93AD",   //  5.6:1 on panel
  dim:   "#7389A6",   //  4.9:1 on panel — was #4E637C at 2.8:1, below the floor
  // accents
  amber: "#F5A623", mint: "#4FD1A5", rust: "#E2603F",
  moss: "#86B24A", violet: "#A177DB", sky: "#4A9BE0", ice: "#6FD7E8",
  // drawing fills, all clear of the panel behind them
  tank: "#5F7488", engine: "#9FB0C4", payloadFill: "#4FD1A5", shroud: "#3F5064",
  // labels printed on top of a filled body hue
  onLight: "#0B1119", onDark: "#F2EFE9",
};

/* --------------------------------- solver ---------------------------------
   Rocket equation with tankage. For propellant mass mp and structural
   coefficient k (tank dry mass per tonne of propellant):
       mf = P + E + k*mp        m0 = mf + mp        R = exp(dv / (Isp*g0))
   Solving for mp:
       mp = (R-1)(P+E) / (1 + k - R*k)
   Feasible only while R < (1+k)/k — for stock 9:1 tanks that caps a single
   stage at Isp*g0*ln(9).                                                   */
/* No cuts to begin with: the whole mission is solved as one span and the stage
   count is found automatically. Cuts are the user's tool for saying "this part
   flies on its own hardware", not something to presume. */

/* -------------------------- parallel solid boosters --------------------------
   Radial SRBs fire alongside the liquid core and are jettisoned at burnout, so
   the launch stage has two phases:
     A  boosters + core together, lasting t_b = booster fuel / booster flow
     B  core alone on whatever propellant phase A left it
   A KSP engine's mass flow is constant (mdot = F_vac / (Isp_vac·g0)); atmospheric
   thrust is just that flow times a lower Isp. So the combined Isp across phase A
   is total vacuum thrust over total flow — no averaging fudge required.        */
function parseConfig(text) {
  let cfg;
  try { cfg = JSON.parse(String(text).replace(/^\s*KSP-PLANNER\s*/, "")); }
  catch { return { error: "That does not parse as a configuration." }; }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg))
    return { error: "That does not parse as a configuration." };

  const values = {};
  let took = 0, left = 0;
  const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  const take = (key, ok, val) => { if (ok) { values[key] = val(); took++; } else left++; };
  const bodies = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);

  take("origin", bodies.includes(cfg.origin), () => cfg.origin);
  take("dest", typeof cfg.dest === "string" && cfg.dest.length > 0, () => cfg.dest);
  take("profile", ["flyby", "orbit", "land"].includes(cfg.profile), () => cfg.profile);
  take("returning", typeof cfg.returning === "boolean", () => cfg.returning);
  take("payload", num(cfg.payload, 0.01, 2000), () => cfg.payload);
  take("payloadDia", num(cfg.payloadDia, 0.1, 20), () => cfg.payloadDia);
  take("margin", num(cfg.margin, 0, 100), () => cfg.margin);
  take("extraDv", num(cfg.extraDv, 0, 20000), () => cfg.extraDv);
  take("objective", ["mass", "cost", "parts"].includes(cfg.objective), () => cfg.objective);
  take("boosters", typeof cfg.boosters === "boolean", () => cfg.boosters);
  take("chutes", typeof cfg.chutes === "boolean", () => cfg.chutes);
  take("needGimbal", typeof cfg.needGimbal === "boolean", () => cfg.needGimbal);
  take("planeNow", typeof cfg.planeNow === "boolean", () => cfg.planeNow);
  take("asparagus", typeof cfg.asparagus === "boolean", () => cfg.asparagus);
  take("maxAspect", num(cfg.maxAspect, 2, 100), () => cfg.maxAspect);
  take("expansions", cfg.expansions && typeof cfg.expansions === "object" && !Array.isArray(cfg.expansions),
    () => ({ mh: !!cfg.expansions.mh, rs: cfg.expansions.rs !== false }));
  take("tech", Array.isArray(cfg.tech) && cfg.tech.some((t) => DATA.nodes[t]),
    () => withDeps(DATA.nodes, new Set(cfg.tech.filter((t) => DATA.nodes[t]))));
  take("excluded", Array.isArray(cfg.excluded), () => new Set(cfg.excluded));
  take("cuts", cfg.cuts === null || Array.isArray(cfg.cuts),
    () => (cfg.cuts ? new Set(cfg.cuts) : null));
  take("splits", Array.isArray(cfg.splits), () => new Map(cfg.splits));
  return { values, took, left };
}

/* A tally of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd, and
   it makes the cost of a wider search visible rather than only felt. */
const NAME_WORDS = {
  flyby: ["Drive-By", "Wave", "Peek", "Flyby", "Glance", "Sightsee"],
  orbit: ["Circuit", "Loiter", "Lap", "Orbiter", "Vigil", "Holding Pattern"],
  land:  ["Descent", "Touchdown", "Boots", "Lander", "Arrival", "Faceplant"],
};
const NAME_ADJ = ["Ambitious", "Reluctant", "Overengineered", "Slightly Concerning",
  "Structurally Optimistic", "Barely Adequate", "Suspiciously Cheap", "Unreasonable",
  "Well-Strutted", "Mostly Symmetrical", "Provisional", "Emphatic", "Unhurried",
  "Load-Bearing", "Theoretically Sound"];
const NAME_TAIL = ["Mk1", "Mk2", "Mk3", "Mk4", "Mk7", "Rev B", "Rev C", "Rev D",
  "Prototype", "Final", "Final (2)", "Final (Actual)", "Flight Article", "Block II"];
const NAME_JOKE = ["Jeb Approved", "Bill Says No", "Bob Has Concerns", "Val Insisted",
  "Struts Extra", "Chutes Optional", "Fins Were Free", "Do Not Revert",
  "Quicksave First", "More Boosters", "This Time For Sure", "Wernher Signed Off"];

function craftName({ origin, dest, profile, returning, payload, objective, k, mass }) {
  const seed = [origin, dest, profile, returning, objective, k,
    Math.round(payload * 10), Math.round(mass || 0)].join("|");
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pick = (arr, salt) => arr[Math.abs((h ^ Math.imul(salt, 2654435761)) >>> 0) % arr.length];
  const where = String(dest).replace(/ orbit$/i, "").replace(/^Low | Orbit$/gi, "");
  const verb = pick(NAME_WORDS[profile] || NAME_WORDS.orbit, 1);
  const adj = pick(NAME_ADJ, 2);
  const tail = pick(NAME_TAIL, 3);
  const joke = pick(NAME_JOKE, 4);
  const trip = returning ? " & Back" : "";
  return {
    name: `${where} ${verb}${trip} — ${adj} ${tail}`,
    sub: joke,
    short: `${where}-${verb.replace(/\s+/g, "")}${returning ? "-RT" : ""}-${tail.replace(/[^A-Za-z0-9]/g, "")}`,
  };
}

/* ================================== UI ================================== */
/* Defensive: a row can legitimately carry no number — the parallel-stacks note
   has no mass of its own — and a formatter that throws on null takes the whole
   page down with it. */
const fmt = (x, d = 0) => (x === null || x === undefined || !isFinite(x))
  ? "—"
  : x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/* KSP shows mission elapsed time as T+ HH:MM:SS, so match it — a figure you can
   read straight off the game clock beats one you have to convert in your head.
   A Kerbin day is six hours, and days only appear when something actually runs
   that long. */
function hms(sec) {
  const x = Math.max(0, Math.round(sec));
  const d = Math.floor(x / 21600);
  const h = Math.floor((x % 21600) / 3600), m = Math.floor((x % 3600) / 60), s2 = x % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (d ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(s2)}`;
}

export default function KSPMissionPlanner() {
  const [origin, setOrigin] = useState("Kerbin");
  const [dest, setDest] = useState("Mun");
  const [profile, setProfile] = useState("land");
  const [returning, setReturning] = useState(true);   // most missions are meant to come home
  const [needGimbal, setNeedGimbal] = useState(true);
  const [planeNow, setPlaneNow] = useState(false);
  const [asparagus, setAsparagus] = useState(false);
  const [maxAspect, setMaxAspect] = useState(14);
  const [payloadDia, setPayloadDia] = useState(1.25);
  const [payload, setPayload] = useState(2.5);
  const [margin, setMargin] = useState(10);
  const [extraDv, setExtraDv] = useState(0);
  const [chutes, setChutes] = useState(true);
  const [boosters, setBoosters] = useState(true);
  const [objective, setObjective] = useState("cost");
  /* Expansions, checked against the uploaded configs: no MakingHistory folder,
     Serenity present. Making History carries seven liquid engines and the whole
     stock 1.875 m tank line, so leaving it on was putting parts in designs that
     do not exist in this install. Breaking Ground ships no engines and no fuel
     tanks, so it cannot change a launch vehicle — its box is shown but inert
     rather than pretending to filter something. */
  /* Checked against the uploaded configs: no MakingHistory folder, ReStock+
     present. Breaking Ground had a box until it was clear it ships no engines
     and no fuel tanks, so it could never change a launch vehicle. */
  const [expansions, setExpansions] = useState({ mh: false, rs: true });
  const hasMH = expansions.mh, hasRS = expansions.rs;
  const [splitBy, setSplitBy] = useState(() => new Map());
  const [unlocked, setUnlocked] = useState(() =>
    withDeps(DATA.nodes, new Set(Object.entries(DATA.nodes).filter(([, v]) => v.lvl <= 5).map(([k]) => k))));
  const [cuts, setCuts] = useState(null);   // null = follow defaultCuts
  const [showTech, setShowTech] = useState(false);
  const [showOrigin, setShowOrigin] = useState(false);
  const [showDest, setShowDest] = useState(true);
  const [excluded, setExcluded] = useState(() => new Set());   // parts the user has ruled out
  /* The part roster is setup, not a per-session choice: it describes your install
     and what you have researched, and retyping it every time would be tedious.
     Persisted through the artifact storage API — localStorage is unavailable
     here. Mission settings are deliberately not saved; those you do want to
     change run to run. */
  const [hydrated, setHydrated] = useState(false);
  /* Asparagus needs fuel to cross from a dropped stack into the core. A radial
     decoupler will do it — crossfeed is a right-click toggle on the TT-38K, which
     arrives with Stability — and a pair of fuel ducts is the alternative. Until
     one of those is researched the option is not offered, because the build is
     not possible. */
  const crossfeedOk = useMemo(() =>
    unlocked.has("Stability") || unlocked.has("Advanced Construction")
    || unlocked.has("Fuel Systems"), [unlocked]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const got = window.storage && await window.storage.get("ksp-planner:roster");
        const v = got && JSON.parse(got.value);
        if (live && v) {
          if (Array.isArray(v.unlocked)) setUnlocked(withDeps(DATA.nodes, new Set(v.unlocked)));
          if (Array.isArray(v.excluded)) setExcluded(new Set(v.excluded));
          if (v.expansions) setExpansions(v.expansions);
          if (typeof v.needGimbal === "boolean") setNeedGimbal(v.needGimbal);
        }
      } catch { /* nothing saved yet, or storage unavailable — defaults stand */ }
      if (live) setHydrated(true);
    })();
    return () => { live = false; };
  }, []);
  const [openNode, setOpenNode] = useState(null);
  const toggleExcluded = (n) => setExcluded((p) => {
    const s2 = new Set(p); s2.has(n) ? s2.delete(n) : s2.add(n); return s2;
  });

  const orbitHere = dest === "Low orbit" || dest === "Stationary orbit";

  const destList = useMemo(() => {
    const here = ["Low orbit"];
    if (hasSync(origin)) here.push("Stationary orbit");
    const rest = origin === "Kerbin"
      ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
      : Object.keys(SYS).filter((b) => b !== "Sun" && b !== origin);
    return [...here, ...rest];
  }, [origin]);

  /* Jool has no surface, and a same-body orbit has no arrival, so landing
     profiles have nothing to act on. Fall back rather than let the state go
     stale when someone switches destination while Land is selected. */
  const canLand = useMemo(() =>
    !orbitHere && buildRoute(dest, "land", true, origin).some((l) => l.kind === "land"),
    [dest, origin, orbitHere]);
  const effProfile = (!canLand && profile === "land") ? "orbit" : profile;

  const route = useMemo(() => buildRoute(dest, effProfile, chutes, origin, returning, planeNow),
    [dest, effProfile, chutes, origin, returning, planeNow]);
  const totalDv = route.reduce((s, l) => s + l.dv, 0);
  const budget = Math.round(totalDv * (1 + margin / 100) + extraDv);

  /* The uploaded configs had no MakingHistory folder, so those seven liquid
     engines are off by default — the solver was building around a Wolfhound that
     is not installed. The MH-derived boosters (Thoroughbred, Clydesdale, Shrimp,
     Mite) stay: they moved into the base game in 1.11. */
  useEffect(() => {
    if (!hydrated) return;                 // do not write the defaults back over a saved roster
    try {
      const w = window.storage && window.storage.set("ksp-planner:roster", JSON.stringify({
        unlocked: [...unlocked], excluded: [...excluded], expansions, needGimbal,
      }));
      if (w && w.catch) w.catch(() => {});
    } catch { /* storage unavailable — the session still works, it just will not persist */ }
  }, [hydrated, unlocked, excluded, expansions, needGimbal]);

  const engines = useMemo(
    () => DATA.engines.filter((e) => unlocked.has(e.t) && (hasMH || !e.mh)
      && (hasRS || !e.rs) && !excluded.has(e.n)),
    [unlocked, hasMH, hasRS, excluded]);
  const EXPANSION_PARTS = useMemo(() => ({
    stock: DATA.engines.filter((e) => !e.mh && !e.rs).length
         + DATA.tanks.filter((t) => !t.mh && !t.rs).length,
    mh: DATA.engines.filter((e) => e.mh).length + DATA.tanks.filter((t) => t.mh).length,
    rs: DATA.engines.filter((e) => e.rs).length + DATA.tanks.filter((t) => t.rs).length,
  }), []);
  const tanks = useMemo(
    () => DATA.tanks.filter((t) => (!t.t || unlocked.has(t.t))
      && (hasMH || !t.mh) && (hasRS || !t.rs) && !excluded.has(t.n)),
    [unlocked, hasMH, hasRS, excluded]);

  /* Group legs into stages using the cut positions (cut i = separate after leg i). */
  const effCuts = useMemo(() => cuts ?? defaultCuts(route), [cuts, route]);

  const groups = useMemo(() => {
    const g = []; let cur = [];
    route.forEach((leg, i) => {
      if (leg.free) return;
      cur.push(leg);
      if (effCuts.has(i)) { g.push(cur); cur = []; }
    });
    if (cur.length) g.push(cur);
    return g;
  }, [route, effCuts]);

  /* Solve bottom-up: the last group flies first, so build from the top down.
     Each segment can expand into several stages, so the result is flattened. */
  /* Solving takes seconds, so it cannot sit on the render path. It runs as an
     async walk that yields between segments and again between stage-count
     candidates; each yield is a chance for React to paint and for a newer run to
     cancel this one. `token` is the abandon signal — if the inputs change, the
     run in flight stops at its next yield instead of finishing work nobody
     wants. */
  const [stages, setStages] = useState([]);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    const token = ++runId.current;
    setBusy(true);          // instantly, in the same tick as the change
    const alive = () => runId.current === token;
    const breathe = () => new Promise((r) => setTimeout(r, 0));
    /* A superseded run stops at its next yield. `alive` still guards the final
       setState — the two agree, but the signal is what a worker will read. */
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;


    (async () => {
      if (!hydrated) return;              // wait for the saved roster before spending a solve
      const startedAt = Date.now();
      /* The veil is already up — it goes on synchronously above so it appears on
         the same tick as the click. This pause only debounces the work, so a
         flurry of edits costs one solve, and the yield lets React paint before the
         thread is seized. */
      await new Promise((r) => setTimeout(r, 120));
      if (!alive()) return;
      await breathe();
      if (!alive()) return;

      const result = await planMission(
        {
          groups, route, payload, payloadDia, margin, extraDv,
          engines, tanks, unlocked, excluded, needGimbal, maxAspect,
          expansions, asparagus, objective, origin, splitBy, boosters,
        },
        { signal: controller.signal, onYield: breathe },
      );
      if (!result) return;
      if (!alive()) return;
      setStages(result.stages);
      setSearch({ ...result.tally, ms: Date.now() - startedAt });
      /* Unconditional: an abandoned run may have switched the veil on, and if this
         one finishes inside the 120 ms delay its own `shown` is false — so keying
         the reset off `shown` could leave the veil stuck on forever. */
      setBusy(false);
    })();

    return () => {};
  }, [hydrated, groups, route, payload, payloadDia, margin, extraDv, engines, tanks, boosters, splitBy, origin, objective, unlocked, excluded, needGimbal, maxAspect, asparagus]);


  const runSim = (pick, bodyName) => {
    const v = buildVehicleFor(stages, pick, bodyName, payloadDia);
    if (!v) return null;
    try {
      const alt = orbitAlt(bodyName);
      const r = simCached(v, alt);
      /* A vehicle that cannot fly is worth saying out loud — silence reads as
         "not simulated" when it actually means "this design cannot work". */
      return r && r.ok ? { ...r, veh: v, bodyName, target: alt }
                       : { ok: false, veh: v, bodyName, target: alt };
    } catch { return null; }
  };

  const ascent = useMemo(() => runSim((s) => s.isLaunch, origin), [stages, origin]);

  /* Climbing back off an atmosphere deserves the same treatment as the pad —
     more so at Eve, where sea level is 5 atm and engines barely push. */
  const returnAscent = useMemo(() => {
    const leg = route.find((l) => l.kind === "ascentBack");
    if (!leg) return null;
    return runSim((s) => s.legs.some((l) => l.kind === "ascentBack"), leg.body);
  }, [stages, route]);

  const geom = useMemo(() => {
    return stackGeometry(stages, payload);
  }, [stages, payload]);

  const srbAvail = engines.some((e) => e.f.includes("SF") && e.fuelM > 0);
  const airDescent = route.some((l) => l.kind === "land" && l.atm);

  const hardware = useMemo(() => missionHardware(route, payload, origin, unlocked, excluded), [route, payload, origin, unlocked, excluded]);

  const [search, setSearch] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const configText = useMemo(() => "KSP-PLANNER " + JSON.stringify({
    origin, dest, profile, returning, payload, payloadDia, margin, extraDv, objective,
    boosters, chutes, needGimbal, planeNow, asparagus, maxAspect, expansions,
    tech: [...unlocked].sort(),
    excluded: [...excluded].sort(),
    cuts: cuts ? [...cuts].sort((x, y) => x - y) : null,
    splits: [...splitBy.entries()],
  }), [origin, dest, profile, returning, payload, payloadDia, margin, extraDv, objective,
       boosters, chutes, needGimbal, planeNow, maxAspect, expansions, unlocked, excluded, cuts, splitBy]);

  /* Load a pasted configuration. Every field is checked on its own and a bad or
     missing one is simply left at its default — a config saved before a setting
     existed should still restore everything else rather than failing whole. The
     count of what was skipped is reported so it is not a silent partial load. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState(null);

  const applyConfig = () => {
    const r = parseConfig(pasteText);
    if (r.error) { setPasteNote({ bad: true, msg: r.error }); return; }
    const v = r.values;
    if ("origin" in v) setOrigin(v.origin);
    if ("dest" in v) setDest(v.dest);
    if ("profile" in v) setProfile(v.profile);
    if ("returning" in v) setReturning(v.returning);
    if ("payload" in v) setPayload(v.payload);
    if ("payloadDia" in v) setPayloadDia(v.payloadDia);
    if ("margin" in v) setMargin(v.margin);
    if ("extraDv" in v) setExtraDv(v.extraDv);
    if ("objective" in v) setObjective(v.objective);
    if ("boosters" in v) setBoosters(v.boosters);
    if ("chutes" in v) setChutes(v.chutes);
    if ("needGimbal" in v) setNeedGimbal(v.needGimbal);
    if ("planeNow" in v) setPlaneNow(v.planeNow);
    if ("asparagus" in v) setAsparagus(v.asparagus);
    if ("maxAspect" in v) setMaxAspect(v.maxAspect);
    if ("expansions" in v) setExpansions(v.expansions);
    if ("tech" in v) setUnlocked(v.tech);
    if ("excluded" in v) setExcluded(v.excluded);
    if ("cuts" in v) setCuts(v.cuts);
    if ("splits" in v) setSplitBy(v.splits);
    setPasteNote({ bad: false,
      msg: `Loaded ${r.took} settings${r.left ? `, ${r.left} left at their defaults` : ""}.` });
    setPasteOpen(false); setPasteText("");
  };

  const copyConfig = async () => {
    /* Clipboard access is not guaranteed here, so fall back to showing the text
       for manual selection rather than failing silently. */
    try {
      await navigator.clipboard.writeText(configText);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { setShowConfig(true); }
  };

  const totalCost = stages.reduce((a, x) => a + (x.sol ? stageCost(x.sol) : 0), 0);
  const totalParts = stages.reduce((a, x) => a + (x.sol ? stageParts(x.sol) : 0), 0);

  const liftoff = stages[0]?.sol ? stages[0].sol.total : NaN;

  const craft = useMemo(() => craftName({ origin, dest, profile: effProfile, returning,
    payload, objective, k: stages.length, mass: liftoff }),
    [origin, dest, effProfile, returning, payload, objective, stages.length, liftoff]);

  /* [].every() is true, so an empty stage list read as "solved" and printed the
     NaN placeholder. Harmless while the solve was synchronous and stages were
     never empty; the async rewrite made the empty first render visible. */
  const ok = stages.length > 0 && stages.every((s) => s.sol);
  // the accent is the target's own tracking-station colour, lifted if too dark to read
  const dcolor = (() => {
    const k = bodyKey(dest);
    return k && BODY_HUE[k] ? edgeOf(BODY_HUE[k]) : C.sky;
  })();

  const setSplit = (key, k) => setSplitBy((p) => {
    const n = new Map(p); k ? n.set(key, k) : n.delete(key); return n;
  });

  const toggleCut = (i) => setCuts((p) => {
    const n = new Set(p ?? defaultCuts(route));
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const setTier = (lvl) => setUnlocked(withDeps(DATA.nodes,
    new Set(Object.entries(DATA.nodes).filter(([, v]) => v.lvl <= lvl).map(([k]) => k))));

  const vehicleClass =
    !ok ? "—" : liftoff < 20 ? "Sounding / light" : liftoff < 75 ? "Medium lifter"
    : liftoff < 250 ? "Heavy lifter" : liftoff < 700 ? "Super heavy" : "Kerbal-scale monster";

  return (
    <div style={{ background: C.ink, color: C.paper, minHeight: "100vh",
      fontFamily: "'Inter',system-ui,-apple-system,sans-serif", padding: "0 0 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .disp { font-family:'Barlow Condensed',Impact,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
        .mono { font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace; font-variant-numeric:tabular-nums; }
        .eyebrow { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.22em;
                   text-transform:uppercase; color:${C.dim}; }
        button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
        button:focus-visible, input:focus-visible { outline:2px solid ${C.amber}; outline-offset:2px; }
        input[type=range]{ accent-color:${C.amber}; width:100%; }
        .chip { border:1px solid ${C.edge}; border-radius:2px; padding:5px 10px; font-size:12px;
                background:${C.panel2}; color:${C.muted}; transition:.12s; }
        .chip:hover { border-color:${C.dim}; color:${C.paper}; }
        .chip[data-on="1"] { background:${C.paper}; color:${C.ink}; border-color:${C.paper}; font-weight:600; }
        .card { background:${C.panel}; border:1px solid ${C.rule}; border-radius:3px; }
        @keyframes sweep { 0% { transform:translateX(-100%); } 100% { transform:translateX(386%); } }
        @keyframes fadein { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
        @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
      `}</style>

      {/* ---------------------------- header ---------------------------- */}
      {/* Solving can take seconds at full tech, so say so plainly rather than with
          a hairline. Held back 120 ms so quick recalculations do not flash. */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: C.panel2, borderBottom: `1px solid ${C.amber}`,
        boxShadow: "0 2px 12px rgba(0,0,0,.45)",
        opacity: busy ? 1 : 0, pointerEvents: "none",
        transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in" }}>
        <div style={{ height: 4, background: C.rule, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "30%", background: C.amber,
            animation: busy ? "sweep 1s ease-in-out infinite" : "none" }} />
        </div>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "7px 20px",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: C.amber,
            animation: busy ? "pulse 1s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>
            Solving {origin} → {dest}
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            staging, engine selection and ascent simulation
          </span>
        </div>
      </div>

      <header style={{ borderBottom: `1px solid ${C.rule}`, background: C.panel,
        padding: "18px 20px", display: "flex", flexWrap: "wrap", gap: 20,
        alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">Kerbal Space Program 1.12 · {
            ["Stock", hasMH && "Making History", hasRS && "ReStock+"]
              .filter(Boolean).join(" + ")}</div>
          <h1 className="disp" style={{ margin: "6px 0 0", fontSize: 34, fontWeight: 700, lineHeight: .95 }}>
            Mission&nbsp;<span style={{ color: dcolor }}>Δv</span>&nbsp;Planner
          </h1>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Stat label="Δv budget" value={fmt(budget)} unit="m/s" color={dcolor} />
          <div style={{ marginLeft: "auto", textAlign: "right", maxWidth: 340 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Save it as</div>
            <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 600, lineHeight: 1.25 }}>
              {craft.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{craft.sub}</div>
          </div>
          <Stat label="Liftoff mass" value={ok ? fmt(liftoff, 1) : "—"} unit="t" />
          <Stat label="Stages" value={ok ? stages.length : "—"} unit="" />
          <Stat label="Height" value={ok ? geom.h.toFixed(1) : "—"} unit="m" small />
          <Stat label="Aspect" value={ok ? geom.ar.toFixed(1) : "—"} unit=":1"
            color={ok && geom.ar > maxAspect ? C.amber : undefined} small />
          <Stat label="Cost" value={ok ? fmt(totalCost) : "—"} unit="funds" small />
          <Stat label="Parts" value={ok ? totalParts : "—"} unit="" small />
          <Stat label="Class" value={vehicleClass} unit="" small />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16,
        padding: 16, maxWidth: 1500, margin: "0 auto" }}>

        {/* ---------------------------- mission controls ---------------------------- */}
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Installed</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            {[["stock", "Stock"], ["mh", "Making History"], ["rs", "ReStock+"]].map(([k, lab]) => {
              const locked = k === "stock";
              return (
                <label key={k} style={{ display: "flex", gap: 6, alignItems: "center",
                  fontSize: 12.5, color: locked ? C.muted : C.paper,
                  cursor: locked ? "default" : "pointer" }}
                  title={locked ? "Always required" : undefined}>
                  <input type="checkbox" checked={locked ? true : expansions[k]} disabled={locked}
                    style={{ accentColor: dcolor }}
                    onChange={(e) => setExpansions((x) => ({ ...x, [k]: e.target.checked }))} />
                  {lab}
                  <span className="mono" style={{ fontSize: 10.5, color: C.dim }}>
                    {EXPANSION_PARTS[k]} parts</span>
                </label>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${C.rule}`, margin: "0 0 14px" }} />
            <button onClick={() => setShowTech(!showTech)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left" }}>
              <span className="eyebrow">Tech tree · {unlocked.size} of {Object.keys(DATA.nodes).length} nodes
                · {engines.length} engines, {tanks.length} tanks available
                {excluded.size > 0 && ` · ${excluded.size} part${excluded.size === 1 ? "" : "s"} excluded`}</span>
              <span style={{ color: C.dim, fontSize: 12, marginLeft: "auto" }}>{showTech ? "hide" : "edit"}</span>
            </button>
            {showTech && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <span style={{ fontSize: 11, color: C.dim, alignSelf: "center", marginRight: 4 }}>
                    Unlock through tier:</span>
                  {[1,2,3,4,5,6,7,8,9].map((l) => (
                    <button key={l} className="chip" onClick={() => setTier(l)}>{l}</button>
                  ))}
                  {excluded.size > 0 && (
                    <button className="chip" style={{ marginLeft: 8 }}
                      onClick={() => setExcluded(new Set())}>
                      clear {excluded.size} exclusion{excluded.size === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gap: 14,
                  gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
                  {Object.keys(TIERS).map((lvl) => (
                    <div key={lvl}>
                      {TIERS[lvl].some((n) => (NODE_PARTS[n] || []).length) && (
                        <div className="eyebrow" style={{ marginBottom: 6 }}>Tier {lvl}</div>
                      )}
                      {TIERS[lvl].filter((n) => (NODE_PARTS[n] || []).length).map((n) => {
                        const parts = NODE_PARTS[n] || [];
                        const on = unlocked.has(n);
                        const off = parts.filter((x) => excluded.has(x.name)).length;
                        const open = openNode === n;
                        return (
                          <div key={n} style={{ padding: "2px 0" }}>
                            <div style={{ display: "flex", gap: 7, alignItems: "flex-start",
                              fontSize: 12 }}>
                              <input type="checkbox" checked={on}
                                style={{ marginTop: 2, accentColor: dcolor }}
                                onChange={() => {
                                  /* Turning a node off rules out everything under it;
                                     turning it back on restores the lot, including parts
                                     ruled out individually beforehand. So the node box is
                                     always a clean sweep either way. */
                                  const turningOn = !on;
                                  setUnlocked((p2) => {
                                    const s2 = new Set(p2);
                                    if (turningOn) s2.add(n); else s2.delete(n);
                                    return withDeps(DATA.nodes, s2);
                                  });
                                  setExcluded((p2) => {
                                    const s2 = new Set(p2);
                                    (NODE_PARTS[n] || []).forEach((y) =>
                                      turningOn ? s2.delete(y.name) : s2.add(y.name));
                                    return s2;
                                  });
                                }} />
                              <span style={{ color: on ? C.paper : C.dim,
                                cursor: "pointer", flex: 1, lineHeight: 1.3 }}
                                onClick={() => setOpenNode(open ? null : n)}>
                                {n}
                                <span className="mono" style={{ fontSize: 9.5, color: C.dim, marginLeft: 5 }}>
                                  {on ? `${parts.length - off}/${parts.length}` : parts.length}
                                </span>
                              </span>
                            </div>
                            {open && (
                              <div style={{ margin: "3px 0 6px 20px", paddingLeft: 8,
                                borderLeft: `1px solid ${C.rule}` }}>
                                {parts.map((x) => {
                                  /* A tick here means the solver can use the part, which
                                     needs the node researched AND the part not ruled out.
                                     Showing these ticked under a locked node claimed parts
                                     were in play that were not. Ticking one now researches
                                     the node as well, so the box does what it says. */
                                  const live = on && !excluded.has(x.name);
                                  return (
                                    <label key={x.name} style={{ display: "flex", gap: 6,
                                      alignItems: "flex-start", fontSize: 11, padding: "1.5px 0",
                                      cursor: "pointer", color: live ? C.muted : C.dim }}>
                                      <input type="checkbox" checked={live}
                                        style={{ marginTop: 2, accentColor: dcolor }}
                                        onChange={() => {
                                          if (!on) {
                                            /* Cherry-pick: research the node but take only
                                               this part, holding the rest back. */
                                            setUnlocked((p2) => withDeps(DATA.nodes, new Set(p2).add(n)));
                                            setExcluded((p2) => {
                                              const s2 = new Set(p2);
                                              (NODE_PARTS[n] || []).forEach((y) => s2.add(y.name));
                                              s2.delete(x.name);
                                              return s2;
                                            });
                                          } else toggleExcluded(x.name);
                                        }} />
                                      <span style={{ flex: 1, lineHeight: 1.25,
                                        textDecoration: on && excluded.has(x.name) ? "line-through" : "none",
                                        opacity: on ? 1 : 0.6 }}>
                                        {x.name}
                                      </span>
                                    </label>
                                  );
                                })}
                                {!on && (
                                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                                    not researched — ticking one part takes just that part
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

          <div style={{ borderTop: `1px solid ${C.rule}`, margin: "16px 0 14px" }} />

          {/* Almost every mission starts at Kerbin, so the full sixteen-body picker
              is a lot of furniture for a choice nobody makes. Folded by default;
              the destination is the opposite, since that is the thing you came to
              change. */}
          <PickerHead label="Launching from" value={origin} open={showOrigin}
            onToggle={() => setShowOrigin(!showOrigin)} />
          {showOrigin && (
            <div style={{ marginBottom: 16 }}>
              {origin !== "Kerbin" && (
                <button className="chip" style={{ marginBottom: 8 }}
                  onClick={() => { setOrigin("Kerbin"); setCuts(null); }}>
                  ← back to Kerbin
                </button>
              )}
              <BodyPicker color={dcolor} value={origin}
                options={Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent)}
                onPick={(b) => {
                  setOrigin(b); setCuts(null);
                  const valid = new Set(["Low orbit", ...(hasSync(b) ? ["Stationary orbit"] : []),
                    ...(b === "Kerbin" ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
                                       : Object.keys(SYS).filter((x) => x !== "Sun" && x !== b))]);
                  if (!valid.has(dest)) setDest("Low orbit");
                }} />
            </div>
          )}
          {!showOrigin && <div style={{ marginBottom: 16 }} />}

          <PickerHead label="Mission" value={dest} open={showDest}
            onToggle={() => setShowDest(!showDest)} />
          {showDest ? (
            <div style={{ marginBottom: 16 }}>
              <BodyPicker color={dcolor} value={dest} options={destList}
                onPick={(d) => { setDest(d); setCuts(null); }} />
            </div>
          ) : <div style={{ marginBottom: 16 }} />}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {Object.entries(PROFILES).map(([k, v]) => (
              <button key={k} className="chip" data-on={k === effProfile ? 1 : 0}
                disabled={k === "land" && !canLand}
                title={k === "land" && !canLand ? `${dest} has no surface to land on` : v.note}
                onClick={() => setProfile(k)}>{v.name}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: C.rule, margin: "0 4px" }} />
            <button className="chip" data-on={returning ? 1 : 0}
              title={returning
                ? "Carries the fuel to come home again"
                : "One way — nothing is brought back"}
              onClick={() => setReturning(!returning)}>
              {returning ? "Return trip" : "One way"}
            </button>
          </div>
          {!orbitHere && !canLand && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10, marginBottom: 16 }}>
              {dest} has no surface to land on, so this is an orbital mission.
            </div>
          )}
          {orbitHere && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10, marginBottom: 16 }}>
              You are launching straight into this orbit, so there is no arrival to shape —
              nothing to fly by, capture into, or land on.
            </div>
          )}
          <div style={{ display: "grid", gap: 18,
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <Slider label="Payload delivered" value={payload} min={0.1} max={60} step={0.1} hardMax={2000}
              unit="t" onChange={setPayload}
              hint="Everything not counted as engine or tank: pod, probe, science, rover, cargo — and the lander's own kit, its legs and heat shield included." />
            <Slider label="Δv margin" value={margin} min={0} max={40} step={1} unit="%" hardMax={100}
              onChange={setMargin} hint="Reserve over the map value for inefficiency and correction burns." />
            {crossfeedOk && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                color: C.muted, margin: "8px 0" }}>
                <input type="checkbox" checked={asparagus}
                  onChange={(e) => setAsparagus(e.target.checked)} />
                Asparagus staging
                <span style={{ fontSize: 11, color: C.dim }}>
                  liquid side stacks feed the core and drop in pairs
                </span>
              </label>
            )}
            <Slider label="Payload width" value={payloadDia} min={0.625} max={5} step={0.625}
              unit="m" hardMax={10} onChange={setPayloadDia}
              hint="How wide the thing you are lifting actually is. It sets the drag the stack has to push through, and on a small rocket the payload is often the widest part of it." />
            <Slider label="Slenderness limit" value={maxAspect} min={6} max={30} step={0.5} unit=":1"
              hardMax={60} onChange={setMaxAspect}
              hint="Tallest the stack may be relative to its widest point, boosters excluded — they stage away inside the atmosphere and what is left has to stay pointed. A pencil wobbles, needs struts and flips under load." />
            <Slider label="Extra Δv" value={extraDv} min={0} max={1500} step={10} unit="m/s" hardMax={9000}
              onChange={setExtraDv}
              hint="A flat reserve added after the margin, carried on the top stage — for rendezvous, a contract you have not planned yet, or getting home when the map was optimistic." />
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Optimise for</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[["mass", "Lightest"], ["cost", "Cheapest"], ["parts", "Fewest parts"]].map(([k, lab]) => (
                  <button key={k} className="chip" data-on={objective === k ? 1 : 0}
                    onClick={() => setObjective(k)}>{lab}</button>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, lineHeight: 1.45 }}>
                Lightest minimises what leaves the pad. Cheapest gives up efficiency for
                price, taking plainer engines and carrying more propellant. Fewest parts
                favours self-contained boosters and the largest tanks that fit, and will
                accept a heavier rocket to save a part.
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Atmospheric descent</div>
              <button className="chip" data-on={needGimbal ? 1 : 0}
                title={needGimbal
                  ? "Stages flying through air must use a vectoring nozzle"
                  : "Fixed nozzles allowed everywhere — you will be steering on fins"}
                onClick={() => setNeedGimbal(!needGimbal)}>
                {needGimbal ? "Gimbal in atmosphere" : "Gimbal optional"}
              </button>
              <button className="chip" data-on={srbAvail && boosters ? 1 : 0} disabled={!srbAvail}
                style={srbAvail ? undefined : { opacity: 0.4, cursor: "default" }}
                title={srbAvail ? undefined : "No solid boosters researched yet"}
                onClick={() => srbAvail && setBoosters(!boosters)}>
                {boosters ? "Solid boosters allowed" : "Liquid only"}
              </button>
              <button className="chip" data-on={airDescent && chutes ? 1 : 0} disabled={!airDescent}
                style={airDescent ? undefined : { opacity: 0.4, cursor: "default" }}
                title={airDescent ? undefined : "Nothing on this route lands through an atmosphere"}
                onClick={() => airDescent && setChutes(!chutes)}>
                {chutes ? "Parachutes fitted" : "Powered descent only"}
              </button>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
                Cuts landing Δv to ~18% on Duna, Eve and Laythe. Add a heat shield to the payload mass.
              </div>
            </div>
          </div>
        </section>

        <Solving busy={busy} label={`Solving ${origin} → ${dest}…`}>
        {/* ---------------------------- route + stages ---------------------------- */}
        <div style={{ display: "grid", gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))" }}>

          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Route · read bottom to top</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Tap a <strong style={{ color: C.paper }}>scissor gap</strong> between stations to add or remove a
              staging event, and the whole mission is solved as one span until you add one.
              Cut where the hardware genuinely parts company — a lander left in orbit, a
              transfer stage dropped before descent — or where a segment will not close.
            </div>
            <RouteMap route={route} cuts={effCuts} onToggle={toggleCut} color={dcolor} stages={stages}
              onPlaneMode={setPlaneNow} />
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Vehicle · stage 1 at the bottom</div>
            {!ok && (
              <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 12,
                marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: C.rust }}>No solution for at least one stage.</strong>{" "}
                A single stock stage tops out near Isp·g₀·ln 9. Add a staging cut on the route, unlock a
                higher-Isp engine, or lower the payload.
              </div>
            )}
            <StageStack stages={stages} color={dcolor} splitBy={splitBy} onSetSplit={setSplit} />
          </section>
        </div>

        {ok && geom.ar > maxAspect && (
          <section className="card" style={{ padding: 14, borderColor: C.amber }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <strong style={{ color: C.amber }}>
                {geom.h.toFixed(0)} m on a {geom.w.toFixed(2)} m core — {geom.ar.toFixed(1)}:1.
              </strong>{" "}
              {geom.ar > 20
                ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
                : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
              <div style={{ color: C.muted, marginTop: 6 }}>
                Forcing a segment to fewer stages trades mass for a squatter stack — one stage
                instead of three is heavier but roughly half the aspect ratio. Optimising for cost
                or fewest parts also builds wider, since the cheap and the self-fuelled parts are
                the fat ones.
              </div>
            </div>
          </section>
        )}

        {/* ------------------------- ascent simulation ------------------------- */}
        {ascent && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Simulated ascent from Kerbin · real atmosphere, real Isp curves, integrated drag
            </div>
            <AscentPanel a={ascent} color={dcolor} />
          </section>
        )}
        {returnAscent && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Simulated ascent from {returnAscent.bodyName} · the climb home
            </div>
            <AscentPanel a={returnAscent} color={dcolor} />
          </section>
        )}

        {stages.some((x) => x.sol) && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Build · step through the staging
            </div>
            <BuildView stages={stages} payload={payload} color={dcolor} maxAspect={maxAspect} />
          </section>
        )}

        {/* ---------------------------- parts list ---------------------------- */}
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 3 }}>Parts list · build order</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
            Top of the stack first, working down to the pad — the order you assemble it in.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12,
            fontSize: 10.5 }}>
            {[["Engine", C.paper], ["Tank", C.muted], ["Adapter", C.violet],
              ["Decoupler", C.dim], ["Booster", C.mint], ["Mission hardware", C.sky]]
              .map(([lab, col]) => (
                <span key={lab} style={{ display: "flex", alignItems: "center", gap: 5, color: C.dim }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: col }} />
                  {lab}
                </span>
              ))}
          </div>
          <PartsTable stages={stages} payload={payload} hardware={hardware} color={dcolor} />
        </section>


        {/* Everything a run depends on, in one string. Pasting it back means we
            are looking at the same rocket rather than describing it to each other. */}
        <section className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {search && (
              <span className="mono" style={{ fontSize: 11, color: C.dim, marginRight: 4 }}>
                searched {fmt(search.stages + search.boosted)} stage designs across{" "}
                {fmt(search.chains)} stacks,{" "}
                {/* The counter records trajectories actually integrated. Ascents are
                    cached across solves, so a re-solve that reuses one legitimately
                    flies nothing new — which read as though the design had never
                    been flown at all. */}
                {search.flights > 0
                  ? <>flew {fmt(search.flights)} ascents, </>
                  : <>ascent reused from cache, </>}
                {(search.ms / 1000).toFixed(1)} s
              </span>
            )}
            <button className="chip" data-on={copied ? 1 : 0} onClick={copyConfig}>
              {copied ? "copied" : "Copy configuration"}
            </button>
            <button className="chip" data-on={pasteOpen ? 1 : 0}
              onClick={() => { setPasteOpen(!pasteOpen); setPasteNote(null); }}>
              Load configuration
            </button>
            {pasteNote && (
              <span style={{ fontSize: 11, color: pasteNote.bad ? C.rust : C.mint }}>
                {pasteNote.msg}
              </span>
            )}
            <span style={{ fontSize: 11, color: C.dim }}>
              Paste this into the chat and I can load the same build — every setting, the
              researched nodes and any parts you have ruled out.
            </span>
          </div>
          {pasteOpen && (
            <div style={{ marginTop: 10 }}>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a KSP-PLANNER configuration here"
                style={{ width: "100%", height: 70, fontSize: 10.5, fontFamily: "monospace",
                  background: C.ink, color: C.muted, border: `1px solid ${C.rule}`,
                  borderRadius: 3, padding: 8, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="chip" data-on={1} onClick={applyConfig}>Load it</button>
                <button className="chip" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {showConfig && (
            <textarea readOnly value={configText} onFocus={(e) => e.target.select()}
              style={{ width: "100%", height: 84, marginTop: 10, fontSize: 10.5,
                fontFamily: "monospace", background: C.ink, color: C.muted,
                border: `1px solid ${C.rule}`, borderRadius: 3, padding: 8, resize: "vertical" }} />
          )}
        </section>

        <footer style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, padding: "4px 2px" }}>
          Part masses, costs, tech nodes and Isp curves are read from KSP 1.12.5 configs — Squad, Breaking Ground
          and ReStock+. Making History is off by default because it is not installed. Atmospheres are the exact
          stock pressure and temperature splines, and Isp follows each engine's own atmosphereCurve, so a vacuum
          bell correctly produces nothing at Eve's surface. Ascents are flown, not estimated: an RK4 integration
          at 0.1 s searches a two-parameter gravity turn, with drag assembled the way KSP assembles it, from the
          curves and constants in Physics.cfg.{" "}
          <strong style={{ color: C.muted }}>Where it is still approximate:</strong> drag counts only the
          frontal area against one representative cube coefficient, so nothing is occluded, a nose cone buys
          nothing, and neither does a fairing. Staging is serial — no asparagus, which is why an Eve return does
          not close. Δv between bodies is a Hohmann transfer through the real orbital elements, ignoring the
          eccentricity and the launch window you actually get. Whether a design flies is judged by this
          simulator, not by the game.
        </footer>
        </Solving>
      </div>
    </div>
  );
}

/* ------------------------------- small pieces ------------------------------- */
function Stat({ label, value, unit, color, small }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={small ? "disp" : "mono"} style={{ fontSize: small ? 19 : 24, fontWeight: 600,
        color: color || C.paper, marginTop: 3, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: 12, color: C.muted, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  );
}

/* Slider for feel, typed entry for precision — 2.72 t for a Mk1-3 pod is not
   something you find by dragging. The field keeps a draft string while focused so
   half-typed values like "1." are not fought, and commits on blur or Enter.
   Typing above the slider's range is allowed up to a hard cap rather than being
   silently clamped; the slider just pins at its maximum. */
function Slider({ label, value, min, max, step, unit, onChange, hint, hardMax }) {
  const [draft, setDraft] = useState(null);
  const cap = hardMax ?? max;
  const commit = (raw) => {
    const v = parseFloat(raw);
    if (isFinite(v)) onChange(Math.min(cap, Math.max(min, v)));
    setDraft(null);
  };
  const over = value > max;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="eyebrow">{label}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <input
            className="mono"
            value={draft ?? value}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => { setDraft(String(value)); e.target.select(); }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }}
            style={{ width: 62, textAlign: "right", fontSize: 14, padding: "2px 5px",
              background: C.panel2, color: C.paper, borderRadius: 3,
              border: `1px solid ${over ? C.amber : C.rule}` }} />
          <span className="mono" style={{ fontSize: 12, color: C.muted }}>{unit}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, value)}
        onChange={(e) => onChange(parseFloat(e.target.value))} style={{ marginTop: 8 }} />
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
      {over && <div style={{ fontSize: 10.5, color: C.amber, marginTop: 3 }}>
        above the slider range — typed value in use</div>}
    </div>
  );
}

/* The signature element: the mission as a transit line you cut into stages. */
function RouteMap({ route, cuts, onToggle, color, stages, onPlaneMode }) {
  /* Which stage actually falls away at a cut. Every solved stage carries the route
     index its segment starts at, so the count through a cut is just the stages
     whose segment began at or before it. The label used to read off the cut's own
     ordinal, so the first cut always claimed "stage 1" even when four stages had
     already burned. */
  const stagesThrough = (i) => stages.filter((s) => s.sol && s.key <= i).length;
  const shown = route.filter((l) => !l.free);
  const rows = [...route].reverse();
  const cutIdx = [...cuts].sort((a, b) => a - b);

  return (
    <div>
      {rows.map((leg, ri) => {
        const i = route.length - 1 - ri;
        const last = i === shown.length - 1;
        const isCut = cuts.has(i);
        return (
          <div key={i}>
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10,
              alignItems: "center", minHeight: 34 }}>
              <div style={{ display: "flex", justifyContent: "center", position: "relative", height: 34 }}>
                <div style={{ width: 3, background: leg.free ? C.rule : color, height: "100%" }} />
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)",
                  width: 11, height: 11, borderRadius: "50%", background: C.ink,
                  border: `3px solid ${leg.free ? C.rule : color}` }} />
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.3,
                color: leg.free ? C.dim : C.paper }}>
                {leg.label}
                {leg.chuted && <span style={{ color: C.mint, fontSize: 10 }}> · chutes</span>}
                {/* The one leg whose cost is a choice rather than a number: pay it
                    in Δv now, or in waiting for a launch window. */}
                {leg.kind === "plane" && leg.cheap < leg.costly && (
                  <button className="chip" onClick={() => onPlaneMode(!leg.planeNow)}
                    style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px" }}
                    title={leg.planeNow
                      ? "Switch to timing the encounter at a node — far cheaper, but you wait for the window"
                      : "Switch to burning it out of low orbit — costs more, goes whenever you like"}>
                    {leg.planeNow ? "burning it now" : "timed at a node"}
                  </button>
                )}
                {leg.note && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{leg.note}</div>}
              </div>
              <div className="mono" style={{ fontSize: 13, color: leg.free ? C.dim : C.paper }}>
                {leg.dv === 0 ? "free" : `${fmt(leg.dv)}`}
              </div>
            </div>
            {!leg.free && !last && (
              <button onClick={() => onToggle(i)}
                aria-label={isCut ? "Remove staging event" : "Add staging event"}
                style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 10, width: "100%",
                  alignItems: "center", padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ width: isCut ? 22 : 3, height: isCut ? 3 : 12,
                    background: isCut ? C.amber : color, transition: ".15s" }} />
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
                  color: isCut ? C.amber : C.rule, fontFamily: "'IBM Plex Mono',monospace",
                  textAlign: "left" }}>
                  {isCut ? (stagesThrough(i) ? `▲ stage ${stagesThrough(i)} separates` : "▲ separates here")
                    : "cut here"}
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageStack({ stages, color, splitBy, onSetSplit }) {
  const max = Math.max(...stages.map((x) => x.sol?.total || 1));

  // stages arrive bottom-first; collect them back under the segment they serve
  const segs = [];
  stages.forEach((s, i) => {
    const last = segs[segs.length - 1];
    if (last && last.key === s.key) last.items.push({ s, n: i + 1 });
    else segs.push({ key: s.key, legs: s.legs, items: [{ s, n: i + 1 }] });
  });

  return (
    <div>
      {segs.slice().reverse().map((seg) => {
        const need = seg.items.reduce((a, x) => a + x.s.want, 0);
        const pick = splitBy.get(seg.key) || 0;
        return (
          <div key={seg.key} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
              flexWrap: "wrap", gap: 8, marginBottom: 8, paddingBottom: 5,
              borderBottom: `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>
                {seg.legs.map((l) => l.label.split(/[→(]/)[0].trim()).join(" · ")}
                <span className="mono" style={{ color: C.dim }}>{"  "}{fmt(need)} m/s</span>
              </span>
              <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span className="eyebrow" style={{ marginRight: 2 }}>stages</span>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <button key={k} className="chip" data-on={pick === k ? 1 : 0}
                    onClick={() => onSetSplit(seg.key, k)}
                    style={{ padding: "1px 7px", fontSize: 10.5, letterSpacing: 0 }}>
                    {k === 0 ? `auto (${seg.items.length})` : k}
                  </button>
                ))}
              </span>
            </div>

            {seg.items.slice().reverse().map(({ s, n }, i) => {
              const sol = s.sol;
              const w = sol ? Math.max(14, (sol.total / max) * 100) : 20;
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 5 }}>
                    <span className="disp" style={{ fontSize: 15, fontWeight: 600 }}>
                      Stage {n}
                      {s.subCount > 1 && <span style={{ color: C.dim, fontWeight: 400, fontSize: 11,
                        marginLeft: 7, textTransform: "none", letterSpacing: 0 }}>
                        {s.sub} of {s.subCount} in this segment</span>}
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: C.muted }}>
                      need {fmt(s.want)} m/s</span>
                  </div>
                  {sol ? (
                    <div style={{ background: C.panel2, border: `1px solid ${C.rule}`,
                      borderLeft: `3px solid ${color}`, borderRadius: 2, padding: "10px 12px" }}>
                      <div style={{ height: 6, background: C.rule, borderRadius: 1, marginBottom: 10 }}>
                        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 1 }} />
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        <strong>{sol.n}×</strong> {sol.engine.n}
                        {sol.tanks && <span style={{ color: C.muted }}>
                          {" + "}{sol.tanks.list.map((x) => `${x.c}× ${x.t.n}`).join(" + ")}</span>}
                      </div>
                      {sol.boosters && (
                        <div style={{ fontSize: 13, marginBottom: 8, color: C.mint }}>
                          + <strong>{sol.boosters.n}×</strong> {sol.boosters.part.n}
                          <span style={{ color: C.dim }}>
                            {"  radial · "}{fmt(sol.boosters.dv)} m/s, separate at T+{hms(sol.boosters.burn)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                        {/* Match the solver's own tolerance. It accepts a stage at
                            99.5% of its share — a solid cannot be tuned to hit a
                            number exactly — so flagging a strict shortfall painted
                            a stage red for being 0.1 m/s under. */}
                        {sol.stacks > 1 && (
                          <span style={{ fontSize: 11.5, color: C.mint, fontWeight: 600 }}>
                            core + {sol.stacks - 1} radial
                          </span>
                        )}
                        <Mini label="Δv" v={`${fmt(sol.dv)} m/s`}
                          good={sol.dv >= s.want * 0.995}
                          note={sol.dv < s.want
                            ? `${fmt(s.want - sol.dv)} m/s under its ${fmt(s.want)} m/s share`
                            : null} />
                        <Mini label="TWR" v={`${sol.twr.toFixed(2)} → ${sol.twrBurnout.toFixed(2)}`}
                          good={sol.twr >= s.twrMin} />
                        <Mini label="Isp" v={`${sol.isp} s`} />
                        <Mini label="Wet" v={`${fmt(sol.wet, 1)} t`} />
                        <Mini label="Prop" v={`${fmt(sol.prop, 1)} t`} />
                        <Mini label="Burn" v={hms(sol.burn)} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: C.panel2, border: `1px dashed ${C.rust}`, borderRadius: 2,
                      padding: "12px", fontSize: 12.5, color: C.muted }}>
                      No stack reaches {fmt(s.want)} m/s carrying {fmt(s.payloadIn, 1)} t.
                      Raise the stage count above, or unlock a higher-Isp engine — one stage
                      tops out at Isp·g₀·ln 9.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* Header for a body picker that can be folded away. Open, it offers a way to
   collapse; closed, it shows what is selected and a way back in. The two pickers
   differ only in where they start — origin closed, destination open. */
const PickerHead = ({ label, value, open, onToggle }) => (
  <div onClick={onToggle} title={open ? "Fold this away" : "Open the picker"}
    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
      marginBottom: open ? 10 : 0, userSelect: "none" }}>
    <span className="mono" style={{ color: C.dim, fontSize: 10, width: 9,
      display: "inline-block", transition: "transform .12s",
      transform: open ? "rotate(90deg)" : "none" }}>▶</span>
    <span className="eyebrow">{label}</span>
    {!open && (
      <>
        <span className="chip" data-on={1}>{value}</span>
        <span className="chip">elsewhere…</span>
      </>
    )}
  </div>
);

const Mini = ({ label, v, good, note }) => (
  <span style={{ fontSize: 11.5 }} title={note || undefined}>
    <span className="eyebrow" style={{ marginRight: 5 }}>{label}</span>
    <span className="mono" style={{ color: good === false ? C.rust : C.paper }}>{v}</span>
    {note && good !== false && <span style={{ color: C.dim, marginLeft: 4 }}>·</span>}
  </span>
);

function PartsTable({ stages, payload, hardware, color }) {
  /* Listed the way you build it: payload at the top, then each stage downward to
     the one standing on the pad. Within a stage the order is physical too —
     decoupler at its top, then tanks, then any adapter, then the engine, with
     radial boosters last since they hang off the side. Stage numbers therefore
     count down, which is also how the staging list reads in game. */
  const rows = [];
  const solved = stages.map((s, i) => ({ s, n: i + 1 })).filter((x) => x.s.sol);
  [...solved].reverse().forEach(({ s, n }) => {
    if (s.sol.decoupler && s.sol.decoupler.qty > 0) {
      const q = s.sol.decoupler.qty;
      rows.push({ stage: n, part: s.sol.decoupler.n, qty: q,
        each: s.sol.decoupler.m / q, tot: s.sol.decoupler.m, kind: "struct" });
    }
    if (s.sol.rejoin)
      rows.push({ stage: n, part: s.sol.rejoin.n + " (inverted)", qty: 1,
        each: s.sol.rejoin.m, tot: s.sol.rejoin.m, kind: "adapter" });
    if (s.sol.stacks > 1) {
      rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
        part: `— core + ${s.sol.stacks - 1} radial stacks, each of the following —` });
      if (s.sol.joiner)
        rows.push({ stage: n, part: `${s.sol.joiner.n} (holds a stack on, top and bottom)`,
          qty: 2, each: s.sol.joiner.m, tot: (s.sol.stacks - 1) * 2 * s.sol.joiner.m,
          kind: "struct" });
    }
    if (s.sol.packed) {
      const pk = s.sol.packed;
      rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
        part: `— ${pk.packedCount}× ${pk.tank.n} packed ${pk.r} around 1`
            + `${pk.levels > 1 ? `, ${pk.levels} levels` : ""}: ${pk.levels} on the centre column, `
            + `${pk.cols} radial at ${pk.r}× symmetry, crossfeed on so they drain together`
            + `${pk.spare ? `. The other ${pk.spare} stack${pk.spare > 1 ? "" : "s"} on the centre` : ""}`
            + `. Any smaller tanks stay stacked on the centre —` });
      rows.push({ stage: n, part: PACK_JOIN.n, qty: pk.cols,
        each: PACK_JOIN.m, tot: pk.cols * PACK_JOIN.m, kind: "struct" });
      rows.push({ stage: n, part: `${PACK_BRACE.n} (steadies each column)`, qty: pk.cols,
        each: PACK_BRACE.m, tot: pk.cols * PACK_BRACE.m, kind: "struct" });
    }
    /* With radial stacks the header says how many there are, so the rows below it
       are one stack's worth — quantities multiplied out under a header that
       already states the count read as though each stack needed all of them. */
    const S = s.sol.stacks || 1;
    /* Smallest at the top of the run, largest at the bottom — the order you would
       actually assemble them in, and the order a rocket wants structurally. */
    (S > 1 ? s.sol.perStack.list : s.sol.tanks ? s.sol.tanks.list : [])
      .slice().sort((a, b) => a.t.wet - b.t.wet)
      .forEach((x) => rows.push({ stage: n, part: x.t.n, qty: x.c, each: x.t.wet,
        tot: (S > 1 ? S : 1) * x.c * x.t.wet, kind: "tank" }));
    if (s.sol.coupler) {
      const pl = PLATE_SHROUD[s.sol.coupler.n];
      rows.push({ stage: n, qty: 1,
        each: s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m,
        tot: S * (s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m),
        kind: "adapter",
        part: s.sol.coupler.n + (pl
          ? ` · ${["", "Single", "Double", "Triple", "Quad"][s.sol.coupler.out] || s.sol.coupler.out + "-way"}`
            + (s.sol.shroud ? `, ${s.sol.shroud.v} shroud` : "")
          : "") });
    }
    s.sol.adapters?.parts.forEach((t) =>
      rows.push({ stage: n, part: t.n, qty: 1, each: t.wet, tot: t.wet, kind: "adapter" }));
    rows.push({ stage: n, part: s.sol.engine.n, qty: s.sol.n / S,   // per stack
      each: s.sol.engine.m, tot: s.sol.n * s.sol.engine.m, kind: "engine" });
    if (s.sol.boosters) {
      /* Decoupler first: it goes on the tank before the booster goes on it, and
         the list is meant to be read as a build order. */
      const b = s.sol.boosters;
      if (b.part.column)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: `— ${b.n} radial stacks, each of the following —` });
      else
        rows.push({ stage: n, part: "TT-38K Radial Decoupler", qty: b.n, each: 0.05,
          tot: b.n * 0.05, kind: "struct" });
      if (b.part.column)
        rows.push({ stage: n, part: "TT-38K Radial Decoupler", qty: 1, each: 0.05,
          tot: 0.05, kind: "struct" });
      if (b.part.dropTank)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: "— drop tanks, no engine on them: turn on crossfeed in the radial "
              + "decoupler's right-click menu, or run an FTX-2 fuel duct from each "
              + "into the core. Stage them off in pairs as they empty —" });
      else if (b.part.column && s.sol.asparagus)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: "— asparagus: turn on crossfeed in the radial decoupler's right-click "
              + "menu, or run a pair of FTX-2 fuel ducts from each stack to the one "
              + "inboard of it. Stage the pairs outermost first —" });
      if (b.part.column) {
        /* A column is a stack and is built like one: tanks first, engine at the
           bottom — the same order every other stage is listed in. Engine-then-
           tanks read as though the list ended on tankage with nothing under it. */
        b.part.column.list.slice().sort((a2, b2) => a2.t.wet - b2.t.wet)
          .forEach((x) => rows.push({ stage: n, part: x.t.n,
            qty: x.c, each: x.t.wet, tot: b.n * x.c * x.t.wet, kind: "booster" }));
        rows.push({ stage: n, part: b.part.n, qty: 1, each: b.part.dry - b.part.column.dryMass,
          tot: b.n * (b.part.dry - b.part.column.dryMass), kind: "booster" });
      } else {
        rows.push({ stage: n, part: b.part.n, qty: b.n, each: b.part.m, tot: b.n * b.part.m, kind: "booster" });
      }
    }
  });
  const th = { textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.rule}`,
    fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: C.dim,
    fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", borderBottom: `1px solid ${C.panel2}`, fontSize: 12.5 };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
        <thead><tr>
          <th style={th}>Stage</th><th style={th}>Part</th>
          <th style={{ ...th, textAlign: "right" }}>Qty</th>
          <th style={{ ...th, textAlign: "right" }}>Each&nbsp;t</th>
          <th style={{ ...th, textAlign: "right" }}>Total&nbsp;t</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{ ...td, color: C.dim }}>—</td>
            <td style={{ ...td, color: color, fontWeight: 600 }}>Payload (pod, probe, science, cargo)</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">1</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">{fmt(payload, 2)}</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">{fmt(payload, 2)}</td>
          </tr>
          {hardware && hardware.items.map((h, i) => (
            <tr key={"hw" + i}>
              <td style={{ ...td, color: C.dim }} className="mono"></td>
              <td style={{ ...td, color: C.sky, paddingLeft: 22 }}>
                ↳ {h.name}
                <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>{h.why}</span>
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">{h.qty}</td>
              <td style={{ ...td, textAlign: "right", color: C.dim }} className="mono">—</td>
              <td style={{ ...td, textAlign: "right", color: C.dim, fontSize: 11 }}>in payload</td>
            </tr>
          ))}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, color: C.muted }} className="mono">{r.stage}</td>
              <td style={{ ...td, color: r.kind === "engine" ? C.paper
                : r.kind === "booster" ? C.mint
                : r.kind === "adapter" ? C.violet
                : r.kind === "struct" ? C.dim
                : r.kind === "note" ? C.mint : C.muted,
                fontStyle: r.kind === "note" ? "italic" : "normal" }}>{r.part}</td>
              <td style={{ ...td, textAlign: "right" }} className="mono">{r.qty}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }} className="mono">
                {r.kind === "note" ? "" : fmt(r.each, 3)}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">
                {r.kind === "note" ? "" : fmt(r.tot, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The whole point of simulating is to hand back something flyable, so this is a
   flight card, not a readout: five steps in the order you do them. Numbering is
   load-bearing here — it really is a sequence. */

/* Bodies laid out the way the system is: one row per planet, ordered outward
   from the sun, its moons trailing to the right. Planets carry the visual
   weight — they are the choice you make first, and a moon only means anything
   once you have picked the planet it belongs to. */
/* Each body's tracking-station orbit line colour, straight out of the Kopernicus
   dump — these are the hues the map view actually draws. Several are dark enough
   that they need lifting to read as a border on a dark panel, and light enough
   when filled that the label has to flip to dark ink. */
const BODY_HUE = { Moho:"#EEB688", Eve:"#6C20E4", Gilly:"#A27E6E", Kerbin:"#8ACAC2",
  Mun:"#9CA0B4", Minmus:"#8E74A0", Duna:"#A33F28", Ike:"#858A9A", Dres:"#5A4432",
  Jool:"#548513", Laythe:"#44569C", Vall:"#6E9BB4", Tylo:"#D3AAAA", Bop:"#BAA07E",
  Pol:"#DCE4AC", Eeloo:"#686A6A" };
const rgbOf = (h) => [1,3,5].map((i) => parseInt(h.slice(i, i+2), 16));
const lumOf = (h) => { const [r,g,b] = rgbOf(h).map((v) => v/255);
  return 0.2126*r + 0.7152*g + 0.0722*b; };
const lift = (h, t) => "#" + rgbOf(h).map((v) =>
  Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
const hueFor = (b) => BODY_HUE[b] || C.sky;
const inkOn  = (h) => (lumOf(h) > 0.45 ? C.onLight : C.onDark);
const edgeOf = (h) => (lumOf(h) < 0.35 ? lift(h, 0.35) : h);

const SYSTEMS = [
  ["Moho", []], ["Eve", ["Gilly"]], ["Kerbin", ["Mun", "Minmus"]],
  ["Duna", ["Ike"]], ["Dres", []],
  ["Jool", ["Laythe", "Vall", "Tylo", "Bop", "Pol"]], ["Eeloo", []],
];

function BodyPicker({ options, value, onPick, color }) {
  // DEST calls it "Jool orbit" where SYS calls it "Jool", so match loosely
  const find = (b) => options.find((o) => o === b || o.startsWith(b + " "));
  const named = new Set();
  SYSTEMS.forEach(([pl, ms]) => [pl, ...ms].forEach((b) => { const o = find(b); if (o) named.add(o); }));
  const extras = options.filter((o) => !named.has(o));

  const planetBtn = (b, on, live) => { const h = hueFor(b); return {
    padding: "7px 11px", borderRadius: 3, minWidth: 84, textAlign: "left",
    fontFamily: "inherit", fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em",
    cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.4,
    background: on ? h : C.panel2, color: on ? inkOn(h) : C.paper,
    border: `1.5px solid ${on ? h : edgeOf(h)}`,
  }; };
  const moonBtn = (b, on) => { const h = hueFor(b); return {
    padding: "3px 9px", borderRadius: 3, fontFamily: "inherit", fontSize: 11.5,
    fontWeight: 400, cursor: "pointer",
    background: on ? h : "transparent", color: on ? inkOn(h) : C.muted,
    border: `1px solid ${on ? h : edgeOf(h)}`,
  }; };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {extras.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {extras.map((o) => (
            <button key={o} className="chip" data-on={o === value ? 1 : 0}
              onClick={() => onPick(o)}>{o}</button>
          ))}
        </div>
      )}
      {SYSTEMS.map(([pl, ms]) => {
        const po = find(pl), mo = ms.map((b) => [b, find(b)]).filter(([, o]) => o);
        if (!po && !mo.length) return null;
        return (
          <div key={pl} style={{ display: "flex", alignItems: "flex-start", gap: 7, flexWrap: "nowrap" }}>
            <button style={{ ...planetBtn(pl, po === value, !!po), flexShrink: 0 }}
              onClick={() => po && onPick(po)} disabled={!po}>{pl}</button>
            {mo.length > 0 && (
              <>
                <span style={{ color: C.rule, fontSize: 12, marginTop: 7 }}>─</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 0, marginTop: 4 }}>
                  {mo.map(([b, o]) => (
                    <button key={b} style={moonBtn(b, o === value)}
                      onClick={() => onPick(o)}>{b}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- build view -------------------------------
   Side and plan elevations of whatever the solver just produced, drawn from the
   same geometry the drag model uses so the picture and the physics cannot drift
   apart. Solid fuel is 7.5 kg per 5 litre unit, so a booster's casing length
   comes out of its fuel mass the same way a tank's does. */
/* Solid fuel is 7.5 kg per 5 litre unit, so 1.5 t per cubic metre. The grain
   alone left the small boosters far too stubby — a Flea came out at 0.6 m — so
   add a nozzle and closure allowance that scales with bore. Schematic, not
   exact: this lands within about 20% across Flea to Kickback. */
const srbLen = (part) => {
  const real = PART_H[part.n];
  if (real !== undefined) return real;
  const d = diaOf(part);
  return (part.fuelM / 1.5) / (Math.PI / 4 * d * d) + 0.7 * d;
};

function ringPositions(n) {
  const centre = (n === 1 || n === 5 || n === 7 || n === 9) ? 1 : 0;
  const ring = n - centre;
  const pts = centre ? [[0, 0]] : [];
  for (let i = 0; i < ring; i++) {
    const th = (i / ring) * 2 * Math.PI - Math.PI / 2;
    pts.push([Math.cos(th), Math.sin(th)]);
  }
  return pts;
}

function BuildView({ stages, payload, color, maxAspect = 14 }) {
  const solved = stages.filter((x) => x.sol);
  const [step, setStep] = useState(0);
  if (!solved.length) return null;

  const hasBoost = !!solved[0].sol.boosters;
  const steps = [{ label: "On the pad", drop: 0, boost: true }];
  if (hasBoost) steps.push({ label: "Boosters away · core burns on", drop: 0, boost: false });
  solved.forEach((_, i) => steps.push({
    label: i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
    drop: i + 1, boost: false }));
  const cur = steps[Math.min(step, steps.length - 1)];
  const live = solved.slice(cur.drop);

  // stack it bottom-up in metres
  const parts = [];
  let y = 0, wMax = Math.max(1, Math.cbrt(payload) * 1.2);
  live.forEach((st, i) => {
    const sol = st.sol;
    /* Same geometry the bounding box and the slenderness check use. Working it
       out again here is what let the drawing describe a different rocket. */
    const g = stageGeom(sol);
    const { td, ed, S, perEng } = g;
    const span = g.engineSpan;              // the engine block, not the tank ring
    const el = g.engine, tl = g.tank;
    if (el > 0) parts.push({ kind: "engine", y, h: el, w: span, n: perEng, ed, td, S });
    y += el;
    if (g.coupler > 0) {
      parts.push({ kind: "adapter", y, h: g.coupler, w: sol.coupler.top });
      y += g.coupler;
    }
    g.adapters.forEach((a2) => {
      parts.push({ kind: "adapter", y, h: a2.h, w: a2.w });
      y += a2.h;
    });
    /* A packed run is drawn band by band: any spare tanks sit on the centre
       column at their own width, then each level of the ring is one tank tall and
       as wide as the ring. Drawing the whole run as a single rectangle with two
       tanks stuck on the side described a shape that does not exist when the ring
       is more than one level deep. */
    if (tl > 0) {
      if (g.pack) {
        const pk = g.pack;
        const spareH = pk.spare * pk.levelH;
        const rest = tl - spareH - pk.levels * pk.levelH;
        if (rest > 0.01) { parts.push({ kind: "tank", y, h: rest, w: td, S }); y += rest; }
        for (let L = 0; L < pk.levels; L++) {
          parts.push({ kind: "tank", y, h: pk.levelH, w: td, S,
            pack: { r: pk.r, w: pk.w, td: pk.td } });
          y += pk.levelH;
        }
        if (spareH > 0.01) { parts.push({ kind: "tank", y, h: spareH, w: td, S }); y += spareH; }
        y -= tl;                            // the common y += tl below adds it back
      } else {
        parts.push({ kind: "tank", y, h: tl, w: td, S, pack: null });
      }
    }
    y += tl;
    if (sol.decoupler) {
      const dh = g.decoupler;      // shared with stageSize, not recomputed
      parts.push({ kind: "struct", y, h: dh, w: td });
      y += dh;
    }
    if (i === 0 && cur.boost && sol.boosters) {
      /* A liquid column is drawn at its tank diameter and its real stacked
         height, not the engine's — an SRB is one part, a column is a stack. */
      const bo = sol.boosters;
      const bd = bo.part.column ? diaOf(bo.part.column.list[0].t) : widthOf(bo.part, diaOf(bo.part));
      const bl = bo.part.column
        ? tankStackLen(bo.part.column) + engineLen(bo.part)
        : srbLen(bo.part);
      // they sit on the pad alongside the core, nozzles roughly level
      parts.push({ kind: "booster", y: 0, h: bl, w: bd, n: bo.n, core: td });
    }

  });
  const geo = stackGeometry(stages, payload);
  const payD = Math.max(0.9, Math.cbrt(payload) * 1.1);
  parts.push({ kind: "payload", y, h: payD * 1.3, w: payD });
  /* Measure both axes from what is actually drawn. Deriving an extent separately
     from the parts let the two disagree: anything wider than the estimate ran off
     the side, and a booster taller than the stage it is strapped to ran off the
     top, since the height came from the stack alone. */
  const H = parts.reduce((mx, q) => Math.max(mx, q.y + q.h), 0);
  wMax = 2 * parts.reduce((mx, q) => Math.max(mx,
    q.kind === "booster" ? q.core / 2 + q.w
    : q.pack ? q.pack.w / 2
    : q.S > 1 ? q.w / 2 + q.w * 1.02
    : q.w / 2), 0);

  // ---- side elevation ----
  const SH = 300, pad = 10;
  const scale = Math.min((SH - 2 * pad) / H, 150 / wMax);
  const sw = wMax * scale + 2 * pad, sh = H * scale + 2 * pad;
  const px = (v) => v * scale;
  const fill = { tank: C.tank, engine: C.engine, booster: color, payload: C.payloadFill,
    adapter: C.violet, struct: C.dim };

  const sideParts = [];
  parts.forEach((q, i) => {
    const yTop = sh - pad - px(q.y + q.h);
    if (q.kind === "booster") {
      // one ring, drawn as the two you would see side-on
      const xs = [sw / 2 - px(q.core / 2) - px(q.w), sw / 2 + px(q.core / 2)];
      xs.forEach((x, j) => sideParts.push(
        <rect key={`b${i}-${j}`} x={x} y={yTop} width={px(q.w)} height={px(q.h)}
          rx={px(q.w) / 3} fill={fill.booster} opacity={0.9}
          stroke={C.edge} strokeWidth="0.8" />));
      sideParts.push(
        <text key={`bn${i}`} x={sw / 2 + px(q.core / 2 + q.w / 2)} y={yTop - 3}
          textAnchor="middle" fontSize="8" fill={color} fontFamily="monospace">{q.n}×</text>);
      return;
    }
    sideParts.push(<rect key={i} x={sw / 2 - px(q.w) / 2} y={yTop}
      width={px(q.w)} height={px(q.h)} rx={q.kind === "payload" ? px(q.w) / 4 : 1.5}
      fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" />);
    /* the other columns of a parallel stage, drawn either side of the middle */
    /* Outer stacks ring the core, so from the side you see the two widest of
       them flanking it — drawing every one in a row would be a lie about the
       width. */
    /* A packed tank block is a centre column with a ring around it, so from the
       side you see the two nearest ring tanks flanking the middle — the same way
       parallel stacks are drawn, and for the same reason. */
    if (q.pack) for (let c = 1; c <= 2; c++) {
      const off = (c % 2 ? 1 : -1) * (q.pack.w - q.pack.td) / 2;
      sideParts.push(<rect key={`${i}k${c}`} x={sw / 2 - px(q.pack.td) / 2 + px(off)}
        y={yTop} width={px(q.pack.td)} height={px(q.h)} rx={1.5}
        fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
    }
    if (q.S > 1) for (let c = 1; c <= Math.min(2, q.S - 1); c++) {
      const off = (c % 2 ? 1 : -1) * q.w * 1.02;
      sideParts.push(<rect key={`${i}p${c}`} x={sw / 2 - px(q.w) / 2 + px(off)}
        y={sh - pad - px(q.y) - px(q.h)} width={px(q.w)} height={px(q.h)} rx={1.5}
        fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
    }
    if (q.kind === "engine" && q.n > 1) sideParts.push(
      <text key={`n${i}`} x={sw / 2} y={yTop + px(q.h) / 2 + 3} textAnchor="middle"
        fontSize="9" fill={C.onLight} fontFamily="monospace" fontWeight="700">{q.n}×</text>);
  });

  // ---- plan view: widest live stage, plus any boosters ----
  const bottom = live[0] && live[0].sol;
  const PS = 150, planPayD = payD;
  const plan = [];
  if (bottom) {
    const td = bottom.tanks ? diaOf(bottom.tanks.list[0].t) : diaOf(bottom.engine);
    const ed = widthOf(bottom.engine, diaOf(bottom.engine));
    const S = bottom.stacks || 1;
    /* The plan's own extent: the ring of stacks reaches td from the middle plus
       its own radius, and boosters sit outside that again. Reusing the side
       elevation's width clipped whichever view was the wider of the two. */
    const bd0 = (cur.boost && bottom.boosters)
      ? (bottom.boosters.part.column ? diaOf(bottom.boosters.part.column.list[0].t)
        : widthOf(bottom.boosters.part, diaOf(bottom.boosters.part))) : 0;
    /* Reach has to cover whichever sticks out furthest. A cluster wider than the
       tank it sits under does, and it was not counted — so dropping the boosters
       shrank the estimate to the tank radius and the engine ring spilled over the
       edge. */
    const perEng0 = bottom.n / S;
    const clusterReach = Math.max(td, clusterSpan(perEng0, ed)) / 2;
    const reach = Math.max(
      (S > 1 ? td : 0) + clusterReach,
      bd0 ? (S > 1 ? td : td / 2) + bd0 : 0,
      bottom.packed ? bottom.packed.width / 2 : 0,
      planPayD / 2);
    const ps = (PS - 16) / (2 * reach);
    /* Where a stage runs parallel columns the plan is the arrangement seen from
       above: two side by side, three in a triangle. Each carries its own engines,
       so the cluster ring is drawn per column. */
    /* One in the middle, the rest evenly around it — the arrangement you get
       from radial symmetry in the VAB. */
    /* Start the ring at the right and work round, so the first pair sits left and
       right — which is the pair the side elevation draws. Starting at the top put
       the plan out of step with the elevation for no reason. */
    const centres = [[0, 0]];
    for (let i = 0; i < S - 1; i++) {
      const th = (i / (S - 1)) * 2 * Math.PI;
      centres.push([Math.cos(th) * td, Math.sin(th) * td]);
    }
    const perEng = bottom.n / S;
    const rr = (clusterSpan(perEng, ed) - ed) / 2 * ps;
    /* The plan is the view looking up from underneath, so it is drawn back to
       front: whatever sits highest goes down first and the engines, nearest the
       viewer, go last. Any packed tank ring is above the engines, so it belongs
       in that first pass. */
    const pk = bottom.packed;
    centres.forEach(([ox, oy], c) => {
      const X = PS / 2 + ox * ps, Y = PS / 2 + oy * ps;
      plan.push(<circle key={`core${c}`} cx={X} cy={Y} r={td / 2 * ps}
        fill={fill.tank} stroke={C.edge} strokeWidth="0.9" />);
      if (pk) {
        const rk = (pk.width - diaOf(pk.tank)) / 2 * ps;
        for (let i = 0; i < pk.r; i++) {
          const th = (i / pk.r) * 2 * Math.PI;    // right first, matching the elevation
          plan.push(<circle key={`k${c}_${i}`} cx={X + Math.cos(th) * rk}
            cy={Y + Math.sin(th) * rk} r={diaOf(pk.tank) / 2 * ps}
            fill={fill.tank} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
        }
      }
    });
    /* Engines last: they are the closest thing to you looking up the stack. */
    centres.forEach(([ox, oy], c) => {
      const X = PS / 2 + ox * ps, Y = PS / 2 + oy * ps;
      ringPositions(perEng).forEach(([cx, cy], i) => plan.push(
        <circle key={`e${c}_${i}`} cx={X + cx * rr} cy={Y + cy * rr} r={ed / 2 * ps}
          fill={fill.engine} stroke={C.edge} strokeWidth="0.8" />));
    });
    if (cur.boost && bottom.boosters) {
      const b = bottom.boosters;
      const bd = b.part.column ? diaOf(b.part.column.list[0].t) : widthOf(b.part, diaOf(b.part));
      const br = ((S > 1 ? td : td / 2) + bd / 2) * ps;
      for (let i = 0; i < b.n; i++) {
        const th = (i / b.n) * 2 * Math.PI;      // right first, matching the elevation
        plan.push(<circle key={`b${i}`} cx={PS / 2 + Math.cos(th) * br}
          cy={PS / 2 + Math.sin(th) * br} r={bd / 2 * ps}
          fill={fill.booster} opacity={0.75} stroke={C.rule} strokeWidth="0.6" />);
      }
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        {steps.map((st, i) => (
          <button key={i} className="chip" data-on={i === Math.min(step, steps.length - 1) ? 1 : 0}
            onClick={() => setStep(i)}>{st.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "nowrap", alignItems: "flex-end", overflowX: "auto" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Elevation</div>
          <svg width={Math.max(sw, 60)} height={sh} style={{ overflow: "visible" }}>{sideParts}</svg>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Plan</div>
          <svg width={PS} height={PS}>
            <circle cx={PS / 2} cy={PS / 2} r={(PS - 16) / 2} fill="none"
              stroke={C.rule} strokeDasharray="2 3" />
            {plan}
          </svg>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 12,
        fontFamily: "monospace", fontSize: 11.5, color: C.muted }}>
        <span>{live.length} stage{live.length === 1 ? "" : "s"} attached</span>
        {/* Report the shared figure, not the drawing's own bounds — the sketch
            shows only the stages still attached at this step, so its extent
            changes as you page through the staging and is not the vehicle's. */}
        <span>{geo.h.toFixed(1)} m tall</span>
        <span>{geo.w.toFixed(2)} m across</span>
        <span style={{ color: geo.ar > maxAspect ? C.amber : C.muted }}>
          {geo.ar.toFixed(1)}:1 aspect
        </span>
      </div>
    </div>
  );
}

/* Everything downstream of the solve gets veiled while it runs. A bar pinned to
   the top of the page was the obvious idea and the wrong one: an artifact is an
   iframe sized to its content, so the parent page scrolls and nothing inside can
   stay in view. Marking the panels themselves works wherever you happen to be
   looking. */
function Solving({ busy, children, label }) {
  /* Both layers stay mounted and animate opacity, so the veil can fade out slowly
     instead of blinking away. Dimming is quick — you want to see it react — while
     coming back is gentle, which stops a fast recalculation from flashing. */
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "sticky", top: 12, height: 0, zIndex: 40,
        display: "flex", justifyContent: "center", pointerEvents: "none",
        opacity: busy ? 1 : 0,
        transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9,
          background: C.panel2, border: `1px solid ${C.amber}`, borderRadius: 3,
          padding: "8px 14px", boxShadow: "0 4px 18px rgba(0,0,0,.6)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: C.amber,
            animation: busy ? "pulse 1s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>{label}</span>
        </div>
      </div>
      <div style={{ opacity: busy ? 0.22 : 1, filter: busy ? "grayscale(1)" : "none",
        transition: busy ? "opacity .08s ease-out, filter .08s ease-out"
                         : "opacity .7s ease-in, filter .7s ease-in",
        pointerEvents: busy ? "none" : "auto" }}>
        {children}
      </div>
    </div>
  );
}

function AscentPanel({ a, color }) {
  const atm = (a.veh.atmo.p(0) / 101.325).toFixed(2);
  if (!a.ok) {
    const m0 = a.veh.stages.reduce((t, x) => t + x.wet + (x.boosters ? x.boosters.n * x.boosters.wet : 0), 0) + a.veh.payload;
    return (
      <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 13, fontSize: 13, lineHeight: 1.55 }}>
        <strong style={{ color: C.rust }}>This design never reaches orbit from {a.bodyName}.</strong>{" "}
        No pitch programme gets {fmt(m0, 1)} t up to {Math.round(a.target / 1000)} km.
        <div style={{ color: C.muted, marginTop: 7 }}>
          The stages above were sized on vacuum Isp, but {a.bodyName} sits at {atm} atm on the
          surface, where engines deliver a fraction of their rated thrust and efficiency. The Δv
          map figure already assumes losses the rocket equation on its own cannot see. Add stages,
          choose engines with a flatter Isp curve, or expect a far heavier vehicle than the parts
          list suggests.
        </div>
      </div>
    );
  }
  const handed = a.handT >= 0;
  const hot = a.maxQ > 40000;
  const limited = a.limit && a.limit < 0.999;
  const cored = a.core && a.core < 0.999;
  /* TWR of the stage that has to finish the job, at the moment it lights. Below
     1.0 the ascent is unforgiving and the flight card should say so. */
  /* The two numbers side by side: what this flight costs, and what the rocket
     has. They used to be a map estimate and a simulated cost with nothing tying
     them together, so a vehicle built to 3 740 could sit next to a 4 062 flight
     and look fine. */
  const lowUpper = (() => {
    const st = a.veh && a.veh.stages[a.veh.stages.length - 1];
    if (!st) return null;
    const m = st.wet + a.veh.payload;
    const twr = st.mdot * st.isp(0) * 9.80665 / (m * a.veh.body.g0);
    return twr < 1 ? twr : null;
  })();
  const limitOn = a.veh.stages[0] && a.veh.stages[0].boosters ? "the boosters" : "the first stage";
  const steps = [
    ...(limited ? [[`Set ${limitOn} to ${Math.round(a.limit * 100)}% thrust`,
      "in the VAB, before you launch"]] : []),
    ...(cored ? [[`Fly the core at ${Math.round(a.core * 100)}% throttle`,
      "boosters stay at full — they cannot be throttled"]] : []),
    [a.bodyName === "Kerbin" ? "Full throttle, release the clamps" : "Full throttle, lift off", "straight up, SAS on"],
    [`At ${a.vKick} m/s, pitch ${a.kick}° east`, "then hold that attitude"],
    handed
      ? [`Hold it until T+${hms(a.handT)}`,
         `the prograde marker rises to meet your nose at ~${Math.round(a.handV)} m/s, ${(a.handAlt / 1000).toFixed(1)} km — switch SAS to prograde then`]
      : ["Hold that attitude all the way up", "prograde never catches your nose on this one"],
    /* The achieved apoapsis, not the target — drag on the way out of the air
       costs some of it — and the time the engine actually stops, not the moment
       the integration hands over to the coast. */
    [`Cut engines at T+${hms(a.tMeco != null ? a.tMeco : a.t)}`,
      `apoapsis will settle at ${(a.apo / 1000).toFixed(1)} km`],
    [`Coast ${a.tApo != null && a.tMeco != null
        ? hms(a.tApo - a.tMeco) : ""} to apoapsis`,
      a.tApo ? `apoapsis at T+${hms(a.tApo)} — warp through it` : "nothing to fly"],
    [`Circularise with ${fmt(a.circ)} m/s, held level`,
      a.circBurn
        ? (a.circBurn < 4
            ? `a ${a.circBurn.toFixed(1)} second tap right on the mark`
            : `${hms(a.circBurn)} of burn — start it ${hms(a.circBurn / 2)} early so it straddles apoapsis`)
        : "circularised"],
  ];
  const box = { background: C.panel2, border: `1px solid ${C.rule}`, borderRadius: 3, padding: "10px 12px" };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8, marginBottom: 14 }}>
        {steps.map(([main, sub], i) => (
          <div key={i} style={{ ...box, borderLeft: `3px solid ${i === 1 || i === 2 ? color : C.rule}` }}>
            <div className="mono" style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>{i + 1}</div>
            <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 3 }}>{main}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 26px", marginBottom: hot ? 12 : 0 }}>
        <Stat label="Ascent costs" value={fmt(a.total)} unit="m/s" color={color} />
        {a.carried != null && (
          <Stat label="Vehicle carries" value={fmt(a.carried)} unit="m/s"
            color={a.carried >= a.total ? C.mint : C.rust} />
        )}
        <Stat label="Gravity loss" value={fmt(a.gLoss)} unit="m/s" small />
        <Stat label="Drag loss" value={fmt(a.dLoss)} unit="m/s" small />
        <Stat label="Steering loss" value={fmt(a.sLoss)} unit="m/s" small />
        <Stat label="Max Q" value={(a.maxQ / 1000).toFixed(1)} unit={`kPa at ${(a.maxQalt / 1000).toFixed(1)} km`} small />
        <Stat label="Peak Mach" value={a.maxMach.toFixed(2)} unit="" small />
      </div>

      {a.circBurn > 90 && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
          That circularisation runs {Math.round(a.circBurn)} s on a low-thrust stage. Centring it
          still helps, but over a burn that long the apoapsis drifts while you push — expect to
          arrive slightly elliptical and trim it on the next pass.
        </div>
      )}
      {a.circShort && (
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 12, lineHeight: 1.5 }}>
          The stage that reaches orbit runs dry partway through this burn — the timing above
          assumes it continues on the stage above.
        </div>
      )}
      {a.marks && a.marks.length > 2 && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 3, padding: 11, marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Fly this profile</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em" }}>
                <th style={{ textAlign: "left", padding: "0 0 5px" }}>T+</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Navball pitch</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Speed</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Altitude</th>
              </tr>
            </thead>
            <tbody>
              {a.marks.map((w, i) => (
                <tr key={i} style={{ borderTop: w.meco || w.apoMark ? `1px solid ${C.rule}` : "none" }}>
                  <td className="mono" style={{ padding: "3px 0",
                    color: w.meco || w.apoMark ? color : C.paper }}>
                    {hms(w.t)}{w.meco ? " · cutoff" : w.apoMark ? " · apoapsis" : ""}
                  </td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right",
                    color: w.coast ? C.dim : color, fontWeight: w.coast ? 400 : 600 }}>
                    {w.apoMark ? "burn level"
                      : w.coast ? "coast"
                      : w.nav >= 0 ? `${w.nav}° up` : `${-w.nav}° down`}
                  </td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right", color: C.muted }}>{w.v} m/s</td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right", color: C.dim }}>
                    {(w.h / 1000).toFixed(1)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
            Pitch is degrees above the horizon on the navball, flying east — fly the clock,
            not the altimeter. A shallow upper stage will level off and may nose slightly
            below the horizon while it builds horizontal speed, so altitude stops rising
            monotonically near the end and is a poor thing to steer by. If you are slow at
            a given time you are climbing too steeply: pitch further down rather than
            waiting for prograde to come to you. After cutoff there is nothing to fly until
            apoapsis; start the circularisation half its duration early so it straddles the
            mark. Hold that burn level — 0° on the navball — rather than on prograde. A long
            circularisation lifts you as it runs, so prograde tilts upward and following it
            pushes apoapsis ahead of you instead of raising periapsis behind you. Level is
            the attitude that closes the orbit.
            The circularisation figure below assumes you arrive at apoapsis on this
            profile — a few hundred m/s short there costs far more than that to fix.
          </div>
        </div>
      )}
      {lowUpper && (
        <div style={{ border: `1px solid ${C.amber}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.amber }}>Upper stage cannot hover.</strong>{" "}
          It lights at TWR {lowUpper.toFixed(2)}, so it will not hold altitude pointed
          upward — it has to be flown nearly level to build speed. If you keep following
          prograde while still climbing steeply it will bleed the whole stage climbing and
          arrive at apoapsis far too slow to circularise.
        </div>
      )}
      {cored && (
        <div style={{ border: `1px solid ${C.mint}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.mint }}>
            Hold the core at {Math.round(a.core * 100)}% until the boosters burn out.
          </strong>{" "}
          Solids have no shutdown, so at full throttle this stack carries its apoapsis
          well past the mark before you can stop it. Throttling the liquid core lands
          the two together and is worth about {fmt(Math.round((a.fullThrottle || 0) - a.total))} m/s.
        </div>
      )}
      {limited && (
        <div style={{ border: `1px solid ${C.mint}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.mint }}>
            Throttled to {Math.round(a.limit * 100)}% on {limitOn}.
          </strong>{" "}
          At full thrust this stack passes 40 kPa, where a real one tends to flip or shed
          parts. Right-click the part in the VAB and drag the thrust limiter — it cuts fuel
          flow with the thrust, so the stage simply burns longer at lower thrust and loses
          no Δv. Peak now {(a.maxQ / 1000).toFixed(0)} kPa.
        </div>
      )}
      {hot && (
        <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 11, fontSize: 12.5, lineHeight: 1.5 }}>
          <strong style={{ color: C.rust }}>
            Nothing stays under 40 kPa — peak is {(a.maxQ / 1000).toFixed(0)} kPa at {(a.maxQalt / 1000).toFixed(1)} km.
          </strong>{" "}
          {Number(atm) > 1.5 ? (
            <>That is {a.bodyName} rather than your rocket: {atm} atm at the surface makes high dynamic
            pressure unavoidable, and this is the gentlest trajectory that still reaches orbit. Treat
            the drag figure as indicative — it is well outside where the model was checked against
            Kerbin ascents.</>
          ) : (
            <>This vehicle is over-thrusted for the air it climbs through, where a real stack tends to
            flip or shed parts. Drop a booster, throttle the first stage back, or fly a shallower turn
            and accept the extra gravity loss.</>
          )}
        </div>
      )}

      <div className="mono" style={{ fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.7 }}>
        Atmosphere is {a.bodyName}'s own stock pressure and temperature spline — {atm} atm at the
        surface. Density and speed of sound fall straight out of it with nothing fitted. Isp follows a three-key
        curve pinned to the vacuum and sea-level figures. Drag takes the widest cross-section still
        attached plus any live boosters, on the stock transonic Cd hump — that part is an
        approximation, since the game bakes drag cubes per part and occludes them by how you stack.
      </div>
    </div>
  );
}

/* ---------------------------- exports for testing ----------------------------
   Re-exported from core/ so the tests keep one import path while the split
   proceeds. Once test/ imports from core/ directly this block can go. */
export {
  DATA,
  BODY,
  withDeps,
  solveStage,
  solveGroup,
  boostedAscent,
  resetTally,
};

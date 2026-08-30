import { useState, useMemo, useEffect, useRef } from "react";
import { solve, cancelSolve } from "./solver-client.js";
import { buildVehicleFor, simCached } from "../core/ascent.js";
import { orbitAlt } from "../core/atmosphere.js";
import { DATA } from "../core/catalogue.js";
import { stackGeometry } from "../core/geometry.js";
import {
  DEST,
  PROFILES,
  SYS,
  bodyKey,
  buildRoute,
  defaultCuts,
  hasSync,
} from "../core/orbits.js";
import { missionHardware } from "../core/parts.js";
import { stageCost, stageParts } from "../core/performance.js";
import { NODE_PARTS, TIERS, withDeps } from "../core/tech.js";
import {
  AscentPanel,
  BuildView,
  PartsTable,
  StageStack,
} from "./components/build.jsx";
import { PickerHead, Slider, Solving, Stat } from "./components/controls.jsx";
import { BodyPicker, RouteMap } from "./components/route.jsx";
import { parseConfig } from "./config.js";
import { craftName, fmt } from "./format.js";
import { loadRoster, saveRoster } from "./storage.js";
import { BODY_HUE, C, edgeOf } from "./tokens.js";
import type { Objective } from "../core/performance.js";
import type { PlanStage } from "../core/plan.js";
import type { Tally } from "../core/tally.js";
import type { Ascent } from "./components/build.jsx";

/* What the last solve cost, as the footer reports it: the search counters the
   solver kept, how many threads it had, and how long it took. */
type SearchStats = Tally & { threads: number; ms: number };

/* Where the parts come from, and what to call each. Stock is always on — it is
   the game — which is what `locked` reads below. */
const PART_SOURCES: ReadonlyArray<["stock" | "mh" | "rs", string]> = [
  ["stock", "Stock"],
  ["mh", "Making History"],
  ["rs", "ReStock+"],
];

/* What the search is asked to minimise, and what to call each. */
const OBJECTIVES: ReadonlyArray<[Objective, string]> = [
  ["mass", "Lightest"],
  ["cost", "Cheapest"],
  ["parts", "Fewest parts"],
];

export default function KSPMissionPlanner() {
  const [origin, setOrigin] = useState("Kerbin");
  const [dest, setDest] = useState("Mun");
  const [profile, setProfile] = useState("land");
  const [returning, setReturning] = useState(true); // most missions are meant to come home
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
  const [objective, setObjective] = useState<Objective>("cost");
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
  const hasMH = expansions.mh,
    hasRS = expansions.rs;
  const [splitBy, setSplitBy] = useState(() => new Map<number, number>());
  const [unlocked, setUnlocked] = useState(() =>
    withDeps(
      DATA.nodes,
      new Set(
        Object.entries(DATA.nodes)
          .filter(([, v]) => v.lvl <= 5)
          .map(([k]) => k),
      ),
    ),
  );
  const [cuts, setCuts] = useState<Set<number> | null>(null); // null = follow defaultCuts
  const [showTech, setShowTech] = useState(false);
  const [showOrigin, setShowOrigin] = useState(false);
  const [showDest, setShowDest] = useState(true);
  const [excluded, setExcluded] = useState(() => new Set<string>()); // parts the user has ruled out
  /* The part roster is setup, not a per-session choice: it describes your install
     and what you have researched, and retyping it every time would be tedious.
     Where it is kept depends on the host — see ui/storage.js. Mission settings
     are deliberately not saved; those you do want to change run to run. */
  const [hydrated, setHydrated] = useState(false);
  /* Asparagus needs fuel to cross from a dropped stack into the core. A radial
     decoupler will do it — crossfeed is a right-click toggle on the TT-38K, which
     arrives with Stability — and a pair of fuel ducts is the alternative. Until
     one of those is researched the option is not offered, because the build is
     not possible. */
  const crossfeedOk = useMemo(
    () =>
      unlocked.has("Stability") ||
      unlocked.has("Advanced Construction") ||
      unlocked.has("Fuel Systems"),
    [unlocked],
  );
  useEffect(() => {
    let live = true;
    (async () => {
      const v = await loadRoster();
      if (live && v) {
        if (Array.isArray(v.unlocked))
          setUnlocked(withDeps(DATA.nodes, new Set(v.unlocked)));
        if (Array.isArray(v.excluded)) setExcluded(new Set(v.excluded));
        if (v.expansions) setExpansions(v.expansions);
        if (typeof v.needGimbal === "boolean") setNeedGimbal(v.needGimbal);
      }
      if (live) setHydrated(true);
    })();
    return () => {
      live = false;
    };
  }, []);
  const [openNode, setOpenNode] = useState<string | null>(null);
  const toggleExcluded = (n: string) =>
    setExcluded((p) => {
      const s2 = new Set(p);
      s2.has(n) ? s2.delete(n) : s2.add(n);
      return s2;
    });

  const orbitHere = dest === "Low orbit" || dest === "Stationary orbit";

  const destList = useMemo(() => {
    const here = ["Low orbit"];
    if (hasSync(origin)) here.push("Stationary orbit");
    const rest =
      origin === "Kerbin"
        ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
        : Object.keys(SYS).filter((b) => b !== "Sun" && b !== origin);
    return [...here, ...rest];
  }, [origin]);

  /* Jool has no surface, and a same-body orbit has no arrival, so landing
     profiles have nothing to act on. Fall back rather than let the state go
     stale when someone switches destination while Land is selected. */
  const canLand = useMemo(
    () =>
      !orbitHere &&
      buildRoute(dest, "land", true, origin).some((l) => l.kind === "land"),
    [dest, origin, orbitHere],
  );
  const effProfile = !canLand && profile === "land" ? "orbit" : profile;

  const route = useMemo(
    () => buildRoute(dest, effProfile, chutes, origin, returning, planeNow),
    [dest, effProfile, chutes, origin, returning, planeNow],
  );
  const totalDv = route.reduce((s, l) => s + l.dv, 0);
  const budget = Math.round(totalDv * (1 + margin / 100) + extraDv);

  /* The uploaded configs had no MakingHistory folder, so those seven liquid
     engines are off by default — the solver was building around a Wolfhound that
     is not installed. The MH-derived boosters (Thoroughbred, Clydesdale, Shrimp,
     Mite) stay: they moved into the base game in 1.11. */
  useEffect(() => {
    if (!hydrated) return; // do not write the defaults back over a saved roster
    saveRoster({
      unlocked: [...unlocked],
      excluded: [...excluded],
      expansions,
      needGimbal,
    });
  }, [hydrated, unlocked, excluded, expansions, needGimbal]);

  const engines = useMemo(
    () =>
      DATA.engines.filter(
        (e) =>
          unlocked.has(e.t) &&
          (hasMH || !e.mh) &&
          (hasRS || !e.rs) &&
          !excluded.has(e.n),
      ),
    [unlocked, hasMH, hasRS, excluded],
  );
  const EXPANSION_PARTS = useMemo(
    () => ({
      stock:
        DATA.engines.filter((e) => !e.mh && !e.rs).length +
        DATA.tanks.filter((t) => !t.mh && !t.rs).length,
      mh:
        DATA.engines.filter((e) => e.mh).length +
        DATA.tanks.filter((t) => t.mh).length,
      rs:
        DATA.engines.filter((e) => e.rs).length +
        DATA.tanks.filter((t) => t.rs).length,
    }),
    [],
  );
  const tanks = useMemo(
    () =>
      DATA.tanks.filter(
        (t) =>
          (!t.t || unlocked.has(t.t)) &&
          (hasMH || !t.mh) &&
          (hasRS || !t.rs) &&
          !excluded.has(t.n),
      ),
    [unlocked, hasMH, hasRS, excluded],
  );

  /* Cut positions (cut i = separate after leg i). The grouping itself now
     happens inside planMission, from indices. */
  /* `defaultCuts` takes nothing — the whole mission is solved as one span
     unless the user says otherwise — and was being handed the route. */
  const effCuts = useMemo(() => cuts ?? defaultCuts(), [cuts]);

  /* Solve bottom-up: the last group flies first, so build from the top down.
     Each segment can expand into several stages, so the result is flattened. */
  /* Solving takes seconds, so it cannot sit on the render path. It runs as an
     async walk that yields between segments and again between stage-count
     candidates; each yield is a chance for React to paint and for a newer run to
     cancel this one. `token` is the abandon signal — if the inputs change, the
     run in flight stops at its next yield instead of finishing work nobody
     wants. */
  const [stages, setStages] = useState<Array<PlanStage>>([]);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = ++runId.current;
    setBusy(true); // instantly, in the same tick as the change
    const alive = () => runId.current === token;
    const breathe = () => new Promise((r) => setTimeout(r, 0));
    /* A superseded run stops at its next yield. `alive` still guards the final
       setState — the two agree, but the signal is what a worker will read. */
    abortRef.current?.abort();
    cancelSolve();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      if (!hydrated) return; // wait for the saved roster before spending a solve
      const startedAt = Date.now();
      /* The veil is already up — it goes on synchronously above so it appears on
         the same tick as the click. This pause only debounces the work, so a
         flurry of edits costs one solve, and the yield lets React paint before the
         thread is seized. */
      await new Promise((r) => setTimeout(r, 120));
      if (!alive()) return;
      await breathe();
      if (!alive()) return;

      const result = await solve(
        {
          cuts: [...effCuts],
          route,
          payload,
          payloadDia,
          margin,
          extraDv,
          engines,
          tanks,
          needGimbal,
          maxAspect,
          expansions,
          asparagus,
          objective,
          origin,
          boosters,
          /* Arrays, not the Sets and Map held in state. planMission rebuilds
             them, and nothing crossing the seam may be a type JSON cannot
             carry — see test/seam-contract.test.js. It is also what lets this
             input be posted to a worker. */
          unlocked: [...unlocked],
          excluded: [...excluded],
          splitBy: [...splitBy],
        },
        { signal: controller.signal, onYield: breathe },
      );
      /* Superseded: a newer run is already in flight and owns the veil, so
         leave it up and let that run clear it. */
      if (!alive()) return;
      /* Still the live run. A null result here is not a supersede — it is the
         worker failing to start or reporting an error — and there is no later
         run coming to tidy up. Clearing the veil has to happen either way, or a
         failed worker leaves the app showing "Solving" for good. */
      if (result) {
        setStages(result.stages);
        setSearch({
          ...result.tally,
          threads: result.threads || 1,
          ms: Date.now() - startedAt,
        });
      }
      setBusy(false);
    })();

    return () => {};
  }, [
    hydrated,
    effCuts,
    route,
    payload,
    payloadDia,
    margin,
    extraDv,
    engines,
    tanks,
    boosters,
    splitBy,
    origin,
    objective,
    unlocked,
    excluded,
    needGimbal,
    maxAspect,
    asparagus,
  ]);

  const runSim = (
    pick: (s: PlanStage) => boolean,
    bodyName: string,
  ): Ascent | null => {
    const v = buildVehicleFor(stages, pick, bodyName, payloadDia);
    if (!v) return null;
    try {
      const alt = orbitAlt(bodyName);
      const r = simCached(v, alt);
      /* A vehicle that cannot fly is worth saying out loud — silence reads as
         "not simulated" when it actually means "this design cannot work". */
      return r && r.ok
        ? { ...r, veh: v, bodyName, target: alt }
        : { ok: false, veh: v, bodyName, target: alt };
    } catch {
      return null;
    }
  };

  /* Where the top of the screen actually is.

     The solving bar is position: fixed, which pins it to the layout viewport.
     An on-screen keyboard does not shrink that — it shrinks the visual viewport
     and the browser scrolls the focused field up into what is left — so a bar
     fixed to the top of the layout viewport ends up above the visible area.
     That is exactly when it matters: you have typed a value into a field and
     want to know the solve started. visualViewport.offsetTop is the gap between
     the two viewports, and translating by it puts the bar back on screen.

     Absent in jsdom and in older browsers, where this stays 0 and the bar
     behaves as it always did. */
  const [viewTop, setViewTop] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const track = () => setViewTop(vv.offsetTop);
    track();
    vv.addEventListener("resize", track);
    vv.addEventListener("scroll", track);
    return () => {
      vv.removeEventListener("resize", track);
      vv.removeEventListener("scroll", track);
    };
  }, []);

  const ascent = useMemo(
    () => runSim((s) => s.isLaunch, origin),
    [stages, origin],
  );

  /* Climbing back off an atmosphere deserves the same treatment as the pad —
     more so at Eve, where sea level is 5 atm and engines barely push. */
  const returnAscent = useMemo(() => {
    const leg = route.find((l) => l.kind === "ascentBack");
    if (!leg) return null;
    return runSim((s) => s.legs.some((l) => l.kind === "ascentBack"), leg.body);
  }, [stages, route]);

  const geom = useMemo(() => {
    return stackGeometry(stages, payload, payloadDia);
  }, [stages, payload, payloadDia]);

  const srbAvail = engines.some((e) => e.f.includes("SF") && e.fuelM > 0);
  const airDescent = route.some((l) => l.kind === "land" && l.atm);

  const hardware = useMemo(
    () => missionHardware(route, payload, origin, unlocked, excluded),
    [route, payload, origin, unlocked, excluded],
  );

  const [search, setSearch] = useState<SearchStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const configText = useMemo(
    () =>
      "KSP-PLANNER " +
      JSON.stringify({
        origin,
        dest,
        profile,
        returning,
        payload,
        payloadDia,
        margin,
        extraDv,
        objective,
        boosters,
        chutes,
        needGimbal,
        planeNow,
        asparagus,
        maxAspect,
        expansions,
        tech: [...unlocked].sort(),
        excluded: [...excluded].sort(),
        cuts: cuts ? [...cuts].sort((x, y) => x - y) : null,
        splits: [...splitBy.entries()],
      }),
    [
      origin,
      dest,
      profile,
      returning,
      payload,
      payloadDia,
      margin,
      extraDv,
      objective,
      boosters,
      chutes,
      needGimbal,
      planeNow,
      maxAspect,
      expansions,
      unlocked,
      excluded,
      cuts,
      splitBy,
    ],
  );

  /* Load a pasted configuration. Every field is checked on its own and a bad or
     missing one is simply left at its default — a config saved before a setting
     existed should still restore everything else rather than failing whole. The
     count of what was skipped is reported so it is not a silent partial load. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<{
    bad: boolean;
    msg: string;
  } | null>(null);

  const applyConfig = () => {
    const r = parseConfig(pasteText);
    if (r.error !== undefined) {
      setPasteNote({ bad: true, msg: r.error });
      return;
    }
    /* Asking for the value rather than for the key: `take` writes a field only
       when it validated, so the two questions have the same answer — and only
       one of them narrows the type. */
    const v = r.values;
    if (v.origin !== undefined) setOrigin(v.origin);
    if (v.dest !== undefined) setDest(v.dest);
    if (v.profile !== undefined) setProfile(v.profile);
    if (v.returning !== undefined) setReturning(v.returning);
    if (v.payload !== undefined) setPayload(v.payload);
    if (v.payloadDia !== undefined) setPayloadDia(v.payloadDia);
    if (v.margin !== undefined) setMargin(v.margin);
    if (v.extraDv !== undefined) setExtraDv(v.extraDv);
    if (v.objective !== undefined) setObjective(v.objective);
    if (v.boosters !== undefined) setBoosters(v.boosters);
    if (v.chutes !== undefined) setChutes(v.chutes);
    if (v.needGimbal !== undefined) setNeedGimbal(v.needGimbal);
    if (v.planeNow !== undefined) setPlaneNow(v.planeNow);
    if (v.asparagus !== undefined) setAsparagus(v.asparagus);
    if (v.maxAspect !== undefined) setMaxAspect(v.maxAspect);
    if (v.expansions !== undefined) setExpansions(v.expansions);
    if (v.tech !== undefined) setUnlocked(v.tech);
    if (v.excluded !== undefined) setExcluded(v.excluded);
    if (v.cuts !== undefined) setCuts(v.cuts);
    if (v.splits !== undefined) setSplitBy(v.splits);
    setPasteNote({
      bad: false,
      msg: `Loaded ${r.took} settings${r.left ? `, ${r.left} left at their defaults` : ""}.`,
    });
    setPasteOpen(false);
    setPasteText("");
  };

  const copyConfig = async () => {
    /* Clipboard access is not guaranteed here, so fall back to showing the text
       for manual selection rather than failing silently. */
    try {
      await navigator.clipboard.writeText(configText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setShowConfig(true);
    }
  };

  const totalCost = stages.reduce(
    (a, x) => a + (x.sol ? stageCost(x.sol) : 0),
    0,
  );
  const totalParts = stages.reduce(
    (a, x) => a + (x.sol ? stageParts(x.sol) : 0),
    0,
  );

  const liftoff = stages[0]?.sol ? stages[0].sol.total : NaN;

  const craft = useMemo(
    () =>
      craftName({
        origin,
        dest,
        profile: effProfile,
        returning,
        payload,
        objective,
        k: stages.length,
        mass: liftoff,
      }),
    [
      origin,
      dest,
      effProfile,
      returning,
      payload,
      objective,
      stages.length,
      liftoff,
    ],
  );

  /* [].every() is true, so an empty stage list read as "solved" and printed the
     NaN placeholder. Harmless while the solve was synchronous and stages were
     never empty; the async rewrite made the empty first render visible. */
  const ok = stages.length > 0 && stages.every((s) => s.sol);
  // the accent is the target's own tracking-station colour, lifted if too dark to read
  const dcolor = (() => {
    const k = bodyKey(dest);
    return k && BODY_HUE[k] ? edgeOf(BODY_HUE[k]) : C.sky;
  })();

  const setSplit = (key: number, k: number) =>
    setSplitBy((p) => {
      const n = new Map(p);
      k ? n.set(key, k) : n.delete(key);
      return n;
    });

  const toggleCut = (i: number) =>
    setCuts((p) => {
      const n = new Set(p ?? defaultCuts());
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const setTier = (lvl: number) =>
    setUnlocked(
      withDeps(
        DATA.nodes,
        new Set(
          Object.entries(DATA.nodes)
            .filter(([, v]) => v.lvl <= lvl)
            .map(([k]) => k),
        ),
      ),
    );

  const vehicleClass = !ok
    ? "—"
    : liftoff < 20
      ? "Sounding / light"
      : liftoff < 75
        ? "Medium lifter"
        : liftoff < 250
          ? "Heavy lifter"
          : liftoff < 700
            ? "Super heavy"
            : "Kerbal-scale monster";

  return (
    <div
      style={{
        background: C.ink,
        color: C.paper,
        minHeight: "100vh",
        fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
        padding: "0 0 60px",
      }}
    >
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
        /* The only links in the application. Browser-default blue against this
           palette reads as a mistake, so they take the muted ink and earn their
           underline on hover rather than shouting by default. */
        a { color:${C.muted}; text-decoration:underline; text-decoration-color:${C.edge};
            text-underline-offset:2px; transition:.12s; }
        a:hover { color:${C.paper}; text-decoration-color:${C.amber}; }
        @keyframes sweep { 0% { transform:translateX(-100%); } 100% { transform:translateX(386%); } }
        @keyframes fadein { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
        @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
      `}</style>

      {/* ---------------------------- header ---------------------------- */}
      {/* Solving can take seconds at full tech, so say so plainly rather than with
          a hairline. Held back 120 ms so quick recalculations do not flash. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transform: `translateY(${viewTop}px)`,
          background: C.panel2,
          borderBottom: `1px solid ${C.amber}`,
          boxShadow: "0 2px 12px rgba(0,0,0,.45)",
          opacity: busy ? 1 : 0,
          pointerEvents: "none",
          transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in",
        }}
      >
        <div style={{ height: 4, background: C.rule, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "30%",
              background: C.amber,
              animation: busy ? "sweep 1s ease-in-out infinite" : "none",
            }}
          />
        </div>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "7px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: C.amber,
              animation: busy ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>
            Solving {origin} → {dest}
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            staging, engine selection and ascent simulation
          </span>
        </div>
      </div>

      <header
        style={{
          borderBottom: `1px solid ${C.rule}`,
          background: C.panel,
          padding: "18px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="eyebrow">
            Kerbal Space Program 1.12 ·{" "}
            {["Stock", hasMH && "Making History", hasRS && "ReStock+"]
              .filter(Boolean)
              .join(" + ")}
          </div>
          <h1
            className="disp"
            style={{
              margin: "6px 0 0",
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 0.95,
            }}
          >
            Mission&nbsp;<span style={{ color: dcolor }}>Δv</span>&nbsp;Planner
          </h1>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Stat
            label="Δv budget"
            value={fmt(budget)}
            unit="m/s"
            color={dcolor}
          />
          <div
            style={{ marginLeft: "auto", textAlign: "right", maxWidth: 340 }}
          >
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              Save it as
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: C.paper,
                fontWeight: 600,
                lineHeight: 1.25,
              }}
            >
              {craft.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {craft.sub}
            </div>
          </div>
          <Stat
            label="Liftoff mass"
            value={ok ? fmt(liftoff, 1) : "—"}
            unit="t"
          />
          <Stat label="Stages" value={ok ? stages.length : "—"} unit="" />
          <Stat
            label="Height"
            value={ok ? geom.h.toFixed(1) : "—"}
            unit="m"
            small
          />
          <Stat
            label="Aspect"
            value={ok ? geom.ar.toFixed(1) : "—"}
            unit=":1"
            color={ok && geom.ar > maxAspect ? C.amber : undefined}
            small
          />
          <Stat
            label="Cost"
            value={ok ? fmt(totalCost) : "—"}
            unit="funds"
            small
          />
          <Stat label="Parts" value={ok ? totalParts : "—"} unit="" small />
          <Stat label="Class" value={vehicleClass} unit="" small />
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr)",
          gap: 16,
          padding: 16,
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        {/* ---------------------------- mission controls ---------------------------- */}
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Installed
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            {PART_SOURCES.map(([k, lab]) => {
              const locked = k === "stock";
              return (
                <label
                  key={k}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 12.5,
                    color: locked ? C.muted : C.paper,
                    cursor: locked ? "default" : "pointer",
                  }}
                  title={locked ? "Always required" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={k === "stock" ? true : expansions[k]}
                    disabled={locked}
                    style={{ accentColor: dcolor }}
                    onChange={(e) =>
                      setExpansions((x) => ({ ...x, [k]: e.target.checked }))
                    }
                  />
                  {lab}
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: C.dim }}
                  >
                    {EXPANSION_PARTS[k]} parts
                  </span>
                </label>
              );
            })}
          </div>

          <div
            style={{ borderTop: `1px solid ${C.rule}`, margin: "0 0 14px" }}
          />
          <button
            onClick={() => setShowTech(!showTech)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
            }}
          >
            <span className="eyebrow">
              Tech tree · {unlocked.size} of {Object.keys(DATA.nodes).length}{" "}
              nodes · {engines.length} engines, {tanks.length} tanks available
              {excluded.size > 0 &&
                ` · ${excluded.size} part${excluded.size === 1 ? "" : "s"} excluded`}
            </span>
            <span style={{ color: C.dim, fontSize: 12, marginLeft: "auto" }}>
              {showTech ? "hide" : "edit"}
            </span>
          </button>
          {showTech && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: C.dim,
                    alignSelf: "center",
                    marginRight: 4,
                  }}
                >
                  Unlock through tier:
                </span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <button key={l} className="chip" onClick={() => setTier(l)}>
                    {l}
                  </button>
                ))}
                {excluded.size > 0 && (
                  <button
                    className="chip"
                    style={{ marginLeft: 8 }}
                    onClick={() => setExcluded(new Set())}
                  >
                    clear {excluded.size} exclusion
                    {excluded.size === 1 ? "" : "s"}
                  </button>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
                }}
              >
                {Object.keys(TIERS).map((lvl) => (
                  <div key={lvl}>
                    {TIERS[lvl].some((n) => (NODE_PARTS[n] || []).length) && (
                      <div className="eyebrow" style={{ marginBottom: 6 }}>
                        Tier {lvl}
                      </div>
                    )}
                    {TIERS[lvl]
                      .filter((n) => (NODE_PARTS[n] || []).length)
                      .map((n) => {
                        const parts = NODE_PARTS[n] || [];
                        const on = unlocked.has(n);
                        const off = parts.filter((x) =>
                          excluded.has(x.name),
                        ).length;
                        const open = openNode === n;
                        return (
                          <div key={n} style={{ padding: "2px 0" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 7,
                                alignItems: "flex-start",
                                fontSize: 12,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                style={{ marginTop: 2, accentColor: dcolor }}
                                onChange={() => {
                                  /* Turning a node off rules out everything under it;
                                     turning it back on restores the lot, including parts
                                     ruled out individually beforehand. So the node box is
                                     always a clean sweep either way. */
                                  const turningOn = !on;
                                  setUnlocked((p2) => {
                                    const s2 = new Set(p2);
                                    if (turningOn) s2.add(n);
                                    else s2.delete(n);
                                    return withDeps(DATA.nodes, s2);
                                  });
                                  setExcluded((p2) => {
                                    const s2 = new Set(p2);
                                    (NODE_PARTS[n] || []).forEach((y) =>
                                      turningOn
                                        ? s2.delete(y.name)
                                        : s2.add(y.name),
                                    );
                                    return s2;
                                  });
                                }}
                              />
                              <span
                                style={{
                                  color: on ? C.paper : C.dim,
                                  cursor: "pointer",
                                  flex: 1,
                                  lineHeight: 1.3,
                                }}
                                onClick={() => setOpenNode(open ? null : n)}
                              >
                                {n}
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: 9.5,
                                    color: C.dim,
                                    marginLeft: 5,
                                  }}
                                >
                                  {on
                                    ? `${parts.length - off}/${parts.length}`
                                    : parts.length}
                                </span>
                              </span>
                            </div>
                            {open && (
                              <div
                                style={{
                                  margin: "3px 0 6px 20px",
                                  paddingLeft: 8,
                                  borderLeft: `1px solid ${C.rule}`,
                                }}
                              >
                                {parts.map((x) => {
                                  /* A tick here means the solver can use the part, which
                                     needs the node researched AND the part not ruled out.
                                     Showing these ticked under a locked node claimed parts
                                     were in play that were not. Ticking one now researches
                                     the node as well, so the box does what it says. */
                                  const live = on && !excluded.has(x.name);
                                  return (
                                    <label
                                      key={x.name}
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "flex-start",
                                        fontSize: 11,
                                        padding: "1.5px 0",
                                        cursor: "pointer",
                                        color: live ? C.muted : C.dim,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={live}
                                        style={{
                                          marginTop: 2,
                                          accentColor: dcolor,
                                        }}
                                        onChange={() => {
                                          if (!on) {
                                            /* Cherry-pick: research the node but take only
                                               this part, holding the rest back. */
                                            setUnlocked((p2) =>
                                              withDeps(
                                                DATA.nodes,
                                                new Set(p2).add(n),
                                              ),
                                            );
                                            setExcluded((p2) => {
                                              const s2 = new Set(p2);
                                              (NODE_PARTS[n] || []).forEach(
                                                (y) => s2.add(y.name),
                                              );
                                              s2.delete(x.name);
                                              return s2;
                                            });
                                          } else toggleExcluded(x.name);
                                        }}
                                      />
                                      <span
                                        style={{
                                          flex: 1,
                                          lineHeight: 1.25,
                                          textDecoration:
                                            on && excluded.has(x.name)
                                              ? "line-through"
                                              : "none",
                                          opacity: on ? 1 : 0.6,
                                        }}
                                      >
                                        {x.name}
                                      </span>
                                    </label>
                                  );
                                })}
                                {!on && (
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: C.dim,
                                      marginTop: 4,
                                    }}
                                  >
                                    not researched — ticking one part takes just
                                    that part
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

          <div
            style={{ borderTop: `1px solid ${C.rule}`, margin: "16px 0 14px" }}
          />

          {/* Almost every mission starts at Kerbin, so the full sixteen-body picker
              is a lot of furniture for a choice nobody makes. Folded by default;
              the destination is the opposite, since that is the thing you came to
              change. */}
          <PickerHead
            label="Launching from"
            value={origin}
            open={showOrigin}
            onToggle={() => setShowOrigin(!showOrigin)}
          />
          {showOrigin && (
            <div style={{ marginBottom: 16 }}>
              {origin !== "Kerbin" && (
                <button
                  className="chip"
                  style={{ marginBottom: 8 }}
                  onClick={() => {
                    setOrigin("Kerbin");
                    setCuts(null);
                  }}
                >
                  ← back to Kerbin
                </button>
              )}
              <BodyPicker
                value={origin}
                options={Object.keys(SYS).filter(
                  (b) => b !== "Sun" && SYS[b].ascent,
                )}
                onPick={(b) => {
                  setOrigin(b);
                  setCuts(null);
                  const valid = new Set([
                    "Low orbit",
                    ...(hasSync(b) ? ["Stationary orbit"] : []),
                    ...(b === "Kerbin"
                      ? Object.keys(DEST).filter(
                          (d) => !/Kerbin Orbit|Keostationary/.test(d),
                        )
                      : Object.keys(SYS).filter((x) => x !== "Sun" && x !== b)),
                  ]);
                  if (!valid.has(dest)) setDest("Low orbit");
                }}
              />
            </div>
          )}
          {!showOrigin && <div style={{ marginBottom: 16 }} />}

          <PickerHead
            label="Mission"
            value={dest}
            open={showDest}
            onToggle={() => setShowDest(!showDest)}
          />
          {showDest ? (
            <div style={{ marginBottom: 16 }}>
              <BodyPicker
                value={dest}
                options={destList}
                onPick={(d) => {
                  setDest(d);
                  setCuts(null);
                }}
              />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }} />
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 16,
            }}
          >
            {Object.entries(PROFILES).map(([k, v]) => (
              <button
                key={k}
                className="chip"
                data-on={k === effProfile ? 1 : 0}
                disabled={k === "land" && !canLand}
                title={
                  k === "land" && !canLand
                    ? `${dest} has no surface to land on`
                    : v.note
                }
                onClick={() => setProfile(k)}
              >
                {v.name}
              </button>
            ))}
            <span
              style={{
                width: 1,
                alignSelf: "stretch",
                background: C.rule,
                margin: "0 4px",
              }}
            />
            <button
              className="chip"
              data-on={returning ? 1 : 0}
              title={
                returning
                  ? "Carries the fuel to come home again"
                  : "One way — nothing is brought back"
              }
              onClick={() => setReturning(!returning)}
            >
              {returning ? "Return trip" : "One way"}
            </button>
          </div>
          {!orbitHere && !canLand && (
            <div
              style={{
                fontSize: 11.5,
                color: C.muted,
                marginTop: -10,
                marginBottom: 16,
              }}
            >
              {dest} has no surface to land on, so this is an orbital mission.
            </div>
          )}
          {orbitHere && (
            <div
              style={{
                fontSize: 11.5,
                color: C.muted,
                marginTop: -10,
                marginBottom: 16,
              }}
            >
              You are launching straight into this orbit, so there is no arrival
              to shape — nothing to fly by, capture into, or land on.
            </div>
          )}
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
            }}
          >
            <Slider
              label="Payload delivered"
              value={payload}
              min={0.1}
              max={60}
              step={0.1}
              hardMax={2000}
              unit="t"
              onChange={setPayload}
              hint="Everything not counted as engine or tank: pod, probe, science, rover, cargo — and the lander's own kit, its legs and heat shield included."
            />
            <Slider
              label="Δv margin"
              value={margin}
              min={0}
              max={40}
              step={1}
              unit="%"
              hardMax={100}
              onChange={setMargin}
              hint="Reserve over the map value for inefficiency and correction burns."
            />
            {crossfeedOk && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: C.muted,
                  margin: "8px 0",
                }}
              >
                <input
                  type="checkbox"
                  checked={asparagus}
                  onChange={(e) => setAsparagus(e.target.checked)}
                />
                Asparagus staging
                <span style={{ fontSize: 11, color: C.dim }}>
                  liquid side stacks feed the core and drop in pairs
                </span>
              </label>
            )}
            <Slider
              label="Payload width"
              value={payloadDia}
              min={0.625}
              max={5}
              step={0.625}
              unit="m"
              hardMax={10}
              onChange={setPayloadDia}
              hint="How wide the thing you are lifting actually is. It sets the drag the stack has to push through, and on a small rocket the payload is often the widest part of it."
            />
            <Slider
              label="Slenderness limit"
              value={maxAspect}
              min={6}
              max={30}
              step={0.5}
              unit=":1"
              hardMax={60}
              onChange={setMaxAspect}
              hint="Tallest the stack may be relative to its widest point, boosters excluded — they stage away inside the atmosphere and what is left has to stay pointed. A pencil wobbles, needs struts and flips under load."
            />
            <Slider
              label="Extra Δv"
              value={extraDv}
              min={0}
              max={1500}
              step={10}
              unit="m/s"
              hardMax={9000}
              onChange={setExtraDv}
              hint="A flat reserve added after the margin, carried on the top stage — for rendezvous, a contract you have not planned yet, or getting home when the map was optimistic."
            />
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Optimise for
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {OBJECTIVES.map(([k, lab]) => (
                  <button
                    key={k}
                    className="chip"
                    data-on={objective === k ? 1 : 0}
                    onClick={() => setObjective(k)}
                  >
                    {lab}
                  </button>
                ))}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: C.dim,
                  marginTop: 6,
                  lineHeight: 1.45,
                }}
              >
                Lightest minimises what leaves the pad. Cheapest gives up
                efficiency for price, taking plainer engines and carrying more
                propellant. Fewest parts favours self-contained boosters and the
                largest tanks that fit, and will accept a heavier rocket to save
                a part.
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Atmospheric descent
              </div>
              <button
                className="chip"
                data-on={needGimbal ? 1 : 0}
                title={
                  needGimbal
                    ? "Stages flying through air must use a vectoring nozzle"
                    : "Fixed nozzles allowed everywhere — you will be steering on fins"
                }
                onClick={() => setNeedGimbal(!needGimbal)}
              >
                {needGimbal ? "Gimbal in atmosphere" : "Gimbal optional"}
              </button>
              <button
                className="chip"
                data-on={srbAvail && boosters ? 1 : 0}
                disabled={!srbAvail}
                style={
                  srbAvail ? undefined : { opacity: 0.4, cursor: "default" }
                }
                title={
                  srbAvail ? undefined : "No solid boosters researched yet"
                }
                onClick={() => srbAvail && setBoosters(!boosters)}
              >
                {boosters ? "Solid boosters allowed" : "Liquid only"}
              </button>
              <button
                className="chip"
                data-on={airDescent && chutes ? 1 : 0}
                disabled={!airDescent}
                style={
                  airDescent ? undefined : { opacity: 0.4, cursor: "default" }
                }
                title={
                  airDescent
                    ? undefined
                    : "Nothing on this route lands through an atmosphere"
                }
                onClick={() => airDescent && setChutes(!chutes)}
              >
                {chutes ? "Parachutes fitted" : "Powered descent only"}
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: C.dim,
                  marginTop: 8,
                  lineHeight: 1.45,
                }}
              >
                Cuts landing Δv to ~18% on Duna, Eve and Laythe. Add a heat
                shield to the payload mass.
              </div>
            </div>
          </div>
        </section>

        <Solving busy={busy} label={`Solving ${origin} → ${dest}…`}>
          {/* ---------------------------- route + stages ---------------------------- */}
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
            }}
          >
            <section className="card" style={{ padding: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                Route · read bottom to top
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: C.muted,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                Tap a <strong style={{ color: C.paper }}>scissor gap</strong>{" "}
                between stations to add or remove a staging event, and the whole
                mission is solved as one span until you add one. Cut where the
                hardware genuinely parts company — a lander left in orbit, a
                transfer stage dropped before descent — or where a segment will
                not close.
              </div>
              <RouteMap
                route={route}
                cuts={effCuts}
                onToggle={toggleCut}
                color={dcolor}
                stages={stages}
                onPlaneMode={setPlaneNow}
              />
            </section>

            <section className="card" style={{ padding: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Vehicle · stage 1 at the bottom
              </div>
              {!ok && (
                <div
                  style={{
                    border: `1px solid ${C.rust}`,
                    borderRadius: 3,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: C.rust }}>
                    No solution for at least one stage.
                  </strong>{" "}
                  A single stock stage tops out near Isp·g₀·ln 9. Add a staging
                  cut on the route, unlock a higher-Isp engine, or lower the
                  payload.
                </div>
              )}
              <StageStack
                stages={stages}
                color={dcolor}
                splitBy={splitBy}
                onSetSplit={setSplit}
              />
            </section>
          </div>

          {ok && geom.ar > maxAspect && (
            <section
              className="card"
              style={{ padding: 14, borderColor: C.amber }}
            >
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                <strong style={{ color: C.amber }}>
                  {geom.h.toFixed(0)} m on a {geom.w.toFixed(2)} m core —{" "}
                  {geom.ar.toFixed(1)}:1.
                </strong>{" "}
                {geom.ar > 20
                  ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
                  : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
                <div style={{ color: C.muted, marginTop: 6 }}>
                  Forcing a segment to fewer stages trades mass for a squatter
                  stack — one stage instead of three is heavier but roughly half
                  the aspect ratio. Optimising for cost or fewest parts also
                  builds wider, since the cheap and the self-fuelled parts are
                  the fat ones.
                </div>
              </div>
            </section>
          )}

          {/* ------------------------- ascent simulation ------------------------- */}
          {ascent && (
            <section className="card" style={{ padding: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Simulated ascent from Kerbin · real atmosphere, real Isp curves,
                integrated drag
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
              <BuildView
                stages={stages}
                payload={payload}
                payloadDia={payloadDia}
                color={dcolor}
                maxAspect={maxAspect}
              />
            </section>
          )}

          {/* ---------------------------- parts list ---------------------------- */}
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              Parts list · build order
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
              Top of the stack first, working down to the pad — the order you
              assemble it in.
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                marginBottom: 12,
                fontSize: 10.5,
              }}
            >
              {[
                ["Engine", C.paper],
                ["Tank", C.muted],
                ["Adapter", C.violet],
                ["Decoupler", C.dim],
                ["Booster", C.mint],
                ["Mission hardware", C.sky],
              ].map(([lab, col]) => (
                <span
                  key={lab}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: C.dim,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 1,
                      background: col,
                    }}
                  />
                  {lab}
                </span>
              ))}
            </div>
            <PartsTable
              stages={stages}
              payload={payload}
              hardware={hardware}
              color={dcolor}
            />
          </section>

          {/* Everything a run depends on, in one string. Pasting it back means we
            are looking at the same rocket rather than describing it to each other. */}
          <section className="card" style={{ padding: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {search && (
                <span
                  className="mono"
                  style={{ fontSize: 11, color: C.dim, marginRight: 4 }}
                >
                  searched {fmt(search.stages + search.boosted)} stage designs
                  across {fmt(search.chains)} stacks,{" "}
                  {/* The counter records trajectories actually integrated. Ascents are
                    cached across solves, so a re-solve that reuses one legitimately
                    flies nothing new — which read as though the design had never
                    been flown at all. */}
                  {search.flights > 0 ? (
                    <>flew {fmt(search.flights)} ascents, </>
                  ) : (
                    <>ascent reused from cache, </>
                  )}
                  {(search.ms / 1000).toFixed(1)} s
                  {/* Which says whether the search was actually shared out. The
                      pool falls back to solving in one thread wherever nested
                      workers are refused, and without this the difference
                      between "no threads here" and "threads bought nothing"
                      is invisible from the outside. */}
                  {search.threads > 1 && <> on {search.threads} threads</>}
                </span>
              )}
              <button
                className="chip"
                data-on={copied ? 1 : 0}
                onClick={copyConfig}
              >
                {copied ? "copied" : "Copy configuration"}
              </button>
              <button
                className="chip"
                data-on={pasteOpen ? 1 : 0}
                onClick={() => {
                  setPasteOpen(!pasteOpen);
                  setPasteNote(null);
                }}
              >
                Load configuration
              </button>
              {pasteNote && (
                <span
                  style={{
                    fontSize: 11,
                    color: pasteNote.bad ? C.rust : C.mint,
                  }}
                >
                  {pasteNote.msg}
                </span>
              )}
              <span style={{ fontSize: 11, color: C.dim }}>
                Paste this into the chat and I can load the same build — every
                setting, the researched nodes and any parts you have ruled out.
              </span>
            </div>
            {pasteOpen && (
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste a KSP-PLANNER configuration here"
                  style={{
                    width: "100%",
                    height: 70,
                    fontSize: 10.5,
                    fontFamily: "monospace",
                    background: C.ink,
                    color: C.muted,
                    border: `1px solid ${C.rule}`,
                    borderRadius: 3,
                    padding: 8,
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="chip" data-on={1} onClick={applyConfig}>
                    Load it
                  </button>
                  <button
                    className="chip"
                    onClick={() => {
                      setPasteOpen(false);
                      setPasteText("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {showConfig && (
              <textarea
                readOnly
                value={configText}
                onFocus={(e) => e.target.select()}
                style={{
                  width: "100%",
                  height: 84,
                  marginTop: 10,
                  fontSize: 10.5,
                  fontFamily: "monospace",
                  background: C.ink,
                  color: C.muted,
                  border: `1px solid ${C.rule}`,
                  borderRadius: 3,
                  padding: 8,
                  resize: "vertical",
                }}
              />
            )}
          </section>

          <footer
            style={{
              fontSize: 11,
              color: C.dim,
              lineHeight: 1.7,
              padding: "4px 2px",
            }}
          >
            Part masses, costs, tech nodes and Isp curves are read from KSP
            1.12.5 configs — Squad, Breaking Ground and ReStock+. Making History
            is off by default because it is not installed. Atmospheres are the
            exact stock pressure and temperature splines, and Isp follows each
            engine's own atmosphereCurve, so a vacuum bell correctly produces
            nothing at Eve's surface. Ascents are flown, not estimated: an RK4
            integration at 0.1 s searches a two-parameter gravity turn, with
            drag assembled the way KSP assembles it, from the curves and
            constants in Physics.cfg.{" "}
            <strong style={{ color: C.muted }}>
              Where it is still approximate:
            </strong>{" "}
            drag counts only the frontal area against one representative cube
            coefficient, so nothing is occluded, a nose cone buys nothing, and
            neither does a fairing. Staging is serial — no asparagus, which is
            why an Eve return does not close. Δv between bodies is a Hohmann
            transfer through the real orbital elements, ignoring the
            eccentricity and the launch window you actually get. Whether a
            design flies is judged by this simulator, not by the game.
          </footer>
        </Solving>

        {/* Outside <Solving> on purpose, and last on the page.

            Everything inside that wrapper drops to 22% opacity, greys out and
            stops taking clicks while a solve runs — which at full tech is
            seconds at a time. Where the source is and what the terms are do not
            depend on the design being computed, so they should not blink out
            with it. #52.

            The wording states the position rather than leaving it to the link:
            a working tool with a bare "licence" link invites the assumption
            that it is open source, and this one is not. */}
        <div
          style={{
            borderTop: `1px solid ${C.rule}`,
            marginTop: 18,
            padding: "14px 2px 4px",
            fontSize: 11,
            color: C.dim,
          }}
        >
          <a
            href="https://github.com/briangbrown/ksp-rocket-optimizer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source on GitHub
          </a>
          {" · © 2026 Brian Brown, "}
          <a
            href="https://github.com/briangbrown/ksp-rocket-optimizer/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            all rights reserved
          </a>
          {
            " · Kerbal Space Program is a trademark of its owners; this is an unaffiliated fan tool."
          }
        </div>
      </div>
    </div>
  );
}

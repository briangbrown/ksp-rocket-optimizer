import { useState, useMemo, useEffect, useRef } from "react";
import { solve, cancelSolve } from "./solver-client.js";
import { buildVehicleFor, simCached } from "../core/ascent.js";
import { orbitAlt } from "../core/atmosphere.js";
import { DATA } from "../core/catalogue.js";
import { stackGeometry } from "../core/geometry.js";
import {
  DEST,
  SYS,
  bodyKey,
  buildRoute,
  defaultCuts,
  hasSync,
} from "../core/orbits.js";
import { missionHardware } from "../core/parts.js";
import { stageCost, stageParts } from "../core/performance.js";
import { withDeps } from "../core/tech.js";
import { Brief } from "./components/brief.jsx";
import { Stat } from "./components/primitives.jsx";
import { Results } from "./components/results.jsx";
import { Setup } from "./components/setup.jsx";
import { Solving } from "./components/solving.jsx";
import { parseConfig } from "./config.js";
import { craftName, fmt } from "./format.js";
import { STYLES } from "./styles.js";
import { loadRoster, saveRoster } from "./storage.js";
import {
  BODY_HUE,
  C,
  FONT,
  RADIUS,
  SHADOW,
  SPACE,
  Z,
  edgeOf,
} from "./tokens.js";
import type { Objective } from "../core/performance.js";
import type { PlanStage } from "../core/plan.js";
import type { Ascent } from "./components/flight.jsx";
import type { SearchStats } from "./components/results.jsx";

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
  const applyConfig = (text: string) => {
    const r = parseConfig(text);
    if (r.error !== undefined) return { bad: true, msg: r.error };
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
    return {
      bad: false,
      msg: `Loaded ${r.took} settings${r.left ? `, ${r.left} left at their defaults` : ""}.`,
    };
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

  /* Picking a body resets the cuts: they index the legs of a route that no
     longer exists. A destination the new origin cannot reach falls back to
     low orbit. */
  const pickOrigin = (b: string) => {
    setOrigin(b);
    setCuts(null);
    const valid = new Set([
      "Low orbit",
      ...(hasSync(b) ? ["Stationary orbit"] : []),
      ...(b === "Kerbin"
        ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
        : Object.keys(SYS).filter((x) => x !== "Sun" && x !== b)),
    ]);
    if (!valid.has(dest)) setDest("Low orbit");
  };
  const pickDest = (d: string) => {
    setDest(d);
    setCuts(null);
  };

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
        fontFamily: FONT,
        padding: "0 0 60px",
      }}
    >
      <style>{STYLES}</style>

      {/* ---------------------------- header ---------------------------- */}
      {/* Solving can take seconds at full tech, so say so plainly rather than with
          a hairline. Held back 120 ms so quick recalculations do not flash. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: Z.solving,
          transform: `translateY(${viewTop}px)`,
          background: C.panel2,
          borderBottom: `1px solid ${C.amber}`,
          boxShadow: SHADOW.bar,
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
              borderRadius: RADIUS.round,
              background: C.amber,
              animation: busy ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span className="body" style={{ color: C.paper, fontWeight: 600 }}>
            Solving {origin} → {dest}
          </span>
          <span className="note">
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
          <div className="label">
            Kerbal Space Program 1.12 ·{" "}
            {["Stock", hasMH && "Making History", hasRS && "ReStock+"]
              .filter(Boolean)
              .join(" + ")}
          </div>
          <h1 className="display" style={{ margin: "6px 0 0" }}>
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
            <div className="label" style={{ marginBottom: 3 }}>
              Save it as
            </div>
            <div
              className="body"
              style={{ color: C.paper, fontWeight: 600, lineHeight: 1.25 }}
            >
              {craft.name}
            </div>
            <div className="note" style={{ marginTop: 2 }}>
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
          gap: SPACE.xl,
          padding: SPACE.xl,
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        {/* ---------------------------- mission controls ---------------------------- */}
        <section className="card" style={{ padding: SPACE.xl }}>
          <Setup
            expansions={expansions}
            setExpansions={setExpansions}
            partsBy={EXPANSION_PARTS}
            unlocked={unlocked}
            setUnlocked={setUnlocked}
            excluded={excluded}
            setExcluded={setExcluded}
            engines={engines.length}
            tanks={tanks.length}
            open={showTech}
            onToggle={() => setShowTech(!showTech)}
            accent={dcolor}
          />

          <div
            style={{ borderTop: `1px solid ${C.rule}`, margin: "16px 0 14px" }}
          />

          <Brief
            origin={origin}
            onOrigin={pickOrigin}
            originOpen={showOrigin}
            onToggleOrigin={() => setShowOrigin(!showOrigin)}
            dest={dest}
            destList={destList}
            onDest={pickDest}
            destOpen={showDest}
            onToggleDest={() => setShowDest(!showDest)}
            profile={effProfile}
            canLand={canLand}
            orbitHere={orbitHere}
            onProfile={setProfile}
            returning={returning}
            onReturning={setReturning}
            payload={payload}
            onPayload={setPayload}
            margin={margin}
            onMargin={setMargin}
            payloadDia={payloadDia}
            onPayloadDia={setPayloadDia}
            maxAspect={maxAspect}
            onMaxAspect={setMaxAspect}
            extraDv={extraDv}
            onExtraDv={setExtraDv}
            crossfeedOk={crossfeedOk}
            asparagus={asparagus}
            onAsparagus={setAsparagus}
            objective={objective}
            onObjective={setObjective}
            needGimbal={needGimbal}
            onNeedGimbal={setNeedGimbal}
            srbAvail={srbAvail}
            boosters={boosters}
            onBoosters={setBoosters}
            airDescent={airDescent}
            chutes={chutes}
            onChutes={setChutes}
          />
        </section>

        <Solving busy={busy} label={`Solving ${origin} → ${dest}…`}>
          <Results
            route={route}
            cuts={effCuts}
            onToggleCut={toggleCut}
            onPlaneMode={setPlaneNow}
            stages={stages}
            ok={ok}
            splitBy={splitBy}
            onSetSplit={setSplit}
            geom={geom}
            maxAspect={maxAspect}
            ascent={ascent}
            returnAscent={returnAscent}
            payload={payload}
            payloadDia={payloadDia}
            hardware={hardware}
            color={dcolor}
            search={search}
            configText={configText}
            onLoad={applyConfig}
          />
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
          className="note"
          style={{
            borderTop: `1px solid ${C.rule}`,
            marginTop: 18,
            padding: "14px 2px 4px",
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

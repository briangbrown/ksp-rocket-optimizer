import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { Settings } from "lucide-react";
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
import { stageParts } from "../core/performance.js";
import { withDeps } from "../core/tech.js";
import { Brief } from "./components/brief.jsx";
import {
  IconButton,
  Sheet,
  useNote,
  useWide,
} from "./components/primitives.jsx";
import { Results, RouteSection } from "./components/results.jsx";
import { Setup } from "./components/setup.jsx";
import { JumpBar } from "./components/jump.jsx";
import { Solving, Veil } from "./components/solving.jsx";
import { parseConfig } from "./config.js";
import { canLink, fromLink, toLink } from "./link.js";
import { briefLine, craftName, fmt } from "./format.js";
import { STYLES } from "./styles.js";
import { loadRoster, saveRoster } from "./storage.js";
import {
  BODY_HUE,
  C,
  FONT,
  SPACE,
  edgeOf,
  palette,
  themeNow,
} from "./tokens.js";
import type { Objective } from "../core/performance.js";
import type { Theme, ThemePref } from "./tokens.js";
import type { PlanStage } from "../core/plan.js";
import type { Ascent } from "./components/flight.jsx";
import type { SearchStats } from "./components/config.jsx";

/* Where the desktop's left column sticks.

   The column is the brief and the route, and it holds its place beside the
   results as the page scrolls — while it fits the window. Taller than the
   window, a column pinned by its head keeps its foot out of reach for the
   length of the page, so it is pinned by its foot instead: `top` goes
   negative by the overshoot, the column scrolls with the page until its last
   line is in view, and holds there. A callback ref, because the column is
   only in the tree on a wide screen — `.claude/rules/ui.md`. #137 */
function useStickyTop(margin: number) {
  const [h, setH] = useState(0);
  const [winH, setWinH] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const watching = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(el);
    watching.current = ro;
  }, []);
  useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { ref, top: Math.min(margin, winH - h - margin) };
}

export default function KSPMissionPlanner() {
  const [origin, setOrigin] = useState("Kerbin");
  const [dest, setDest] = useState("Mun");
  const [profile, setProfile] = useState("land");
  const [returning, setReturning] = useState(true); // most missions are meant to come home
  const [needGimbal, setNeedGimbal] = useState(true);
  /* What the reader asked for, and what the page is showing — the OS's
     choice resolved. The choice goes on the root as `data-theme`, where the
     stylesheet reads it; the resolved theme is state because the drawing
     has to be rebuilt in it. */
  const [themePref, setThemePref] = useState<ThemePref>("system");
  const [theme, setTheme] = useState<Theme>(themeNow);
  useEffect(() => {
    const root = document.documentElement;
    if (themePref === "system") delete root.dataset.theme;
    else root.dataset.theme = themePref;
    setTheme(themeNow());
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const on = () => setTheme(themeNow());
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [themePref]);
  /* The browser chrome follows the page ground. */
  useEffect(() => {
    let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "theme-color";
      document.head.appendChild(m);
    }
    m.content = palette(theme).ink;
  }, [theme]);
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
  const [showMore, setShowMore] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const closeSetup = useCallback(() => setShowSetup(false), []);
  /* Open until the first solve delivers a design, then one line — unless
     the reader has touched it, in which case it stays open until they say
     Done: a form that folds under someone mid-edit is worse than one that
     asks to be closed. Opening it again counts as touching it. */
  const [briefOpen, setBriefOpen] = useState(true);
  const touched = useRef(false);
  const edit =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      touched.current = true;
      f(...a);
    };
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
  /* What the page has to say about the design as a whole — a link that did
     not load, a link copied — at the top of *Your rocket*. #140 */
  const [note, setNote, noteFade] = useNote();
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
        if (v.theme === "system" || v.theme === "dark" || v.theme === "light")
          setThemePref(v.theme);
      }
      /* A design in the address, after the roster so that it wins: the link
         is the whole point of the visit. It goes through `applyConfig` as a
         paste does, and like a paste it sets the roster too. A link that is
         one but will not read is said so; a plain visit is not remarked on.
         Then the brief is set and the page is at the rocket, which is what
         the reader was sent. #140 */
      const found = live ? await fromLink(location.hash) : null;
      if (live && found) {
        if (found.error !== undefined) {
          setNote({ severity: "bad", title: found.error });
        } else {
          const r = applyConfig(found.text);
          if (r.bad) setNote({ severity: "bad", title: r.msg });
          else if (r.left) setNote({ severity: "info", title: r.msg });
          setBriefOpen(false);
          requestAnimationFrame(() =>
            document.getElementById("rocket")?.scrollIntoView?.(),
          );
        }
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
      theme: themePref,
    });
  }, [hydrated, unlocked, excluded, expansions, needGimbal, themePref]);

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
  /* Until the first solve has come back, the results have a shape and no
     numbers; `Results` draws the sections' headings over skeleton lines. Set
     when a run completes, delivered or not — a worker that failed to start
     has no later run coming, and a page of skeletons is worse than a page
     that says nothing solved. #139 */
  const [first, setFirst] = useState(true);
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
        if (
          !touched.current &&
          result.stages.length > 0 &&
          result.stages.every((s) => s.sol)
        )
          setBriefOpen(false);
        setSearch({
          ...result.tally,
          threads: result.threads || 1,
          ms: Date.now() - startedAt,
        });
      }
      setBusy(false);
      setFirst(false);
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
  /* The header: what the jump bar waits for the page to scroll past. */
  const headRef = useRef<HTMLElement | null>(null);
  /* Two columns or one. The stylesheet draws the difference; this is what
     decides where the route stands — see `useWide`. */
  const wide = useWide();
  const ask = useStickyTop(SPACE.xl);
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
      left: r.left,
      msg: `Loaded ${r.took} settings${r.left ? `, ${r.left} left at their defaults` : ""}.`,
    };
  };

  /* The address is the design. Written on every change, replacing rather
     than pushing so the back button is not a history of slider moves, and
     only once the roster has loaded, or the defaults would go over a link
     the reader arrived by before it was read. #140 */
  useEffect(() => {
    if (!hydrated || !canLink()) return;
    let live = true;
    toLink(configText).then((hash) => {
      if (live) history.replaceState(null, "", hash);
    });
    return () => {
      live = false;
    };
  }, [hydrated, configText]);

  /* The link for the design as it stands: this page, with the hash. Built
     on demand rather than read back from the address, which is a moment
     behind it. */
  const linkFor = async () => {
    const url = new URL(location.href);
    url.hash = await toLink(configText);
    return url.href;
  };
  /* The phone's share sheet where there is one; the clipboard where not. A
     clipboard that refuses is not the end of it — the address bar holds the
     same link — and the callout says where to find it. */
  const share = async () => {
    const url = await linkFor();
    try {
      if (navigator.share) {
        await navigator.share({ url, title: craft.name });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote({ severity: "good", title: "Link copied." });
    } catch (e) {
      /* Dismissing the share sheet rejects with AbortError; that is a
         choice, not a failure. */
      if (e instanceof Error && e.name === "AbortError") return;
      setNote({
        severity: "bad",
        title: "Could not copy the link — it is in the address bar.",
      });
    }
  };

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
    return k && BODY_HUE[k] ? edgeOf(BODY_HUE[k], theme) : palette(theme).sky;
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

  /* The three things to try when nothing solves, as the callout's buttons.
     The cut goes at the first place the route can be cut and is not — after
     the climb to orbit, for a mission that starts on the pad — which is
     where a cut most often turns one impossible vehicle into two possible
     ones. The rule for where a cut may go is `RouteMap`'s, repeated. #139 */
  const shownLegs = route.filter((l) => !l.free).length;
  const nextCut = route.findIndex(
    (l, i) => !l.free && i !== shownLegs - 1 && !effCuts.has(i),
  );
  const tryCut = nextCut < 0 ? undefined : () => toggleCut(nextCut);
  const tryTech = () => {
    setShowSetup(true);
    setShowTech(true);
  };
  const tryHalf =
    payload > 0.1
      ? edit(() => setPayload(Math.max(0.1, Math.round(payload * 5) / 10)))
      : undefined;

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

  const brief = (
    <Brief
      wide={wide}
      open={briefOpen}
      onToggle={() => {
        touched.current = true;
        setBriefOpen(!briefOpen);
      }}
      onDone={() => setBriefOpen(false)}
      line={briefLine({
        origin,
        dest,
        profile: effProfile,
        returning,
        payload,
        objective,
      })}
      budget={budget}
      accent={dcolor}
      top={viewTop}
      onShare={canLink() ? share : undefined}
      moreOpen={showMore}
      onToggleMore={() => setShowMore(!showMore)}
      origin={origin}
      onOrigin={edit(pickOrigin)}
      originOpen={showOrigin}
      onToggleOrigin={() => setShowOrigin(!showOrigin)}
      dest={dest}
      destList={destList}
      onDest={edit(pickDest)}
      profile={effProfile}
      canLand={canLand}
      orbitHere={orbitHere}
      onProfile={edit(setProfile)}
      returning={returning}
      onReturning={edit(setReturning)}
      payload={payload}
      onPayload={edit(setPayload)}
      margin={margin}
      onMargin={edit(setMargin)}
      payloadDia={payloadDia}
      onPayloadDia={edit(setPayloadDia)}
      maxAspect={maxAspect}
      onMaxAspect={edit(setMaxAspect)}
      extraDv={extraDv}
      onExtraDv={edit(setExtraDv)}
      crossfeedOk={crossfeedOk}
      asparagus={asparagus}
      onAsparagus={edit(setAsparagus)}
      objective={objective}
      onObjective={edit(setObjective)}
      needGimbal={needGimbal}
      onNeedGimbal={edit(setNeedGimbal)}
      srbAvail={srbAvail}
      boosters={boosters}
      onBoosters={edit(setBoosters)}
      airDescent={airDescent}
      chutes={chutes}
      onChutes={edit(setChutes)}
    />
  );

  const routeSection = (
    <RouteSection
      route={route}
      cuts={effCuts}
      busy={first}
      onToggleCut={toggleCut}
      onPlaneMode={setPlaneNow}
      stages={stages}
      budget={budget}
      color={dcolor}
    />
  );

  return (
    <div
      className="page"
      style={{
        background: C.ink,
        color: C.paper,
        /* dvh, not vh: a phone's address bar comes and goes, and the page
           is as tall as what is left. */
        minHeight: "100dvh",
        fontFamily: FONT,
        /* The notch's strip and the rounded corners' on a phone held
           sideways; the foot is the stylesheet's, which knows about the
           jump bar. */
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <style>{STYLES}</style>

      {/* ---------------------------- header ---------------------------- */}
      <header
        ref={headRef}
        style={{
          borderBottom: `1px solid ${C.rule}`,
          background: C.panel,
          padding: "18px 20px",
          display: "flex",
          gap: 20,
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          {/* What is installed: the setup sheet's summary, and the one line
              of it that belongs on the page. */}
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
        <IconButton
          icon={Settings}
          label="Setup"
          on={showSetup}
          onClick={() => setShowSetup(true)}
        />
      </header>

      <Sheet open={showSetup} onClose={closeSetup} title="Setup">
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
          theme={themePref}
          onTheme={setThemePref}
          search={search}
          configText={configText}
          linkFor={canLink() ? linkFor : undefined}
          onLoad={applyConfig}
        />
      </Sheet>

      {/* The shell. On the phone, one column in reading order: the brief,
          the three results, the route. On a wide screen the same flow gains
          a second column rather than becoming a different application: the
          two things that are inputs — the brief and the route, since a cut
          changes the rocket — stand on the left and hold their place as the
          results scroll; the three results take the rest. The route moves
          between the two in the tree, not just on the screen, so what a
          reader is read matches what they see. #137 */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: wide ? "360px minmax(0,1fr)" : "minmax(0,1fr)",
          gap: SPACE.xl,
          padding: SPACE.xl,
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        {/* ---------------------------- the brief ---------------------------- */}
        {wide ? (
          <div
            ref={ask.ref}
            style={{
              position: "sticky",
              top: ask.top,
              alignSelf: "start",
              display: "grid",
              gap: SPACE.xl,
            }}
          >
            {brief}
            <Veil busy={busy}>{routeSection}</Veil>
          </div>
        ) : (
          brief
        )}

        {/* Solving can take seconds at full tech, so say so plainly rather
            than with a hairline. Held back 120 ms so quick recalculations do
            not flash. */}
        <Solving
          busy={busy}
          top={viewTop}
          label={`Solving ${origin} → ${dest}…`}
          status={
            busy
              ? `Solving ${origin} → ${dest}…`
              : first
                ? ""
                : ok
                  ? `${craft.name}: ${fmt(liftoff, 1)} t at liftoff.`
                  : "No solution for at least one stage."
          }
        >
          <Results
            stages={stages}
            ok={ok}
            first={first}
            note={note}
            noteStyle={noteFade}
            onCut={tryCut}
            onTech={tryTech}
            onHalve={tryHalf}
            splitBy={splitBy}
            onSetSplit={setSplit}
            geom={geom}
            maxAspect={maxAspect}
            ascent={ascent}
            returnAscent={returnAscent}
            payload={payload}
            payloadDia={payloadDia}
            hardware={hardware}
            craft={craft}
            liftoff={liftoff}
            totalParts={totalParts}
            vehicleClass={vehicleClass}
            color={dcolor}
            theme={theme}
          />
          {!wide && routeSection}
        </Solving>
      </main>

      {/* Outside <Solving> on purpose, and last on the page — and outside
          <main>, since it is the page's footer and not its content.

            Everything inside that wrapper drops to 22% opacity, greys out and
            stops taking clicks while a solve runs — which at full tech is
            seconds at a time. Where the source is and what the terms are do not
            depend on the design being computed, so they should not blink out
            with it. #52.

            The wording states the position rather than leaving it to the link:
            a working tool with a bare "licence" link invites the assumption
            that it is open source, and this one is not. */}
      <footer
        className="note"
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: `0 ${SPACE.xl}px ${SPACE.xl}px`,
        }}
      >
        <div
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
      </footer>
      <JumpBar past={headRef} />
    </div>
  );
}

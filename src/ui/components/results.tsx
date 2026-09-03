import { useState } from "react";
import { fmt, hms } from "../format.js";
import { C, RADIUS, SPACE } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { BuildView } from "./build.jsx";
import { AscentPanel } from "./flight.jsx";
import { LEGEND, PartsTable } from "./parts.jsx";
import { Callout, Choice, Section, Stat } from "./primitives.jsx";
import { RouteMap } from "./route.jsx";
import { StageStack } from "./stages.jsx";
import type { Leg } from "../../core/orbits.js";
import type { PlanStage } from "../../core/plan.js";
import type { Ascent } from "./flight.jsx";
import type { Hardware } from "./parts.jsx";

type ResultsProps = {
  route: ReadonlyArray<Leg>;
  cuts: Set<number>;
  onToggleCut: (i: number) => void;
  onPlaneMode: (now: boolean) => void;
  stages: ReadonlyArray<PlanStage>;
  /* Every stage solved. */
  ok: boolean;
  splitBy: Map<number, number>;
  onSetSplit: (key: number, k: number) => void;
  geom: { h: number; w: number; ar: number };
  maxAspect: number;
  ascent: Ascent | null;
  returnAscent: Ascent | null;
  payload: number;
  payloadDia: number;
  hardware: Hardware | null;
  /* The headline figures: what the rocket is called and what it comes to. */
  craft: { name: string; sub: string };
  liftoff: number;
  totalCost: number;
  totalParts: number;
  vehicleClass: string;
  /* The mission's Δv, for the route's summary line. */
  budget: number;
  color: string;
  theme: Theme;
};

/* The two lists a build section can show: the design, or the bill. */
type Tab = "stages" | "order";

/* The one line a flight folds to: what it costs, when the engine stops, and
   what closes the orbit. Not a flight at all where the design never got up. */
const flightLine = (a: Ascent) =>
  a.ok
    ? `${fmt(a.total)} m/s · MECO T+${hms(a.tMeco ?? a.t)} · circularise ${fmt(a.circ)} m/s`
    : `does not reach orbit from ${a.bodyName}`;

/* Everything downstream of the solve, in the order a reader uses it: the
   rocket, how to build it, how to fly it, where it goes. Each is a section
   that folds to a line; the route starts folded unless it has been cut, since
   a cut is the one thing on it that changes the rocket. #134 */
function Results(p: ResultsProps) {
  const [rocketOpen, setRocketOpen] = useState(true);
  const [buildOpen, setBuildOpen] = useState(true);
  const [flyOpen, setFlyOpen] = useState(true);
  const [routeOpen, setRouteOpen] = useState(p.cuts.size > 0);
  const [tab, setTab] = useState<Tab>("stages");

  const dash = (v: string | number) => (p.ok ? v : "—");
  const flights = [p.ascent, p.returnAscent].filter((a) => a !== null);

  return (
    <>
      <Section
        heading="Your rocket"
        summary={`${p.craft.name} · ${dash(fmt(p.liftoff, 1))} t`}
        open={rocketOpen}
        onToggle={() => setRocketOpen(!rocketOpen)}
      >
        {!p.ok && (
          <Callout
            severity="bad"
            title="No solution for at least one stage."
            style={{ marginBottom: 14 }}
          >
            A single stock stage tops out near Isp·g₀·ln 9. Add a staging cut on
            the route, unlock a higher-Isp engine, or lower the payload.
          </Callout>
        )}
        {p.ok && p.geom.ar > p.maxAspect && (
          <Callout
            severity="warn"
            title={`${p.geom.h.toFixed(0)} m on a ${p.geom.w.toFixed(2)} m core — ${p.geom.ar.toFixed(1)}:1.`}
            style={{ marginBottom: 14 }}
          >
            {p.geom.ar > 20
              ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
              : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
            <div style={{ color: C.muted, marginTop: 6 }}>
              Forcing a segment to fewer stages trades mass for a squatter stack
              — one stage instead of three is heavier but roughly half the
              aspect ratio. Optimising for cost or fewest parts also builds
              wider, since the cheap and the self-fuelled parts are the fat
              ones.
            </div>
          </Callout>
        )}

        {/* The name and the headline figures. Step 11 (#138) makes the rocket
            the hero; this is the row beside it. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 26,
            alignItems: "flex-end",
            marginBottom: p.stages.some((x) => x.sol) ? SPACE.xl : 0,
          }}
        >
          <div style={{ maxWidth: 340 }}>
            <div className="label" style={{ marginBottom: 3 }}>
              Save it as
            </div>
            <div
              className="body"
              style={{ color: C.paper, fontWeight: 600, lineHeight: 1.25 }}
            >
              {p.craft.name}
            </div>
            <div className="note" style={{ marginTop: 2 }}>
              {p.craft.sub}
            </div>
          </div>
          <Stat label="Liftoff mass" value={dash(fmt(p.liftoff, 1))} unit="t" />
          <Stat label="Stages" value={dash(p.stages.length)} unit="" />
          <Stat
            label="Height"
            value={dash(p.geom.h.toFixed(1))}
            unit="m"
            small
          />
          <Stat
            label="Aspect"
            value={dash(p.geom.ar.toFixed(1))}
            unit=":1"
            color={p.ok && p.geom.ar > p.maxAspect ? C.amber : undefined}
            small
          />
          <Stat
            label="Cost"
            value={dash(fmt(p.totalCost))}
            unit="funds"
            small
          />
          <Stat label="Parts" value={dash(p.totalParts)} unit="" small />
          <Stat label="Class" value={p.vehicleClass} unit="" small />
        </div>

        {/* The heading lives in BuildView, with the full-screen button beside
            it, so the overlay carries its own title. #99 */}
        {p.stages.some((x) => x.sol) && (
          <BuildView
            stages={p.stages}
            payload={p.payload}
            payloadDia={p.payloadDia}
            color={p.color}
            theme={p.theme}
            maxAspect={p.maxAspect}
          />
        )}
      </Section>

      <Section
        heading="How to build it"
        summary={`${dash(p.stages.length)} stages · ${dash(p.totalParts)} parts · ${dash(fmt(p.liftoff, 1))} t`}
        open={buildOpen}
        onToggle={() => setBuildOpen(!buildOpen)}
        aside={
          buildOpen ? (
            <Choice
              label="Show"
              value={tab}
              onChange={setTab}
              options={[
                { value: "stages", label: "By stage" },
                { value: "order", label: "Build order" },
              ]}
            />
          ) : undefined
        }
      >
        {tab === "stages" ? (
          <>
            <div className="note" style={{ marginBottom: SPACE.lg }}>
              Stage 1 at the bottom, the way it stacks.
            </div>
            <StageStack
              stages={p.stages}
              color={p.color}
              splitBy={p.splitBy}
              onSetSplit={p.onSetSplit}
            />
          </>
        ) : (
          <>
            <div className="note" style={{ marginBottom: SPACE.md }}>
              Top of the stack first, working down to the pad — the order you
              assemble it in.
            </div>
            <div
              className="note"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                marginBottom: SPACE.lg,
                color: C.dim,
              }}
            >
              {LEGEND.map(([lab, col]) => (
                <span
                  key={lab}
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: RADIUS.sm,
                      background: col,
                    }}
                  />
                  {lab}
                </span>
              ))}
            </div>
            <PartsTable
              stages={p.stages}
              payload={p.payload}
              hardware={p.hardware}
              color={p.color}
            />
          </>
        )}
      </Section>

      {flights.length > 0 && (
        <Section
          heading="How to fly it"
          summary={flightLine(flights[0])}
          open={flyOpen}
          onToggle={() => setFlyOpen(!flyOpen)}
        >
          {p.ascent && (
            <>
              <div className="note" style={{ marginBottom: SPACE.lg }}>
                Simulated ascent from {p.ascent.bodyName} · real atmosphere,
                real Isp curves, integrated drag.
              </div>
              <AscentPanel a={p.ascent} color={p.color} />
            </>
          )}
          {p.returnAscent && (
            <>
              <div
                className="label"
                style={{
                  margin: `${p.ascent ? SPACE.xxl : 0}px 0 ${SPACE.lg}px`,
                }}
              >
                The climb home from {p.returnAscent.bodyName}
              </div>
              <AscentPanel a={p.returnAscent} color={p.color} />
            </>
          )}
        </Section>
      )}

      <Section
        heading="Where it goes"
        summary={`${p.route.length} legs · ${fmt(p.budget)} m/s · ${
          p.cuts.size === 0
            ? "one span"
            : `${p.cuts.size} cut${p.cuts.size === 1 ? "" : "s"}`
        }`}
        open={routeOpen}
        onToggle={() => setRouteOpen(!routeOpen)}
        gap={SPACE.sm}
      >
        <div className="note" style={{ marginBottom: SPACE.xl }}>
          Read bottom to top. Tap a{" "}
          <strong style={{ color: C.paper }}>scissor gap</strong> between
          stations to add or remove a staging event, and the whole mission is
          solved as one span until you add one. Cut where the hardware genuinely
          parts company — a lander left in orbit, a transfer stage dropped
          before descent — or where a segment will not close.
        </div>
        <RouteMap
          route={p.route}
          cuts={p.cuts}
          onToggle={p.onToggleCut}
          color={p.color}
          stages={p.stages}
          onPlaneMode={p.onPlaneMode}
        />
      </Section>

      <footer className="note" style={{ color: C.dim, padding: "4px 2px" }}>
        Part masses, costs, tech nodes and Isp curves are read from KSP 1.12.5
        configs — Squad, Breaking Ground and ReStock+. Making History is off by
        default because it is not installed. Atmospheres are the exact stock
        pressure and temperature splines, and Isp follows each engine's own
        atmosphereCurve, so a vacuum bell correctly produces nothing at Eve's
        surface. Ascents are flown, not estimated: an RK4 integration at 0.1 s
        searches a two-parameter gravity turn, with drag assembled the way KSP
        assembles it, from the curves and constants in Physics.cfg.{" "}
        <strong style={{ color: C.muted }}>
          Where it is still approximate:
        </strong>{" "}
        drag counts only the frontal area against one representative cube
        coefficient, so nothing is occluded, a nose cone buys nothing, and
        neither does a fairing. Staging is serial — no asparagus, which is why
        an Eve return does not close. Δv between bodies is a Hohmann transfer
        through the real orbital elements, ignoring the eccentricity and the
        launch window you actually get. Whether a design flies is judged by this
        simulator, not by the game.
      </footer>
    </>
  );
}

export { Results };

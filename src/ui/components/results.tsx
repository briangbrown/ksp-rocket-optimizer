import { useState } from "react";
import { fmt, hms } from "../format.js";
import { C, SPACE } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { BuildView } from "./build.jsx";
import { AscentPanel, FLYING_IT, methodology } from "./flight.jsx";
import { PartsTable } from "./parts.jsx";
import { Callout, Choice, Disclosure, Section, Stat } from "./primitives.jsx";
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
        id="rocket"
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
            more="A single stock stage tops out near Isp·g₀·ln 9: however much tank you add, the empty tank comes with it."
          >
            Add a staging cut on the route, unlock a higher-Isp engine, or lower
            the payload.
          </Callout>
        )}
        {p.ok && p.geom.ar > p.maxAspect && (
          <Callout
            severity="warn"
            title={`${p.geom.h.toFixed(0)} m on a ${p.geom.w.toFixed(2)} m core — ${p.geom.ar.toFixed(1)}:1.`}
            style={{ marginBottom: 14 }}
            more="Forcing a segment to fewer stages trades mass for a squatter stack — one stage instead of three is heavier but roughly half the aspect ratio. Optimising for cost or fewest parts also builds wider, since the cheap and the self-fuelled parts are the fat ones."
          >
            {p.geom.ar > 20
              ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
              : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
          </Callout>
        )}

        {/* The name and the headline figures. Step 11 (#138) makes the rocket
            the hero; this is the row beside it. The gap is the stylesheet's:
            26 on desktop, and on the phone 12, with the name on a line of
            its own, which is what lets seven figures fall on two lines
            rather than three. #136 */}
        <div
          className="hero"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: p.stages.some((x) => x.sol) ? SPACE.xl : 0,
          }}
        >
          <div className="hero-name" style={{ maxWidth: 340 }}>
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
        id="build"
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
          <StageStack
            stages={p.stages}
            color={p.color}
            splitBy={p.splitBy}
            onSetSplit={p.onSetSplit}
          />
        ) : (
          <>
            <div className="note" style={{ marginBottom: SPACE.lg }}>
              Top of the stack first, working down to the pad — the order you
              assemble it in.
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
          id="fly"
          heading="How to fly it"
          summary={flightLine(flights[0])}
          open={flyOpen}
          onToggle={() => setFlyOpen(!flyOpen)}
        >
          {p.ascent && <AscentPanel a={p.ascent} color={p.color} />}
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
          {/* The methodology and the long form of "fly the clock", for the
              reader who wants to know what was computed and how to read the
              table — at the foot, where the footnotes used to be. */}
          <div style={{ marginTop: SPACE.lg }}>
            <Disclosure
              label="How this was computed"
              caption="How this was computed"
            >
              {flights.map((a) => (
                <p key={a.bodyName} style={{ margin: `0 0 ${SPACE.md}px` }}>
                  {methodology(a)}
                </p>
              ))}
              <p style={{ margin: 0 }}>{FLYING_IT}</p>
            </Disclosure>
          </div>
        </Section>
      )}

      <Section
        id="route"
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
          Cut where the hardware parts company.
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
    </>
  );
}

export { Results };

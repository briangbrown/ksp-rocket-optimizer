import { useState } from "react";
import { fmt, hms } from "../format.js";
import { SPACE } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { BuildView } from "./build.jsx";
import { AscentPanel, FLYING_IT, methodology } from "./flight.jsx";
import { PartsTable } from "./parts.jsx";
import { Callout, Choice, Disclosure, Section } from "./primitives.jsx";
import { RouteMap } from "./route.jsx";
import { StageStack } from "./stages.jsx";
import type { Leg } from "../../core/orbits.js";
import type { PlanStage } from "../../core/plan.js";
import type { Ascent } from "./flight.jsx";
import type { Hardware } from "./parts.jsx";

type RouteProps = {
  route: ReadonlyArray<Leg>;
  cuts: Set<number>;
  onToggleCut: (i: number) => void;
  onPlaneMode: (now: boolean) => void;
  stages: ReadonlyArray<PlanStage>;
  /* The mission's Δv, for the summary line. */
  budget: number;
  color: string;
};

type ResultsProps = {
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
  totalParts: number;
  vehicleClass: string;
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

/* Where it goes. Its own component because the desktop shell stands it
   beside the brief — it is the one result a reader edits — and the phone
   stands it last; `app.tsx` decides which. It starts folded unless it has
   been cut, since a cut is the one thing on it that changes the rocket.
   #134, #137 */
function RouteSection(p: RouteProps) {
  const [open, setOpen] = useState(p.cuts.size > 0);
  return (
    <Section
      id="route"
      heading="Where it goes"
      summary={`${p.route.length} legs · ${fmt(p.budget)} m/s · ${
        p.cuts.size === 0
          ? "one span"
          : `${p.cuts.size} cut${p.cuts.size === 1 ? "" : "s"}`
      }`}
      open={open}
      onToggle={() => setOpen(!open)}
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
  );
}

/* Everything downstream of the solve, in the order a reader uses it: the
   rocket, how to build it, how to fly it. Each is a section that folds to a
   line. #134 */
function Results(p: ResultsProps) {
  const [rocketOpen, setRocketOpen] = useState(true);
  const [buildOpen, setBuildOpen] = useState(true);
  const [flyOpen, setFlyOpen] = useState(true);
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

        {/* The rocket is the hero: the name stands over the drawing and the
            headline figures under it, both inside `BuildView`, which is also
            where the full-screen button is, so the overlay carries its own
            title. Where nothing solved there is no drawing, and the name and
            a row of dashes stand over the callout above. #99, #138 */}
        <BuildView
          stages={p.stages}
          payload={p.payload}
          payloadDia={p.payloadDia}
          craft={p.craft}
          vehicleClass={p.vehicleClass}
          color={p.color}
          theme={p.theme}
          maxAspect={p.maxAspect}
        />
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
    </>
  );
}

export { Results, RouteSection };

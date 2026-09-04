import { useState } from "react";
import { Scissors, Settings } from "lucide-react";
import { fmt, hms } from "../format.js";
import { SPACE } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { BuildView } from "./build.jsx";
import { AscentPanel, FLYING_IT, methodology } from "./flight.jsx";
import { PartsTable } from "./parts.jsx";
import {
  Callout,
  Choice,
  Disclosure,
  ICON,
  STROKE,
  Section,
} from "./primitives.jsx";
import type { CSSProperties } from "react";
import type { Note } from "./primitives.jsx";
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
  /* Before the first solve: the heading over a skeleton line. */
  busy?: boolean;
};

type ResultsProps = {
  stages: ReadonlyArray<PlanStage>;
  /* Every stage solved. */
  ok: boolean;
  /* No solve has come back yet: the sections show their shape and nothing
     else. */
  first: boolean;
  /* What the page has to say about the design as a whole — the link it
     arrived by, the link just copied — over the rocket, where the
     unsolvable callout also stands. `noteStyle` carries its fade. #140 */
  note: Note | null;
  noteStyle: CSSProperties;
  /* What to try when nothing solves, each absent where it cannot apply —
     every leg already cut, the payload already at its floor. */
  onCut?: () => void;
  onTech: () => void;
  onHalve?: () => void;
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
      busy={p.busy}
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
        busy={p.first}
      >
        {p.note && (
          <Callout
            severity={p.note.severity}
            title={p.note.title}
            style={{ marginBottom: 14, ...p.noteStyle }}
          />
        )}
        {/* The three things to try are buttons that try them, not a sentence
            that names them. A chip each, with the icon where one is
            established — the route's scissors, the setup's cog — and the
            word where none is (docs/design.md §7). #139 */}
        {!p.ok && (
          <Callout
            severity="bad"
            title="No solution for at least one stage."
            style={{ marginBottom: 14 }}
            more="A single stock stage tops out near Isp·g₀·ln 9: however much tank you add, the empty tank comes with it. Cutting the route makes it two vehicles with a stage limit each; a higher-Isp engine raises the ceiling; a lighter payload needs less of it."
            actions={
              <>
                <button
                  className="chip"
                  onClick={p.onCut}
                  disabled={p.onCut === undefined}
                >
                  <Scissors size={ICON.chip} strokeWidth={STROKE} aria-hidden />
                  Cut the route
                </button>
                <button className="chip" onClick={p.onTech}>
                  <Settings size={ICON.chip} strokeWidth={STROKE} aria-hidden />
                  Open the tech tree
                </button>
                <button
                  className="chip"
                  onClick={p.onHalve}
                  disabled={p.onHalve === undefined}
                >
                  Halve the payload
                </button>
              </>
            }
          />
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
        busy={p.first}
        aside={
          buildOpen && !p.first ? (
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

      {(flights.length > 0 || p.first) && (
        <Section
          id="fly"
          heading="How to fly it"
          summary={flights.length > 0 ? flightLine(flights[0]) : undefined}
          open={flyOpen}
          onToggle={() => setFlyOpen(!flyOpen)}
          busy={p.first}
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

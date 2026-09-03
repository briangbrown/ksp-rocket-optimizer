import { C, RADIUS, SPACE } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { BuildView } from "./build.jsx";
import { AscentPanel } from "./flight.jsx";
import { LEGEND, PartsTable } from "./parts.jsx";
import { Callout, Section } from "./primitives.jsx";
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
  color: string;
  theme: Theme;
};

/* Everything downstream of the solve: the route with its cuts, the stages, the
   flights, the drawing, the parts and the configuration that reproduces it. */
function Results(p: ResultsProps) {
  return (
    <>
      <div
        style={{
          display: "grid",
          gap: SPACE.xl,
          gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
        }}
      >
        <Section heading="Route · read bottom to top" gap={SPACE.sm}>
          <div className="note" style={{ marginBottom: SPACE.xl }}>
            Tap a <strong style={{ color: C.paper }}>scissor gap</strong>{" "}
            between stations to add or remove a staging event, and the whole
            mission is solved as one span until you add one. Cut where the
            hardware genuinely parts company — a lander left in orbit, a
            transfer stage dropped before descent — or where a segment will not
            close.
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

        <Section heading="Vehicle · stage 1 at the bottom">
          {!p.ok && (
            <Callout
              severity="bad"
              title="No solution for at least one stage."
              style={{ marginBottom: 14 }}
            >
              A single stock stage tops out near Isp·g₀·ln 9. Add a staging cut
              on the route, unlock a higher-Isp engine, or lower the payload.
            </Callout>
          )}
          <StageStack
            stages={p.stages}
            color={p.color}
            splitBy={p.splitBy}
            onSetSplit={p.onSetSplit}
          />
        </Section>
      </div>

      {p.ok && p.geom.ar > p.maxAspect && (
        <Callout
          severity="warn"
          title={`${p.geom.h.toFixed(0)} m on a ${p.geom.w.toFixed(2)} m core — ${p.geom.ar.toFixed(1)}:1.`}
          style={{ background: C.panel, padding: 14 }}
        >
          {p.geom.ar > 20
            ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
            : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
          <div style={{ color: C.muted, marginTop: 6 }}>
            Forcing a segment to fewer stages trades mass for a squatter stack —
            one stage instead of three is heavier but roughly half the aspect
            ratio. Optimising for cost or fewest parts also builds wider, since
            the cheap and the self-fuelled parts are the fat ones.
          </div>
        </Callout>
      )}

      {p.ascent && (
        <Section heading="Simulated ascent from Kerbin · real atmosphere, real Isp curves, integrated drag">
          <AscentPanel a={p.ascent} color={p.color} />
        </Section>
      )}
      {p.returnAscent && (
        <Section
          heading={`Simulated ascent from ${p.returnAscent.bodyName} · the climb home`}
        >
          <AscentPanel a={p.returnAscent} color={p.color} />
        </Section>
      )}

      {/* The heading lives in BuildView, with the full-screen button beside
          it, so the overlay carries its own title. #99 */}
      {p.stages.some((x) => x.sol) && (
        <section className="card" style={{ padding: SPACE.xl }}>
          <BuildView
            stages={p.stages}
            payload={p.payload}
            payloadDia={p.payloadDia}
            color={p.color}
            theme={p.theme}
            maxAspect={p.maxAspect}
          />
        </section>
      )}

      <Section heading="Parts list · build order" gap={3}>
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

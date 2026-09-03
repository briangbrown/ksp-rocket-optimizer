import { Undo2 } from "lucide-react";
import { PROFILES, SYS } from "../../core/orbits.js";
import { OBJECTIVES, OBJECTIVE_HINT, fmt } from "../format.js";
import { C, RADIUS, SHADOW, SPACE, Z } from "../tokens.js";
import { BodyPicker } from "./route.jsx";
import {
  Choice,
  Disclosure,
  Field,
  ICON,
  STROKE,
  Section,
  Toggle,
} from "./primitives.jsx";
import type { CSSProperties } from "react";
import type { Objective } from "../../core/performance.js";

type BriefProps = {
  /* Open, the brief is the form. Set, it is one line under the solving bar,
     stuck to the top of the page so it is a tap away from anywhere. */
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
  /* The set line — briefLine in format.ts — and the Δv budget beside it. */
  line: string;
  budget: number;
  /* The Δv accent: the destination's own hue. */
  accent: string;
  /* How far the visual viewport has been pushed down the layout one, which
     is where "the top of the page" actually is — `.claude/rules/ui.md`. */
  top: number;
  moreOpen: boolean;
  onToggleMore: () => void;
  origin: string;
  onOrigin: (b: string) => void;
  originOpen: boolean;
  onToggleOrigin: () => void;
  dest: string;
  destList: ReadonlyArray<string>;
  onDest: (d: string) => void;
  /* The profile in force, which is not always the one chosen: a landing
     falls back to orbit where there is nothing to land on. */
  profile: string;
  canLand: boolean;
  orbitHere: boolean;
  onProfile: (p: string) => void;
  returning: boolean;
  onReturning: (on: boolean) => void;
  payload: number;
  onPayload: (v: number) => void;
  margin: number;
  onMargin: (v: number) => void;
  payloadDia: number;
  onPayloadDia: (v: number) => void;
  maxAspect: number;
  onMaxAspect: (v: number) => void;
  extraDv: number;
  onExtraDv: (v: number) => void;
  crossfeedOk: boolean;
  asparagus: boolean;
  onAsparagus: (on: boolean) => void;
  objective: Objective;
  onObjective: (o: Objective) => void;
  needGimbal: boolean;
  onNeedGimbal: (on: boolean) => void;
  srbAvail: boolean;
  boosters: boolean;
  onBoosters: (on: boolean) => void;
  airDescent: boolean;
  chutes: boolean;
  onChutes: (on: boolean) => void;
};

/* The mission: where to, what kind, what it carries, how much margin, and
   what the search is asked for — in the order you decide it. Everything here
   changes run to run, which is why none of it is saved. Once it is decided
   the card folds to a line and the page below it is all result. */
function Brief(p: BriefProps) {
  /* Set: stuck under the solving bar, bled to the page edges so the results
     scroll under it rather than past it. `top` follows the visual viewport
     for the same reason the solving bar does. */
  const stuck: CSSProperties | undefined = p.open
    ? undefined
    : {
        position: "sticky",
        top: 0,
        zIndex: Z.brief,
        transform: `translateY(${p.top}px)`,
        /* Up as well as out: the grid's top padding would otherwise show
           as a strip of ink between the header and the bar. */
        margin: `-${SPACE.xl}px -${SPACE.xl}px 0`,
        borderRadius: RADIUS.none,
        borderWidth: "0 0 1px",
        boxShadow: SHADOW.bar,
      };
  return (
    <Section
      heading="Brief"
      summary={p.line}
      open={p.open}
      onToggle={p.onToggle}
      style={stuck}
      aside={
        <span className="figure" style={{ color: p.accent }}>
          {fmt(p.budget)}
          <span className="note" style={{ color: C.dim, marginLeft: SPACE.sm }}>
            m/s
          </span>
        </span>
      }
    >
      <div className="label" style={{ marginBottom: SPACE.md }}>
        Where to
      </div>
      <BodyPicker value={p.dest} options={p.destList} onPick={p.onDest} />

      {/* Almost every mission starts at Kerbin, so the full sixteen-body
          picker is a lot of furniture for a choice nobody makes. Folded
          beneath the destination, which is the thing you came to change. */}
      <Section
        bare
        heading="Launching from"
        summary={p.origin}
        open={p.originOpen}
        onToggle={p.onToggleOrigin}
        gap={10}
        style={{ margin: `${SPACE.lg}px 0 ${SPACE.xl}px` }}
      >
        {p.origin !== "Kerbin" && (
          <button
            className="chip"
            style={{ marginBottom: SPACE.md }}
            onClick={() => p.onOrigin("Kerbin")}
          >
            <Undo2 size={ICON.chip} strokeWidth={STROKE} aria-hidden />
            back to Kerbin
          </button>
        )}
        <BodyPicker
          value={p.origin}
          options={Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent)}
          onPick={p.onOrigin}
        />
      </Section>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: SPACE.xl,
        }}
      >
        <Choice
          label="Mission profile"
          value={p.profile}
          onChange={p.onProfile}
          style={{ gap: 6 }}
          options={Object.entries(PROFILES).map(([k, v]) => ({
            value: k,
            label: v.name,
            disabled: k === "land" && !p.canLand,
          }))}
        />
        <span
          style={{
            width: 1,
            alignSelf: "stretch",
            background: C.rule,
            margin: "0 4px",
          }}
        />
        <Toggle label="Return trip" on={p.returning} onChange={p.onReturning} />
      </div>
      {!p.orbitHere && !p.canLand && (
        <div
          className="note"
          style={{ marginTop: -10, marginBottom: SPACE.xl }}
        >
          {p.dest} has no surface to land on, so this is an orbital mission.
        </div>
      )}
      {p.orbitHere && (
        <div
          className="note"
          style={{ marginTop: -10, marginBottom: SPACE.xl }}
        >
          You are launching straight into this orbit, so there is no arrival to
          shape — nothing to fly by, capture into, or land on.
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          marginBottom: SPACE.xl,
        }}
      >
        <Field
          label="Payload delivered"
          value={p.payload}
          min={0.1}
          max={60}
          step={0.1}
          hardMax={2000}
          unit="t"
          onChange={p.onPayload}
          hint="Everything not counted as engine or tank: pod, probe, science, rover, cargo — and the lander's own kit, its legs and heat shield included."
        />
        <Field
          label="Payload width"
          value={p.payloadDia}
          min={0.625}
          max={5}
          step={0.625}
          unit="m"
          hardMax={10}
          onChange={p.onPayloadDia}
          hint="How wide the thing you are lifting actually is. It sets the drag the stack has to push through, and on a small rocket the payload is often the widest part of it."
        />
        <Field
          label="Δv margin"
          value={p.margin}
          min={0}
          max={40}
          step={1}
          unit="%"
          hardMax={100}
          onChange={p.onMargin}
          hint="Reserve over the map value for inefficiency and correction burns."
        />
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: SPACE.md,
            }}
          >
            <span className="label">Optimise for</span>
            <Disclosure
              label="About the objectives"
              style={{ marginLeft: SPACE.xs }}
            >
              {OBJECTIVES.map(([k]) => (
                <div key={k}>{OBJECTIVE_HINT[k]}</div>
              ))}
            </Disclosure>
          </div>
          <Choice
            label="Optimise for"
            value={p.objective}
            onChange={p.onObjective}
            options={OBJECTIVES.map(([k, lab]) => ({
              value: k,
              label: lab,
              hint: OBJECTIVE_HINT[k],
            }))}
          />
        </div>
      </div>

      {/* The defaults are right for most missions, and these were fighting
          the inputs above for a row. */}
      <Section
        bare
        heading="More options"
        open={p.moreOpen}
        onToggle={p.onToggleMore}
        gap={SPACE.lg}
        style={{ marginBottom: SPACE.xl }}
      >
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          }}
        >
          <Field
            label="Slenderness limit"
            value={p.maxAspect}
            min={6}
            max={30}
            step={0.5}
            unit=":1"
            hardMax={60}
            onChange={p.onMaxAspect}
            hint="Tallest the stack may be relative to its widest point, boosters excluded — they stage away inside the atmosphere and what is left has to stay pointed. A pencil wobbles, needs struts and flips under load."
          />
          <Field
            label="Extra Δv"
            value={p.extraDv}
            min={0}
            max={1500}
            step={10}
            unit="m/s"
            hardMax={9000}
            onChange={p.onExtraDv}
            hint="A flat reserve added after the margin, carried on the top stage — for rendezvous, a contract you have not planned yet, or getting home when the map was optimistic."
          />
          <div>
            <div className="label" style={{ marginBottom: SPACE.md }}>
              Atmospheric descent
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Toggle
                label="Gimbal in atmosphere"
                on={p.needGimbal}
                onChange={p.onNeedGimbal}
              />
              <Toggle
                label="Solid boosters allowed"
                on={p.srbAvail && p.boosters}
                disabled={!p.srbAvail}
                onChange={p.onBoosters}
              />
              <Toggle
                label="Parachutes fitted"
                on={p.airDescent && p.chutes}
                disabled={!p.airDescent}
                onChange={p.onChutes}
              />
              <Disclosure label="About parachutes">
                Parachutes cut landing Δv to ~18% on Duna, Eve and Laythe. Add a
                heat shield to the payload mass.
              </Disclosure>
            </div>
          </div>
          {p.crossfeedOk && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: SPACE.md,
                flexWrap: "wrap",
              }}
            >
              <Toggle
                label="Asparagus staging"
                on={p.asparagus}
                onChange={p.onAsparagus}
              />
              <span className="note" style={{ color: C.dim }}>
                liquid side stacks feed the core and drop in pairs
              </span>
            </div>
          )}
        </div>
      </Section>

      <button className="chip" data-on={1} onClick={p.onDone}>
        Done
      </button>
    </Section>
  );
}

export { Brief };

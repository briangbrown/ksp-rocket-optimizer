import { Share2, Undo2 } from "lucide-react";
import { STATES, SYS, fromReason, toReason } from "../../core/orbits.js";
import { DAY, kerbalDate, utOf } from "../../core/kepler.js";
import type { Endpoint, State } from "../../core/orbits.js";
import type { TransferType } from "../../core/transfer.js";
import {
  OBJECTIVES,
  OBJECTIVE_HINT,
  STATE_LABEL,
  bodyLabel,
  fmt,
} from "../format.js";
import { C, RADIUS, SHADOW, SPACE, Z } from "../tokens.js";
import { BodyPicker } from "./route.jsx";
import {
  Choice,
  Disclosure,
  Field,
  ICON,
  IconButton,
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
  /* On a wide screen it is a card in a column that sticks as a whole, so
     the set line stays in the flow. */
  wide: boolean;
  onToggle: () => void;
  onDone: () => void;
  /* The set line — briefLine in format.ts — and the Δv budget beside it. */
  line: string;
  budget: number;
  /* The design as a link, offered once the brief is set — a decided mission
     is the one worth sending. Absent where the browser cannot make one. #140 */
  onShare?: () => void;
  /* The Δv accent: the destination's own hue. */
  accent: string;
  /* How far the visual viewport has been pushed down the layout one, which
     is where "the top of the page" actually is — `.claude/rules/ui.md`. */
  top: number;
  moreOpen: boolean;
  onToggleMore: () => void;
  /* The mission's two ends, a body and a state each (#188). The From end
     folds to a line, since nearly every mission starts on Kerbin's surface. */
  from: Endpoint;
  onFrom: (e: Endpoint) => void;
  fromOpen: boolean;
  onToggleFrom: () => void;
  to: Endpoint;
  onTo: (e: Endpoint) => void;
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
  /* The window search's start, UT seconds, and the stay before the window
     home. */
  leaveAfter: number;
  onLeaveAfter: (ut: number) => void;
  stay: number;
  onStay: (s: number) => void;
  transfer: TransferType;
  onTransfer: (t: TransferType) => void;
  crossfeedOk: boolean;
  asparagus: boolean;
  onAsparagus: (on: boolean) => void;
  objective: Objective;
  onObjective: (o: Objective) => void;
  needGimbal: boolean;
  onNeedGimbal: (on: boolean) => void;
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
/* Every body, the Sun first: it is in no system of its own, so the picker
   shows it as a chip above the planets. */
const BODIES = Object.keys(SYS);

/* The state a body opens in when it is picked. The state already chosen,
   where the new body can do it — a landing stays a landing when the body
   changes, and tapping the body already chosen changes nothing, which is
   what made a shared Kerbol fly-by into a 36 km/s low solar orbit with no
   solution. Else the first state the body can: its surface, then its low
   orbit — except Kerbol, whose low orbit is that 36 km/s and a mission
   nobody means by tapping the sun, so it opens on a fly-by. */
const firstFrom = (b: string, keep: State): Endpoint => {
  const can = (state: State) => fromReason({ body: b, state }) === true;
  if (can(keep)) return { body: b, state: keep };
  return { body: b, state: can("surface") ? "surface" : "low" };
};
const firstTo = (from: Endpoint, b: string, keep: State): Endpoint => {
  const can = (state: State) => toReason(from, { body: b, state }) === true;
  if (can(keep)) return { body: b, state: keep };
  for (const state of b === "Sun" ? ["flyby" as State, ...STATES] : STATES)
    if (can(state)) return { body: b, state };
  return { body: b, state: "low" };
};

/* A reason as the reader knows the body: the model says "Sun", the page says
   Kerbol everywhere else. */
const said = (r: true | string) =>
  r === true ? r : r.replace(/\bSun\b/g, bodyLabel("Sun"));

/* The state chips for one end, with what the body cannot do disabled and
   why written under the group, since a hint under a pointer is not something
   a finger can read. */
function StateChoice({
  label,
  value,
  states,
  reason,
  onChange,
}: {
  label: string;
  value: State;
  states: ReadonlyArray<State>;
  reason: (s: State) => true | string;
  onChange: (s: State) => void;
}) {
  const reasons = states
    .map((s) => reason(s))
    .filter((r): r is string => r !== true);
  return (
    <div style={{ margin: `${SPACE.md}px 0` }}>
      <Choice
        label={label}
        value={value}
        onChange={onChange}
        style={{ gap: 6 }}
        options={states.map((s) => {
          const r = reason(s);
          return {
            value: s,
            label: STATE_LABEL[s],
            disabled: r !== true,
            hint: r === true ? undefined : r,
          };
        })}
      />
      {reasons.length > 0 && (
        <div className="note" style={{ marginTop: SPACE.sm }}>
          {[...new Set(reasons)].join(". ")}.
        </div>
      )}
    </div>
  );
}

function Brief(p: BriefProps) {
  /* Set: stuck under the solving bar, bled to the page edges so the results
     scroll under it rather than past it. `top` follows the visual viewport
     for the same reason the solving bar does. */
  const stuck: CSSProperties | undefined =
    p.open || p.wide
      ? undefined
      : {
          position: "sticky",
          top: 0,
          zIndex: Z.brief,
          transform: `translateY(${p.top}px)`,
          /* Up as well as out: the grid's top padding would otherwise show
           as a strip of ink between the header and the bar. */
          margin: `-${SPACE.xl}px -${SPACE.xl}px 0`,
          /* Bled to the edges, so under the notch's strip as well: the page's
           own inset is inside the margin this undoes. */
          paddingTop: `calc(${SPACE.xl}px + env(safe-area-inset-top))`,
          borderRadius: RADIUS.none,
          borderWidth: "0 0 1px",
          boxShadow: SHADOW.bar,
        };
  return (
    <Section
      id="brief"
      heading="Mission"
      summary={p.line}
      open={p.open}
      onToggle={p.onToggle}
      style={stuck}
      /* The share button's 44 hangs into the card's padding, so the set
         line keeps the width it had. */
      asideReach={!p.open && p.onShare ? 12 : 0}
      aside={
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: SPACE.sm,
          }}
        >
          <span className="figure" style={{ color: p.accent }}>
            {fmt(p.budget)}
            <span
              className="note"
              style={{ color: C.dim, marginLeft: SPACE.sm }}
            >
              m/s
            </span>
          </span>
          {/* The button is 44 on the phone in a line of text; it hangs
              above and below the line — on a wrapper, not the button, or
              its box overflows the row's — so the set line is no taller
              for it. */}
          {!p.open && p.onShare && (
            <span style={{ display: "inline-flex", margin: "-10px 0" }}>
              <IconButton
                icon={Share2}
                label="Share the link"
                onClick={p.onShare}
              />
            </span>
          )}
        </span>
      }
    >
      {/* To first: it is the thing you came to change. Every body, Kerbol
          at the head as the one not in a system; then the state, with what
          the body cannot do disabled and the reasons under the chips. */}
      <div className="label" style={{ marginBottom: SPACE.md }}>
        To
      </div>
      <BodyPicker
        value={p.to.body}
        options={BODIES}
        onPick={(b) => p.onTo(firstTo(p.from, b, p.to.state))}
      />
      <StateChoice
        label="Arriving"
        value={p.to.state}
        states={STATES}
        reason={(s) => said(toReason(p.from, { body: p.to.body, state: s }))}
        onChange={(s) => p.onTo({ body: p.to.body, state: s })}
      />

      {/* Almost every mission starts on Kerbin's surface, so the From end is
          a lot of furniture for a choice nobody makes. Folded beneath the
          To end; its line says where and in what state. */}
      <Section
        bare
        level={3}
        heading="From"
        summary={`${bodyLabel(p.from.body)}, ${STATE_LABEL[p.from.state].toLowerCase()}`}
        open={p.fromOpen}
        onToggle={p.onToggleFrom}
        gap={10}
        style={{ margin: `${SPACE.lg}px 0 ${SPACE.xl}px` }}
      >
        {(p.from.body !== "Kerbin" || p.from.state !== "surface") && (
          <button
            className="chip"
            style={{ marginBottom: SPACE.md }}
            onClick={() => p.onFrom({ body: "Kerbin", state: "surface" })}
          >
            <Undo2 size={ICON.chip} strokeWidth={STROKE} aria-hidden />
            back to Kerbin's surface
          </button>
        )}
        <BodyPicker
          value={p.from.body}
          options={BODIES}
          onPick={(b) => p.onFrom(firstFrom(b, p.from.state))}
        />
        <StateChoice
          label="Starting in"
          value={p.from.state}
          states={STATES.filter((s) => s !== "flyby")}
          reason={(s) => said(fromReason({ body: p.from.body, state: s }))}
          onChange={(s) => p.onFrom({ body: p.from.body, state: s })}
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
        <Toggle label="Return trip" on={p.returning} onChange={p.onReturning} />
      </div>
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
        level={3}
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
          {/* The window search's start, as the game's clock says it: the
              first window from this date is the one the transfer is priced
              on and drawn for. A day is enough to say — the window itself is
              found to the second. */}
          <Field
            label="Leave from year"
            value={kerbalDate(p.leaveAfter).year}
            min={1}
            max={50}
            step={1}
            hardMax={1000}
            onChange={(y) =>
              p.onLeaveAfter(utOf(y, kerbalDate(p.leaveAfter).day))
            }
            hint="The transfer window is the first after this date, on the game's clock — Year 1 Day 1 is a new save."
          />
          <Field
            label="and day"
            value={kerbalDate(p.leaveAfter).day}
            min={1}
            max={426}
            step={1}
            onChange={(d) =>
              p.onLeaveAfter(utOf(kerbalDate(p.leaveAfter).year, d))
            }
            hint="A Kerbin year is 426 six-hour days."
          />
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: SPACE.md,
              }}
            >
              <span className="label">Transfer</span>
              <Disclosure
                label="About transfer types"
                style={{ marginLeft: SPACE.xs }}
              >
                <div>
                  Ballistic flies the inclination in the ejection: one burn,
                  with a normal component from an equatorial parking orbit. The
                  easiest to set up in the game.
                </div>
                <div>
                  Mid-course leaves in the plane and tilts up to the target with
                  one burn on the way, where the ship is slowest. Often cheaper,
                  but the burn has to land on the right point of the arc.
                </div>
                <div>
                  Cheapest takes whichever of the two costs less for this
                  window. The card says which was flown.
                </div>
              </Disclosure>
            </div>
            <Choice
              label="Transfer"
              value={p.transfer}
              onChange={p.onTransfer}
              options={[
                {
                  value: "best",
                  label: "Cheapest",
                  hint: "Whichever of the two costs less for this window.",
                },
                {
                  value: "ballistic",
                  label: "Ballistic",
                  hint: "One burn: the inclination is flown in the ejection, as a normal component. Easier to fly.",
                },
                {
                  value: "plane",
                  label: "Mid-course",
                  hint: "Leave in the plane and tilt up to the target with one burn on the way. Often cheaper; harder to place in the game.",
                },
              ]}
            />
          </div>
          {p.returning && (
            <Field
              label="Stay at least"
              value={Math.round(p.stay / DAY)}
              min={0}
              max={600}
              step={5}
              unit="days"
              hardMax={5000}
              onChange={(d) => p.onStay(d * DAY)}
              hint="The window home is the first after arrival plus this. Zero is the first window there is, which at Duna is most of a year anyway."
            />
          )}
          <div>
            <div className="label" style={{ marginBottom: SPACE.md }}>
              Atmosphere
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
                label="Radial boosters allowed"
                on={p.boosters}
                onChange={p.onBoosters}
              />
              <Toggle
                label="Parachutes fitted"
                on={p.airDescent && p.chutes}
                disabled={!p.airDescent}
                onChange={p.onChutes}
              />
              <Disclosure label="About parachutes">
                Parachutes cut landing Δv to ~18% wherever there is air to land
                through — Duna, Eve, Laythe, and Kerbin on the way home. Add a
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

import { Scissors, ScissorsLineDashed } from "lucide-react";
import { fmt } from "../format.js";
import { C, RADIUS, SYSTEMS, edgeOf, hueFor, inkOn } from "../tokens.js";
import { Choice, ICON, STROKE } from "./primitives.jsx";
import type { CSSProperties } from "react";
import type { Leg } from "../../core/orbits.js";
import type { PlanStage } from "../../core/plan.js";

/* The mission as a transit line. `cuts` holds the route indices the user has
   cut at — separate after leg i — and `stages` is what the solver made of
   them, so each cut can say which stage actually falls away there. */
type RouteMapProps = {
  route: ReadonlyArray<Leg>;
  cuts: ReadonlySet<number>;
  onToggle: (i: number) => void;
  color: string;
  stages: ReadonlyArray<PlanStage>;
  onPlaneMode: (now: boolean) => void;
};

function RouteMap({
  route,
  cuts,
  onToggle,
  color,
  stages,
  onPlaneMode,
}: RouteMapProps) {
  /* Which stage actually falls away at a cut. Every solved stage carries the route
     index its segment starts at, so the count through a cut is just the stages
     whose segment began at or before it. The label used to read off the cut's own
     ordinal, so the first cut always claimed "stage 1" even when four stages had
     already burned. */
  const stagesThrough = (i: number) =>
    stages.filter((s) => s.sol && s.key <= i).length;
  const shown = route.filter((l) => !l.free);
  const rows = [...route].reverse();

  return (
    <div>
      {rows.map((leg, ri) => {
        const i = route.length - 1 - ri;
        const last = i === shown.length - 1;
        const isCut = cuts.has(i);
        return (
          <div key={i}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "26px 1fr auto",
                gap: 10,
                alignItems: "center",
                minHeight: 34,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                  height: 34,
                }}
              >
                <div
                  style={{
                    width: 3,
                    background: leg.free ? C.rule : color,
                    height: "100%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 11,
                    height: 11,
                    borderRadius: RADIUS.round,
                    background: C.ink,
                    border: `3px solid ${leg.free ? C.rule : color}`,
                  }}
                />
              </div>
              <div
                className="body"
                style={{ lineHeight: 1.3, color: leg.free ? C.dim : C.paper }}
              >
                {leg.label}
                {leg.chuted && (
                  <span className="note" style={{ color: C.mint }}>
                    {" "}
                    · chutes
                  </span>
                )}
                {/* The one leg whose cost is a choice rather than a number: pay it
                    in Δv now, or in waiting for a launch window. */}
                {/* Both figures are written together on a plane change and on
                    nothing else, so asking for each is asking whether this is
                    one — the same question the kind already answered. */}
                {leg.kind === "plane" &&
                  leg.cheap !== undefined &&
                  leg.costly !== undefined &&
                  leg.cheap < leg.costly && (
                    <Choice
                      label="Plane change"
                      value={leg.planeNow ? "now" : "node"}
                      onChange={(m) => onPlaneMode(m === "now")}
                      options={[
                        { value: "node", label: "timed at a node" },
                        { value: "now", label: "burning it now" },
                      ]}
                      chip={{ padding: "1px 7px" }}
                      style={{ display: "inline-flex", marginLeft: 8, gap: 4 }}
                    />
                  )}
                {leg.note && (
                  <div className="note" style={{ marginTop: 2 }}>
                    {leg.note}
                  </div>
                )}
              </div>
              <div
                className="figure"
                style={{ color: leg.free ? C.dim : C.paper }}
              >
                {leg.dv === 0 ? "free" : `${fmt(leg.dv)}`}
              </div>
            </div>
            {!leg.free && !last && (
              <button
                onClick={() => onToggle(i)}
                aria-label={
                  isCut ? "Remove staging event" : "Add staging event"
                }
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr",
                  gap: 10,
                  width: "100%",
                  alignItems: "center",
                  padding: "2px 0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    color: isCut ? C.amber : C.dim,
                  }}
                >
                  {isCut ? (
                    <ScissorsLineDashed
                      size={ICON.chip}
                      strokeWidth={STROKE}
                      aria-hidden
                    />
                  ) : (
                    <Scissors
                      size={ICON.chip}
                      strokeWidth={STROKE}
                      aria-hidden
                    />
                  )}
                </div>
                <div
                  className="label"
                  style={{ color: C.amber, textAlign: "left" }}
                >
                  {isCut &&
                    (stagesThrough(i)
                      ? `stage ${stagesThrough(i)} separates`
                      : "separates here")}
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type BodyPickerProps = {
  options: ReadonlyArray<string>;
  value: string;
  onPick: (o: string) => void;
};

function BodyPicker({ options, value, onPick }: BodyPickerProps) {
  // DEST calls it "Jool orbit" where SYS calls it "Jool", so match loosely
  const find = (b: string) =>
    options.find((o) => o === b || o.startsWith(b + " "));
  const named = new Set<string>();
  SYSTEMS.forEach(([pl, ms]) =>
    [pl, ...ms].forEach((b) => {
      const o = find(b);
      if (o) named.add(o);
    }),
  );
  const extras = options.filter((o) => !named.has(o));

  const planetBtn = (b: string, on: boolean, live: boolean): CSSProperties => {
    const h = hueFor(b);
    return {
      padding: "7px 11px",
      borderRadius: RADIUS.sm,
      minWidth: 84,
      textAlign: "left",
      fontWeight: 600,
      cursor: live ? "pointer" : "default",
      opacity: live ? 1 : 0.4,
      background: on ? h : C.panel2,
      color: on ? inkOn(h) : C.paper,
      border: `1.5px solid ${on ? h : edgeOf(h)}`,
    };
  };
  const moonBtn = (b: string, on: boolean): CSSProperties => {
    const h = hueFor(b);
    return {
      padding: "3px 9px",
      borderRadius: RADIUS.sm,
      cursor: "pointer",
      background: on ? h : "transparent",
      color: on ? inkOn(h) : C.muted,
      border: `1px solid ${on ? h : edgeOf(h)}`,
    };
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {extras.length > 0 && (
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}
        >
          {extras.map((o) => (
            <button
              key={o}
              className="chip"
              data-on={o === value ? 1 : 0}
              onClick={() => onPick(o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {SYSTEMS.map(([pl, ms]) => {
        const po = find(pl),
          /* Named rather than a pair, so what survives the filter is a moon
             with an option and not an array that might hold one. */
          mo = ms
            .map((b) => ({ b, o: find(b) }))
            .filter((m): m is { b: string; o: string } => m.o !== undefined);
        if (!po && !mo.length) return null;
        return (
          <div
            key={pl}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 7,
              flexWrap: "nowrap",
            }}
          >
            <button
              className="body"
              style={{ ...planetBtn(pl, po === value, !!po), flexShrink: 0 }}
              onClick={() => po && onPick(po)}
              disabled={!po}
            >
              {pl}
            </button>
            {mo.length > 0 && (
              <>
                <span className="body" style={{ color: C.rule, marginTop: 7 }}>
                  ─
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    flex: 1,
                    minWidth: 0,
                    marginTop: 4,
                  }}
                >
                  {mo.map(({ b, o }) => (
                    <button
                      key={b}
                      className="note"
                      style={moonBtn(b, o === value)}
                      onClick={() => onPick(o)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { BodyPicker, RouteMap };

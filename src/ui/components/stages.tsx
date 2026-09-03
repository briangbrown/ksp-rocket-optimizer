import { fmt, hms } from "../format.js";
import { C, RADIUS, SPACE } from "../tokens.js";
import { Stat, Stepper, Toggle } from "./primitives.jsx";
import type { ManifestRow } from "../../core/manifest.js";
import type { PlanStage } from "../../core/plan.js";
import type { Solution } from "../../core/solution.js";

/* The part's name, where the row has one to give. */
const partName = (p: ManifestRow["part"]) => (p && "n" in p ? (p.n ?? "") : "");

/* The most stages a segment may be forced to. */
const MAX_STAGES = 5;

type StageStackProps = {
  stages: ReadonlyArray<PlanStage>;
  color: string;
  splitBy: ReadonlyMap<number, number>;
  onSetSplit: (key: number, k: number) => void;
};

function StageStack({ stages, color, splitBy, onSetSplit }: StageStackProps) {
  const max = Math.max(...stages.map((x) => x.sol?.total || 1));
  /* A boosted stage carries no column count at all — it is one core with a ring
     bolted to it — so the same `|| 1` the solver and the geometry use. */
  const columns = (sol: Solution) => sol.stacks || 1;

  // stages arrive bottom-first; collect them back under the segment they serve
  const segs: Array<{
    key: number;
    legs: PlanStage["legs"];
    items: Array<{ s: PlanStage; n: number }>;
  }> = [];
  stages.forEach((s, i) => {
    const last = segs[segs.length - 1];
    if (last && last.key === s.key) last.items.push({ s, n: i + 1 });
    else segs.push({ key: s.key, legs: s.legs, items: [{ s, n: i + 1 }] });
  });

  return (
    <div>
      {segs
        .slice()
        .reverse()
        .map((seg) => {
          const need = seg.items.reduce((a, x) => a + x.s.want, 0);
          const pick = splitBy.get(seg.key) || 0;
          return (
            <div key={seg.key} style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: SPACE.md,
                  marginBottom: SPACE.md,
                  paddingBottom: 5,
                  borderBottom: `1px solid ${C.rule}`,
                }}
              >
                <span className="body" style={{ color: C.muted }}>
                  {seg.legs
                    .map((l) => l.label.split(/[→(]/)[0].trim())
                    .join(" · ")}
                  <span className="figure" style={{ color: C.dim }}>
                    {"  "}
                    {fmt(need)} m/s
                  </span>
                </span>
                {/* The solver's own count, or one forced on it: `auto` is
                    on until the stepper is touched, and turns it back over.
                    A zero in splitBy is the solver's choice. */}
                <span
                  style={{
                    display: "flex",
                    gap: SPACE.sm,
                    alignItems: "center",
                  }}
                >
                  <span className="label" style={{ marginRight: SPACE.xs }}>
                    stages
                  </span>
                  <Toggle
                    label="auto"
                    on={pick === 0}
                    onChange={(on) => on && onSetSplit(seg.key, 0)}
                  />
                  <Stepper
                    label="Stages in this segment"
                    unit="stages"
                    value={pick || seg.items.length}
                    min={1}
                    max={MAX_STAGES}
                    onChange={(k) => onSetSplit(seg.key, k)}
                  />
                </span>
              </div>

              {/* One under another on the phone; two across on a wide
                  screen, top of the rocket first — the stylesheet's
                  `.stages`. The room between cards is its gap: a margin on
                  the last card no longer collapses through the segment's
                  once the card is a grid item, and the page grew 10 px a
                  segment. #137 */}
              <div className="stages">
                {seg.items
                  .slice()
                  .reverse()
                  .map(({ s, n }, i) => {
                    const sol = s.sol;
                    const w = sol ? Math.max(14, (sol.total / max) * 100) : 20;
                    return (
                      <div key={i}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 5,
                          }}
                        >
                          <span className="heading">
                            Stage {n}
                            {s.subCount > 1 && (
                              <span
                                className="note"
                                style={{
                                  color: C.dim,
                                  marginLeft: 7,
                                  textTransform: "none",
                                }}
                              >
                                {s.sub} of {s.subCount} in this segment
                              </span>
                            )}
                          </span>
                          <span className="figure" style={{ color: C.muted }}>
                            need {fmt(s.want)} m/s
                          </span>
                        </div>
                        {sol ? (
                          <div
                            className="body"
                            style={{
                              background: C.panel2,
                              border: `1px solid ${C.rule}`,
                              borderLeft: `3px solid ${color}`,
                              borderRadius: RADIUS.sm,
                              padding: "10px 12px",
                            }}
                          >
                            <div
                              style={{
                                height: 6,
                                background: C.rule,
                                borderRadius: RADIUS.sm,
                                marginBottom: 10,
                              }}
                            >
                              <div
                                style={{
                                  width: `${w}%`,
                                  height: "100%",
                                  background: color,
                                  borderRadius: RADIUS.sm,
                                }}
                              />
                            </div>
                            <div style={{ marginBottom: SPACE.md }}>
                              <strong>{sol.n}×</strong> {sol.engine.n}
                              {sol.tanks && (
                                <span style={{ color: C.muted }}>
                                  {" + "}
                                  {sol.tanks.list
                                    .map((x) => `${x.c}× ${x.t.n}`)
                                    .join(" + ")}
                                </span>
                              )}
                            </div>
                            {sol.boosters && (
                              <div
                                style={{
                                  marginBottom: SPACE.md,
                                  color: C.mint,
                                }}
                              >
                                + <strong>{sol.boosters.n}×</strong>{" "}
                                {partName(sol.boosters.part)}
                                <span style={{ color: C.dim }}>
                                  {"  radial · "}
                                  {fmt(sol.boosters.dv)} m/s, separate at T+
                                  {hms(sol.boosters.burn)}
                                </span>
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "6px 18px",
                              }}
                            >
                              {/* Match the solver's own tolerance. It accepts a stage at
                            99.5% of its share — a solid cannot be tuned to hit a
                            number exactly — so flagging a strict shortfall painted
                            a stage red for being 0.1 m/s under. */}
                              {columns(sol) > 1 && (
                                <span
                                  className="note"
                                  style={{ color: C.mint, fontWeight: 600 }}
                                >
                                  core + {columns(sol) - 1} radial
                                </span>
                              )}
                              <Stat
                                inline
                                label="Δv"
                                value={`${fmt(sol.dv)} m/s`}
                                good={sol.dv >= s.want * 0.995}
                                note={
                                  sol.dv < s.want
                                    ? `${fmt(s.want - sol.dv)} m/s under its ${fmt(s.want)} m/s share`
                                    : undefined
                                }
                              />
                              <Stat
                                inline
                                label="TWR"
                                value={`${sol.twr.toFixed(2)} → ${sol.twrBurnout.toFixed(2)}`}
                                good={sol.twr >= s.twrMin}
                              />
                              <Stat inline label="Isp" value={`${sol.isp} s`} />
                              <Stat
                                inline
                                label="Wet"
                                value={`${fmt(sol.wet, 1)} t`}
                              />
                              <Stat
                                inline
                                label="Prop"
                                value={`${fmt(sol.prop, 1)} t`}
                              />
                              <Stat inline label="Burn" value={hms(sol.burn)} />
                            </div>
                          </div>
                        ) : (
                          <div
                            className="body"
                            style={{
                              background: C.panel2,
                              border: `1px dashed ${C.rust}`,
                              borderRadius: RADIUS.sm,
                              padding: SPACE.lg,
                              color: C.muted,
                            }}
                          >
                            No stack reaches {fmt(s.want)} m/s carrying{" "}
                            {fmt(s.payloadIn, 1)} t. Raise the stage count
                            above, or unlock a higher-Isp engine — one stage
                            tops out at Isp·g₀·ln 9.
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export { StageStack };

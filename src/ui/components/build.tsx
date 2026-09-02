import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Maximize, Minimize, Pause, Play } from "lucide-react";

import { payloadDiaOf, stackGeometry } from "../../core/geometry.js";
import { manifest } from "../../core/manifest.js";
import type { ManifestRow } from "../../core/manifest.js";
import { extentOf, modelOf } from "../../core/model.js";
import { framing, panelSizes } from "../views.js";
import { pose, separation } from "../separation.js";
import { PLATE_SHROUD } from "../../core/parts.js";
import { fmt, hms } from "../format.js";
import { C, FONT } from "../tokens.js";
import { Mini, Stat } from "./controls.jsx";
import type { CSSProperties, ReactNode } from "react";
import type { Vehicle, Turn } from "../../core/ascent.js";
import type { PlanStage } from "../../core/plan.js";
import type { Solution } from "../../core/solution.js";

/* A stage the solver actually built. `stages` arrives with the unsolved ones
   still in it — a segment with no design is a row that says so — and every
   panel here works on what is left. */
type SolvedStage = PlanStage & { sol: Solution };
const isSolved = (s: PlanStage): s is SolvedStage => s.sol !== null;
const hasSol = <S extends { sol: Solution | null }>(
  s: S,
): s is S & { sol: Solution } => s.sol !== null;

/* One step of the stepper: what has been staged away, and whether what is left
   still has its boosters on. */
type Step = { label: string; drop: number; boost: boolean };

/* What the mission needs fitted that no stage pays for — chutes, legs, a heat
   shield — as a reminder rather than a charge. */
type Hardware = {
  items: Array<{ name: string; qty: number; why: string }>;
  mass: number;
};

/* A flown ascent as the panel needs it: what the simulator returned, the
   vehicle that flew it, and where from. A design that cannot reach orbit is
   worth saying out loud, which is why the failure is a variant of this rather
   than a null. */
type Ascent =
  | (Turn & { veh: Vehicle; bodyName: string; target: number })
  | { ok: false; veh: Vehicle; bodyName: string; target: number };

/* Loaded when the build view first draws, not with the application. three.js
   is about the size of everything else here put together, and nothing above
   this panel needs it — see #63. */
const ThreeView = lazy(() => import("./three-view.jsx"));
let webgl: boolean | null = null;
const canRender3D = () => {
  if (webgl === null)
    try {
      /* Ask whether the constructors exist before asking for a context.
         jsdom implements neither and logs a "not implemented" error for the
         call itself, which turns every suite that mounts the app into a wall
         of noise — and the answer is the same either way. */
      webgl =
        (typeof WebGL2RenderingContext !== "undefined" ||
          typeof WebGLRenderingContext !== "undefined") &&
        !!document
          .createElement("canvas")
          .getContext(
            typeof WebGL2RenderingContext !== "undefined" ? "webgl2" : "webgl",
          );
    } catch {
      webgl = false;
    }
  return webgl;
};

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
                  gap: 8,
                  marginBottom: 8,
                  paddingBottom: 5,
                  borderBottom: `1px solid ${C.rule}`,
                }}
              >
                <span style={{ fontSize: 12.5, color: C.muted }}>
                  {seg.legs
                    .map((l) => l.label.split(/[→(]/)[0].trim())
                    .join(" · ")}
                  <span className="mono" style={{ color: C.dim }}>
                    {"  "}
                    {fmt(need)} m/s
                  </span>
                </span>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span className="eyebrow" style={{ marginRight: 2 }}>
                    stages
                  </span>
                  {[0, 1, 2, 3, 4, 5].map((k) => (
                    <button
                      key={k}
                      className="chip"
                      data-on={pick === k ? 1 : 0}
                      onClick={() => onSetSplit(seg.key, k)}
                      style={{
                        padding: "1px 7px",
                        fontSize: 10.5,
                        letterSpacing: 0,
                      }}
                    >
                      {k === 0 ? `auto (${seg.items.length})` : k}
                    </button>
                  ))}
                </span>
              </div>

              {seg.items
                .slice()
                .reverse()
                .map(({ s, n }, i) => {
                  const sol = s.sol;
                  const w = sol ? Math.max(14, (sol.total / max) * 100) : 20;
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: 5,
                        }}
                      >
                        <span
                          className="disp"
                          style={{ fontSize: 15, fontWeight: 600 }}
                        >
                          Stage {n}
                          {s.subCount > 1 && (
                            <span
                              style={{
                                color: C.dim,
                                fontWeight: 400,
                                fontSize: 11,
                                marginLeft: 7,
                                textTransform: "none",
                                letterSpacing: 0,
                              }}
                            >
                              {s.sub} of {s.subCount} in this segment
                            </span>
                          )}
                        </span>
                        <span
                          className="mono"
                          style={{ fontSize: 12, color: C.muted }}
                        >
                          need {fmt(s.want)} m/s
                        </span>
                      </div>
                      {sol ? (
                        <div
                          style={{
                            background: C.panel2,
                            border: `1px solid ${C.rule}`,
                            borderLeft: `3px solid ${color}`,
                            borderRadius: 2,
                            padding: "10px 12px",
                          }}
                        >
                          <div
                            style={{
                              height: 6,
                              background: C.rule,
                              borderRadius: 1,
                              marginBottom: 10,
                            }}
                          >
                            <div
                              style={{
                                width: `${w}%`,
                                height: "100%",
                                background: color,
                                borderRadius: 1,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 13, marginBottom: 8 }}>
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
                                fontSize: 13,
                                marginBottom: 8,
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
                                style={{
                                  fontSize: 11.5,
                                  color: C.mint,
                                  fontWeight: 600,
                                }}
                              >
                                core + {columns(sol) - 1} radial
                              </span>
                            )}
                            <Mini
                              label="Δv"
                              v={`${fmt(sol.dv)} m/s`}
                              good={sol.dv >= s.want * 0.995}
                              note={
                                sol.dv < s.want
                                  ? `${fmt(s.want - sol.dv)} m/s under its ${fmt(s.want)} m/s share`
                                  : null
                              }
                            />
                            <Mini
                              label="TWR"
                              v={`${sol.twr.toFixed(2)} → ${sol.twrBurnout.toFixed(2)}`}
                              good={sol.twr >= s.twrMin}
                            />
                            <Mini label="Isp" v={`${sol.isp} s`} />
                            <Mini label="Wet" v={`${fmt(sol.wet, 1)} t`} />
                            <Mini label="Prop" v={`${fmt(sol.prop, 1)} t`} />
                            <Mini label="Burn" v={hms(sol.burn)} />
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: C.panel2,
                            border: `1px dashed ${C.rust}`,
                            borderRadius: 2,
                            padding: "12px",
                            fontSize: 12.5,
                            color: C.muted,
                          }}
                        >
                          No stack reaches {fmt(s.want)} m/s carrying{" "}
                          {fmt(s.payloadIn, 1)} t. Raise the stage count above,
                          or unlock a higher-Isp engine — one stage tops out at
                          Isp·g₀·ln 9.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
    </div>
  );
}

/* Header for a body picker that can be folded away. Open, it offers a way to
   collapse; closed, it shows what is selected and a way back in. The two pickers
   differ only in where they start — origin closed, destination open. */
type PartsTableProps = {
  /* Only the solved design of each: this table is a bill of parts and reads
     nothing else off a stage. Asking for no more is what lets a test hand it a
     stage without inventing a route for it. */
  stages: ReadonlyArray<{ sol: Solution | null }>;
  payload: number;
  hardware?: Hardware | null;
  color: string;
};

/* One row of the bill. `kind` drives how it is drawn, and a note carries words
   instead of a part. */
type Row = {
  stage: number;
  part?: string;
  /* Null on a note, which carries words where a part would carry figures. */
  qty?: number | null;
  each?: number | null;
  tot?: number | null;
  kind: string;
  note?: ReactNode;
};

/* The part's name, where the row has one to give. Every row this table names
   does; the one row whose part might not — a coupler wearing an engine plate's
   shroud, which is measured rather than named — is drawn from `sol.coupler` a
   little further down instead. */
const partName = (p: ManifestRow["part"]) => (p && "n" in p ? (p.n ?? "") : "");

function PartsTable({ stages, payload, hardware, color }: PartsTableProps) {
  /* Listed the way you build it: payload at the top, then each stage downward to
     the one standing on the pad. Within a stage the order is physical too —
     decoupler at its top, then tanks, then any adapter, then the coupler a
     cluster hangs from, then the engine, with radial boosters last since they
     hang off the side. Stage numbers therefore
     count down, which is also how the staging list reads in game. */
  const rows: Array<Row> = [];
  const solved = stages
    .map((s, i) => ({ s, n: i + 1 }))
    .filter((x): x is { s: { sol: Solution }; n: number } => hasSol(x.s));
  [...solved].reverse().forEach(({ s, n }) => {
    /* One list, from core, and the numbers below are read off it rather than
       worked out again beside it. That is the whole of #62: this table was the
       fourth description of a stage, and #77 was it disagreeing with the other
       three about what order a plate and an adapter go on in.

       What stays here is the wording and the shape — the build order, the
       headers, the notes, and the quantity column staying per column under a
       header that already says how many there are. The manifest returns facts;
       every word of this is the view's. */
    const bill = manifest(s.sol);
    const of = (role: ManifestRow["role"]) =>
      bill.filter((r) => r.role === role);
    const one = (role: ManifestRow["role"]) => of(role)[0];
    /* A tank you place in the VAB is full. The manifest carries propellant per
       part now, so wet is dry plus what that part holds — one list serving the
       reading the solver wants and the reading you would check against the
       game. */
    const wet = (r: ManifestRow) => r.mass + r.prop;
    /* With radial stacks the header says how many there are, so the rows below
       it are one stack's worth — quantities multiplied out under a header that
       already states the count read as though each stack needed all of them. */
    const S = s.sol.stacks || 1;
    const per = (r: ManifestRow) => r.qty / S;
    const dec = one("decoupler");
    /* A stage whose joint is made by the plate above it buys none, and the
       manifest no longer lists one — it used to, with no part on it and no
       mass, and this drew it as an empty row with 0.000 against it. #107 */
    if (dec && dec.part)
      rows.push({
        stage: n,
        part: partName(dec.part),
        qty: dec.qty,
        each: wet(dec),
        tot: dec.qty * wet(dec),
        kind: "struct",
      });
    const rej = one("rejoin");
    if (rej)
      rows.push({
        stage: n,
        part: partName(rej.part) + " (inverted)",
        qty: rej.qty,
        each: wet(rej),
        tot: rej.qty * wet(rej),
        kind: "adapter",
      });
    if (S > 1) {
      rows.push({
        stage: n,
        kind: "note",
        qty: null,
        each: null,
        tot: null,
        part: `— core + ${S - 1} radial stacks, each of the following —`,
      });
      const join = one("joiner");
      /* Two per extra stack, and the header above counts the stacks, so the
         quantity column shows the two rather than dividing by anything. */
      if (join)
        rows.push({
          stage: n,
          part: `${partName(join.part)} (holds a stack on, top and bottom)`,
          qty: 2,
          each: wet(join),
          tot: join.qty * wet(join),
          kind: "struct",
        });
    }
    if (s.sol.packed) {
      const pk = s.sol.packed;
      rows.push({
        stage: n,
        kind: "note",
        qty: null,
        each: null,
        tot: null,
        part:
          `— ${pk.packedCount}× ${pk.tank.n} packed ${pk.r} around 1` +
          `${pk.levels > 1 ? `, ${pk.levels} levels` : ""}: ${pk.levels} on the centre column, ` +
          `${pk.cols} radial at ${pk.r}× symmetry, crossfeed on so they drain together` +
          `${pk.spare ? `. The other ${pk.spare} stack${pk.spare > 1 ? "" : "s"} on the centre` : ""}` +
          `. Any smaller tanks stay stacked on the centre —`,
      });
      /* One ring per stack since #56, so the totals carry the stack count the
         way the tanks below them do — the quantity column stays per column,
         under the header that already says how many there are. */
      const pj = one("pack-join");
      const pb = one("pack-brace");
      if (pj)
        rows.push({
          stage: n,
          part: partName(pj.part),
          qty: per(pj),
          each: wet(pj),
          tot: pj.qty * wet(pj),
          kind: "struct",
        });
      if (pb)
        rows.push({
          stage: n,
          part: `${partName(pb.part)} (steadies each column)`,
          qty: per(pb),
          each: wet(pb),
          tot: pb.qty * wet(pb),
          kind: "struct",
        });
    }
    /* Smallest at the top of the run, largest at the bottom — the order you would
       actually assemble them in, and the order a rocket wants structurally. */
    of("tank")
      .slice()
      .sort((a, b) => wet(a) - wet(b))
      .forEach((r) =>
        rows.push({
          stage: n,
          part: partName(r.part),
          qty: per(r),
          each: wet(r),
          tot: r.qty * wet(r),
          kind: "tank",
        }),
      );
    /* Above the coupler, because that is the order they go on: the tank narrows
       through the adapter onto the plate, and the plate carries the engines.
       Listed the other way round it described a stack nobody can build — and
       made a needed adapter look redundant, which is how it was reported. #77 */
    of("adapter").forEach((r) =>
      rows.push({
        stage: n,
        part: partName(r.part),
        qty: per(r),
        each: wet(r),
        tot: r.qty * wet(r), // one set per column, like the coupler below
        kind: "adapter",
      }),
    );
    const coup = one("coupler");
    /* The row exists only where the stage has a coupler, so naming it is
       asking the question the row already answered. */
    const cp = s.sol.coupler;
    if (coup && cp) {
      const pl = PLATE_SHROUD[cp.n];
      rows.push({
        stage: n,
        qty: per(coup),
        each: wet(coup),
        tot: coup.qty * wet(coup),
        kind: "adapter",
        part:
          cp.n +
          (pl
            ? ` · ${["", "Single", "Double", "Triple", "Quad"][cp.out] || cp.out + "-way"}` +
              (s.sol.shroud ? `, ${s.sol.shroud.v} shroud` : "")
            : ""),
      });
    }
    const eng = one("engine");
    rows.push({
      stage: n,
      part: partName(eng.part),
      qty: per(eng), // per stack
      each: wet(eng),
      tot: eng.qty * wet(eng),
      kind: "engine",
    });
    if (s.sol.boosters) {
      /* Decoupler first: it goes on the tank before the booster goes on it, and
         the list is meant to be read as a build order. */
      const b = s.sol.boosters;
      const bo = one("booster");
      const bdec = one("booster-decoupler");
      /* Each of the radial stacks, so the quantity column is one stack's worth
         under the header that counts them. A plain booster has no header, so
         its rows carry the full count. */
      const each = (r: ManifestRow) => (b.part.column ? r.qty / b.n : r.qty);
      if (b.part.column)
        rows.push({
          stage: n,
          kind: "note",
          qty: null,
          each: null,
          tot: null,
          part: `— ${b.n} radial stacks, each of the following —`,
        });
      else if (bdec)
        rows.push({
          stage: n,
          part: "TT-38K Radial Decoupler",
          qty: bdec.qty,
          each: wet(bdec),
          tot: bdec.qty * wet(bdec),
          kind: "struct",
        });
      if (b.part.column && bdec)
        rows.push({
          stage: n,
          part: "TT-38K Radial Decoupler",
          qty: each(bdec),
          each: wet(bdec),
          tot: each(bdec) * wet(bdec),
          kind: "struct",
        });
      if (b.part.dropTank)
        rows.push({
          stage: n,
          kind: "note",
          qty: null,
          each: null,
          tot: null,
          part:
            "— drop tanks, no engine on them: turn on crossfeed in the radial " +
            "decoupler's right-click menu, or run an FTX-2 fuel duct from each " +
            "into the core. Stage them off in pairs as they empty —",
        });
      else if (b.part.column && s.sol.asparagus)
        rows.push({
          stage: n,
          kind: "note",
          qty: null,
          each: null,
          tot: null,
          part:
            "— asparagus: turn on crossfeed in the radial decoupler's right-click " +
            "menu, or run a pair of FTX-2 fuel ducts from each stack to the one " +
            "inboard of it. Stage the pairs outermost first —",
        });
      if (b.part.column) {
        /* A column is a stack and is built like one: tanks first, engine at the
           bottom — the same order every other stage is listed in. Engine-then-
           tanks read as though the list ended on tankage with nothing under it. */
        of("booster-tank")
          .slice()
          .sort((a2, b2) => wet(a2) - wet(b2))
          .forEach((r) =>
            rows.push({
              stage: n,
              part: partName(r.part),
              qty: each(r),
              each: wet(r),
              tot: r.qty * wet(r),
              kind: "booster",
            }),
          );
        rows.push({
          stage: n,
          part: partName(bo.part),
          qty: each(bo),
          each: wet(bo),
          tot: bo.qty * wet(bo),
          kind: "booster",
        });
      } else {
        rows.push({
          stage: n,
          part: partName(bo.part),
          qty: bo.qty,
          each: wet(bo),
          tot: bo.qty * wet(bo),
          kind: "booster",
        });
      }
    }
  });
  const th: CSSProperties = {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `1px solid ${C.rule}`,
    fontSize: 10,
    letterSpacing: ".18em",
    textTransform: "uppercase",
    color: C.dim,
    fontFamily: "'IBM Plex Mono',monospace",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "6px 8px",
    borderBottom: `1px solid ${C.panel2}`,
    fontSize: 12.5,
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}
      >
        <thead>
          <tr>
            <th style={th}>Stage</th>
            <th style={th}>Part</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={{ ...th, textAlign: "right" }}>Each&nbsp;t</th>
            <th style={{ ...th, textAlign: "right" }}>Total&nbsp;t</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, color: C.dim }}>—</td>
            <td style={{ ...td, color: color, fontWeight: 600 }}>
              Payload (pod, probe, science, cargo)
            </td>
            <td style={{ ...td, textAlign: "right" }} className="mono">
              1
            </td>
            <td style={{ ...td, textAlign: "right" }} className="mono">
              {fmt(payload, 2)}
            </td>
            <td style={{ ...td, textAlign: "right" }} className="mono">
              {fmt(payload, 2)}
            </td>
          </tr>
          {hardware &&
            hardware.items.map((h, i) => (
              <tr key={"hw" + i}>
                <td style={{ ...td, color: C.dim }} className="mono"></td>
                <td style={{ ...td, color: C.sky, paddingLeft: 22 }}>
                  ↳ {h.name}
                  <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>
                    {h.why}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right" }} className="mono">
                  {h.qty}
                </td>
                <td
                  style={{ ...td, textAlign: "right", color: C.dim }}
                  className="mono"
                >
                  —
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: "right",
                    color: C.dim,
                    fontSize: 11,
                  }}
                >
                  in payload
                </td>
              </tr>
            ))}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, color: C.muted }} className="mono">
                {r.stage}
              </td>
              <td
                style={{
                  ...td,
                  color:
                    r.kind === "engine"
                      ? C.paper
                      : r.kind === "booster"
                        ? C.mint
                        : r.kind === "adapter"
                          ? C.violet
                          : r.kind === "struct"
                            ? C.dim
                            : r.kind === "note"
                              ? C.mint
                              : C.muted,
                  fontStyle: r.kind === "note" ? "italic" : "normal",
                }}
              >
                {r.part}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">
                {r.qty}
              </td>
              <td
                style={{ ...td, textAlign: "right", color: C.muted }}
                className="mono"
              >
                {r.kind === "note" ? "" : fmt(r.each, 3)}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">
                {r.kind === "note" ? "" : fmt(r.tot, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The whole point of simulating is to hand back something flyable, so this is a
   flight card, not a readout: five steps in the order you do them. Numbering is
   load-bearing here — it really is a sequence. */

/* Bodies laid out the way the system is: one row per planet, ordered outward
   from the sun, its moons trailing to the right. Planets carry the visual
   weight — they are the choice you make first, and a moon only means anything
   once you have picked the planet it belongs to. */
/* Each body's tracking-station orbit line colour, straight out of the Kopernicus
   dump — these are the hues the map view actually draws. Several are dark enough
   that they need lifting to read as a border on a dark panel, and light enough
   when filled that the label has to flip to dark ink. */
/* ------------------------------- build view -------------------------------
   Side and plan views of whatever the solver just produced, projected from the
   one model in core/model.js so the picture and the physics cannot drift apart.
   Both were drawn here as SVG once, from two passes over the rocket that were
   free to disagree; #63 replaced them with two cameras on a single scene, and
   step 4 took the drawing out. What is left is layout and figures. */

/* Holds the panel's space while the 3D chunk arrives, so the layout does not
   jump when it does. */
const Loading = ({ w, h }: { w: number; h: number }) => (
  <div
    style={{
      width: w,
      height: h,
      border: `1px solid ${C.rule}`,
      borderRadius: 3,
    }}
  />
);

/* Where there is no context to draw into. The stage stepper, the figures below
   the panels and the parts table are all still there and all still say what the
   rocket is, so this is a missing picture rather than a missing answer — which
   is why it is a line rather than a second drawing kept alive for it. #63. */
const NoWebGL = () => (
  <div
    style={{
      border: `1px solid ${C.rule}`,
      borderRadius: 3,
      padding: "18px 16px",
      color: C.muted,
      fontSize: 12,
      maxWidth: 460,
    }}
  >
    This browser has no WebGL, so the rocket cannot be drawn. Every part of it
    is in the stage table below.
  </div>
);

/* The steps the stepper offers. Boosters leave on a step of their own, before
   the stage that carries them, so `drop` and `boost` are separate: what has
   been staged away, and whether what is left still has its boosters on.

   Exported with `stepModels` because the model checks have to ask the build
   view what it draws rather than deriving it a second time. The walk is not a
   property of the solver — `planMission` knows nothing about a boosters-away
   step — so a test that slices the stages itself is checking a rocket the
   application never shows. #63 step 4. */
export function stagingSteps(solved: ReadonlyArray<SolvedStage>) {
  const steps: Array<Step> = [{ label: "On the pad", drop: 0, boost: true }];
  if (solved.length && solved[0].sol.boosters)
    steps.push({
      label: "Boosters away · core burns on",
      drop: 0,
      boost: false,
    });
  solved.forEach((_, i) =>
    steps.push({
      label: i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
      drop: i + 1,
      boost: false,
    }),
  );
  return steps;
}

/* What a step draws: the whole vehicle for the elevation, and the bottom live
   stage for the plan. Boosters are filtered out once they have gone, so the
   panel is sized for the rocket on screen rather than for parts that left. */
export function stepModels(
  solved: ReadonlyArray<SolvedStage>,
  cur: Step,
  payload: number,
  payloadDia: number,
) {
  const live = solved.slice(cur.drop);
  const payD = payloadDiaOf(payload, payloadDia);
  const attached = (p: { ring?: number }) => cur.boost || p.ring === undefined;
  return {
    live,
    model: modelOf(live, payload, payD).filter(attached),
    planModel: modelOf(live.slice(0, 1), payload, payD).filter(attached),
  };
}

/* ------------------------------- the build view -------------------------------

   Layout constants, all in CSS pixels. */
/* Wide enough for the longest step label — "Boosters away · core burns on" —
   to stand on one line, so the rail reads as a list rather than a ragged
   column of one- and two-line chips. */
const RAIL = 200;
const GAP = 22;
/* The header line above each of the three columns, which is what makes their
   labels share one. */
const HEAD = 22;
/* How tall the drawings stand when this is not full screen: what they have
   always been. Full screen is where the space is. */
const INLINE_H = 300;
/* How long one stage separation takes.

   Two paces, because the two ways of asking for one are different questions.
   Clicking a step is a way of getting to it, and the motion is there to say
   what changed — long enough to read, short enough not to be in the way.
   Pressing play is asking to watch the thing, and at twice the length the
   boosters have time to tumble clear before the camera has finished closing
   in. #105 */
const STEP_MS = 800;
const PLAY_MS = 1600;

/* Motion is a preference. The stylesheet already honours it for every
   transition in the application; a separation is the same question asked of a
   render loop. Read once, because it is a property of the person and not of
   the frame. */
let still: boolean | null = null;
const reducedMotion = () => {
  if (still === null)
    still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return still;
};

/* The container width at which the staging chips move to a rail down the left.
   Width rather than aspect ratio, because what a rail needs is horizontal room
   for itself and a phone held either way has none. #99 */
const WIDE = 640;

/* The observed size of an element.

   Width is always safe to read: the row is as wide as the card, and the
   drawings never affect that. Height is read only in full screen, where the row
   is a flex child of a column of known height — inline it would be the
   drawings' own height coming back round to size them again.

   jsdom implements no ResizeObserver, and nothing there can see this anyway:
   `canRender3D()` is false, so the panels this sizes are never built. */
function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const watching = useRef<ResizeObserver | null>(null);
  /* A callback ref, not a `useRef` and an effect. The row it measures is
     unmounted and rebuilt somewhere else every time full screen is toggled —
     the portal is a different place in the tree — and an effect with no
     dependencies would go on watching the element that left, which reports
     nothing and sizes both panels to a pixel. React calls this with the new
     element, and with null on the way out. */
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      /* The same object back where nothing moved, or every scroll of the page
         would be a re-render and a repaint of two WebGL panels. */
      setBox((was) =>
        was.w === r.width && was.h === r.height
          ? was
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    watching.current = ro;
  }, []);
  return { ref, w: box.w, h: box.h };
}

type BuildViewProps = {
  stages: ReadonlyArray<PlanStage>;
  payload: number;
  payloadDia: number;
  color: string;
  maxAspect?: number;
};

function BuildView({
  stages,
  payload,
  payloadDia,
  color,
  maxAspect = 14,
}: BuildViewProps) {
  const solved = useMemo(() => stages.filter(isSolved), [stages]);
  const steps = useMemo(() => stagingSteps(solved), [solved]);
  /* Where the stepper has settled, and where it is going. They differ only
     while a separation is running. */
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(0);
  const [playing, setPlaying] = useState(false);
  /* The transition in flight: which pair of steps, and how far through. Null
     between them, which is every frame that is not animating. */
  const [anim, setAnim] = useState<{ a: number; t: number } | null>(null);
  /* Locked cameras, not an orbit: a schematic that moves stops being a
     drawing. The three-quarter is the one angle that shows a ring of columns
     as a ring while still reading as an elevation. #63 step 5. */
  const [angle, setAngle] = useState("side");
  const [full, setFull] = useState(false);
  const box = useBox();

  const drawn = canRender3D();
  /* Nothing to animate where nothing is drawn — jsdom takes this path, and so
     does a browser with no WebGL and anyone who has asked for less motion.
     Steps are then instant, which is what they have always been. */
  const animates = drawn && !reducedMotion();

  const last = Math.max(0, steps.length - 1);
  const from = Math.min(step, last);
  const want = Math.min(goal, last);
  const moving = from !== want;
  const back = want < from;
  /* A transition is always between neighbours; `lo` is the lower of the pair,
     and a backward step is the same one played from the far end. */
  const lo = back ? from - 1 : from;

  /* One at a time, and the next begins where the last committed — so a jump of
     several steps plays each separation in turn, which is what a launch does.
     #105 */
  useEffect(() => {
    if (!moving) {
      setPlaying(false);
      return;
    }
    if (!animates) {
      setStep(back ? from - 1 : from + 1);
      return;
    }
    setAnim({ a: lo, t: back ? 1 : 0 });
    /* Read here and deliberately not a dependency: the pace belongs to the
       transition that is running, not to the state of the button. Stopping
       mid-play changes `playing` and `goal` without changing which pair of
       steps is in flight, so this effect is not rebuilt and the separation
       finishes at the speed it began. */
    const ms = playing ? PLAY_MS : STEP_MS;
    const t0 = performance.now();
    let id = requestAnimationFrame(function tick(now: number) {
      const u = Math.min(1, (now - t0) / ms);
      setAnim({ a: lo, t: back ? 1 - u : u });
      if (u < 1) id = requestAnimationFrame(tick);
      else {
        setAnim(null);
        setStep(back ? from - 1 : from + 1);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [moving, back, lo, from, animates]);

  /* Escape leaves, and the page behind does not scroll while it is covered. */
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = had;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  /* The two models a transition runs between, and the choreography joining
     them — built once for the transition, not once a frame. `stepModels`
     returns fresh arrays every call, and handing ThreeView a new one every
     frame would have it throw away every buffer on the card to move a part a
     metre. */
  const base = anim ? anim.a : from;
  const shot = useMemo(() => {
    const A = stepModels(solved, steps[base], payload, payloadDia);
    if (!anim || base + 1 > last) return { A, B: null, sep: null };
    const B = stepModels(solved, steps[base + 1], payload, payloadDia);
    return {
      A,
      B,
      sep: separation(A.model, B.model, steps[base], steps[base + 1]),
    };
  }, [solved, steps, base, anim !== null, last, payload, payloadDia]);

  if (!solved.length) return null;

  const frame = anim && shot.sep ? pose(shot.sep, anim.t) : null;
  /* The step being entered: what the figures report and which chip is lit. The
     drawing is between two of them, and the numbers may as well lead. */
  const at = moving ? (back ? lo : lo + 1) : from;
  const model = shot.A.model;
  const live =
    frame && shot.B ? (back ? shot.A.live : shot.B.live) : shot.A.live;
  /* The plan shows the bottom live stage alone, so between two steps it is a
     different shape with nothing in common. It fades through rather than
     moving: out over the first half, swapped where nothing is on screen, back
     in over the second. */
  const planModel =
    frame && shot.B && anim
      ? anim.t < 0.5
        ? shot.A.planModel
        : shot.B.planModel
      : shot.A.planModel;
  const planFade = anim ? Math.abs(2 * anim.t - 1) : 1;

  /* Twice, over two chains. `pad` is the vehicle that leaves the pad and `now`
     is what is left at this step — the same function and the same authority,
     asked about a shorter stack. `test/model.test.ts` already asks it the
     second way and holds the drawing to the answer, so the figures under the
     panels were the only place still reporting the whole vehicle at every
     step: a 1.1 m pod read as 23.2 m tall. #101 */
  const pad = stackGeometry(stages, payload, payloadDia);
  const now = stackGeometry(live, payload, payloadDia);
  /* Nothing has staged away yet, so the two are the same chain and the same
     numbers. Boosters do not enter it either way: `stackGeometry` reports the
     core width, because boosters are gone by about 18 km and the limit judges
     what is left. */
  const whole = live.length === solved.length;
  /* Slenderness is a constraint on the stack that leaves the pad, not on a
     step of it — at "Payload alone" a per-step aspect is about 0.8:1, and a
     warning keyed to that would come off a design that breaks the limit. So
     the colour belongs to the pad's figure, and where that is not the figure
     on the line, the pad's is named beside it and takes the colour. */
  const limit = pad.ar > maxAspect ? C.amber : C.muted;
  /* Both numbers come from the model, not from a second pass over shapes this
     file pushed. They used to be reasoned back from a parts array that carried
     at most two of a stage's side columns — a side elevation cannot show a ring
     — and that is where #9 lived, and #58, and every geometry bug in this
     repository: two descriptions of one rocket.

     Sized for the view actually on screen: turned three-quarters on, a stack is
     shorter and wider than its elevation, and a panel cut for the elevation
     would leave it drawn small in the middle of it. `framing` carries no
     three.js, so asking it costs the bundle nothing. */
  const need = framing(angle, frame ? frame.extent : extentOf(model));
  const H = Math.max(0.1, need.h * 2);
  /* A floor so a very small rocket still gets a panel with room in it. */
  const wMax = Math.max(1, need.w * 2);

  /* Before the observer has reported, and in jsdom where it never will. */
  const outerW = box.w || 320;
  const railed = drawn && outerW >= WIDE;
  const aw = railed ? outerW - RAIL - GAP : outerW;
  const ah = full ? Math.max(1, box.h - HEAD) : INLINE_H;
  const { elev, plan } = panelSizes({ aw, ah }, wMax / H, GAP);

  /* One header line per column, so all three labels sit on it. */
  const head = (label: string, extra?: ReactNode) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, height: HEAD }}
    >
      <span className="eyebrow">{label}</span>
      {extra}
    </div>
  );

  const chips = steps.map((st, i) => (
    <button
      key={i}
      className="chip"
      data-on={i === at ? 1 : 0}
      onClick={() => {
        setPlaying(false);
        setGoal(i);
      }}
      style={railed ? { textAlign: "left", width: "100%" } : undefined}
    >
      {st.label}
    </button>
  ));

  const heading = (
    <span className="eyebrow">Build · step through the staging</span>
  );

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {heading}
      <span style={{ flex: 1 }} />
      {animates && steps.length > 1 && (
        <button
          className="chip"
          aria-label={playing ? "Stop" : "Play the staging"}
          onClick={() => {
            if (playing) {
              /* Let the separation in flight finish rather than snapping out
                 of it halfway. */
              setPlaying(false);
              setGoal(at);
            } else {
              /* From the top again if it is already at the end. */
              if (from === last) setStep(0);
              setGoal(last);
              setPlaying(true);
            }
          }}
          title={playing ? "Stop where it gets to" : "Play the staging through"}
          style={{ display: "flex", alignItems: "center", padding: "4px 8px" }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      )}
      {drawn && (
        <button
          className="chip"
          /* The label is the only text on it, so it has to be a real one: the
             browser reads it out, and the browser suite finds the button by
             it. */
          aria-label={full ? "Leave full screen" : "Full screen"}
          onClick={() => setFull(!full)}
          title={
            full
              ? "Back to the page — Escape does the same"
              : "Fill the window with the drawings"
          }
          style={{ display: "flex", alignItems: "center", padding: "4px 8px" }}
        >
          {full ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>
      )}
    </div>
  );

  /* The largest box the transition passes through. The buffer is allocated
     once for it and the visible box is clipped out of the corner, so the panel
     can change size every frame without reallocating two render targets and a
     depth texture sixty times a second. Sampled rather than solved for:
     `panelSizes` is not monotone in the extent, and nine points cost nothing
     once a transition. #105 */
  const buffers = useMemo(() => {
    if (!shot.sep) return null;
    let ew = 0,
      eh = 0,
      pw = 0;
    for (let i = 0; i <= 8; i++) {
      const f = pose(shot.sep, i / 8);
      const n = framing(angle, f.extent);
      const sz = panelSizes(
        { aw, ah },
        Math.max(1, n.w * 2) / Math.max(0.1, n.h * 2),
        GAP,
      );
      ew = Math.max(ew, sz.elev.w);
      eh = Math.max(eh, sz.elev.h);
      pw = Math.max(pw, sz.plan.w);
    }
    return { elev: { w: ew, h: eh }, plan: { w: pw, h: pw } };
  }, [shot.sep, angle, aw, ah]);

  const panel = (
    label: string,
    parts: typeof model,
    view: string,
    size: { w: number; h: number },
    buffer: { w: number; h: number } | undefined,
    extra?: ReactNode,
    fade?: number,
    moves?: ReturnType<typeof pose> | null,
  ) => (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {head(label, extra)}
      {/* At the foot of its column, so the base of the plan and the base of
          the elevation are the same line — which is the bottom of the section.
          The elevation is the taller of the two and never moves. */}
      <div style={{ marginTop: "auto", opacity: fade ?? 1 }}>
        <Suspense fallback={<Loading w={size.w} h={size.h} />}>
          <ThreeView
            parts={parts}
            view={view}
            width={size.w}
            height={size.h}
            color={color}
            buffer={buffer}
            extent={moves ? moves.extent : undefined}
            midY={moves ? moves.midY : undefined}
            offsets={moves ? moves.offsets : undefined}
          />
        </Suspense>
      </div>
    </div>
  );

  const row = (
    <div
      ref={box.ref}
      style={{
        display: "flex",
        gap: GAP,
        /* Every column the height of the row, so the one that pushes its
           drawing to the bottom has something to push against. */
        alignItems: "stretch",
        /* Full screen: everything the two lines of text do not need. */
        flex: full ? 1 : undefined,
        minHeight: 0,
        overflowX: railed ? undefined : "auto",
      }}
    >
      {railed && (
        <div
          style={{
            width: RAIL,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {head("Staging")}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              marginTop: 6,
              overflowY: "auto",
            }}
          >
            {chips}
          </div>
        </div>
      )}
      {panel(
        "Elevation",
        model,
        angle,
        elev,
        buffers?.elev,
        <button
          className="chip"
          data-on={angle === "iso" ? 1 : 0}
          style={{ padding: "2px 7px", fontSize: 10 }}
          onClick={() => setAngle(angle === "iso" ? "side" : "iso")}
          title="Turn the same model three-quarters on. The plan does not move; it is the same scene from underneath."
        >
          Iso
        </button>,
        1,
        frame,
      )}
      {panel(
        "Plan",
        planModel,
        "plan",
        plan,
        buffers?.plan,
        undefined,
        planFade,
      )}
    </div>
  );

  const body = (
    <>
      {header}
      {!railed && (
        <div
          style={{
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          {chips}
        </div>
      )}
      {drawn ? row : <NoWebGL />}
      <div
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
          marginTop: 12,
          fontFamily: "monospace",
          fontSize: 11.5,
          color: C.muted,
        }}
      >
        <span>
          {live.length} stage{live.length === 1 ? "" : "s"} attached
        </span>
        {/* From `stackGeometry`, not from the drawing's own bounds. The two
            agree — `test/model.test.ts` holds them to a millimetre — and there
            is one of them, which is the point. */}
        <span>{now.h.toFixed(1)} m tall</span>
        <span>{now.w.toFixed(2)} m across</span>
        <span style={{ color: whole ? limit : undefined }}>
          {now.ar.toFixed(1)}:1 aspect
          {!whole && (
            <span style={{ color: limit }}>
              {" · "}
              {pad.ar.toFixed(1)} on the pad
            </span>
          )}
        </span>
      </div>
    </>
  );

  /* What is left in the card while the overlay is up. A line rather than the
     same button again: two controls with one label is two things for a screen
     reader to read out and one of them to pick from, and the way back is on
     the overlay where the eye already is. */
  const placeholder = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {heading}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: C.dim }}>
        shown full screen · Escape to come back
      </span>
    </div>
  );

  /* Through a portal, and this is not a detail. The overlay has to escape the
     `Solving` veil: that wrapper drops to `opacity: .22` and `filter:
     grayscale(1)` while a solve runs, and either of those makes it the
     containing block for a `position: fixed` descendant — so the overlay would
     re-anchor itself to the results column halfway through a solve.

     Under the app's own solving bar, which is fixed at 50 and lives outside the
     veil, so a full-screen rocket about to be replaced still says so.

     Not the Fullscreen API. This is meant to run inside a Claude artifact's
     iframe, where `requestFullscreen` needs an `allow` attribute nobody here
     controls. Filling the window is the promise it can keep. */
  return (
    <>
      <div>{full ? placeholder : body}</div>
      {full &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 45,
              background: C.ink,
              /* A second root. Outside the one the application sets these on,
                 `button { font-family: inherit }` reaches the browser default
                 and every chip in here comes out in Times. */
              fontFamily: FONT,
              color: C.paper,
              padding: 16,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}

/* Everything downstream of the solve gets veiled while it runs. A bar pinned to
   the top of the page was the obvious idea and the wrong one: an artifact is an
   iframe sized to its content, so the parent page scrolls and nothing inside can
   stay in view. Marking the panels themselves works wherever you happen to be
   looking. */
function AscentPanel({ a, color }: { a: Ascent; color: string }) {
  const atm = (a.veh.atmo.p(0) / 101.325).toFixed(2);
  if (!a.ok) {
    const m0 =
      a.veh.stages.reduce(
        (t, x) => t + x.wet + (x.boosters ? x.boosters.n * x.boosters.wet : 0),
        0,
      ) + a.veh.payload;
    return (
      <div
        style={{
          border: `1px solid ${C.rust}`,
          borderRadius: 3,
          padding: 13,
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: C.rust }}>
          This design never reaches orbit from {a.bodyName}.
        </strong>{" "}
        No pitch programme gets {fmt(m0, 1)} t up to{" "}
        {Math.round(a.target / 1000)} km.
        <div style={{ color: C.muted, marginTop: 7 }}>
          The stages above were sized on vacuum Isp, but {a.bodyName} sits at{" "}
          {atm} atm on the surface, where engines deliver a fraction of their
          rated thrust and efficiency. The Δv map figure already assumes losses
          the rocket equation on its own cannot see. Add stages, choose engines
          with a flatter Isp curve, or expect a far heavier vehicle than the
          parts list suggests.
        </div>
      </div>
    );
  }
  const handed = a.handT >= 0;
  const hot = a.maxQ > 40000;
  /* Named as numbers rather than as truthiness, so the throttle settings below
     can be read without asking again whether they are there. */
  const limit = a.limit ?? 1;
  const core = a.core ?? 1;
  /* Null where no stage was still live to circularise on. */
  const circBurn = a.circBurn ?? 0;
  const limited = limit < 0.999;
  const cored = core < 0.999;
  /* TWR of the stage that has to finish the job, at the moment it lights. Below
     1.0 the ascent is unforgiving and the flight card should say so. */
  /* The two numbers side by side: what this flight costs, and what the rocket
     has. They used to be a map estimate and a simulated cost with nothing tying
     them together, so a vehicle built to 3 740 could sit next to a 4 062 flight
     and look fine. */
  const lowUpper = (() => {
    const st = a.veh && a.veh.stages[a.veh.stages.length - 1];
    if (!st) return null;
    const m = st.wet + a.veh.payload;
    const twr = (st.mdot * st.isp(0) * 9.80665) / (m * a.veh.body.g0);
    return twr < 1 ? twr : null;
  })();
  const limitOn =
    a.veh.stages[0] && a.veh.stages[0].boosters
      ? "the boosters"
      : "the first stage";
  const steps = [
    ...(limited
      ? [
          [
            `Set ${limitOn} to ${Math.round(limit * 100)}% thrust`,
            "in the VAB, before you launch",
          ],
        ]
      : []),
    ...(cored
      ? [
          [
            `Fly the core at ${Math.round(core * 100)}% throttle`,
            "boosters stay at full — they cannot be throttled",
          ],
        ]
      : []),
    [
      a.bodyName === "Kerbin"
        ? "Full throttle, release the clamps"
        : "Full throttle, lift off",
      "straight up, SAS on",
    ],
    [`At ${a.vKick} m/s, pitch ${a.kick}° east`, "then hold that attitude"],
    handed
      ? [
          `Hold it until T+${hms(a.handT)}`,
          `the prograde marker rises to meet your nose at ~${Math.round(a.handV)} m/s, ${(a.handAlt / 1000).toFixed(1)} km — switch SAS to prograde then`,
        ]
      : [
          "Hold that attitude all the way up",
          "prograde never catches your nose on this one",
        ],
    /* The achieved apoapsis, not the target — drag on the way out of the air
       costs some of it — and the time the engine actually stops, not the moment
       the integration hands over to the coast. */
    [
      `Cut engines at T+${hms(a.tMeco != null ? a.tMeco : a.t)}`,
      `apoapsis will settle at ${(a.apo / 1000).toFixed(1)} km`,
    ],
    [
      `Coast ${
        a.tApo != null && a.tMeco != null ? hms(a.tApo - a.tMeco) : ""
      } to apoapsis`,
      a.tApo
        ? `apoapsis at T+${hms(a.tApo)} — warp through it`
        : "nothing to fly",
    ],
    [
      `Circularise with ${fmt(a.circ)} m/s, held level`,
      a.circBurn
        ? a.circBurn < 4
          ? `a ${a.circBurn.toFixed(1)} second tap right on the mark`
          : `${hms(a.circBurn)} of burn — start it ${hms(a.circBurn / 2)} early so it straddles apoapsis`
        : "circularised",
    ],
  ];
  const box = {
    background: C.panel2,
    border: `1px solid ${C.rule}`,
    borderRadius: 3,
    padding: "10px 12px",
  };
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {steps.map(([main, sub], i) => (
          <div
            key={i}
            style={{
              ...box,
              borderLeft: `3px solid ${i === 1 || i === 2 ? color : C.rule}`,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}
            >
              {i + 1}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 3 }}>
              {main}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted }}>{sub}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 26px",
          marginBottom: hot ? 12 : 0,
        }}
      >
        <Stat
          label="Ascent costs"
          value={fmt(a.total)}
          unit="m/s"
          color={color}
        />
        {a.carried != null && (
          <Stat
            label="Vehicle carries"
            value={fmt(a.carried)}
            unit="m/s"
            color={a.carried >= a.total ? C.mint : C.rust}
          />
        )}
        <Stat label="Gravity loss" value={fmt(a.gLoss)} unit="m/s" small />
        <Stat label="Drag loss" value={fmt(a.dLoss)} unit="m/s" small />
        <Stat label="Steering loss" value={fmt(a.sLoss)} unit="m/s" small />
        <Stat
          label="Max Q"
          value={(a.maxQ / 1000).toFixed(1)}
          unit={`kPa at ${(a.maxQalt / 1000).toFixed(1)} km`}
          small
        />
        <Stat label="Peak Mach" value={a.maxMach.toFixed(2)} unit="" small />
      </div>

      {circBurn > 90 && (
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          That circularisation runs {Math.round(circBurn)} s on a low-thrust
          stage. Centring it still helps, but over a burn that long the apoapsis
          drifts while you push — expect to arrive slightly elliptical and trim
          it on the next pass.
        </div>
      )}
      {a.circShort && (
        <div
          style={{
            fontSize: 12,
            color: C.amber,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          The stage that reaches orbit runs dry partway through this burn — the
          timing above assumes it continues on the stage above.
        </div>
      )}
      {a.marks && a.marks.length > 2 && (
        <div
          style={{
            border: `1px solid ${C.rule}`,
            borderRadius: 3,
            padding: 11,
            marginBottom: 12,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 7 }}>
            Fly this profile
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr
                style={{
                  color: C.dim,
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                <th style={{ textAlign: "left", padding: "0 0 5px" }}>T+</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>
                  Navball pitch
                </th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>
                  Speed
                </th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>
                  Altitude
                </th>
              </tr>
            </thead>
            <tbody>
              {a.marks.map((w, i) => (
                <tr
                  key={i}
                  style={{
                    borderTop:
                      w.meco || w.apoMark ? `1px solid ${C.rule}` : "none",
                  }}
                >
                  <td
                    className="mono"
                    style={{
                      padding: "3px 0",
                      color: w.meco || w.apoMark ? color : C.paper,
                    }}
                  >
                    {hms(w.t)}
                    {w.meco ? " · cutoff" : w.apoMark ? " · apoapsis" : ""}
                  </td>
                  <td
                    className="mono"
                    style={{
                      padding: "3px 0",
                      textAlign: "right",
                      color: w.coast ? C.dim : color,
                      fontWeight: w.coast ? 400 : 600,
                    }}
                  >
                    {w.apoMark
                      ? "burn level"
                      : w.coast
                        ? "coast"
                        : (w.nav ?? 0) >= 0
                          ? `${w.nav ?? 0}° up`
                          : `${-(w.nav ?? 0)}° down`}
                  </td>
                  <td
                    className="mono"
                    style={{
                      padding: "3px 0",
                      textAlign: "right",
                      color: C.muted,
                    }}
                  >
                    {w.v} m/s
                  </td>
                  <td
                    className="mono"
                    style={{
                      padding: "3px 0",
                      textAlign: "right",
                      color: C.dim,
                    }}
                  >
                    {(w.h / 1000).toFixed(1)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              fontSize: 11,
              color: C.dim,
              marginTop: 8,
              lineHeight: 1.45,
            }}
          >
            Pitch is degrees above the horizon on the navball, flying east — fly
            the clock, not the altimeter. A shallow upper stage will level off
            and may nose slightly below the horizon while it builds horizontal
            speed, so altitude stops rising monotonically near the end and is a
            poor thing to steer by. If you are slow at a given time you are
            climbing too steeply: pitch further down rather than waiting for
            prograde to come to you. After cutoff there is nothing to fly until
            apoapsis; start the circularisation half its duration early so it
            straddles the mark. Hold that burn level — 0° on the navball —
            rather than on prograde. A long circularisation lifts you as it
            runs, so prograde tilts upward and following it pushes apoapsis
            ahead of you instead of raising periapsis behind you. Level is the
            attitude that closes the orbit. The circularisation figure below
            assumes you arrive at apoapsis on this profile — a few hundred m/s
            short there costs far more than that to fix.
          </div>
        </div>
      )}
      {lowUpper && (
        <div
          style={{
            border: `1px solid ${C.amber}`,
            borderRadius: 3,
            padding: 11,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: C.amber }}>Upper stage cannot hover.</strong>{" "}
          It lights at TWR {lowUpper.toFixed(2)}, so it will not hold altitude
          pointed upward — it has to be flown nearly level to build speed. If
          you keep following prograde while still climbing steeply it will bleed
          the whole stage climbing and arrive at apoapsis far too slow to
          circularise.
        </div>
      )}
      {cored && (
        <div
          style={{
            border: `1px solid ${C.mint}`,
            borderRadius: 3,
            padding: 11,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: C.mint }}>
            Hold the core at {Math.round(core * 100)}% until the boosters burn
            out.
          </strong>{" "}
          Solids have no shutdown, so at full throttle this stack carries its
          apoapsis well past the mark before you can stop it. Throttling the
          liquid core lands the two together and is worth about{" "}
          {fmt(Math.round((a.fullThrottle || 0) - a.total))} m/s.
        </div>
      )}
      {limited && (
        <div
          style={{
            border: `1px solid ${C.mint}`,
            borderRadius: 3,
            padding: 11,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: C.mint }}>
            Throttled to {Math.round(limit * 100)}% on {limitOn}.
          </strong>{" "}
          At full thrust this stack passes 40 kPa, where a real one tends to
          flip or shed parts. Right-click the part in the VAB and drag the
          thrust limiter — it cuts fuel flow with the thrust, so the stage
          simply burns longer at lower thrust and loses no Δv. Peak now{" "}
          {(a.maxQ / 1000).toFixed(0)} kPa.
        </div>
      )}
      {hot && (
        <div
          style={{
            border: `1px solid ${C.rust}`,
            borderRadius: 3,
            padding: 11,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: C.rust }}>
            Nothing stays under 40 kPa — peak is {(a.maxQ / 1000).toFixed(0)}{" "}
            kPa at {(a.maxQalt / 1000).toFixed(1)} km.
          </strong>{" "}
          {Number(atm) > 1.5 ? (
            <>
              That is {a.bodyName} rather than your rocket: {atm} atm at the
              surface makes high dynamic pressure unavoidable, and this is the
              gentlest trajectory that still reaches orbit. Treat the drag
              figure as indicative — it is well outside where the model was
              checked against Kerbin ascents.
            </>
          ) : (
            <>
              This vehicle is over-thrusted for the air it climbs through, where
              a real stack tends to flip or shed parts. Drop a booster, throttle
              the first stage back, or fly a shallower turn and accept the extra
              gravity loss.
            </>
          )}
        </div>
      )}

      <div
        className="mono"
        style={{ fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.7 }}
      >
        Atmosphere is {a.bodyName}'s own stock pressure and temperature spline —{" "}
        {atm} atm at the surface. Density and speed of sound fall straight out
        of it with nothing fitted. Isp follows a three-key curve pinned to the
        vacuum and sea-level figures. Drag takes the widest cross-section still
        attached plus any live boosters, on the stock transonic Cd hump — that
        part is an approximation, since the game bakes drag cubes per part and
        occludes them by how you stack.
      </div>
    </div>
  );
}

export { AscentPanel, BuildView, PartsTable, StageStack, isSolved };
export type { Ascent, Hardware, SolvedStage, Step };

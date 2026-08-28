import { useState } from "react";
import {
  PACK_BRACE,
  PACK_JOIN,
  PART_H,
  clusterSpan,
  engineLen,
  stackGeometry,
  stageGeom,
  tankStackLen,
  widthOf,
} from "../../core/geometry.js";
import { PLATE_SHROUD, diaOf } from "../../core/parts.js";
import { fmt, hms } from "../format.js";
import { C } from "../tokens.js";
import { Mini, Stat } from "./controls.jsx";

function StageStack({ stages, color, splitBy, onSetSplit }) {
  const max = Math.max(...stages.map((x) => x.sol?.total || 1));

  // stages arrive bottom-first; collect them back under the segment they serve
  const segs = [];
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
                              {sol.boosters.part.n}
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
                            {sol.stacks > 1 && (
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color: C.mint,
                                  fontWeight: 600,
                                }}
                              >
                                core + {sol.stacks - 1} radial
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
function PartsTable({ stages, payload, hardware, color }) {
  /* Listed the way you build it: payload at the top, then each stage downward to
     the one standing on the pad. Within a stage the order is physical too —
     decoupler at its top, then tanks, then any adapter, then the engine, with
     radial boosters last since they hang off the side. Stage numbers therefore
     count down, which is also how the staging list reads in game. */
  const rows = [];
  const solved = stages.map((s, i) => ({ s, n: i + 1 })).filter((x) => x.s.sol);
  [...solved].reverse().forEach(({ s, n }) => {
    if (s.sol.decoupler && s.sol.decoupler.qty > 0) {
      const q = s.sol.decoupler.qty;
      rows.push({
        stage: n,
        part: s.sol.decoupler.n,
        qty: q,
        each: s.sol.decoupler.m / q,
        tot: s.sol.decoupler.m,
        kind: "struct",
      });
    }
    if (s.sol.rejoin)
      rows.push({
        stage: n,
        part: s.sol.rejoin.n + " (inverted)",
        qty: 1,
        each: s.sol.rejoin.m,
        tot: s.sol.rejoin.m,
        kind: "adapter",
      });
    if (s.sol.stacks > 1) {
      rows.push({
        stage: n,
        kind: "note",
        qty: null,
        each: null,
        tot: null,
        part: `— core + ${s.sol.stacks - 1} radial stacks, each of the following —`,
      });
      if (s.sol.joiner)
        rows.push({
          stage: n,
          part: `${s.sol.joiner.n} (holds a stack on, top and bottom)`,
          qty: 2,
          each: s.sol.joiner.m,
          tot: (s.sol.stacks - 1) * 2 * s.sol.joiner.m,
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
      rows.push({
        stage: n,
        part: PACK_JOIN.n,
        qty: pk.cols,
        each: PACK_JOIN.m,
        tot: pk.cols * PACK_JOIN.m,
        kind: "struct",
      });
      rows.push({
        stage: n,
        part: `${PACK_BRACE.n} (steadies each column)`,
        qty: pk.cols,
        each: PACK_BRACE.m,
        tot: pk.cols * PACK_BRACE.m,
        kind: "struct",
      });
    }
    /* With radial stacks the header says how many there are, so the rows below it
       are one stack's worth — quantities multiplied out under a header that
       already states the count read as though each stack needed all of them. */
    const S = s.sol.stacks || 1;
    /* Smallest at the top of the run, largest at the bottom — the order you would
       actually assemble them in, and the order a rocket wants structurally. */
    (S > 1 ? s.sol.perStack.list : s.sol.tanks ? s.sol.tanks.list : [])
      .slice()
      .sort((a, b) => a.t.wet - b.t.wet)
      .forEach((x) =>
        rows.push({
          stage: n,
          part: x.t.n,
          qty: x.c,
          each: x.t.wet,
          tot: (S > 1 ? S : 1) * x.c * x.t.wet,
          kind: "tank",
        }),
      );
    if (s.sol.coupler) {
      const pl = PLATE_SHROUD[s.sol.coupler.n];
      rows.push({
        stage: n,
        qty: 1,
        each: s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m,
        tot: S * (s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m),
        kind: "adapter",
        part:
          s.sol.coupler.n +
          (pl
            ? ` · ${["", "Single", "Double", "Triple", "Quad"][s.sol.coupler.out] || s.sol.coupler.out + "-way"}` +
              (s.sol.shroud ? `, ${s.sol.shroud.v} shroud` : "")
            : ""),
      });
    }
    s.sol.adapters?.parts.forEach((t) =>
      rows.push({
        stage: n,
        part: t.n,
        qty: 1,
        each: t.wet,
        tot: t.wet,
        kind: "adapter",
      }),
    );
    rows.push({
      stage: n,
      part: s.sol.engine.n,
      qty: s.sol.n / S, // per stack
      each: s.sol.engine.m,
      tot: s.sol.n * s.sol.engine.m,
      kind: "engine",
    });
    if (s.sol.boosters) {
      /* Decoupler first: it goes on the tank before the booster goes on it, and
         the list is meant to be read as a build order. */
      const b = s.sol.boosters;
      if (b.part.column)
        rows.push({
          stage: n,
          kind: "note",
          qty: null,
          each: null,
          tot: null,
          part: `— ${b.n} radial stacks, each of the following —`,
        });
      else
        rows.push({
          stage: n,
          part: "TT-38K Radial Decoupler",
          qty: b.n,
          each: 0.05,
          tot: b.n * 0.05,
          kind: "struct",
        });
      if (b.part.column)
        rows.push({
          stage: n,
          part: "TT-38K Radial Decoupler",
          qty: 1,
          each: 0.05,
          tot: 0.05,
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
        b.part.column.list
          .slice()
          .sort((a2, b2) => a2.t.wet - b2.t.wet)
          .forEach((x) =>
            rows.push({
              stage: n,
              part: x.t.n,
              qty: x.c,
              each: x.t.wet,
              tot: b.n * x.c * x.t.wet,
              kind: "booster",
            }),
          );
        rows.push({
          stage: n,
          part: b.part.n,
          qty: 1,
          each: b.part.dry - b.part.column.dryMass,
          tot: b.n * (b.part.dry - b.part.column.dryMass),
          kind: "booster",
        });
      } else {
        rows.push({
          stage: n,
          part: b.part.n,
          qty: b.n,
          each: b.part.m,
          tot: b.n * b.part.m,
          kind: "booster",
        });
      }
    }
  });
  const th = {
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
   Side and plan elevations of whatever the solver just produced, drawn from the
   same geometry the drag model uses so the picture and the physics cannot drift
   apart. Solid fuel is 7.5 kg per 5 litre unit, so a booster's casing length
   comes out of its fuel mass the same way a tank's does. */
/* Solid fuel is 7.5 kg per 5 litre unit, so 1.5 t per cubic metre. The grain
   alone left the small boosters far too stubby — a Flea came out at 0.6 m — so
   add a nozzle and closure allowance that scales with bore. Schematic, not
   exact: this lands within about 20% across Flea to Kickback. */
const srbLen = (part) => {
  const real = PART_H[part.n];
  if (real !== undefined) return real;
  const d = diaOf(part);
  return part.fuelM / 1.5 / ((Math.PI / 4) * d * d) + 0.7 * d;
};

function ringPositions(n) {
  const centre = n === 1 || n === 5 || n === 7 || n === 9 ? 1 : 0;
  const ring = n - centre;
  const pts = centre ? [[0, 0]] : [];
  for (let i = 0; i < ring; i++) {
    const th = (i / ring) * 2 * Math.PI - Math.PI / 2;
    pts.push([Math.cos(th), Math.sin(th)]);
  }
  return pts;
}

function BuildView({ stages, payload, color, maxAspect = 14 }) {
  const solved = stages.filter((x) => x.sol);
  const [step, setStep] = useState(0);
  if (!solved.length) return null;

  const hasBoost = !!solved[0].sol.boosters;
  const steps = [{ label: "On the pad", drop: 0, boost: true }];
  if (hasBoost)
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
  const cur = steps[Math.min(step, steps.length - 1)];
  const live = solved.slice(cur.drop);

  // stack it bottom-up in metres
  const parts = [];
  let y = 0,
    wMax = Math.max(1, Math.cbrt(payload) * 1.2);
  live.forEach((st, i) => {
    const sol = st.sol;
    /* Same geometry the bounding box and the slenderness check use. Working it
       out again here is what let the drawing describe a different rocket. */
    const g = stageGeom(sol);
    const { td, ed, S, perEng } = g;
    /* One radius for the whole stage, from stageGeom. The side columns used to
       be offset by each part's own width, so an engine and the tank above it in
       the same column did not line up. #58 */
    const ring = g.ringR;
    const span = g.engineSpan; // the engine block, not the tank ring
    const el = g.engine,
      tl = g.tank;
    if (el > 0)
      parts.push({
        kind: "engine",
        y,
        h: el,
        w: span,
        n: perEng,
        ed,
        td,
        S,
        ring,
      });
    y += el;
    if (g.coupler > 0) {
      parts.push({ kind: "adapter", y, h: g.coupler, w: sol.coupler.top });
      y += g.coupler;
    }
    g.adapters.forEach((a2) => {
      parts.push({ kind: "adapter", y, h: a2.h, w: a2.w });
      y += a2.h;
    });
    /* A packed run is drawn band by band: any spare tanks sit on the centre
       column at their own width, then each level of the ring is one tank tall and
       as wide as the ring. Drawing the whole run as a single rectangle with two
       tanks stuck on the side described a shape that does not exist when the ring
       is more than one level deep. */
    if (tl > 0) {
      if (g.pack) {
        const pk = g.pack;
        const spareH = pk.spare * pk.levelH;
        const rest = tl - spareH - pk.levels * pk.levelH;
        if (rest > 0.01) {
          parts.push({ kind: "tank", y, h: rest, w: td, S, ring });
          y += rest;
        }
        for (let L = 0; L < pk.levels; L++) {
          parts.push({
            kind: "tank",
            y,
            h: pk.levelH,
            w: td,
            S,
            ring,
            pack: { r: pk.r, w: pk.w, td: pk.td },
          });
          y += pk.levelH;
        }
        if (spareH > 0.01) {
          parts.push({ kind: "tank", y, h: spareH, w: td, S, ring });
          y += spareH;
        }
        y -= tl; // the common y += tl below adds it back
      } else {
        parts.push({ kind: "tank", y, h: tl, w: td, S, ring, pack: null });
      }
    }
    y += tl;
    if (sol.decoupler) {
      const dh = g.decoupler; // shared with stageSize, not recomputed
      parts.push({ kind: "struct", y, h: dh, w: td });
      y += dh;
    }
    if (i === 0 && cur.boost && sol.boosters) {
      /* A liquid column is drawn at its tank diameter and its real stacked
         height, not the engine's — an SRB is one part, a column is a stack. */
      const bo = sol.boosters;
      const bd = bo.part.column
        ? diaOf(bo.part.column.list[0].t)
        : widthOf(bo.part, diaOf(bo.part));
      const bl = bo.part.column
        ? tankStackLen(bo.part.column) + engineLen(bo.part)
        : srbLen(bo.part);
      // they sit on the pad alongside the core, nozzles roughly level
      parts.push({ kind: "booster", y: 0, h: bl, w: bd, n: bo.n, core: td });
    }
  });
  const geo = stackGeometry(stages, payload);
  const payD = Math.max(0.9, Math.cbrt(payload) * 1.1);
  parts.push({ kind: "payload", y, h: payD * 1.3, w: payD });
  /* Measure both axes from what is actually drawn. Deriving an extent separately
     from the parts let the two disagree: anything wider than the estimate ran off
     the side, and a booster taller than the stage it is strapped to ran off the
     top, since the height came from the stack alone. */
  const H = parts.reduce((mx, q) => Math.max(mx, q.y + q.h), 0);
  wMax =
    2 *
    parts.reduce(
      (mx, q) =>
        Math.max(
          mx,
          /* Every term that applies, not the first one that matches. A packed
             tank part carries both `pack` and `S`, and the renderer runs both
             loops — so taking only `pack.w / 2` for it left the parallel
             columns out of the width the panel is sized from, and they drew
             off the side. Latent until the designs moved under it; five stages
             across the two baselines are now both. #9. */
          q.kind === "booster"
            ? q.core / 2 + q.w
            : Math.max(
                q.w / 2,
                q.pack ? q.pack.w / 2 : 0,
                q.S > 1 ? q.ring + q.w / 2 : 0,
              ),
        ),
      0,
    );

  // ---- side elevation ----
  const SH = 300,
    pad = 10;
  const scale = Math.min((SH - 2 * pad) / H, 150 / wMax);
  const sw = wMax * scale + 2 * pad,
    sh = H * scale + 2 * pad;
  const px = (v) => v * scale;
  const fill = {
    tank: C.tank,
    engine: C.engine,
    booster: color,
    payload: C.payloadFill,
    adapter: C.violet,
    struct: C.dim,
  };

  const sideParts = [];
  parts.forEach((q, i) => {
    const yTop = sh - pad - px(q.y + q.h);
    if (q.kind === "booster") {
      // one ring, drawn as the two you would see side-on
      const xs = [sw / 2 - px(q.core / 2) - px(q.w), sw / 2 + px(q.core / 2)];
      xs.forEach((x, j) =>
        sideParts.push(
          <rect
            key={`b${i}-${j}`}
            x={x}
            y={yTop}
            width={px(q.w)}
            height={px(q.h)}
            rx={px(q.w) / 3}
            fill={fill.booster}
            opacity={0.9}
            stroke={C.edge}
            strokeWidth="0.8"
          />,
        ),
      );
      sideParts.push(
        <text
          key={`bn${i}`}
          x={sw / 2 + px(q.core / 2 + q.w / 2)}
          y={yTop - 3}
          textAnchor="middle"
          fontSize="8"
          fill={color}
          fontFamily="monospace"
        >
          {q.n}×
        </text>,
      );
      return;
    }
    sideParts.push(
      <rect
        key={i}
        x={sw / 2 - px(q.w) / 2}
        y={yTop}
        width={px(q.w)}
        height={px(q.h)}
        rx={q.kind === "payload" ? px(q.w) / 4 : 1.5}
        fill={fill[q.kind]}
        stroke={C.edge}
        strokeWidth="0.8"
      />,
    );
    /* the other columns of a parallel stage, drawn either side of the middle */
    /* Outer stacks ring the core, so from the side you see the two widest of
       them flanking it — drawing every one in a row would be a lie about the
       width. */
    /* A packed tank block is a centre column with a ring around it, so from the
       side you see the two nearest ring tanks flanking the middle — the same way
       parallel stacks are drawn, and for the same reason. */
    if (q.pack)
      for (let c = 1; c <= 2; c++) {
        const off = ((c % 2 ? 1 : -1) * (q.pack.w - q.pack.td)) / 2;
        sideParts.push(
          <rect
            key={`${i}k${c}`}
            x={sw / 2 - px(q.pack.td) / 2 + px(off)}
            y={yTop}
            width={px(q.pack.td)}
            height={px(q.h)}
            rx={1.5}
            fill={fill[q.kind]}
            stroke={C.edge}
            strokeWidth="0.8"
            opacity="0.92"
          />,
        );
      }
    if (q.S > 1)
      for (let c = 1; c <= Math.min(2, q.S - 1); c++) {
        const off = (c % 2 ? 1 : -1) * q.ring;
        sideParts.push(
          <rect
            key={`${i}p${c}`}
            x={sw / 2 - px(q.w) / 2 + px(off)}
            y={sh - pad - px(q.y) - px(q.h)}
            width={px(q.w)}
            height={px(q.h)}
            rx={1.5}
            fill={fill[q.kind]}
            stroke={C.edge}
            strokeWidth="0.8"
            opacity="0.92"
          />,
        );
      }
    if (q.kind === "engine" && q.n > 1)
      sideParts.push(
        <text
          key={`n${i}`}
          x={sw / 2}
          y={yTop + px(q.h) / 2 + 3}
          textAnchor="middle"
          fontSize="9"
          fill={C.onLight}
          fontFamily="monospace"
          fontWeight="700"
        >
          {q.n}×
        </text>,
      );
  });

  // ---- plan view: widest live stage, plus any boosters ----
  const bottom = live[0] && live[0].sol;
  const PS = 150,
    planPayD = payD;
  const plan = [];
  if (bottom) {
    const td = bottom.tanks
      ? diaOf(bottom.tanks.list[0].t)
      : diaOf(bottom.engine);
    const ed = widthOf(bottom.engine, diaOf(bottom.engine));
    const S = bottom.stacks || 1;
    /* The plan's own extent: the ring of stacks reaches td from the middle plus
       its own radius, and boosters sit outside that again. Reusing the side
       elevation's width clipped whichever view was the wider of the two. */
    const bd0 =
      cur.boost && bottom.boosters
        ? bottom.boosters.part.column
          ? diaOf(bottom.boosters.part.column.list[0].t)
          : widthOf(bottom.boosters.part, diaOf(bottom.boosters.part))
        : 0;
    /* Reach has to cover whichever sticks out furthest. A cluster wider than the
       tank it sits under does, and it was not counted — so dropping the boosters
       shrank the estimate to the tank radius and the engine ring spilled over the
       edge. */
    const perEng0 = bottom.n / S;
    const clusterReach = Math.max(td, clusterSpan(perEng0, ed)) / 2;
    const ringOff = S > 1 ? stageGeom(bottom).ringR : 0;
    const reach = Math.max(
      ringOff + clusterReach,
      bd0 ? (S > 1 ? ringOff : td / 2) + bd0 : 0,
      /* A packed ring on parallel stacks sits at a column centre, td from the
         middle, so its reach is the offset plus the ring — not the ring alone.
         Same one-term-per-part mistake as `wMax` above, in the other view. #9 */
      bottom.packed ? ringOff + bottom.packed.width / 2 : 0,
      planPayD / 2,
    );
    const ps = (PS - 16) / (2 * reach);
    /* Where a stage runs parallel columns the plan is the arrangement seen from
       above: two side by side, three in a triangle. Each carries its own engines,
       so the cluster ring is drawn per column. */
    /* One in the middle, the rest evenly around it — the arrangement you get
       from radial symmetry in the VAB. */
    /* Start the ring at the right and work round, so the first pair sits left and
       right — which is the pair the side elevation draws. Starting at the top put
       the plan out of step with the elevation for no reason. */
    /* The radius comes from stageGeom, which is the one authority on it. It
       used to be `td` here, so a column wider than its tank overlapped its
       neighbours — #58. */
    const ringR = stageGeom(bottom).ringR;
    /* Each column carries the angle it sits at, because what is bolted to it
       turns with it. Radial symmetry in the VAB rotates every copy by the
       symmetry angle, so a pair of engines on a column at 120 degrees points
       along that column, not along whichever axis the centre one uses. Drawing
       every cluster at the same orientation put two engines one above the other
       on all three columns of a three-stack stage. */
    const centres = [[0, 0, 0]];
    for (let i = 0; i < S - 1; i++) {
      const th = (i / (S - 1)) * 2 * Math.PI;
      centres.push([Math.cos(th) * ringR, Math.sin(th) * ringR, th]);
    }
    /* Turn a position in a column's own frame into the plan's frame. */
    const turn = (cx, cy, th) => [
      cx * Math.cos(th) - cy * Math.sin(th),
      cx * Math.sin(th) + cy * Math.cos(th),
    ];
    const perEng = bottom.n / S;
    const rr = ((clusterSpan(perEng, ed) - ed) / 2) * ps;
    /* The plan is the view looking up from underneath, so it is drawn back to
       front: whatever sits highest goes down first and the engines, nearest the
       viewer, go last. Any packed tank ring is above the engines, so it belongs
       in that first pass. */
    const pk = bottom.packed;
    centres.forEach(([ox, oy, oth], c) => {
      const X = PS / 2 + ox * ps,
        Y = PS / 2 + oy * ps;
      plan.push(
        <circle
          key={`core${c}`}
          cx={X}
          cy={Y}
          r={(td / 2) * ps}
          fill={fill.tank}
          stroke={C.edge}
          strokeWidth="0.9"
        />,
      );
      if (pk) {
        const rk = ((pk.width - diaOf(pk.tank)) / 2) * ps;
        for (let i = 0; i < pk.r; i++) {
          const th = (i / pk.r) * 2 * Math.PI + oth; // right first, matching the elevation
          plan.push(
            <circle
              key={`k${c}_${i}`}
              cx={X + Math.cos(th) * rk}
              cy={Y + Math.sin(th) * rk}
              r={(diaOf(pk.tank) / 2) * ps}
              fill={fill.tank}
              stroke={C.edge}
              strokeWidth="0.8"
              opacity="0.92"
            />,
          );
        }
      }
    });
    /* Engines last: they are the closest thing to you looking up the stack. */
    centres.forEach(([ox, oy, oth], c) => {
      const X = PS / 2 + ox * ps,
        Y = PS / 2 + oy * ps;
      ringPositions(perEng).forEach(([cx0, cy0], i) => {
        const [cx, cy] = turn(cx0, cy0, oth);
        return plan.push(
          <circle
            key={`e${c}_${i}`}
            cx={X + cx * rr}
            cy={Y + cy * rr}
            r={(ed / 2) * ps}
            fill={fill.engine}
            stroke={C.edge}
            strokeWidth="0.8"
          />,
        );
      });
    });
    if (cur.boost && bottom.boosters) {
      const b = bottom.boosters;
      const bd = b.part.column
        ? diaOf(b.part.column.list[0].t)
        : widthOf(b.part, diaOf(b.part));
      const br = ((S > 1 ? ringR : td / 2) + bd / 2) * ps;
      for (let i = 0; i < b.n; i++) {
        const th = (i / b.n) * 2 * Math.PI; // right first, matching the elevation
        plan.push(
          <circle
            key={`b${i}`}
            cx={PS / 2 + Math.cos(th) * br}
            cy={PS / 2 + Math.sin(th) * br}
            r={(bd / 2) * ps}
            fill={fill.booster}
            opacity={0.75}
            stroke={C.rule}
            strokeWidth="0.6"
          />,
        );
      }
    }
  }

  return (
    <div>
      <div
        style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}
      >
        {steps.map((st, i) => (
          <button
            key={i}
            className="chip"
            data-on={i === Math.min(step, steps.length - 1) ? 1 : 0}
            onClick={() => setStep(i)}
          >
            {st.label}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "nowrap",
          alignItems: "flex-end",
          overflowX: "auto",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Elevation
          </div>
          <svg
            width={Math.max(sw, 60)}
            height={sh}
            style={{ overflow: "visible" }}
          >
            {sideParts}
          </svg>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Plan
          </div>
          <svg width={PS} height={PS}>
            <circle
              cx={PS / 2}
              cy={PS / 2}
              r={(PS - 16) / 2}
              fill="none"
              stroke={C.rule}
              strokeDasharray="2 3"
            />
            {plan}
          </svg>
        </div>
      </div>
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
        {/* Report the shared figure, not the drawing's own bounds — the sketch
            shows only the stages still attached at this step, so its extent
            changes as you page through the staging and is not the vehicle's. */}
        <span>{geo.h.toFixed(1)} m tall</span>
        <span>{geo.w.toFixed(2)} m across</span>
        <span style={{ color: geo.ar > maxAspect ? C.amber : C.muted }}>
          {geo.ar.toFixed(1)}:1 aspect
        </span>
      </div>
    </div>
  );
}

/* Everything downstream of the solve gets veiled while it runs. A bar pinned to
   the top of the page was the obvious idea and the wrong one: an artifact is an
   iframe sized to its content, so the parent page scrolls and nothing inside can
   stay in view. Marking the panels themselves works wherever you happen to be
   looking. */
function AscentPanel({ a, color }) {
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
  const limited = a.limit && a.limit < 0.999;
  const cored = a.core && a.core < 0.999;
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
            `Set ${limitOn} to ${Math.round(a.limit * 100)}% thrust`,
            "in the VAB, before you launch",
          ],
        ]
      : []),
    ...(cored
      ? [
          [
            `Fly the core at ${Math.round(a.core * 100)}% throttle`,
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

      {a.circBurn > 90 && (
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          That circularisation runs {Math.round(a.circBurn)} s on a low-thrust
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
                        : w.nav >= 0
                          ? `${w.nav}° up`
                          : `${-w.nav}° down`}
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
            Hold the core at {Math.round(a.core * 100)}% until the boosters burn
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
            Throttled to {Math.round(a.limit * 100)}% on {limitOn}.
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

export {
  AscentPanel,
  BuildView,
  PartsTable,
  StageStack,
  ringPositions,
  srbLen,
};

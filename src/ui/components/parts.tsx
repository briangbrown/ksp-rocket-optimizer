import { manifest } from "../../core/manifest.js";
import { PLATE_SHROUD } from "../../core/parts.js";
import { fmt } from "../format.js";
import { C, KIND } from "../tokens.js";
import type { CSSProperties, ReactNode } from "react";
import type { ManifestRow } from "../../core/manifest.js";
import type { Solution } from "../../core/solution.js";

/* What the mission needs fitted that no stage pays for — chutes, legs, a heat
   shield — as a reminder rather than a charge. */
type Hardware = {
  items: Array<{ name: string; qty: number; why: string }>;
  mass: number;
};

const hasSol = <S extends { sol: Solution | null }>(
  s: S,
): s is S & { sol: Solution } => s.sol !== null;

/* What each row is drawn in, from the same table as the elevation. A note is
   in the booster's colour because every note here is about a ring of them;
   a strut takes the decoupler's. */
const ROW_INK: Readonly<Record<string, string>> = {
  engine: C.paper,
  booster: C.mint,
  note: C.mint,
  adapter: KIND.adapter,
  struct: KIND.decoupler,
  tank: C.muted,
};

/* The legend over the table, in the table's own inks. */
const LEGEND: ReadonlyArray<[string, string]> = [
  ["Engine", ROW_INK.engine],
  ["Tank", ROW_INK.tank],
  ["Adapter", ROW_INK.adapter],
  ["Decoupler", ROW_INK.struct],
  ["Booster", ROW_INK.booster],
  ["Mission hardware", C.sky],
];

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
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "6px 8px",
    borderBottom: `1px solid ${C.panel2}`,
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}
      >
        <thead>
          <tr>
            <th className="label" style={th}>
              Stage
            </th>
            <th className="label" style={th}>
              Part
            </th>
            <th className="label" style={{ ...th, textAlign: "right" }}>
              Qty
            </th>
            <th className="label" style={{ ...th, textAlign: "right" }}>
              Each&nbsp;t
            </th>
            <th className="label" style={{ ...th, textAlign: "right" }}>
              Total&nbsp;t
            </th>
          </tr>
        </thead>
        <tbody className="body">
          <tr>
            <td style={{ ...td, color: C.dim }}>—</td>
            <td style={{ ...td, color: color, fontWeight: 600 }}>
              Payload (pod, probe, science, cargo)
            </td>
            <td style={{ ...td, textAlign: "right" }} className="figure">
              1
            </td>
            <td style={{ ...td, textAlign: "right" }} className="figure">
              {fmt(payload, 2)}
            </td>
            <td style={{ ...td, textAlign: "right" }} className="figure">
              {fmt(payload, 2)}
            </td>
          </tr>
          {hardware &&
            hardware.items.map((h, i) => (
              <tr key={"hw" + i}>
                <td style={{ ...td, color: C.dim }}></td>
                <td style={{ ...td, color: C.sky, paddingLeft: 22 }}>
                  ↳ {h.name}
                  <span
                    className="note"
                    style={{ color: C.dim, marginLeft: 6 }}
                  >
                    {h.why}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right" }} className="figure">
                  {h.qty}
                </td>
                <td
                  style={{ ...td, textAlign: "right", color: C.dim }}
                  className="figure"
                >
                  —
                </td>
                <td
                  className="note"
                  style={{ ...td, textAlign: "right", color: C.dim }}
                >
                  in payload
                </td>
              </tr>
            ))}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, color: C.muted }} className="figure">
                {r.stage}
              </td>
              <td
                style={{
                  ...td,
                  color: ROW_INK[r.kind] ?? C.muted,
                  fontStyle: r.kind === "note" ? "italic" : "normal",
                }}
              >
                {r.part}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="figure">
                {r.qty}
              </td>
              <td
                style={{ ...td, textAlign: "right", color: C.muted }}
                className="figure"
              >
                {r.kind === "note" ? "" : fmt(r.each, 3)}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="figure">
                {r.kind === "note" ? "" : fmt(r.tot, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { LEGEND, PartsTable };
export type { Hardware };

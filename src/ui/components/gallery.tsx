import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { DATA } from "../../core/catalogue.js";
import {
  engineLen,
  engineShape,
  useArt,
  widthOf,
} from "../../core/geometry.js";
import { extentOf } from "../../core/model.js";
import { diaOf, isRadial } from "../../core/parts.js";
import { canRender3D } from "./build.jsx";
import { Callout, Choice } from "./primitives.jsx";
import { STYLES } from "../styles.js";
import { C, FONT, SPACE, palette, themeNow } from "../tokens.js";
import { fitOrtho, framing, viewRight, viewUp } from "../views.js";
import type { ModelPart } from "../../core/model.js";

/* Every engine in the catalogue, drawn under a tank of its own mount
   diameter, by the renderer the build view uses — so what is judged here is
   what the application draws, outlines and all. For looking at
   src/data/engine-shapes.json against the parts it stands for, one at a
   time, and saying which are wrong. Not linked from the application. #85

   One canvas for all of them, laid out as a grid in the elevation's own
   plane: a browser drops WebGL contexts past a dozen or so, a phone sooner,
   and fifty-one panels would lose the first before the last was drawn. The
   labels are HTML laid over the canvas at each engine's projected position —
   the same `fitOrtho` and view basis the renderer frames with, so they land
   where the drawing does. Every engine is scaled so its tank is 2 m across:
   the point is the shape against its mount, not the size. */
const ThreeView = lazy(() => import("./three-view.jsx"));

/* The tank every engine hangs from, in the gallery's scaled metres. */
const TANK_R = 1;
const TANK_H = 1.5;
/* A cell, across and the air above the tank. */
const CELL_W = 3.4;
const CELL_GAP = 0.9;

type Cell = {
  name: string;
  nick: string;
  sz: string;
  bells: number;
  radial: boolean;
  x: number;
  base: number;
  top: number;
  col: number;
  row: number;
};

/* The quoted nickname where the title has one, else the title. */
const nickOf = (n: string) =>
  n.match(/["']([^"']+)["']/)?.[1] ?? n.replace(/ (Liquid|Solid).*$/, "");

/* Where everything stands. Rows are as tall as the tallest engine in them,
   the first row is at the top, and the rows are dealt into groups of two or
   three, each its own canvas: one canvas for the whole grid was 6,000 CSS
   pixels tall at a desktop width, which at a device pixel ratio of 2 is a
   render target no GPU will allocate — the page drew black. A handful of
   canvases stays under the context limit; one per engine would not. */
type Group = { parts: Array<ModelPart>; cells: Array<Cell>; height: number };

function layout(per: number, rowsPer: number): Array<Group> {
  const engines = [...DATA.engines].sort((a, b) => {
    const d = diaOf(a) - diaOf(b);
    return d !== 0 ? d : a.m - b.m;
  });
  const rows: Array<typeof engines> = [];
  for (let i = 0; i < engines.length; i += per)
    rows.push(engines.slice(i, i + per));
  const groups: Array<Group> = [];
  for (let g = 0; g < rows.length; g += rowsPer) {
    const mine = rows.slice(g, g + rowsPer);
    const heights = mine.map(
      (row) =>
        Math.max(...row.map((e) => (engineLen(e) * 2) / diaOf(e))) +
        TANK_H +
        CELL_GAP,
    );
    const parts: Array<ModelPart> = [];
    const cells: Array<Cell> = [];
    mine.forEach((row, r) => {
      /* The rows below this one, so the first row is at the top. */
      const base = heights.slice(r + 1).reduce((a, h) => a + h, 0);
      row.forEach((e, i) => {
        const D = diaOf(e);
        const s = 2 / D;
        const x = (i - (per - 1) / 2) * CELL_W;
        const eh = engineLen(e) * s;
        const er = (widthOf(e, D) * s) / 2;
        parts.push({
          role: "engine",
          part: e,
          x,
          z: 0,
          y: base,
          r: Math.min(er, CELL_W / 2 - 0.1),
          h: eh,
          shape: engineShape(e.n),
        });
        parts.push({
          role: "tank",
          x,
          z: 0,
          y: base + eh,
          r: TANK_R,
          h: TANK_H,
        });
        cells.push({
          name: e.n,
          nick: nickOf(e.n),
          sz: e.sz.join("/"),
          bells: engineShape(e.n)?.n ?? 1,
          radial: isRadial(e),
          x,
          base,
          top: base + eh + TANK_H,
          col: i,
          row: g + r,
        });
      });
    });
    groups.push({
      parts,
      cells,
      height: heights.reduce((a, h) => a + h, 0),
    });
  }
  return groups;
}

/* A point in the drawing to a point on the canvas, for the still frame the
   gallery is: the renderer aims at (0, mid, 0) and frames `fitOrtho`'s box. */
function projector(
  view: string,
  parts: ReadonlyArray<ModelPart>,
  width: number,
  height: number,
) {
  const extent = extentOf(parts);
  const mid = extent.height / 2;
  const { halfW, halfH } = fitOrtho(view, extent, width / height);
  const R = viewRight(view);
  const U = viewUp(view);
  return (x: number, y: number, z = 0) => {
    const dx = x * R.x + (y - mid) * R.y + z * R.z;
    const dy = x * U.x + (y - mid) * U.y + z * U.z;
    return {
      left: ((dx + halfW) / (2 * halfW)) * width,
      top: ((halfH - dy) / (2 * halfH)) * height,
    };
  };
}

function EngineGallery() {
  const [art, setArt] = useState<"restock" | "stock">("restock");
  const [view, setView] = useState<"side" | "iso">("side");
  const [width, setWidth] = useState(() =>
    Math.min(
      1100,
      (typeof window !== "undefined" ? window.innerWidth : 390) - 32,
    ),
  );
  useEffect(() => {
    const on = () => setWidth(Math.min(1100, window.innerWidth - 32));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const per = width < 700 ? 3 : 6;
  const rowsPer = per === 6 ? 2 : 3;
  /* The art is solve-scoped state in the solver; the gallery sets it the
     way planMission would before it lays anything out. */
  const groups = useMemo(() => {
    useArt({ mh: true, rs: art === "restock" });
    return layout(per, rowsPer);
  }, [art, per, rowsPer]);
  const theme = themeNow();
  const drawn = canRender3D();
  let n = 0;

  return (
    <div
      style={{
        fontFamily: FONT,
        color: C.paper,
        background: C.ink,
        minHeight: "100%",
        padding: SPACE.lg,
      }}
    >
      <style>{STYLES}</style>
      <div className="label">Engine gallery</div>
      <h1 className="display" style={{ margin: "6px 0 10px" }}>
        Every engine, under its tank
      </h1>
      <p className="body" style={{ margin: "0 0 14px", maxWidth: 640 }}>
        Each engine drawn by the build view's renderer from its entry in{" "}
        <span className="figure">engine-profiles.json</span>, under a tank of
        its own mount diameter and scaled so every tank is the same width.
        Sorted by mount, then mass. The number is for saying which one.
      </p>
      <div
        style={{
          display: "flex",
          gap: SPACE.lg,
          flexWrap: "wrap",
          marginBottom: SPACE.lg,
        }}
      >
        <Choice
          label="Art"
          value={art}
          onChange={setArt}
          options={[
            { value: "restock", label: "ReStock" },
            { value: "stock", label: "Stock" },
          ]}
        />
        <Choice
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "side", label: "Elevation" },
            { value: "iso", label: "Isometric" },
          ]}
        />
      </div>
      {!drawn && (
        <Callout
          severity="warn"
          title="This browser has no WebGL, so there is nothing to draw here."
        />
      )}
      {groups.map((grp, g) => {
        /* Each canvas as tall as its rows need at this width, with the
           renderer's own margins and no more. */
        const need = framing(view, extentOf(grp.parts));
        const aspect = (need.w * 1.2) / (need.h * 1.08);
        const height = Math.round(width / aspect);
        const at = projector(view, grp.parts, width, height);
        const cellPx = (CELL_W / (need.w * 2 * 1.2)) * width;
        return (
          <div
            key={`${art}-${view}-${g}`}
            style={{
              position: "relative",
              width,
              height: drawn ? height : grp.cells.length * 44,
              margin: "0 auto",
            }}
          >
            {drawn && (
              <Suspense fallback={null}>
                <ThreeView
                  parts={grp.parts}
                  view={view}
                  width={width}
                  height={height}
                  color={palette(theme).amber}
                  theme={theme}
                  alt={`Engines ${n + 1} to ${n + grp.cells.length}, each under a tank`}
                />
              </Suspense>
            )}
            {grp.cells.map((c, i) => {
              const p = at(c.x, c.base - 0.15);
              const k = ++n;
              return (
                <div
                  key={c.name}
                  className="note"
                  style={{
                    position: "absolute",
                    left: p.left - cellPx / 2,
                    top: drawn ? p.top : i * 44,
                    width: cellPx,
                    textAlign: "center",
                    color: C.paper,
                    lineHeight: 1.25,
                  }}
                >
                  <span className="figure" style={{ color: C.dim }}>
                    {k}
                  </span>{" "}
                  <span style={{ fontWeight: 600 }}>{c.nick}</span>
                  <div style={{ color: C.dim }}>
                    {c.sz}
                    {c.bells > 1 ? ` · ${c.bells} bells` : ""}
                    {c.radial ? " · radial" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default EngineGallery;

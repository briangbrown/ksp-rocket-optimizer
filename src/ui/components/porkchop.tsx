import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DAY } from "../../core/kepler.js";
import { LUT, capOf, cetL08 } from "../cet.js";
import { bodyLabel, fmt, kerbalDayLabel } from "../format.js";
import { C, SPACE, cssOf } from "../tokens.js";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Window } from "../../core/transfer.js";

/* The Δv transfer plot (#213): the porkchop every launch-window tool draws,
   under the transfer drawings and above the numbers. Departure date along the bottom, time of
   flight up the side, the total Δv of every cell as colour, and the window
   chosen marked on it — so the reader sees the valley the window sits in,
   how wide it is, and what leaving a week late costs.

   The grid is the search's own: `findWindow` prices 94 departures by 41
   flight times over two synodic periods and keeps them on the window as
   plain numbers. That is 20 days by 11 for Duna, a cell every four pixels
   or so at this width, and the picture is read between cells bilinearly;
   the ridge of near-180° transfers comes out as the jagged yellow wall it
   is in every such plot. The colours are CET-L08 (`cet.ts`), blue at the
   cheapest cell and yellow at four times it, on a `<canvas>` painted from
   one `ImageData`; the axes, the scale bar and the markers are SVG over it
   in the page's tokens, since a name in a drawing is the `note` role in
   `C.dim`, as everywhere. jsdom has no canvas: the effect that paints it
   asks for `CanvasRenderingContext2D` first and leaves the overlay to say
   what the plot shows.

   Tap or drag reads a cell — the crosshair follows and the figure updates —
   and on release nothing else changes: the plot is for reading, not for
   choosing a window, which the brief's start date and the offer under the
   card do. `touch-action: pan-y` keeps the page scrolling under a finger
   that lands on it; a drag across reads, a drag up or down scrolls. */

/* Under the two drawings, at their combined width. */
const FULL = 2 * 220 + SPACE.lg;
/* Margins: the flight-day labels and their title on the left, the scale
   bar and its five values on the right, the "m/s" over the bar, the date
   labels and their title under. */
const ML = 42,
  MR = 68,
  MT = 18,
  MB = 36;
/* The five values the scale bar names. */
const SCALE_STOPS = 5;

type Plot = Window["plot"];

/* The grid read between cells: bilinear on the four about (gx, gy) in cell
   units, with an unsolved cell counting as the cap. */
function readGrid(p: Plot, cap: number, gx: number, gy: number) {
  const i0 = Math.max(0, Math.min(p.nt - 1, Math.floor(gx))),
    j0 = Math.max(0, Math.min(p.nf - 1, Math.floor(gy)));
  const i1 = Math.min(p.nt - 1, i0 + 1),
    j1 = Math.min(p.nf - 1, j0 + 1);
  const fx = Math.max(0, Math.min(1, gx - i0)),
    fy = Math.max(0, Math.min(1, gy - j0));
  const at = (i: number, j: number) => {
    const v = p.totals[i * p.nf + j];
    return v < 0 ? cap : v;
  };
  return (
    (at(i0, j0) * (1 - fx) + at(i1, j0) * fx) * (1 - fy) +
    (at(i0, j1) * (1 - fx) + at(i1, j1) * fx) * fy
  );
}

/* The cheapest solved cell, and the scale's bottom: the window's own total
   where the refinement found lower than any cell. */
function floorOf(p: Plot, w: Window) {
  let lo = w.total;
  for (const v of p.totals) if (v > 0 && v < lo) lo = v;
  return lo;
}

/* A round step that puts about `want` ticks across `span`. */
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const niceStep = (span: number, want: number) =>
  NICE.find((s) => span / s <= want) ?? NICE[NICE.length - 1];

type Reading = { t: number; tof: number; dv: number };

function Porkchop({ w }: { w: Window }) {
  const p = w.plot;
  const tSpan = (p.nt - 1) * p.step;
  const lo = floorOf(p, w);
  const cap = capOf(lo);
  const [W, setW] = useState(FULL);
  const [read, setRead] = useState<Reading | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const watching = useRef<ResizeObserver | null>(null);
  /* The width is the card's, measured: a callback ref, since the card
     mounts and unmounts as the section folds. jsdom has no
     `ResizeObserver`, and there the plot stays at its full width. */
  const host = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(200, Math.min(FULL, Math.round(e.contentRect.width)))),
    );
    ro.observe(el);
    watching.current = ro;
  }, []);
  const aw = W - ML - MR;
  const ah = Math.max(150, Math.min(230, Math.round(aw * 0.55)));
  const H = MT + ah + MB;
  const xOf = (t: number) => ML + ((t - p.t0) / tSpan) * aw;
  const yOf = (tof: number) => MT + ah - ((tof - p.fLo) / (p.fHi - p.fLo)) * ah;
  const clampX = (x: number) => Math.max(ML, Math.min(ML + aw, x));
  const clampY = (y: number) => Math.max(MT, Math.min(MT + ah, y));

  /* The picture: one ImageData at the device's resolution, each pixel the
     grid read between cells and looked up in the map. */
  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof CanvasRenderingContext2D === "undefined") return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(aw * dpr),
      ph = Math.round(ah * dpr);
    el.width = pw;
    el.height = ph;
    const img = ctx.createImageData(pw, ph);
    const d = img.data;
    const span = cap - lo;
    let k = 0;
    for (let y = 0; y < ph; y++) {
      const gy = (1 - (y + 0.5) / ph) * (p.nf - 1);
      for (let x = 0; x < pw; x++) {
        const gx = ((x + 0.5) / pw) * (p.nt - 1);
        const v = readGrid(p, cap, gx, gy);
        const u = Math.max(0, Math.min(1, (v - lo) / span));
        const c = LUT[Math.round(255 * u)];
        d[k++] = c[0];
        d[k++] = c[1];
        d[k++] = c[2];
        d[k++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [p, lo, cap, aw, ah]);

  /* The reading under the pointer. */
  const readAt = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const sx = box.width / W;
    const x = (e.clientX - box.left) / sx,
      y = (e.clientY - box.top) / sx;
    const gx = ((clampX(x) - ML) / aw) * (p.nt - 1);
    const gy = (1 - (clampY(y) - MT) / ah) * (p.nf - 1);
    setRead({
      t: p.t0 + gx * p.step,
      tof: p.fLo + (gy * (p.fHi - p.fLo)) / (p.nf - 1),
      dv: readGrid(p, cap, gx, gy),
    });
  };

  /* Ticks: dates along the bottom at a round number of days, flight days
     up the side the same. */
  const dayStep = niceStep(tSpan / DAY, Math.max(3, Math.floor(aw / 85)));
  const xTicks: Array<number> = [];
  for (
    let k = Math.ceil(p.t0 / (dayStep * DAY));
    k * dayStep * DAY <= p.t0 + tSpan;
    k++
  )
    xTicks.push(k * dayStep * DAY);
  const fStep = niceStep(
    (p.fHi - p.fLo) / DAY,
    Math.max(3, Math.floor(ah / 40)),
  );
  const yTicks: Array<number> = [];
  for (let k = Math.ceil(p.fLo / (fStep * DAY)); k * fStep * DAY <= p.fHi; k++)
    yTicks.push(k * fStep * DAY);
  const scale = Array.from(
    { length: SCALE_STOPS },
    (_, k) => lo + ((cap - lo) * k) / (SCALE_STOPS - 1),
  );
  const barX = ML + aw + 16;

  /* The window, and the cheaper one after it where there is one. */
  const mx = clampX(xOf(w.depart)),
    my = clampY(yOf(w.tof));
  const figure = `${fmt(w.total)} m/s`;
  const figLeft = mx > ML + aw / 2;
  const figAbove = my > MT + ah / 2;
  const next = w.next
    ? { x: clampX(xOf(w.next.depart)), y: clampY(yOf(w.next.tof)) }
    : null;
  const rx = read ? clampX(xOf(read.t)) : 0,
    ry = read ? clampY(yOf(read.tof)) : 0;
  const readText = read
    ? `${kerbalDayLabel(read.t)} · ${fmt(read.tof / DAY)} days · ${fmt(read.dv)} m/s`
    : "";
  const gradId = useId();
  const days = (s: number) => fmt(s / DAY);
  const label =
    `Total Δv by departure date and time of flight, leaving ${bodyLabel(w.from)} for ${bodyLabel(w.to)}: ` +
    `departures from ${kerbalDayLabel(p.t0)} to ${kerbalDayLabel(p.t0 + tSpan)} along the bottom, ` +
    `flights of ${days(p.fLo)} to ${days(p.fHi)} days up the side; ` +
    `blue is the cheapest at ${fmt(lo)} m/s, yellow ${fmt(cap)} m/s and over. ` +
    `The window chosen is marked: leaving ${kerbalDayLabel(w.depart)} after ${days(w.tof)} days of flight, ${figure}.` +
    (w.next
      ? ` A cheaper window is marked hollow, leaving ${kerbalDayLabel(w.next.depart)}.`
      : "");

  return (
    <div style={{ maxWidth: FULL, margin: `0 auto ${SPACE.lg}px` }}>
      <div
        ref={host}
        role="img"
        aria-label={label}
        data-plot={`${w.from}-${w.to}`}
        style={{ position: "relative", width: "100%" }}
      >
        <canvas
          ref={canvas}
          aria-hidden
          style={{
            position: "absolute",
            left: ML,
            top: MT,
            width: aw,
            height: ah,
            display: "block",
          }}
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{
            display: "block",
            position: "relative",
            touchAction: "pan-y",
            cursor: "crosshair",
            color: C.paper,
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            readAt(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons) readAt(e);
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
              {Array.from({ length: 17 }, (_, k) => {
                return (
                  <stop
                    key={k}
                    offset={`${(100 * k) / 16}%`}
                    stopColor={cssOf(cetL08(k / 16))}
                  />
                );
              })}
            </linearGradient>
          </defs>
          <rect
            x={ML}
            y={MT}
            width={aw}
            height={ah}
            fill="none"
            stroke={C.rule}
          />
          {xTicks.map((t) => (
            <g key={t}>
              <line
                x1={xOf(t)}
                y1={MT + ah}
                x2={xOf(t)}
                y2={MT + ah + 4}
                stroke={C.rule}
              />
              <text
                className="note"
                x={xOf(t)}
                y={MT + ah + 16}
                fill={C.dim}
                textAnchor="middle"
              >
                {kerbalDayLabel(t)}
              </text>
            </g>
          ))}
          <text
            className="note"
            x={ML + aw / 2}
            y={H - 4}
            fill={C.dim}
            textAnchor="middle"
          >
            Departure
          </text>
          {yTicks.map((f) => (
            <g key={f}>
              <line
                x1={ML - 4}
                y1={yOf(f)}
                x2={ML}
                y2={yOf(f)}
                stroke={C.rule}
              />
              <text
                className="note"
                x={ML - 7}
                y={yOf(f) + 4}
                fill={C.dim}
                textAnchor="end"
              >
                {fmt(f / DAY)}
              </text>
            </g>
          ))}
          <text
            className="note"
            fill={C.dim}
            textAnchor="middle"
            transform={`translate(11 ${MT + ah / 2}) rotate(-90)`}
          >
            Days of flight
          </text>
          {/* The scale bar: the map top to bottom, five values beside it. */}
          <rect
            x={barX}
            y={MT}
            width={12}
            height={ah}
            fill={`url(#${gradId})`}
            stroke={C.rule}
          />
          <text
            className="note"
            x={barX}
            y={MT - 6}
            fill={C.dim}
            textAnchor="start"
          >
            m/s
          </text>
          {scale.map((v, k) => (
            <g key={k}>
              <line
                x1={barX + 12}
                y1={yOf(p.fLo + ((p.fHi - p.fLo) * k) / (SCALE_STOPS - 1))}
                x2={barX + 16}
                y2={yOf(p.fLo + ((p.fHi - p.fLo) * k) / (SCALE_STOPS - 1))}
                stroke={C.rule}
              />
              <text
                className="note"
                data-scale={Math.round(v)}
                x={barX + 19}
                y={yOf(p.fLo + ((p.fHi - p.fLo) * k) / (SCALE_STOPS - 1)) + 4}
                fill={C.dim}
              >
                {fmt(v)}
                {k === SCALE_STOPS - 1 ? "+" : ""}
              </text>
            </g>
          ))}
          {/* The window: a crosshair across the plot and a diamond, the
              total beside it, on the side with room. */}
          <line
            x1={ML}
            y1={my}
            x2={ML + aw}
            y2={my}
            stroke={C.paper}
            strokeOpacity={0.55}
          />
          <line
            x1={mx}
            y1={MT}
            x2={mx}
            y2={MT + ah}
            stroke={C.paper}
            strokeOpacity={0.55}
          />
          {next && (
            <polygon
              data-mark="next"
              points={`${next.x},${next.y - 6} ${next.x + 6},${next.y} ${next.x},${next.y + 6} ${next.x - 6},${next.y}`}
              fill={C.panel}
              stroke={C.paper}
              strokeWidth={1.5}
            />
          )}
          <polygon
            data-mark="window"
            points={`${mx},${my - 6} ${mx + 6},${my} ${mx},${my + 6} ${mx - 6},${my}`}
            fill={C.paper}
          />
          <text
            className="note"
            paintOrder="stroke"
            stroke={C.panel}
            strokeWidth={3}
            strokeLinejoin="round"
            x={figLeft ? mx - 10 : mx + 10}
            y={figAbove ? my - 8 : my + 16}
            fill={C.paper}
            textAnchor={figLeft ? "end" : "start"}
          >
            {figure}
          </text>
          {/* The reading, where the reader has tapped. */}
          {read && (
            <g data-mark="reading">
              <line
                x1={ML}
                y1={ry}
                x2={ML + aw}
                y2={ry}
                stroke={C.amber}
                strokeOpacity={0.8}
              />
              <line
                x1={rx}
                y1={MT}
                x2={rx}
                y2={MT + ah}
                stroke={C.amber}
                strokeOpacity={0.8}
              />
              <circle
                cx={rx}
                cy={ry}
                r={4}
                fill="none"
                stroke={C.amber}
                strokeWidth={1.5}
              />
              <text
                className="note"
                paintOrder="stroke"
                stroke={C.panel}
                strokeWidth={3}
                strokeLinejoin="round"
                x={rx > ML + aw / 2 ? rx - 9 : rx + 9}
                y={ry > MT + ah / 2 ? ry - 8 : ry + 16}
                fill={C.amber}
                textAnchor={rx > ML + aw / 2 ? "end" : "start"}
              >
                {readText}
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="note" style={{ textAlign: "center" }}>
        Total Δv by departure and flight time · tap or drag to read
      </div>
      <span className="sr-only" aria-live="polite">
        {readText}
      </span>
    </div>
  );
}

export { Porkchop };

import CET_L08 from "../data/cet-l08.json";
import { cssOf } from "./tokens.js";

/* The Δv plot's colours: CET-L08, Peter Kovesi's linear blue → magenta →
   yellow map, from colorcet.com under Creative Commons BY (the citation is
   in the Setup sheet's Attribution and in `.claude/rules/part-data.md`). A
   perceptually uniform ramp, so an equal step in Δv is an equal step in
   colour anywhere on it, and the valley a window sits in reads as a valley
   rather than as bands. 256 entries, bytes. */
type RGB = [number, number, number];
const LUT = CET_L08 as unknown as ReadonlyArray<RGB>;

/* The colour at `u` in [0, 1]: the map's blue end at 0, its yellow end at 1,
   clamped beyond. */
const cetL08 = (u: number): RGB =>
  LUT[Math.round(255 * Math.min(1, Math.max(0, u)))];

/* The plot's scale: blue at the cheapest total `lo`, yellow at the dearest
   `hi`, and log between — a step in colour is a ratio in Δv, so the valley
   round the window keeps a quarter of the ramp when the far corners are
   fifteen times it, and nothing pins at yellow. A linear scale capped at
   four times the minimum was the first cut; half of every plot was the
   cap's colour. #213 */
const uOf = (total: number, lo: number, hi: number) =>
  hi > lo ? Math.log(Math.max(total, lo) / lo) / Math.log(hi / lo) : 0;
const colourOf = (total: number, lo: number, hi: number): RGB =>
  cetL08(uOf(total, lo, hi));
/* The scale bar's `n` values, evenly up the ramp: lo to hi geometrically. */
const stopsOf = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, k) => lo * Math.pow(hi / lo, k / (n - 1)));

/* The map as CSS, for the scale bar: `n` stops from blue at the bottom to
   yellow at the top. */
const cssRamp = (n = 17) =>
  `linear-gradient(to top, ${Array.from({ length: n }, (_, k) => {
    return `${cssOf(cetL08(k / (n - 1)))} ${((100 * k) / (n - 1)).toFixed(1)}%`;
  }).join(", ")})`;

export { LUT, cetL08, colourOf, cssRamp, stopsOf, uOf };
export type { RGB };

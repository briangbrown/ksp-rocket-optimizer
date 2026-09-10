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

/* The plot's scale: blue at the cheapest total `lo`, yellow at the cap, and
   the cap four times `lo` — so the valley has the whole ramp and the far
   corners, tens of km/s, do not flatten it (#213). */
const CAP = 4;
const capOf = (lo: number) => lo * CAP;
const colourOf = (total: number, lo: number): RGB =>
  cetL08((total - lo) / (capOf(lo) - lo));

/* The map as CSS, for the scale bar: `n` stops from blue at the bottom to
   yellow at the top. */
const cssRamp = (n = 17) =>
  `linear-gradient(to top, ${Array.from({ length: n }, (_, k) => {
    return `${cssOf(cetL08(k / (n - 1)))} ${((100 * k) / (n - 1)).toFixed(1)}%`;
  }).join(", ")})`;

export { CAP, capOf, cetL08, colourOf, cssRamp, LUT };
export type { RGB };

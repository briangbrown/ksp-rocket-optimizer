import { CraftError } from "./error.js";

/* How numbers are written and read, in one place. The game writes floats as
   .NET does — `1.04474032`, `-0.0406360477`, `0` — nine significant digits
   and no exponent. Nine is enough that anything a caller hands us with that
   precision or less comes back the same, which is what the round trip
   holds; `-0` is written `0`, since the game never writes a signed zero and
   a `-0` reads back as `0` anyway. */
const num = (x: number): string => {
  if (!Number.isFinite(x)) throw new CraftError(`not a finite number: ${x}`);
  if (Math.abs(x) < 5e-8) return "0";
  const s = String(Number(x.toPrecision(9)));
  /* Very small or very large values would take an exponent, which the
     game's reader accepts but never writes; write the digits instead. */
  return s.includes("e") ? x.toFixed(7).replace(/\.?0+$/, "") : s;
};

/* A list of numbers, comma-separated as in `pos = 0,15,0`, or `|`-separated
   as inside an `attN` value. Exactly `n` of them, all finite. */
const nums = (
  s: string,
  n: number,
  what: string,
  sep: "," | "|" = ",",
  line: number | null = null,
): Array<number> => {
  const v = s.split(sep).map((x) => Number(x.trim()));
  if (v.length !== n || v.some((x) => !Number.isFinite(x)))
    throw new CraftError(`${what} should be ${n} numbers, is "${s}"`, line);
  return v;
};

const list = (v: ReadonlyArray<number>, sep: "," | "|" = ","): string =>
  v.map(num).join(sep);

const bool = (b: boolean): string => (b ? "True" : "False");

export { bool, list, num, nums };

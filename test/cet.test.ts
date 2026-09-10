import { describe, it, expect } from "vitest";
import { LUT, cetL08, colourOf, cssRamp, stopsOf, uOf } from "../src/ui/cet.js";

/* The Δv plot's colours (#213): CET-L08 from colorcet.com, end to end. The
   table is the download's, byte for byte at both ends; the scale puts the
   cheapest total at the blue end and the cap at the yellow one, and the
   ramp climbs in lightness all the way, which is what makes it linear. */

describe("CET-L08", () => {
  it("is the colorcet table, blue at one end and yellow at the other", () => {
    expect(LUT.length).toBe(256);
    expect(LUT[0]).toEqual([0, 15, 93]);
    expect(LUT[255]).toEqual([245, 249, 78]);
    expect(cetL08(0)).toEqual(LUT[0]);
    expect(cetL08(1)).toEqual(LUT[255]);
    expect(cetL08(-3)).toEqual(LUT[0]);
    expect(cetL08(7)).toEqual(LUT[255]);
  });
  it("climbs in lightness the whole way", () => {
    let prev = -1;
    for (const [r, g, b] of LUT) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(y).toBeGreaterThan(prev - 0.5);
      prev = y;
    }
  });
  it("puts the cheapest at the first entry and the dearest at the last, log between", () => {
    const lo = 1666,
      hi = 16 * lo;
    expect(colourOf(lo, lo, hi)).toEqual(LUT[0]);
    expect(colourOf(hi, lo, hi)).toEqual(LUT[255]);
    expect(colourOf(lo / 2, lo, hi)).toEqual(LUT[0]);
    /* Log: four times the cheapest is halfway up a sixteen-fold scale. */
    expect(uOf(4 * lo, lo, hi)).toBeCloseTo(0.5, 10);
    expect(colourOf(4 * lo, lo, hi)).toEqual(LUT[128]);
    /* A flat grid is all blue rather than a division by zero. */
    expect(uOf(lo, lo, lo)).toBe(0);
    /* The scale bar's values are geometric. */
    expect(stopsOf(lo, hi, 5).map((v) => Math.round(v))).toEqual([
      1666, 3332, 6664, 13328, 26656,
    ]);
  });
  it("writes the ramp as CSS, bottom to top", () => {
    const css = cssRamp(3);
    expect(css).toBe(
      `linear-gradient(to top, rgb(0 15 93) 0.0%, rgb(${LUT[128].join(" ")}) 50.0%, rgb(245 249 78) 100.0%)`,
    );
  });
});

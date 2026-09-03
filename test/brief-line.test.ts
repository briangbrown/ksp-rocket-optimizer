import { describe, it, expect } from "vitest";
import { DEST, PROFILES, SYS } from "../src/core/orbits.js";
import { OBJECTIVES, briefLine } from "../src/ui/format.js";

/* The set brief is one line, and the line is a function of state — so the
   grid's axes go through it and every line is looked at, rather than the
   default mission's being eyeballed once. #133 */

const origins = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);
const dests = ["Low orbit", "Stationary orbit", ...Object.keys(DEST)];

describe("the brief's summary line", () => {
  it("reads as the mission, in the order it was decided", () => {
    expect(
      briefLine({
        origin: "Kerbin",
        dest: "Mun",
        profile: "land",
        returning: true,
        payload: 2.5,
        objective: "cost",
      }),
    ).toBe("Kerbin → Mun · land & return · 2.5 t · cheapest");
    expect(
      briefLine({
        origin: "Kerbin",
        dest: "Duna",
        profile: "orbit",
        returning: false,
        payload: 12,
        objective: "parts",
      }),
    ).toBe("Kerbin → Duna · orbit, one way · 12 t · fewest parts");
  });

  it("says neither the profile nor the trip for an orbit of the origin", () => {
    /* There is no arrival to shape and buildRoute ignores `returning`. */
    for (const dest of ["Low orbit", "Stationary orbit"]) {
      const line = briefLine({
        origin: "Kerbin",
        dest,
        profile: "land",
        returning: true,
        payload: 0.8,
        objective: "mass",
      });
      expect(line).toBe(`Kerbin → ${dest.toLowerCase()} · 0.8 t · lightest`);
    }
  });

  it("names every profile, origin, objective and destination", () => {
    for (const origin of origins)
      for (const dest of dests)
        for (const profile of Object.keys(PROFILES))
          for (const [objective, label] of OBJECTIVES)
            for (const returning of [true, false]) {
              const line = briefLine({
                origin,
                dest,
                profile,
                returning,
                payload: 3.5,
                objective,
              });
              const parts = line.split(" · ");
              expect(parts[0]).toBe(
                `${origin} → ${dest === "Low orbit" || dest === "Stationary orbit" ? dest.toLowerCase() : dest}`,
              );
              expect(parts[parts.length - 1]).toBe(label.toLowerCase());
              expect(parts[parts.length - 2]).toBe("3.5 t");
              const here = dest === "Low orbit" || dest === "Stationary orbit";
              expect(parts.length).toBe(here ? 3 : 4);
              if (!here) {
                expect(
                  parts[1].startsWith(PROFILES[profile].name.toLowerCase()),
                ).toBe(true);
                expect(
                  parts[1].endsWith(returning ? "& return" : "one way"),
                ).toBe(true);
              }
              /* Nothing undefined, nothing doubled. */
              expect(line).not.toMatch(/undefined|NaN|· ·/);
            }
  });
});

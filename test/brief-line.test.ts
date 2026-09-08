import { describe, it, expect } from "vitest";
import { STATES, SYS, possible } from "../src/core/orbits.js";
import type { Endpoint } from "../src/core/orbits.js";
import {
  OBJECTIVES,
  STATE_LABEL,
  bodyLabel,
  briefLine,
} from "../src/ui/format.js";

/* The set brief is one line, and the line is a function of state — so the
   model's axes go through it and every line is looked at, rather than the
   default mission's being eyeballed once. #133, #188 */

const at = (body: string, state: Endpoint["state"]): Endpoint => ({
  body,
  state,
});

describe("the brief's summary line", () => {
  it("reads as the mission, in the order it was decided", () => {
    expect(
      briefLine({
        from: at("Kerbin", "surface"),
        to: at("Mun", "surface"),
        returning: true,
        payload: 2.5,
        objective: "cost",
      }),
    ).toBe("Kerbin → Mun · land & return · 2.5 t · cheapest");
    expect(
      briefLine({
        from: at("Kerbin", "surface"),
        to: at("Duna", "low"),
        returning: false,
        payload: 12,
        objective: "parts",
      }),
    ).toBe("Kerbin → Duna · orbit, one way · 12 t · fewest parts");
  });

  it("names the From end's state only off the surface, and Kerbol by its name", () => {
    expect(
      briefLine({
        from: at("Kerbin", "low"),
        to: at("Sun", "low"),
        returning: false,
        payload: 1,
        objective: "mass",
      }),
    ).toBe("Kerbin low orbit → Kerbol · orbit, one way · 1 t · lightest");
    expect(
      briefLine({
        from: at("Sun", "sync"),
        to: at("Eve", "flyby"),
        returning: false,
        payload: 1,
        objective: "mass",
      }),
    ).toBe("Kerbol stationary orbit → Eve · fly-by, one way · 1 t · lightest");
  });

  it("says the state and not a trip for an orbit of the same body, unless it comes back", () => {
    expect(
      briefLine({
        from: at("Kerbin", "surface"),
        to: at("Kerbin", "low"),
        returning: false,
        payload: 0.8,
        objective: "mass",
      }),
    ).toBe("Kerbin → low orbit · 0.8 t · lightest");
    expect(
      briefLine({
        from: at("Kerbin", "surface"),
        to: at("Kerbin", "sync"),
        returning: true,
        payload: 0.8,
        objective: "mass",
      }),
    ).toBe("Kerbin → stationary orbit · & return · 0.8 t · lightest");
  });

  it("names every end, state and objective the model allows", () => {
    for (const fb of Object.keys(SYS))
      for (const fs of STATES)
        for (const tb of Object.keys(SYS))
          for (const ts of STATES) {
            const from = at(fb, fs);
            const to = at(tb, ts);
            if (possible(from, to) !== true) continue;
            for (const [objective, label] of OBJECTIVES)
              for (const returning of [true, false]) {
                const line = briefLine({
                  from,
                  to,
                  returning,
                  payload: 3.5,
                  objective,
                });
                const parts = line.split(" · ");
                expect(parts[0].startsWith(bodyLabel(fb))).toBe(true);
                expect(parts[0]).toContain(" → ");
                expect(
                  parts[0].endsWith(
                    tb === fb ? STATE_LABEL[ts].toLowerCase() : bodyLabel(tb),
                  ),
                ).toBe(true);
                expect(parts[parts.length - 1]).toBe(label.toLowerCase());
                expect(parts[parts.length - 2]).toBe("3.5 t");
                if (tb !== fb)
                  expect(
                    parts[1].endsWith(returning ? "& return" : "one way"),
                  ).toBe(true);
              }
          }
  });
});

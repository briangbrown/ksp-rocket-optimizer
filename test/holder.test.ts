import { describe, it, expect } from "vitest";
import { HOLDERS, LONG_BOOSTER, holderFor } from "../src/core/parts.js";

/* What holds a booster on is chosen for the booster: the TT-38K on a 1.25 m
   one, the TT-70 on 1.875 and 2.5, the manifold wider than that, and two of
   them on a booster longer than LONG_BOOSTER. Down the ladder where a size is
   not researched or ruled out. #467 */

const all = new Set(HOLDERS.map((h) => h.t));
const none = new Set<string>();

describe("holderFor", () => {
  it("picks the decoupler for the booster's width", () => {
    expect(holderFor(1.25, 4, all, none).n).toBe("TT-38K Radial Decoupler");
    expect(holderFor(1.875, 4, all, none).n).toBe("TT-70 Radial Decoupler");
    expect(holderFor(2.5, 4, all, none).n).toBe("TT-70 Radial Decoupler");
    expect(holderFor(3.75, 4, all, none).n).toBe(
      "Hydraulic Detachment Manifold",
    );
  });

  it("takes two on a long booster and one on a short one", () => {
    expect(holderFor(1.25, LONG_BOOSTER - 0.1, all, none).count).toBe(1);
    expect(holderFor(1.25, LONG_BOOSTER, all, none).count).toBe(2);
    expect(holderFor(1.875, 12.2, all, none)).toMatchObject({
      n: "TT-70 Radial Decoupler",
      count: 2,
    });
  });

  it("falls down the ladder to what is researched, and never below the TT-38K", () => {
    const stability = new Set(["Stability"]);
    expect(holderFor(2.5, 4, stability, none).n).toBe(
      "TT-38K Radial Decoupler",
    );
    expect(
      holderFor(3.75, 4, all, new Set(["Hydraulic Detachment Manifold"])).n,
    ).toBe("TT-70 Radial Decoupler");
    expect(holderFor(1.25, 4, none, none).n).toBe("TT-38K Radial Decoupler");
  });

  it("charges the part the table lists", () => {
    const h = holderFor(2.5, 4, all, none);
    expect(h).toMatchObject({ m: 0.05, cost: 700, t: "Advanced Construction" });
  });
});

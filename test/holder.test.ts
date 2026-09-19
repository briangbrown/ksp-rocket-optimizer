import { describe, it, expect } from "vitest";
import { HOLDERS, LONG_BOOSTER, holderFor } from "../src/core/parts.js";

/* What holds a booster on is chosen for the booster: the TT-14 on a 0.625 m
   one where ReStock+ is on, the TT-38K on 1.25, the TT-70 on 1.875 and 2.5,
   the TT-70 everything wider (the manifold is no rung, #483), and two of them on a booster longer than
   LONG_BOOSTER. Down the ladder where a size is not researched or ruled
   out, and never below the stock TT-38K without ReStock+. #467 */

const all = new Set(HOLDERS.map((h) => h.t));
const none = new Set<string>();
const RS = { mh: false, rs: true };
const STOCK = { mh: false, rs: false };

describe("holderFor", () => {
  it("picks the decoupler for the booster's width", () => {
    expect(holderFor(0.625, 4, all, none, RS).n).toBe("TT-14 Radial Decoupler");
    expect(holderFor(0.625, 4, all, none, STOCK).n).toBe(
      "TT-38K Radial Decoupler",
    );
    expect(holderFor(1.25, 4, all, none, RS).n).toBe("TT-38K Radial Decoupler");
    expect(holderFor(1.25, 4, all, none, STOCK).n).toBe(
      "TT-38K Radial Decoupler",
    );
    expect(holderFor(1.875, 4, all, none).n).toBe("TT-70 Radial Decoupler");
    expect(holderFor(2.5, 4, all, none).n).toBe("TT-70 Radial Decoupler");
    expect(holderFor(3.75, 4, all, none).n).toBe("TT-70 Radial Decoupler");
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
    expect(holderFor(3.75, 4, all, new Set(["TT-70 Radial Decoupler"])).n).toBe(
      "TT-38K Radial Decoupler",
    );
    expect(holderFor(1.25, 4, none, none).n).toBe("TT-38K Radial Decoupler");
    expect(holderFor(0.625, 4, none, none, RS).n).toBe(
      "TT-38K Radial Decoupler",
    );
  });

  it("charges the TT-14 as the table lists it", () => {
    expect(holderFor(0.625, 4, all, none, RS)).toMatchObject({
      m: 0.0125,
      cost: 250,
      t: "Stability",
    });
  });

  it("charges the part the table lists", () => {
    const h = holderFor(2.5, 4, all, none);
    expect(h).toMatchObject({ m: 0.05, cost: 700, t: "Advanced Construction" });
  });
});

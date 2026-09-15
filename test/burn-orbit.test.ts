import { describe, it, expect } from "vitest";
import {
  DEST,
  SYS,
  burnPortions,
  buildRoute,
  lowR,
  omegaOf,
  routeFor,
  soiR,
} from "../src/core/orbits.js";
import { burnArc, finiteBurnDv } from "../src/core/performance.js";
import type { Leg } from "../src/core/orbits.js";

/* Where each leg's burn is made, and how a stage's slice of the budget lands
   on the legs it flies.

   A leg's `body` cannot answer the first question — the two route builders mean
   opposite things by it — so every leg that makes an orbital burn carries the
   orbit it makes it in. The second question has three shapes, and the last of
   them is the one `solveStage`'s single burn figure cannot express. #418 */

const BURNS: ReadonlyArray<string> = ["transfer", "capture", "plane"];
const every = () => {
  const out: Array<{ route: string; leg: Leg }> = [];
  const origins = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);
  for (const origin of origins)
    for (const dest of Object.keys(DEST))
      for (const profile of ["flyby", "orbit", "land"])
        for (const returning of [false, true])
          for (const planeNow of [false, true])
            for (const leg of buildRoute(
              dest,
              profile,
              true,
              origin,
              returning,
              planeNow,
            ))
              out.push({ route: `${origin} → ${dest} ${profile}`, leg });
  return out;
};

describe("every leg says where its burn is made", () => {
  const all = every();

  it("tags every burn, and nothing that is not one", () => {
    expect(all.length).toBeGreaterThan(1000);
    const missing = all.filter(
      (x) => BURNS.includes(x.leg.kind) && !x.leg.orbit,
    );
    const spurious = all.filter(
      (x) => !BURNS.includes(x.leg.kind) && x.leg.orbit,
    );
    expect(
      missing.slice(0, 5).map((x) => `${x.route}: ${x.leg.label}`),
      "burns with nowhere to burn",
    ).toEqual([]);
    /* An ascent, a landing and an aerobrake are not spread impulses. The one
       exception is the arrival that captures rather than aerobrakes, which is
       a real burn wearing an `aero` kind. */
    expect(
      spurious
        .filter((x) => !(x.leg.kind === "aero" && !x.leg.free))
        .slice(0, 5)
        .map((x) => `${x.route}: ${x.leg.label}`),
      "tagged something that is not a burn",
    ).toEqual([]);
  });

  it("tags nothing impossible", () => {
    for (const { route, leg } of all) {
      const o = leg.orbit;
      if (!o) continue;
      const where = `${route}: ${leg.label}`;
      expect(SYS[o.body], `${where}: unknown body ${o.body}`).toBeDefined();
      expect(o.r, `${where}: inside ${o.body}`).toBeGreaterThan(SYS[o.body].R);
      expect(Number.isFinite(o.r), `${where}: radius is not a number`).toBe(
        true,
      );
      const soi = soiR(o.body);
      if (Number.isFinite(soi))
        expect(o.r, `${where}: outside ${o.body}'s SOI`).toBeLessThanOrEqual(
          soi,
        );
    }
  });

  it("does not take a leg's body for the orbit it burns in", () => {
    /* The case that motivated all of this: the tabulated Mun intercept is
       headed for Mun and burns at Kerbin. If anyone ever "simplifies" this to
       `lowOrbit(leg.body)`, this is what goes red. */
    const mun = buildRoute("Mun", "land", true, "Kerbin", false, false);
    const intercept = mun.find((l) => l.label === "LKO → Mun intercept")!;
    expect(intercept.body).toBe("Mun");
    expect(intercept.orbit!.body).toBe("Kerbin");
    expect(intercept.orbit!.r).toBe(lowR("Kerbin"));
    /* And the other direction: a computed transfer names the body it leaves. */
    const fromMun = routeFor(
      { body: "Mun", state: "surface" },
      { body: "Minmus", state: "surface" },
      true,
      false,
      false,
    );
    const leave = fromMun.find((l) => l.kind === "transfer" && l.orbit)!;
    expect(leave.orbit!.body).toBe("Mun");
  });

  it("puts a stationary circularisation where it actually burns", () => {
    /* Twelve times the period of the low orbit a rule from `kind` alone would
       have assumed, and so a twelfth of the arc for the same burn. */
    const keo = DEST["Keostationary orbit"].legs.find(
      (l) => l.kind === "capture",
    )!;
    expect(keo.orbit!.body).toBe("Kerbin");
    expect(keo.orbit!.r).toBeGreaterThan(5 * lowR("Kerbin"));
    const low = omegaOf({ body: "Kerbin", r: lowR("Kerbin") });
    expect(low / omegaOf(keo.orbit!)).toBeGreaterThan(10);
  });
});

describe("a stage's slice of the budget, leg by leg", () => {
  /* Three legs of 1000 each, so the arithmetic is readable. */
  const legs = [
    { label: "a", dv: 1000, kind: "transfer", body: "Kerbin" },
    { label: "b", dv: 1000, kind: "capture", body: "Mun" },
    { label: "c", dv: 1000, kind: "transfer", body: "Mun" },
  ] as Array<Leg>;

  it("one stage to one leg: the whole leg, opened and closed", () => {
    const p = burnPortions(legs, 1000, 2000);
    expect(p).toHaveLength(1);
    expect(p[0].leg.label).toBe("b");
    expect(p[0].dv).toBe(1000);
    expect(p[0].legDv).toBe(1000);
    expect(p[0].first && p[0].last, "a leg flown whole").toBe(true);
  });

  it("many stages to one leg: each takes a part, and the parts make the leg", () => {
    const thirds = [
      burnPortions(legs, 0, 333),
      burnPortions(legs, 333, 666),
      burnPortions(legs, 666, 1000),
    ];
    for (const t of thirds) expect(t).toHaveLength(1);
    expect(thirds.map((t) => t[0].leg.label)).toEqual(["a", "a", "a"]);
    /* Only the first opens it and only the last closes it: the middle stage
       burns with the leg already under way at both ends. */
    expect(thirds.map((t) => [t[0].first, t[0].last])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    const sum = thirds.reduce((a, t) => a + t[0].dv, 0);
    expect(sum).toBeCloseTo(1000, 9);
  });

  it("one stage to many legs: a burn in each, in order", () => {
    const p = burnPortions(legs, 500, 2500);
    expect(p.map((x) => x.leg.label)).toEqual(["a", "b", "c"]);
    expect(p.map((x) => x.dv)).toEqual([500, 1000, 500]);
    expect(p.map((x) => [x.first, x.last])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
    expect(p.reduce((a, x) => a + x.dv, 0)).toBe(2000);
  });

  it("carries the margin the budget was grown by", () => {
    /* The solver hands stages a slice of the grown budget, not of the raw
       legs, so the walk has to be told what it was grown by or every boundary
       lands in the wrong leg. */
    const p = burnPortions(legs, 0, 1100, 1.1);
    expect(p).toHaveLength(1);
    expect(p[0].dv).toBeCloseTo(1100, 9);
    expect(p[0].legDv).toBeCloseTo(1100, 9);
    expect(p[0].last).toBe(true);
  });

  it("gives a real mission its burns one at a time", () => {
    /* The Mun round trip, split five ways as the solver splits it. Each stage
       is 1443 m/s of a 7216 m/s budget, and not one of those boundaries falls
       on a leg. */
    const route = buildRoute("Mun", "land", true, "Kerbin", true, false);
    const raw = route.reduce((a, l) => a + l.dv, 0);
    const scale = 1.1;
    const share = (raw * scale) / 5;
    const seen: Array<string> = [];
    for (let i = 0; i < 5; i++) {
      const p = burnPortions(route, i * share, (i + 1) * share, scale);
      seen.push(
        `stage ${i}: ` +
          p
            .map(
              (x) =>
                `${x.leg.kind} ${x.dv.toFixed(0)}${x.first && x.last ? "" : " (part)"}${x.leg.orbit ? ` @${x.leg.orbit.body}` : ""}`,
            )
            .join(" + "),
      );
    }
    console.log(seen.join("\n"));
    /* The whole budget is accounted for exactly once. */
    let total = 0;
    for (let i = 0; i < 5; i++)
      total += burnPortions(route, i * share, (i + 1) * share, scale).reduce(
        (a, x) => a + x.dv,
        0,
      );
    expect(total).toBeCloseTo(raw * scale, 6);
    /* And at least one stage genuinely straddles several legs, which is the
       case this exists for. */
    const widest = Math.max(
      ...[0, 1, 2, 3, 4].map(
        (i) => burnPortions(route, i * share, (i + 1) * share, scale).length,
      ),
    );
    expect(widest).toBeGreaterThan(1);
  });
});

describe("what the tags are for", () => {
  it("prices the same burn differently in the orbit it is made in", () => {
    const route = buildRoute("Duna", "land", true, "Kerbin", false, false);
    const rows: Array<string> = [];
    for (const leg of route) {
      if (!leg.orbit) continue;
      const arc = burnArc(omegaOf(leg.orbit), 300);
      const pct = 100 * (finiteBurnDv(1000, arc)! / 1000 - 1);
      rows.push(
        `${leg.label.padEnd(30)} @ ${leg.orbit.body.padEnd(6)} arc ${((arc * 180) / Math.PI).toFixed(1).padStart(6)}°  +${pct.toFixed(2)}%`,
      );
    }
    console.log(
      "a 300 s burn on each leg of Kerbin → Duna:\n" + rows.join("\n"),
    );
    const escape = route.find((l) => l.label === "LKO → Kerbin escape")!;
    const cruise = route.find((l) => l.label.startsWith("Kerbin escape →"))!;
    /* The one costs a tenth of its leg and the other is free, and the only
       difference between them is where they are burnt. */
    expect(burnArc(omegaOf(escape.orbit!), 300)).toBeGreaterThan(0.9);
    expect(burnArc(omegaOf(cruise.orbit!), 300)).toBeLessThan(0.0005);
  });
});

/* A table a person can read a wrong body off. `routes-sample.txt` does the
   same job for the Δv figures; this one is for where each of them is spent,
   with the orbit's period beside it because that is what decides whether a
   long burn there costs anything at all. */
describe("the tags, in the clear", () => {
  it("keeps a few routes' burn orbits readable", async () => {
    const sample: Array<[string, string, string, boolean, boolean]> = [
      ["Kerbin", "Mun", "land", true, false],
      ["Kerbin", "Stationary orbit", "orbit", false, false],
      ["Kerbin", "Duna", "land", false, false],
      ["Kerbin", "Minmus", "orbit", false, true],
      ["Kerbin", "Laythe", "land", false, false],
      ["Mun", "Minmus", "land", true, false],
    ];
    const text = sample
      .map(([o, d, prof, ret, planeNow]) => {
        const legs = buildRoute(d, prof, true, o, ret, planeNow);
        return (
          `## ${o} → ${d} ${prof}${ret ? " & back" : ""}${planeNow ? " plane-now" : ""}\n` +
          legs
            .map((l) => {
              const where = l.orbit
                ? `${l.orbit.body} r=${Math.round(l.orbit.r / 1000)} km  T=${((2 * Math.PI) / omegaOf(l.orbit) / 60).toFixed(0)} min`
                : "—";
              return `  ${l.kind.padEnd(10)} ${String(l.dv).padStart(5)}  ${l.label.padEnd(34)} ${where}`;
            })
            .join("\n")
        );
      })
      .join("\n\n");
    await expect(text + "\n").toMatchFileSnapshot(
      "./__snapshots__/burn-orbits.txt",
    );
  });
});

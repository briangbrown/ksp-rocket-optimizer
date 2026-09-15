import { describe, it, expect } from "vitest";
import { ARC_MAX, burnArc, finiteBurnDv } from "../src/core/performance.js";
import { lowR, mu, omegaAt, vCirc } from "../src/core/orbits.js";
import { G0 } from "../src/core/constants.js";

/* What a burn costs above the impulse the route priced it as.

   The route's Δv budget is a list of impulses. A real burn is spread, and the
   quantity that decides what that costs is not its duration but the arc it
   sweeps — `finiteBurnDv` in core/performance.ts, and the reasoning above it.

   Two halves here. The first pins the closed form and the arcs it is asked
   about. The second integrates the two-body problem with the thrust on and
   says how far the closed form is from a flown burn, because a penalty nobody
   has checked against a trajectory is a number someone made up. #409 */

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(x) / x);

describe("the finite-burn penalty", () => {
  it("charges nothing for an impulse and more for every arc after it", () => {
    expect(finiteBurnDv(1000, 0)).toBe(1000);
    let last = 1000;
    for (const arc of [0.1, 0.25, 0.5, 1, 1.5, 2, 3]) {
      const got = finiteBurnDv(1000, arc);
      expect(got, `arc ${arc}`).not.toBeNull();
      expect(got!, `arc ${arc} is not dearer than ${last}`).toBeGreaterThan(
        last,
      );
      last = got!;
    }
  });

  it("agrees with the θ²/24 form while the arc is small, and passes it after", () => {
    /* The first-order expansion is what #352 estimated with. It is within a
       tenth of a percent out to half a radian and then starts flattering a
       long burn, which is the reason the exact reciprocal is what ships. */
    const rows: Array<string> = [];
    for (const arc of [0.1, 0.5, 1, 1.5, 2, 2.5, 3]) {
      const exact = finiteBurnDv(1000, arc)! / 1000 - 1;
      const first = (arc * arc) / 24;
      rows.push(
        `arc ${((arc * 180) / Math.PI).toFixed(0).padStart(4)}°  exact ${(100 * exact).toFixed(1).padStart(6)}%  θ²/24 ${(100 * first).toFixed(1).padStart(6)}%`,
      );
      if (arc <= 0.5) expect(Math.abs(exact - first)).toBeLessThan(0.001);
      else expect(exact).toBeGreaterThan(first);
    }
    console.log(rows.join("\n"));
  });

  it("refuses an arc it has nothing to say about", () => {
    expect(finiteBurnDv(1000, ARC_MAX)).toBeNull();
    expect(finiteBurnDv(1000, 4)).toBeNull();
    expect(finiteBurnDv(1000, -1)).toBeNull();
    expect(finiteBurnDv(1000, NaN)).toBeNull();
    expect(finiteBurnDv(1000, Infinity)).toBeNull();
  });
});

describe("the arc a burn sweeps", () => {
  /* The same burn in four places, which is the whole argument for pricing the
     arc rather than the clock. Low orbit periods cluster, so the interesting
     spread is not between one low orbit and another — it is between any of
     them and a burn made out in solar orbit, where the arc is nothing. */
  it("is what makes the same 523 s cheap in one orbit and dear in another", () => {
    const seconds = 523;
    const rows: Array<[string, number]> = [
      ["low Kerbin orbit", omegaAt("Kerbin", lowR("Kerbin"))],
      ["low Duna orbit", omegaAt("Duna", lowR("Duna"))],
      ["low Jool orbit", omegaAt("Jool", lowR("Jool"))],
      ["solar orbit at Kerbin's distance", omegaAt("Sun", 13599840256)],
    ];
    const out: Array<string> = [];
    for (const [where, omega] of rows) {
      const arc = burnArc(omega, seconds);
      const pct = 100 * (finiteBurnDv(1000, arc)! / 1000 - 1);
      out.push(
        `${where.padEnd(33)} period ${((2 * Math.PI) / omega / 60).toFixed(0).padStart(7)} min   arc ${((arc * 180) / Math.PI).toFixed(1).padStart(6)}°   +${pct.toFixed(1)}%`,
      );
    }
    console.log(`a ${seconds} s burn:\n` + out.join("\n"));

    const kerbin = burnArc(rows[0][1], seconds);
    const solar = burnArc(rows[3][1], seconds);
    expect((kerbin * 180) / Math.PI).toBeCloseTo(100.6, 0);
    expect((solar * 180) / Math.PI).toBeLessThan(0.05);
    /* And the clock the solver carries today, for scale: 420 s out of low
       Kerbin orbit is already a tenth of the leg it is flying. */
    const cap = burnArc(rows[0][1], 420);
    expect(100 * (finiteBurnDv(1000, cap)! / 1000 - 1)).toBeCloseTo(8.7, 0);
  });
});

/* ---------------------------------------------------------------------------
   The check on all of the above: fly it.

   Two-body motion with the thrust on, integrated with RK4 in SI units, from a
   circular orbit. The burn is centred on the point the impulse would have been
   applied at, because that is what the closed form assumes; the fixed thrust
   direction is therefore the velocity direction at the arc's midpoint.

   What comes out is compared on energy, which is the invariant an ejection
   burn is actually bought for: the impulsive Δv from the same circular orbit
   that would have left the craft with the energy the flown burn did. */
type Steering = "inertial" | "prograde";

function flyBurn(
  body: string,
  r0: number,
  arcWanted: number,
  dvWanted: number,
  isp: number,
  steering: Steering,
) {
  const m = mu(body);
  const vc = Math.sqrt(m / r0);
  const seconds = arcWanted / Math.sqrt(m / r0 ** 3);
  const m0 = 10_000;
  const mEnd = m0 * Math.exp(-dvWanted / (isp * G0));
  const mdot = (m0 - mEnd) / seconds;
  const thrust = mdot * isp * G0;

  /* Start half the intended arc early, so the burn straddles the reference
     point rather than beginning at it. */
  const a0 = -arcWanted / 2;
  let s = [
    r0 * Math.cos(a0),
    r0 * Math.sin(a0),
    -vc * Math.sin(a0),
    vc * Math.cos(a0),
    m0,
  ];
  /* The velocity direction at the midpoint, which is angle 0. */
  const fixed = [0, 1];

  const deriv = (st: Array<number>) => {
    const [x, y, vx, vy, mass] = st;
    const r = Math.hypot(x, y);
    const g = -m / (r * r * r);
    let dx = fixed[0],
      dy = fixed[1];
    if (steering === "prograde") {
      const v = Math.hypot(vx, vy);
      dx = vx / v;
      dy = vy / v;
    }
    const a = thrust / mass;
    return [vx, vy, g * x + a * dx, g * y + a * dy, -mdot];
  };

  const steps = 20_000;
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) {
    const k1 = deriv(s);
    const k2 = deriv(s.map((v, j) => v + (dt / 2) * k1[j]));
    const k3 = deriv(s.map((v, j) => v + (dt / 2) * k2[j]));
    const k4 = deriv(s.map((v, j) => v + dt * k3[j]));
    s = s.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }

  const [x, y, vx, vy, mass] = s;
  const rEnd = Math.hypot(x, y);
  const energy = (vx * vx + vy * vy) / 2 - m / rEnd;
  /* The impulse from the starting orbit that would have left it here. */
  const equivalent = Math.sqrt(2 * (energy + m / r0)) - vc;
  const applied = isp * G0 * Math.log(m0 / mass);
  /* The angle actually swept, which is not quite the one asked for: the orbit
     changes under the thrust as it goes. */
  let swept = Math.atan2(y, x) - a0;
  if (swept < 0) swept += 2 * Math.PI;
  return { applied, equivalent, swept, kept: equivalent / applied, seconds };
}

describe("the closed form against a flown burn", () => {
  it("never charges less than a flown burn loses, and not much more", () => {
    /* The invariant worth holding is the direction of the error. The closed
       form counts only the component along the intended direction; a flown
       burn also gets work out of the radial component, so it keeps more than
       sinc says and the model overcharges. Overcharging is the side to be
       wrong on — an undercharging penalty ships optimistic Δv, which is the
       failure the whole route budget exists to avoid.

       If anyone replaces the closed form with something that flatters a long
       burn, the first assertion here goes red. */
    const r0 = lowR("Kerbin");
    const rows: Array<string> = [];
    let worst = 0;
    for (const arc of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) {
      const f = flyBurn("Kerbin", r0, arc, 950, 800, "inertial");
      const model = sinc(f.swept / 2);
      const over = (f.kept - model) / model;
      worst = Math.max(worst, over);
      rows.push(
        `arc ${((f.swept * 180) / Math.PI).toFixed(0).padStart(4)}° (${f.seconds.toFixed(0).padStart(4)} s)  flown keeps ${(100 * f.kept).toFixed(2)}%  charged for ${(100 * model).toFixed(2)}%  overcharged ${(100 * over).toFixed(2)}%`,
      );
      expect(
        f.kept,
        `arc ${arc}: the model charges less than the burn actually loses`,
      ).toBeGreaterThanOrEqual(model);
    }
    console.log(
      "inertially held thrust, 950 m/s from low Kerbin orbit:\n" +
        rows.join("\n"),
    );
    /* 3.3% at 95° of arc, when this was written. It is a bound on how much a
       later calibration could claim back, not a target. */
    expect(worst, "the overcharge has grown").toBeLessThan(0.05);
  });

  it("overcharges a pilot holding prograde by more still", () => {
    /* Nobody flies a long burn inertially; prograde hold is what SAS does and
       what a pilot does. A prograde burn keeps more again, so the shipped
       penalty is conservative against the way the burn is actually flown, by
       about four percent of the leg at 86° of arc.

       That gap is the argument for calibrating the model to the prograde
       curve later. It is deliberately not done here: this issue ships the
       standard form and the measurement that says what it costs, and what to
       do about it belongs with the solver change that starts reading it. */
    const r0 = lowR("Kerbin");
    const rows: Array<string> = [];
    for (const arc of [0.5, 1, 1.5]) {
      const i = flyBurn("Kerbin", r0, arc, 950, 800, "inertial");
      const p = flyBurn("Kerbin", r0, arc, 950, 800, "prograde");
      const model = sinc(i.swept / 2);
      rows.push(
        `arc ${((arc * 180) / Math.PI).toFixed(0).padStart(4)}°  charged for ${(100 * model).toFixed(2)}%  inertial keeps ${(100 * i.kept).toFixed(2)}%  prograde keeps ${(100 * p.kept).toFixed(2)}%`,
      );
      expect(p.kept).toBeGreaterThan(i.kept);
      expect(p.kept).toBeGreaterThan(model);
    }
    console.log(rows.join("\n"));
  });

  it("costs what the rocket equation says whichever way it is flown", () => {
    /* The guard on the integrator itself: propellant spent is propellant
       spent, so the applied Δv must be the one that was asked for however the
       craft was pointed. Without this a steering bug would read as physics. */
    const r0 = lowR("Kerbin");
    for (const steering of ["inertial", "prograde"] as const) {
      const f = flyBurn("Kerbin", r0, 1, 950, 800, steering);
      expect(f.applied, steering).toBeCloseTo(950, 6);
    }
    /* And a burn short enough to be an impulse keeps essentially all of it. */
    const tiny = flyBurn("Kerbin", r0, 0.02, 950, 800, "inertial");
    expect(tiny.kept).toBeGreaterThan(0.999);
    expect(vCirc("Kerbin")).toBeCloseTo(Math.sqrt(mu("Kerbin") / r0), 6);
  });
});

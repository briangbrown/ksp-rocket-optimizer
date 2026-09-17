import { describe, it, expect } from "vitest";
import { buildRoute, mu, SYS } from "../src/core/orbits.js";
import type { Leg } from "../src/core/orbits.js";

/* The low-thrust price of a leg.

   An impulse and a spiral are different manoeuvres. A burn spread over many
   revolutions costs what the circular speeds at its two ends say — the whole
   of the circular speed to escape, against the 0.414 of it an impulse pays —
   and an engine too weak to make a burn in a fraction of an orbit pays that
   instead of the map's figure. Every leg with an orbit carries its spiral
   price; these hold the forms, leg by leg, on the routes the app builds. #415 */

const vc = (b: string, r: number) => Math.sqrt(mu(b) / r);
const sma = (b: string) => SYS[b].sma!;
const route = (dest: string, profile = "land", back = true) =>
  buildRoute(dest, profile, true, "Kerbin", back, false);
const leg = (legs: ReadonlyArray<Leg>, label: RegExp) => {
  const l = legs.find((x) => label.test(x.label));
  if (!l) throw new Error(`no leg ${label} in ${legs.map((x) => x.label)}`);
  return l;
};

describe("a leg's spiral price", () => {
  it("costs the whole circular speed to escape, 2.4 times the impulse", () => {
    /* The number the issue was written around: an ion ejection from low
       Kerbin orbit is about 2,290 m/s where the map says 950. */
    const esc = leg(route("Duna"), /LKO → Kerbin escape/);
    expect(esc.dv).toBe(950);
    expect(esc.spiral).toBe(Math.round(vc("Kerbin", esc.orbit!.r)));
    expect(esc.spiral! / esc.dv).toBeGreaterThan(2.3);
    expect(esc.spiral! / esc.dv).toBeLessThan(2.5);
    expect(esc.spiralAfter).toBeUndefined();
  });

  it("costs the difference of circular speeds between two orbits", () => {
    const mun = leg(route("Mun"), /LKO → Mun intercept/);
    const r = mun.orbit!.r;
    expect(mun.spiral).toBe(
      Math.round(Math.abs(vc("Kerbin", sma("Mun")) - vc("Kerbin", r))),
    );
    /* Between the planets the same form, about the Sun. */
    const helio = leg(route("Duna"), /Kerbin escape → Duna transfer/);
    expect(helio.spiral).toBe(
      Math.round(Math.abs(vc("Sun", sma("Duna")) - vc("Sun", sma("Kerbin")))),
    );
  });

  it("charges Edelbaum's turn for a plane change, about π/2 the impulse", () => {
    const pc = leg(route("Eeloo"), /Plane change .* Sun system/);
    expect(pc.spiral! / pc.dv).toBeGreaterThan(1.5);
    expect(pc.spiral! / pc.dv).toBeLessThan(1.6);
  });

  it("prices a capture from rest, and says it must follow a spiral", () => {
    const cap = leg(route("Duna"), /Capture → low Duna orbit/);
    expect(cap.spiral).toBe(Math.round(vc("Duna", cap.orbit!.r)));
    expect(cap.spiralAfter).toBe(true);
  });

  it("stops a capture at the moon the route goes on to, and the intercept then costs only the descent", () => {
    /* The impulsive route captures low about Jool and climbs back out to
       Pol. A spiral has no reason to: it stops at Pol's distance, and what
       is left of the intercept is spiralling down into Pol's low orbit,
       because the landing that follows starts from there. */
    const legs = route("Pol");
    const cap = leg(legs, /Jool capture/);
    const pol = leg(legs, /Jool orbit → Pol intercept/);
    expect(cap.spiral).toBe(Math.round(vc("Jool", sma("Pol"))));
    expect(pol.spiral).toBe(Math.round(vc("Pol", SYS.Pol.R + 10000)));
    expect(pol.spiralAfter).toBe(true);
  });

  it("climbs the body tree on the way home, and does not spiral down into an aerobrake", () => {
    const home = leg(route("Pol"), /Return transfer to Kerbin/);
    const r = home.orbit!.r;
    const want =
      vc("Pol", r) +
      vc("Jool", sma("Pol")) +
      Math.abs(vc("Sun", sma("Kerbin")) - vc("Sun", sma("Jool")));
    expect(home.spiral).toBe(Math.round(want));
    /* Where the route ends in orbit rather than in the air, the descent to
       low orbit is charged, since a spiral arrives with nothing for the air
       to take away. */
    const orbit = leg(route("Laythe", "orbit", false), /Laythe intercept/);
    expect(orbit.spiral).toBe(
      Math.round(vc("Laythe", SYS.Laythe.R + SYS.Laythe.atm! + 10000)),
    );
  });

  it("gives no spiral to a leg with no orbit", () => {
    for (const l of route("Duna"))
      if (!l.orbit) expect(l.spiral, l.label).toBeUndefined();
  });
});

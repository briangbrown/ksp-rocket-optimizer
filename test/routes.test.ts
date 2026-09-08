import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  DEST,
  STATES,
  SYS,
  buildRoute,
  hasSync,
  possible,
  routeFor,
} from "../src/core/orbits.js";
import type { Endpoint, State } from "../src/core/orbits.js";

/* Every route the app can build today, hashed, one line each. The mission
   model is being generalised (#188) — any body's surface, low orbit or
   stationary orbit to any body's surface, low orbit, stationary orbit or
   fly-by — and the property that makes that safe is that every mission that
   exists today comes out leg for leg the same: labels, kinds, Δv. A diff here
   is a route that moved; if that is intended, re-bless with the before and
   after in the commit message, as with the design snapshot. */

const origins = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);
const destsFor = (origin: string) => {
  const here = ["Low orbit"];
  if (hasSync(origin)) here.push("Stationary orbit");
  const rest =
    origin === "Kerbin"
      ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
      : Object.keys(SYS).filter((b) => b !== "Sun" && b !== origin);
  return [...here, ...rest];
};

const digest = (legs: unknown) =>
  createHash("sha1").update(JSON.stringify(legs)).digest("hex").slice(0, 12);

describe("every route the app can build", () => {
  it("comes out leg for leg as it did", async () => {
    const lines: Array<string> = [];
    for (const origin of origins)
      for (const dest of destsFor(origin))
        for (const profile of ["flyby", "orbit", "land"])
          for (const returning of [false, true])
            for (const chutes of [true, false])
              for (const planeNow of [false, true]) {
                const legs = buildRoute(
                  dest,
                  profile,
                  chutes,
                  origin,
                  returning,
                  planeNow,
                );
                const total = legs.reduce((a, l) => a + l.dv, 0);
                lines.push(
                  `${origin} → ${dest} ${profile}${returning ? " & back" : ""}${chutes ? "" : " no-chutes"}${planeNow ? " plane-now" : ""}  ${legs.length} legs ${total} m/s ${digest(legs)}`,
                );
              }
    await expect(lines.join("\n") + "\n").toMatchFileSnapshot(
      "./__snapshots__/routes.txt",
    );
  });

  it("keeps a few whole routes in the clear, for reading a diff by", async () => {
    const sample: Array<[string, string, string, boolean]> = [
      ["Kerbin", "Mun", "land", true],
      ["Kerbin", "Jool orbit", "orbit", false],
      ["Kerbin", "Stationary orbit", "orbit", false],
      ["Kerbin", "Eeloo", "flyby", false],
      ["Mun", "Minmus", "land", true],
      ["Laythe", "Kerbin", "land", false],
      ["Duna", "Low orbit", "orbit", false],
    ];
    const text = sample
      .map(([o, d, p, r]) => {
        const legs = buildRoute(d, p, true, o, r, false);
        return (
          `## ${o} → ${d} ${p}${r ? " & back" : ""}\n` +
          legs
            .map(
              (l) =>
                `  ${l.kind.padEnd(10)} ${String(l.dv).padStart(5)}  ${l.label}${l.free ? " (free)" : ""}${l.chuted ? " (chuted)" : ""}`,
            )
            .join("\n")
        );
      })
      .join("\n\n");
    await expect(text + "\n").toMatchFileSnapshot(
      "./__snapshots__/routes-sample.txt",
    );
  });
});

/* The model itself: every pair the filter allows is a route, every pair it
   refuses says why, and the endpoints the old form could not express — a
   start in orbit, an arrival in stationary orbit, Kerbol at either end — come
   out of the same arithmetic. #188 */
describe("the mission model", () => {
  const bodies = Object.keys(SYS);
  const pairs = () => {
    const out: Array<[Endpoint, Endpoint]> = [];
    for (const fb of bodies)
      for (const fs of STATES)
        for (const tb of bodies)
          for (const ts of STATES)
            out.push([
              { body: fb, state: fs },
              { body: tb, state: ts },
            ]);
    return out;
  };

  it("filters exhaustively: every allowed pair is a route, every refused pair a reason", () => {
    let allowed = 0;
    let refused = 0;
    const bad: Array<string> = [];
    for (const [from, to] of pairs()) {
      const ok = possible(from, to);
      const legs = routeFor(from, to, true, true, false);
      const name = `${from.body}/${from.state} → ${to.body}/${to.state}`;
      if (ok === true) {
        allowed++;
        if (!legs.length) bad.push(`${name}: allowed but no legs`);
        for (const l of legs)
          if (!Number.isFinite(l.dv) || l.dv < 0)
            bad.push(`${name}: ${l.label} is ${l.dv}`);
      } else {
        refused++;
        if (typeof ok !== "string" || !ok.length)
          bad.push(`${name}: no reason`);
        if (legs.length)
          bad.push(`${name}: refused but built ${legs.length} legs`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} faults`).toEqual([]);
    /* 17 bodies × 4 states each way, less the impossibilities. */
    expect(allowed + refused).toBe(17 * 4 * 17 * 4);
    expect(allowed).toBeGreaterThan(1500);
  });

  it("refuses what the bodies cannot do, with the sentence the chip will carry", () => {
    const at = (body: string, state: State): Endpoint => ({ body, state });
    expect(possible(at("Kerbin", "flyby"), at("Mun", "surface"))).toMatch(
      /cannot start in a fly-by/,
    );
    expect(possible(at("Jool", "surface"), at("Kerbin", "low"))).toMatch(
      /Jool has no surface/,
    );
    expect(possible(at("Sun", "surface"), at("Kerbin", "low"))).toMatch(
      /Sun has no surface/,
    );
    expect(possible(at("Kerbin", "surface"), at("Jool", "surface"))).toMatch(
      /Jool has no surface to land on/,
    );
    expect(possible(at("Kerbin", "surface"), at("Mun", "sync"))).toMatch(
      /Mun has no stationary orbit/,
    );
    expect(possible(at("Kerbin", "surface"), at("Kerbin", "flyby"))).toMatch(
      /not a journey/,
    );
    expect(possible(at("Kerbin", "low"), at("Kerbin", "low"))).toMatch(
      /where the mission starts/,
    );
    expect(possible(at("Kerbin", "surface"), at("Kerbin", "sync"))).toBe(true);
    expect(possible(at("Kerbin", "sync"), at("Mun", "surface"))).toBe(true);
  });

  it("reaches Kerbol, and leaves from it", () => {
    /* Kerbol has a stationary orbit — a 432,000 s day against its GM puts it
       about 1.77 Gm out, well above the 600 km atmosphere — and no surface. */
    expect(hasSync("Sun")).toBe(true);
    const down = routeFor(
      { body: "Kerbin", state: "surface" },
      { body: "Sun", state: "low" },
      true,
      false,
      false,
    );
    expect(down.map((l) => l.kind)).toEqual(["ascent", "transfer", "capture"]);
    expect(down.reduce((a, l) => a + l.dv, 0)).toBeGreaterThan(20000);
    const out = routeFor(
      { body: "Sun", state: "low" },
      { body: "Duna", state: "surface" },
      true,
      true,
      false,
    );
    expect(out.some((l) => l.kind === "land" && l.body === "Duna")).toBe(true);
    expect(out.some((l) => l.kind === "ascentBack")).toBe(true);
    expect(out[out.length - 1].label).toMatch(/Capture at Sun/);
    const geo = routeFor(
      { body: "Kerbin", state: "low" },
      { body: "Sun", state: "sync" },
      true,
      false,
      false,
    );
    expect(geo[geo.length - 1].label).toMatch(/one orbit per day/);
  });

  it("starts in orbit, and comes back to it", () => {
    const fromLow = routeFor(
      { body: "Kerbin", state: "low" },
      { body: "Mun", state: "surface" },
      true,
      true,
      false,
    );
    expect(fromLow[0].kind).not.toBe("ascent");
    expect(fromLow[fromLow.length - 1].kind).toBe("aero");
    const fromSync = routeFor(
      { body: "Kerbin", state: "sync" },
      { body: "Mun", state: "low" },
      true,
      true,
      false,
    );
    expect(fromSync[0].label).toMatch(/Lower periapsis/);
    expect(fromSync[fromSync.length - 1].label).toMatch(/one orbit per day/);
    /* And the old way of asking still lands on the same legs. */
    const old = buildRoute("Mun", "land", true, "Kerbin", true, false);
    const now = routeFor(
      { body: "Kerbin", state: "surface" },
      { body: "Mun", state: "surface" },
      true,
      true,
      false,
    );
    expect(now).toEqual(old);
  });
});

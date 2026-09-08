import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { DEST, SYS, buildRoute, hasSync } from "../src/core/orbits.js";

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

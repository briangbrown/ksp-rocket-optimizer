import { describe, it, expect } from "vitest";
import { planMission } from "../src/core/plan.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";
import { buildRoute } from "../src/core/orbits.js";

/* The seam contract.

   `planMission` is the whole interface between the application and the design
   solver. If the solver is ever replaced by a Web Worker or a Rust/WASM module,
   everything crossing this boundary has to survive serialisation — structured
   clone at minimum, JSON in practice.

   That property is easy to state and easy to lose. One `Set` in an input object,
   one reference to a live part record in an output, and the boundary silently
   stops being portable — with nothing failing until the day someone tries to
   move it. These tests are what makes it fail on the day it breaks instead. */

const tierUnlocks = (lvl) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

function sampleInput() {
  const unlocked = tierUnlocks(5);
  const engines = DATA.engines.filter(
    (e) => unlocked.has(e.t) && !e.mh && !e.rs,
  );
  const tanks = DATA.tanks.filter(
    (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
  );
  const route = buildRoute("Mun", "land", true, "Kerbin", true, false);
  return {
    groups: [route.filter((l) => !l.free)],
    route,
    payload: 2.5,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    engines,
    tanks,
    unlocked: [...unlocked].sort(),
    excluded: [],
    needGimbal: true,
    maxAspect: 14,
    expansions: { mh: false, rs: false },
    asparagus: false,
    objective: "cost",
    origin: "Kerbin",
    splitBy: [],
    boosters: true,
  };
}

/* Reports every path holding something JSON cannot carry, rather than just
   failing — "the input is not serialisable" is not an actionable message.

   `ancestors` deliberately tracks the path from the root, not every object
   seen. The same leg object appears in both `route` and `groups`, and the same
   part record appears in several stages; that is a shared reference, which JSON
   handles by duplicating it. Only an object containing itself is a cycle, and
   only that breaks serialisation. */
function unserialisable(value, path = "input", ancestors = new Set()) {
  const bad = [];
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") bad.push(`${path}: function`);
    if (typeof value === "undefined") bad.push(`${path}: undefined`);
    if (typeof value === "number" && !Number.isFinite(value))
      bad.push(`${path}: ${value}`);
    return bad;
  }
  if (ancestors.has(value)) return [`${path}: circular reference`];
  const seen = new Set(ancestors).add(value);
  if (value instanceof Set) return [`${path}: Set`];
  if (value instanceof Map) return [`${path}: Map`];
  if (value instanceof Date) return [`${path}: Date`];
  if (Array.isArray(value)) {
    value.forEach((v, i) => bad.push(...unserialisable(v, `${path}[${i}]`, seen)));
    return bad;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype)
    return [`${path}: class instance`];
  for (const [k, v] of Object.entries(value))
    bad.push(...unserialisable(v, `${path}.${k}`, seen));
  return bad;
}

describe("seam contract", () => {
  it("accepts an input that survives JSON", async () => {
    const input = sampleInput();
    expect(unserialisable(input)).toEqual([]);

    /* Not just serialisable in principle — the same input must produce the same
       plan after a round trip, which is what a worker would actually deliver. */
    const viaJson = JSON.parse(JSON.stringify(input));
    const a = await planMission(input);
    const b = await planMission(viaJson);
    expect(JSON.stringify(b.stages)).toEqual(JSON.stringify(a.stages));
  }, 300_000);

  it("returns a result that survives JSON", async () => {
    const result = await planMission(sampleInput());
    expect(result.stages.length).toBeGreaterThan(0);
    expect(unserialisable(result, "result")).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  }, 300_000);

  it("stops at the next yield when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await planMission(sampleInput(), {
      signal: controller.signal,
    });
    expect(result).toBeNull();
  }, 300_000);
});

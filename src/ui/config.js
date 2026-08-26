import { DATA } from "../core/catalogue.js";
import { SYS } from "../core/orbits.js";
import { withDeps } from "../core/tech.js";

function parseConfig(text) {
  let cfg;
  try {
    cfg = JSON.parse(String(text).replace(/^\s*KSP-PLANNER\s*/, ""));
  } catch {
    return { error: "That does not parse as a configuration." };
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg))
    return { error: "That does not parse as a configuration." };

  const values = {};
  let took = 0,
    left = 0;
  const num = (v, lo, hi) =>
    typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  const take = (key, ok, val) => {
    if (ok) {
      values[key] = val();
      took++;
    } else left++;
  };
  const bodies = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);

  take("origin", bodies.includes(cfg.origin), () => cfg.origin);
  take(
    "dest",
    typeof cfg.dest === "string" && cfg.dest.length > 0,
    () => cfg.dest,
  );
  take(
    "profile",
    ["flyby", "orbit", "land"].includes(cfg.profile),
    () => cfg.profile,
  );
  take("returning", typeof cfg.returning === "boolean", () => cfg.returning);
  take("payload", num(cfg.payload, 0.01, 2000), () => cfg.payload);
  take("payloadDia", num(cfg.payloadDia, 0.1, 20), () => cfg.payloadDia);
  take("margin", num(cfg.margin, 0, 100), () => cfg.margin);
  take("extraDv", num(cfg.extraDv, 0, 20000), () => cfg.extraDv);
  take(
    "objective",
    ["mass", "cost", "parts"].includes(cfg.objective),
    () => cfg.objective,
  );
  take("boosters", typeof cfg.boosters === "boolean", () => cfg.boosters);
  take("chutes", typeof cfg.chutes === "boolean", () => cfg.chutes);
  take("needGimbal", typeof cfg.needGimbal === "boolean", () => cfg.needGimbal);
  take("planeNow", typeof cfg.planeNow === "boolean", () => cfg.planeNow);
  take("asparagus", typeof cfg.asparagus === "boolean", () => cfg.asparagus);
  take("maxAspect", num(cfg.maxAspect, 2, 100), () => cfg.maxAspect);
  take(
    "expansions",
    cfg.expansions &&
      typeof cfg.expansions === "object" &&
      !Array.isArray(cfg.expansions),
    () => ({ mh: !!cfg.expansions.mh, rs: cfg.expansions.rs !== false }),
  );
  take(
    "tech",
    Array.isArray(cfg.tech) && cfg.tech.some((t) => DATA.nodes[t]),
    () => withDeps(DATA.nodes, new Set(cfg.tech.filter((t) => DATA.nodes[t]))),
  );
  take("excluded", Array.isArray(cfg.excluded), () => new Set(cfg.excluded));
  take("cuts", cfg.cuts === null || Array.isArray(cfg.cuts), () =>
    cfg.cuts ? new Set(cfg.cuts) : null,
  );
  take("splits", Array.isArray(cfg.splits), () => new Map(cfg.splits));
  return { values, took, left };
}

/* A tally of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd, and
   it makes the cost of a wider search visible rather than only felt. */

export { parseConfig };

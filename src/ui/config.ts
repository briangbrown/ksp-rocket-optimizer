import { DATA } from "../core/catalogue.js";
import { SYS } from "../core/orbits.js";
import { withDeps } from "../core/tech.js";
import type { Expansions } from "../core/constants.js";
import type { Objective } from "../core/performance.js";

/* ------------------------- reading a pasted configuration -------------------------

   `Pasted` is what a *well-formed* configuration looks like, and nothing is
   taken on its word: every field below is validated at runtime before it
   reaches `values`, which is the whole job of this function. Writing the happy
   shape down is what lets the extractors be read as what they mean rather than
   as twenty casts — the checks beside them are the guarantee.

   Each field is validated on its own and a bad or missing one is simply
   omitted, leaving that setting at its default. A config saved before a setting
   existed still restores everything else rather than failing whole. */
type Pasted = {
  origin: string;
  dest: string;
  profile: string;
  returning: boolean;
  payload: number;
  payloadDia: number;
  margin: number;
  extraDv: number;
  objective: Objective;
  boosters: boolean;
  chutes: boolean;
  needGimbal: boolean;
  planeNow: boolean;
  asparagus: boolean;
  maxAspect: number;
  expansions: { mh: unknown; rs: unknown };
  tech: Array<string>;
  excluded: Array<string>;
  cuts: Array<number> | null;
  splits: Array<[number, number]>;
};

/* What was actually taken. Every field is optional because a configuration may
   carry any subset of them, and what is missing keeps its default. */
type ConfigValues = {
  origin?: string;
  dest?: string;
  profile?: string;
  returning?: boolean;
  payload?: number;
  payloadDia?: number;
  margin?: number;
  extraDv?: number;
  objective?: Objective;
  boosters?: boolean;
  chutes?: boolean;
  needGimbal?: boolean;
  planeNow?: boolean;
  asparagus?: boolean;
  maxAspect?: number;
  expansions?: Expansions;
  tech?: Set<string>;
  excluded?: Set<string>;
  cuts?: Set<number> | null;
  splits?: Map<number, number>;
};

/* Told apart by `error`, which is present on one and absent on the other. */
type ConfigParse =
  | { error: string; values?: undefined; took?: undefined; left?: undefined }
  | { error?: undefined; values: ConfigValues; took: number; left: number };

function parseConfig(text: string): ConfigParse {
  let cfg: Pasted;
  try {
    cfg = JSON.parse(String(text).replace(/^\s*KSP-PLANNER\s*/, ""));
  } catch {
    return { error: "That does not parse as a configuration." };
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg))
    return { error: "That does not parse as a configuration." };

  const values: ConfigValues = {};
  let took = 0,
    left = 0;
  const num = (v: number, lo: number, hi: number) =>
    typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  const take = <K extends keyof ConfigValues>(
    key: K,
    ok: unknown,
    val: () => ConfigValues[K],
  ) => {
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
    Array.isArray(cfg.tech) && cfg.tech.some((t: string) => DATA.nodes[t]),
    () =>
      withDeps(
        DATA.nodes,
        new Set(cfg.tech.filter((t: string) => DATA.nodes[t])),
      ),
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
export type { ConfigParse, ConfigValues };

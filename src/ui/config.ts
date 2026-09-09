import { DATA } from "../core/catalogue.js";
import { DEST, STATES, SYS, endpointsOf, possible } from "../core/orbits.js";
import type { Endpoint, State } from "../core/orbits.js";
import { MAX_K } from "../core/plan.js";
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
  /* The mission's two ends (#188). `origin`, `dest` and `profile` are the
     form every configuration and link carried before, still read and mapped
     onto the ends, so nothing saved or shared stops working. */
  from: { body: string; state: string };
  to: { body: string; state: string };
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
  /* The transfer window search: leave no earlier than this UT, and stay at
     the destination at least this long before the window home. Seconds. */
  leaveAfter: number;
  stay: number;
  expansions: { mh: unknown; rs: unknown };
  tech: Array<string>;
  excluded: Array<string>;
  cuts: Array<number> | null;
  splits: Array<[number, number]>;
};

/* What was actually taken. Every field is optional because a configuration may
   carry any subset of them, and what is missing keeps its default. */
type ConfigValues = {
  from?: Endpoint;
  to?: Endpoint;
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
  leaveAfter?: number;
  stay?: number;
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

/* A link is untrusted input, and so is a paste: every field is checked
   against what the app knows before it reaches state, every list is bounded,
   and nothing in here may throw — a `TypeError` out of `new Map` on a
   malformed field escaped to the mount effect, `hydrated` never became true,
   and the page sat under the solving veil until the hash was edited by
   hand. #174 */
const MAX_LIST = 400;
const MAX_CUTS = 64;

function parseConfig(text: string): ConfigParse {
  let cfg: Pasted;
  try {
    cfg = JSON.parse(String(text).replace(/^\s*KSP-PLANNER\s*/, ""));
  } catch {
    return { error: "That does not parse as a configuration." };
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg))
    return { error: "That does not parse as a configuration." };
  try {
    return readConfig(cfg);
  } catch {
    return { error: "That does not parse as a configuration." };
  }
}

/* A whole number in a range. */
const int = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function readConfig(cfg: Pasted): ConfigParse {
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
  /* Every destination the picker can name, for any origin: the orbits, the
     destinations table and every body. Which of them the current origin
     offers is the picker's business; an unknown name was a blank route and a
     string of any length in state. */
  const dests = new Set([
    "Low orbit",
    "Stationary orbit",
    ...Object.keys(DEST),
    ...Object.keys(SYS).filter((b) => b !== "Sun"),
  ]);
  const parts = new Set([
    ...DATA.engines.map((e) => e.n),
    ...DATA.tanks.map((t) => t.n),
  ]);
  const known = (n: string) => Object.hasOwn(DATA.nodes, n);

  /* The two ends, or the old three fields mapped onto them. Whichever the
     text carries, what comes out is a pair the model calls a mission — an
     impossible pair is left at the defaults, as a bad field is. */
  const endpoint = (e: unknown): Endpoint | null =>
    e &&
    typeof e === "object" &&
    typeof (e as { body: unknown }).body === "string" &&
    Object.hasOwn(SYS, (e as { body: string }).body) &&
    STATES.includes((e as { state: State }).state)
      ? { body: (e as Endpoint).body, state: (e as Endpoint).state }
      : null;
  const ends = (() => {
    const from = endpoint(cfg.from);
    const to = endpoint(cfg.to);
    if (from && to) return { from, to, count: 2 };
    const legacy =
      bodies.includes(cfg.origin) ||
      dests.has(cfg.dest) ||
      ["flyby", "orbit", "land"].includes(cfg.profile);
    if (!legacy) return null;
    /* An old field that is present but not a body, destination or profile
       is left at its default, and counted as left, as any bad field is. */
    left += [
      cfg.origin !== undefined && !bodies.includes(cfg.origin),
      cfg.dest !== undefined && !dests.has(cfg.dest),
      cfg.profile !== undefined &&
        !["flyby", "orbit", "land"].includes(cfg.profile),
    ].filter(Boolean).length;
    const e = endpointsOf(
      dests.has(cfg.dest) ? cfg.dest : "Mun",
      ["flyby", "orbit", "land"].includes(cfg.profile) ? cfg.profile : "land",
      bodies.includes(cfg.origin) ? cfg.origin : "Kerbin",
    );
    return e ? { from: e.from, to: e.to, count: 1 } : null;
  })();
  take("from", ends && possible(ends.from, ends.to) === true, () => ends!.from);
  take("to", ends && possible(ends.from, ends.to) === true, () => ends!.to);
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
  /* A thousand Kerbin years is past any save; a stay is bounded the same. */
  take("leaveAfter", num(cfg.leaveAfter, 0, 1e10), () => cfg.leaveAfter);
  take("stay", num(cfg.stay, 0, 1e10), () => cfg.stay);
  take(
    "expansions",
    cfg.expansions &&
      typeof cfg.expansions === "object" &&
      !Array.isArray(cfg.expansions),
    () => ({ mh: !!cfg.expansions.mh, rs: cfg.expansions.rs !== false }),
  );
  take(
    "tech",
    Array.isArray(cfg.tech) && cfg.tech.some((t: unknown) => known(String(t))),
    () =>
      withDeps(
        DATA.nodes,
        new Set(
          cfg.tech
            .slice(0, MAX_LIST)
            .filter(
              (t: unknown): t is string => typeof t === "string" && known(t),
            ),
        ),
      ),
  );
  /* Only parts the catalogue has, and never every engine: a link that
     excluded them all was saved with the roster and made every later visit
     unsolvable. */
  take(
    "excluded",
    Array.isArray(cfg.excluded) &&
      cfg.excluded.every(
        (n: unknown) => typeof n === "string" && parts.has(n),
      ) &&
      DATA.engines.some((e) => !cfg.excluded.includes(e.n)),
    () => new Set<string>(cfg.excluded.slice(0, MAX_LIST)),
  );
  take(
    "cuts",
    cfg.cuts === null ||
      (Array.isArray(cfg.cuts) &&
        cfg.cuts.length <= MAX_CUTS &&
        cfg.cuts.every((i: unknown) => int(i, 0, MAX_CUTS))),
    () => (cfg.cuts ? new Set<number>(cfg.cuts) : null),
  );
  take(
    "splits",
    Array.isArray(cfg.splits) &&
      cfg.splits.length <= MAX_CUTS &&
      cfg.splits.every(
        (s: unknown) =>
          Array.isArray(s) &&
          s.length === 2 &&
          int(s[0], 0, MAX_CUTS) &&
          int(s[1], 1, MAX_K),
      ),
    () => new Map<number, number>(cfg.splits),
  );
  return { values, took, left };
}

/* A tally of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd, and
   it makes the cost of a wider search visible rather than only felt. */

export { parseConfig };
export type { ConfigParse, ConfigValues };

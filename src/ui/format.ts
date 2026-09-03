import { PROFILES } from "../core/orbits.js";
import type { Objective } from "../core/performance.js";

const NAME_WORDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  flyby: ["Drive-By", "Wave", "Peek", "Flyby", "Glance", "Sightsee"],
  orbit: ["Circuit", "Loiter", "Lap", "Orbiter", "Vigil", "Holding Pattern"],
  land: ["Descent", "Touchdown", "Boots", "Lander", "Arrival", "Faceplant"],
};
const NAME_ADJ = [
  "Ambitious",
  "Reluctant",
  "Overengineered",
  "Slightly Concerning",
  "Structurally Optimistic",
  "Barely Adequate",
  "Suspiciously Cheap",
  "Unreasonable",
  "Well-Strutted",
  "Mostly Symmetrical",
  "Provisional",
  "Emphatic",
  "Unhurried",
  "Load-Bearing",
  "Theoretically Sound",
];
const NAME_TAIL = [
  "Mk1",
  "Mk2",
  "Mk3",
  "Mk4",
  "Mk7",
  "Rev B",
  "Rev C",
  "Rev D",
  "Prototype",
  "Final",
  "Final (2)",
  "Final (Actual)",
  "Flight Article",
  "Block II",
];
const NAME_JOKE = [
  "Jeb Approved",
  "Bill Says No",
  "Bob Has Concerns",
  "Val Insisted",
  "Struts Extra",
  "Chutes Optional",
  "Fins Were Free",
  "Do Not Revert",
  "Quicksave First",
  "More Boosters",
  "This Time For Sure",
  "Wernher Signed Off",
];

/* Everything the name is hashed from. Deterministic in all of it: the same
   mission always gets the same name, and it changes when the mission does. */
type CraftIn = {
  origin: string;
  dest: string;
  profile: string;
  returning: boolean;
  payload: number;
  objective: string;
  k: number;
  mass?: number;
};

function craftName({
  origin,
  dest,
  profile,
  returning,
  payload,
  objective,
  k,
  mass,
}: CraftIn) {
  const seed = [
    origin,
    dest,
    profile,
    returning,
    objective,
    k,
    Math.round(payload * 10),
    Math.round(mass || 0),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pick = (arr: ReadonlyArray<string>, salt: number) =>
    arr[Math.abs((h ^ Math.imul(salt, 2654435761)) >>> 0) % arr.length];
  const where = String(dest)
    .replace(/ orbit$/i, "")
    .replace(/^Low | Orbit$/gi, "");
  const verb = pick(NAME_WORDS[profile] || NAME_WORDS.orbit, 1);
  const adj = pick(NAME_ADJ, 2);
  const tail = pick(NAME_TAIL, 3);
  const joke = pick(NAME_JOKE, 4);
  const trip = returning ? " & Back" : "";
  return {
    name: `${where} ${verb}${trip} — ${adj} ${tail}`,
    sub: joke,
    short: `${where}-${verb.replace(/\s+/g, "")}${returning ? "-RT" : ""}-${tail.replace(/[^A-Za-z0-9]/g, "")}`,
  };
}

/* What the search is asked to minimise, and what to call each: the chip in
   the brief, and — lower-cased — the last word of its summary line. */
const OBJECTIVES: ReadonlyArray<[Objective, string]> = [
  ["mass", "Lightest"],
  ["cost", "Cheapest"],
  ["parts", "Fewest parts"],
];

/* One sentence on what each gives up: the chip's hint under a pointer, and
   the group's disclosure under a finger. */
const OBJECTIVE_HINT: Readonly<Record<Objective, string>> = {
  mass: "Lightest minimises what leaves the pad.",
  cost: "Cheapest gives up efficiency for price, taking plainer engines and carrying more propellant.",
  parts:
    "Fewest parts favours self-contained boosters and the largest tanks that fit, and will accept a heavier rocket to save a part.",
};

/* The set brief, as one line: `Kerbin → Mun · land & return · 2.5 t ·
   cheapest`. A function of the mission and nothing else, so a table can
   check it — test/brief-line.test.ts walks every profile, origin and
   objective through it. */
type BriefIn = {
  origin: string;
  dest: string;
  /* The profile in force, not the one chosen: a landing falls back to orbit
     where there is nothing to land on, and the line says what will fly. */
  profile: string;
  returning: boolean;
  payload: number;
  objective: Objective;
};

function briefLine({
  origin,
  dest,
  profile,
  returning,
  payload,
  objective,
}: BriefIn) {
  /* Launching straight into an orbit of the origin: there is no arrival to
     shape and no return leg, so neither the profile nor the trip is said. */
  const here = dest === "Low orbit" || dest === "Stationary orbit";
  const kind = here
    ? null
    : `${(PROFILES[profile]?.name ?? profile).toLowerCase()}${returning ? " & return" : ", one way"}`;
  const tonnes = payload.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  const aim = (
    OBJECTIVES.find(([k]) => k === objective)?.[1] ?? objective
  ).toLowerCase();
  return [
    `${origin} → ${here ? dest.toLowerCase() : dest}`,
    kind,
    `${tonnes} t`,
    aim,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ================================== UI ================================== */
/* Defensive: a row can legitimately carry no number — the parallel-stacks note
   has no mass of its own — and a formatter that throws on null takes the whole
   page down with it. */
const fmt = (x: number | null | undefined, d = 0) =>
  x === null || x === undefined || !isFinite(x)
    ? "—"
    : x.toLocaleString(undefined, {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

/* KSP shows mission elapsed time as T+ HH:MM:SS, so match it — a figure you can
   read straight off the game clock beats one you have to convert in your head.
   A Kerbin day is six hours, and days only appear when something actually runs
   that long. */
function hms(sec: number) {
  const x = Math.max(0, Math.round(sec));
  const d = Math.floor(x / 21600);
  const h = Math.floor((x % 21600) / 3600),
    m = Math.floor((x % 3600) / 60),
    s2 = x % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (d ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(s2)}`;
}

export {
  NAME_ADJ,
  NAME_JOKE,
  NAME_TAIL,
  NAME_WORDS,
  OBJECTIVES,
  OBJECTIVE_HINT,
  briefLine,
  craftName,
  fmt,
  hms,
};

export type { BriefIn, CraftIn };

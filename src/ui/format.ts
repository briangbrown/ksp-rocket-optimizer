import { kerbalDate } from "../core/kepler.js";
import type { Endpoint, State } from "../core/orbits.js";
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
/* The bodies by the names players use: the game's "Sun" is Kerbol. */
const bodyLabel = (b: string) => (b === "Sun" ? "Kerbol" : b);

/* The states of an endpoint, as the chips and the line say them. */
const STATE_LABEL: Readonly<Record<State, string>> = {
  surface: "Surface",
  low: "Low orbit",
  sync: "Stationary orbit",
  flyby: "Fly-by",
};
/* The arrival, as the line's verb: what the profile used to say. */
const ARRIVE_WORD: Readonly<Record<State, string>> = {
  surface: "land",
  low: "orbit",
  sync: "stationary orbit",
  flyby: "fly-by",
};

type CraftIn = {
  from: Endpoint;
  to: Endpoint;
  returning: boolean;
  payload: number;
  objective: string;
  k: number;
  mass?: number;
};

function craftName({
  from,
  to,
  returning,
  payload,
  objective,
  k,
  mass,
}: CraftIn) {
  /* Seeded as the old form was — origin, destination, profile — so every
     name a saved design had is the name it keeps. */
  const profile =
    to.state === "surface" ? "land" : to.state === "flyby" ? "flyby" : "orbit";
  const dest = to.body === from.body ? STATE_LABEL[to.state] : to.body;
  const seed = [
    from.body,
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
  const where = bodyLabel(to.body === from.body ? from.body : to.body);
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
  from: Endpoint;
  to: Endpoint;
  returning: boolean;
  payload: number;
  objective: Objective;
};

function briefLine({ from, to, returning, payload, objective }: BriefIn) {
  /* The From end names its state only off the surface, which is where
     nearly every mission starts. Within one body the To end is the state
     itself and the trip is said only where there is one to make. */
  const start =
    bodyLabel(from.body) +
    (from.state === "surface"
      ? ""
      : ` ${STATE_LABEL[from.state].toLowerCase()}`);
  const here = to.body === from.body;
  const end = here ? STATE_LABEL[to.state].toLowerCase() : bodyLabel(to.body);
  const kind = here
    ? returning
      ? "& return"
      : null
    : `${ARRIVE_WORD[to.state]}${returning ? " & return" : ", one way"}`;
  const tonnes = payload.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  const aim = (
    OBJECTIVES.find(([k]) => k === objective)?.[1] ?? objective
  ).toLowerCase();
  return [`${start} → ${end}`, kind, `${tonnes} t`, aim]
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

/* A moment on the game's clock, as the game prints it — Year 1 Day 1 is UT
   0 — with the seconds, since a window is found to the second. */
const kerbalDateLabel = (ut: number) => {
  const d = kerbalDate(ut);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Y${d.year} D${d.day} ${pad(d.h)}:${pad(d.m)}:${pad(d.s)}`;
};
const kerbalDayLabel = (ut: number) => {
  const d = kerbalDate(ut);
  return `Y${d.year} D${d.day}`;
};

export {
  NAME_ADJ,
  NAME_JOKE,
  NAME_TAIL,
  NAME_WORDS,
  OBJECTIVES,
  OBJECTIVE_HINT,
  ARRIVE_WORD,
  STATE_LABEL,
  bodyLabel,
  briefLine,
  craftName,
  fmt,
  hms,
  kerbalDateLabel,
  kerbalDayLabel,
};

export type { BriefIn, CraftIn };

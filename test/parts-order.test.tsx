// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { manifest } from "../src/core/manifest.js";
import { PartsTable } from "../src/ui/components/build.jsx";
import type { Coupler, Engine, Tank } from "../src/core/catalogue.js";
import type { Role } from "../src/core/manifest.js";
import type { Solution } from "../src/core/solution.js";

/* The parts list is a build order, and says so twice.

   `PartsTable` opens with "listed the way you build it ... within a stage the
   order is physical too", and its booster block repeats it: "the list is meant
   to be read as a build order". The table itself is headed "Top of the stack
   first, working down to the pad — the order you assemble it in."

   It listed an engine plate above the fuel tank adapter the plate hangs from,
   which is the reverse of how they go on, and `manifest()` in core did the same
   thing independently — the table does not call it, so the two are separate
   descriptions of one stage and both had drifted the same way. Read as the
   build order it claims to be, it described a stack nobody can assemble, and it
   made a load-bearing adapter look redundant. That is how it was reported. #77

   One fixture, both lists, because the bug was that they agreed with each other
   and not with the rocket. */

afterEach(cleanup);

/* A stage whose tanks are narrower than the plate under them, which is the case
   that needs an adapter at all: 1.25 m tanks, a 1.875 m plate top, three
   engines gathered onto it. The shape of stage 3 in the report. */
/* Blanks to build the fixture on. Everything below says what the case is
   about — a plated stage whose tanks are narrower than the plate — and the
   fields it does not mention are the ones the case does not turn on. Spelling
   all twenty of them out at each fixture would bury the four that matter. */
const tank = (over: Partial<Tank>): Tank => ({
  n: "",
  t: null,
  sz: [],
  wet: 0,
  dry: 0,
  lf: 0,
  ox: 0,
  mono: 0,
  xe: 0,
  prop: 0,
  k: 0,
  ...over,
});
const engine = (over: Partial<Engine>): Engine => ({
  n: "",
  t: "",
  sz: [],
  m: 0,
  dry: 0,
  fuelM: 0,
  cost: 0,
  gim: 0,
  iv: 0,
  ia: 0,
  fv: 0,
  fa: 0,
  f: [],
  ...over,
});
const coupler = (over: Partial<Coupler>): Coupler => ({
  n: "",
  out: 1,
  dia: 0,
  top: 0,
  m: 0,
  cost: 0,
  t: "",
  ...over,
});
const stage = (over: Partial<Solution>): Solution => ({
  engine: engine({}),
  n: 1,
  tanks: null,
  adapters: null,
  coupler: null,
  shroud: null,
  decoupler: null,
  boosters: null,
  total: 0,
  wet: 0,
  dry: 0,
  prop: 0,
  isp: 0,
  dv: 0,
  twr: 0,
  twrBurnout: 0,
  burn: 0,
  cost: 0,
  parts: 0,
  score: 0,
  ...over,
});

const ADAPTER = tank({
  n: "FL-XA160 Fuel Tank Adapter",
  dry: 0.1,
  wet: 0.9,
  cost: 160,
});
const PLATE = coupler({
  n: "EP-18 Engine Plate",
  m: 0.14,
  cost: 250,
  top: 1.875,
  out: 3,
});
const TANK = tank({ n: "FL-T800 Fuel Tank", dry: 0.5, wet: 4.5, cost: 800 });
/* `dry` equal to `m`, which is what a liquid engine is: the manifest reads
   `dry ?? m`, and the fixture used to carry only the one. */
const ENGINE = engine({
  n: 'LV-909 "Terrier" Liquid Fuel Engine',
  m: 0.5,
  dry: 0.5,
  cost: 390,
});

const SOL = stage({
  n: 3,
  stacks: 1,
  engine: ENGINE,
  decoupler: { n: "TD-12 Decoupler", m: 0.04, cost: 400, d: 1.25, qty: 1 },
  tanks: { list: [{ c: 1, t: TANK }], count: 1, dryMass: 0.5, prop: 4 },
  adapters: { parts: [ADAPTER], dry: 0.1, prop: 0.8 },
  coupler: PLATE,
  shroud: null,
});

/* Where each part stands in the stage, top down. `modelOf` is the authority —
   it stacks a stage engines-first from the bottom, so read upwards that is
   tank, adapter, coupler, engine, with the decoupler above the lot.

   An engine plate is a coupler that sits *above* the engines it carries, with
   them hanging inside its shroud, and it has a decoupler built in. So a plated
   stage reads tanks, adapter, plate, engines, and then straight into the next
   stage's tanks with nothing between them — the plate is the joint. An
   unplated stage reads tanks, engines, and then a decoupler before the next
   stage's tanks. The solver charges every joint to the stage below it rather
   than above, which is the same joint named the other way round, and is why
   `plateAbove` on a stage zeroes the decoupler it would otherwise buy. */
const ORDER = ["decoupler", "tank", "adapter", "coupler", "engine"];
const rank = (role: Role) => ORDER.indexOf(role);

describe("the parts list, as a build order", () => {
  it("puts every part of a stage in the order it goes on", () => {
    const seen = manifest(SOL)
      .map((r) => r.role)
      .filter((r) => rank(r) >= 0);
    expect(seen).toEqual([...seen].sort((a, b) => rank(a) - rank(b)));
    /* Not vacuous: the two that were the wrong way round are both here. */
    expect(seen).toContain("adapter");
    expect(seen).toContain("coupler");
    expect(seen.indexOf("adapter")).toBeLessThan(seen.indexOf("coupler"));
  });

  it("draws the table in that same order, since it is a second list", () => {
    render(<PartsTable stages={[{ sol: SOL }]} payload={1} color="#8ACAC2" />);
    const text = [...document.querySelectorAll("tr")].map((tr) =>
      tr.textContent.trim(),
    );
    const at = (name: string) => text.findIndex((t) => t.includes(name));

    for (const part of [ADAPTER, PLATE, TANK, ENGINE])
      expect(at(part.n), `${part.n} is not in the table`).toBeGreaterThan(-1);

    expect(at(TANK.n)).toBeLessThan(at(ADAPTER.n));
    expect(
      at(ADAPTER.n),
      "the plate is listed above the adapter it hangs from",
    ).toBeLessThan(at(PLATE.n));
    expect(at(PLATE.n)).toBeLessThan(at(ENGINE.n));
  });
});

import { DATA } from "./catalogue.js";
import { COUPLERS, STRUCT } from "./parts.js";
import { BOOSTER_HOLD, STACK_JOIN, tankRun } from "./geometry.js";
import { titleOf } from "./nodes.js";
import type { Craft, CraftPart } from "../craft/index.js";
import type { PlanStage } from "./plan.js";

/* The bill of a rocket, stage by stage, in a form both a plan and a craft
   reduce to: which parts, how many, what they hold. Equal bills is what "the
   craft matches the build" means (#465), and the craft side is as far as a
   future "price this craft" importer needs to go before the solver's
   vocabulary takes over. Bottom stage first. (The parts table's own bill for
   the reader is `manifest.ts`; this one is for checking, not showing.) */

type Count = { title: string; count: number };

type StageBill = {
  engines: Array<Count>;
  tanks: Array<Count>;
  couplers: Array<Count>;
  decoupler: string | null;
  /* Radial holders and struts the stage itself carries — a packed ring's,
     a ring of columns' — not the boosters'. */
  holders: number;
  struts: number;
  /* Tonnes of propellant the stage's own tanks hold, to a kilogram. */
  propellant: number;
  /* The ring of boosters, where there is one: how many, and which parts
     each is made of. */
  ring: { count: number; titles: Array<string> } | null;
};

type Bill = Array<StageBill>;

/* Tonnes a unit. */
const UNIT: Record<string, number> = {
  LiquidFuel: 0.005,
  Oxidizer: 0.005,
  SolidFuel: 0.0075,
  MonoPropellant: 0.004,
  XenonGas: 0.0001,
};

const kg = (t: number) => Math.round(t * 1000) / 1000;
const counts = (titles: ReadonlyArray<string>): Array<Count> => {
  const m = new Map<string, number>();
  for (const t of titles) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => a.title.localeCompare(b.title));
};

/* ----------------------------------------------------------------- plan */
function billOfPlan(stages: ReadonlyArray<PlanStage>): Bill {
  const out: Bill = [];
  for (const st of stages) {
    const sol = st.sol;
    if (!sol) continue;
    const S = sol.stacks || 1;
    const run = tankRun(S > 1 ? sol.perStack : sol.tanks);
    const tanks: Array<string> = [];
    for (let k = 0; k < S; k++) {
      for (const tk of run) tanks.push(tk.t.n);
      for (const a of sol.adapters?.parts ?? []) tanks.push(a.n);
    }
    const couplers: Array<string> = [];
    if (sol.coupler) for (let k = 0; k < S; k++) couplers.push(sol.coupler.n);
    if (sol.rejoin) couplers.push(sol.rejoin.n);
    const b = sol.boosters;
    let ring: StageBill["ring"] = null;
    let ringProp = 0;
    if (b) {
      const col = b.part.column;
      const titles = col
        ? [
            ...((b.part.nEng ?? 1) ? [b.part.n] : []),
            ...tankRun(col).map((t) => t.t.n),
          ]
        : [b.part.n];
      ring = { count: b.n, titles: [...new Set(titles)].sort() };
      ringProp = b.n * (b.part.m - b.part.dry);
    }
    out.push({
      engines: counts(Array.from({ length: sol.n }, () => sol.engine.n)),
      tanks: counts(tanks),
      couplers: counts(couplers),
      decoupler: sol.decoupler?.n ?? null,
      holders: sol.packed?.cols ?? 0,
      struts: (sol.packed?.cols ?? 0) + (sol.joiner ? (S - 1) * 2 : 0),
      /* `prop` is the tanks' and the adapters'; a solid stage's is its
         engine's own charge (n × fuelM), and a fuelled engine under tanks
         carries fuelM the stage does not count in `prop` but does in mass. */
      propellant: kg(
        sol.prop - ringProp + (sol.tanks ? sol.n * sol.engine.fuelM : 0),
      ),
      ring,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- craft */
const ENGINES = new Set(DATA.engines.map((e) => e.n));
const TANKS = new Set(DATA.tanks.map((t) => t.n));
const COUPLER_TITLES = new Set(COUPLERS.map((c) => c.n));
const DECOUPLERS = new Set(
  STRUCT.decoupler.map((d) => d.n).filter((n) => n !== BOOSTER_HOLD),
);

function billOfCraft(craft: Craft): Bill {
  const root = craft.parts[0];
  const groups = new Map<number, Array<CraftPart>>();
  for (const p of craft.parts) {
    if (p === root) continue;
    if (!groups.has(p.stage.drop)) groups.set(p.stage.drop, []);
    groups.get(p.stage.drop)!.push(p);
  }
  /* A group is a ring of boosters when no stack link leaves it: a stage's
     own parts hang from the stage above by a stack node, a ring hangs by
     its holders' surfaces. */
  const isRing = (ps: Array<CraftPart>) => {
    const ids = new Set(ps.map((p) => p.id));
    return ps.every(
      (p) =>
        p.parent === null || p.parent.via === "surface" || ids.has(p.parent.id),
    );
  };
  const drops = [...groups.keys()].sort((a, b) => b - a);
  const out: Bill = [];
  let pendingRing: StageBill["ring"] = null;
  for (const d of drops) {
    const ps = groups.get(d)!;
    const title = (p: CraftPart) => titleOf(p.name) ?? p.name;
    if (isRing(ps)) {
      const holders = ps.filter((p) => title(p) === BOOSTER_HOLD);
      const bodies = ps.filter((p) => title(p) !== BOOSTER_HOLD);
      pendingRing = {
        count: holders.length,
        titles: [...new Set(bodies.map(title))].sort(),
      };
      continue;
    }
    const titles = ps.map(title);
    out.push({
      engines: counts(titles.filter((t) => ENGINES.has(t))),
      tanks: counts(titles.filter((t) => TANKS.has(t))),
      couplers: counts(titles.filter((t) => COUPLER_TITLES.has(t))),
      decoupler: titles.find((t) => DECOUPLERS.has(t)) ?? null,
      holders: titles.filter((t) => t === BOOSTER_HOLD).length,
      struts: titles.filter((t) => t === STACK_JOIN).length,
      propellant: kg(
        ps.reduce(
          (a, p) =>
            a +
            p.resources.reduce((s, r) => s + r.amount * (UNIT[r.name] ?? 0), 0),
          0,
        ),
      ),
      ring: pendingRing,
    });
    pendingRing = null;
  }
  return out;
}

export { billOfCraft, billOfPlan };
export type { Bill, StageBill };

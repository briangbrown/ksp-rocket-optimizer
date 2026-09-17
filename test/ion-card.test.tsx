// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { planMission } from "../src/core/plan.js";
import { StageStack } from "../src/ui/components/stages.jsx";
import { PartsTable } from "../src/ui/components/parts.jsx";
import { sweepCases } from "./grid.js";
import type { Plan } from "../src/core/plan.js";

/* The stage card and the bill of parts, with an electric stage on them.

   A reader who sees an ion engine wants to know what feeds it before anything
   else, and the TWR of a stage flying a spiral is not a fault. The Tylo 3.5 t
   sweep mission is the one that delivers a Dawn today; if it stops, the plan
   is solved on a roster that leaves nothing else, so the card is still
   exercised. #415 */

afterEach(cleanup);

async function ionPlan(): Promise<Plan> {
  const c = sweepCases().find((x) => x.name === "Tylo-pay3.5")!;
  const p = await planMission({ ...c.input, objective: "mass" });
  if (p && p.stages.some((s) => s.sol?.plant)) return p;
  throw new Error("the Tylo 3.5 t mass plan no longer carries a plant");
}

describe("an electric stage on the page", () => {
  it("names its plant on the card and says the burn is a spiral", async () => {
    const p = await ionPlan();
    const ion = p.stages.find((s) => s.sol?.plant)!;
    const { container } = render(
      <StageStack
        stages={p.stages}
        color="#fff"
        splitBy={new Map()}
        onSetSplit={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    for (const part of ion.sol!.plant!.parts)
      expect(text).toContain(`${part.c}×`);
    expect(text).toContain(ion.sol!.plant!.parts[0].n);
    expect(text).toContain("power ·");
    /* Flown as a spiral, and said so where the arc cost is. */
    expect(text).toMatch(/spiral over [\d.]+ revolutions/);
    /* Nothing on the page reads NaN or undefined. */
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it("lists the plant's parts in the bill", async () => {
    const p = await ionPlan();
    const ion = p.stages.find((s) => s.sol?.plant)!;
    const { container } = render(
      <PartsTable
        stages={p.stages}
        payload={3.5}
        hardware={null}
        color="#fff"
      />,
    );
    const text = container.textContent ?? "";
    for (const part of ion.sol!.plant!.parts) expect(text).toContain(part.n);
    expect(text).not.toMatch(/NaN|undefined/);
  });
});

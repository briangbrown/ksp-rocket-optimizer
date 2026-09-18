// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Plan, PlanInput, PlanOpts } from "../src/core/plan.js";

/* The round trip the craft feature is judged on (#465): a rocket the app
   built, as the link the app writes, all the way to a .craft and back,
   matching the build it started from.

     link → the app (fromLink, parseConfig, its own PlanInput) → planMission
          → craftOf → writeCraft → readCraft
                 ↓                        ↓
          billOfPlan      ===   billOfCraft

   The app is mounted on each fixture link rather than its input assembly
   being re-derived here: what is under test is the path a reader's link
   takes, and `test/seam-input.test.tsx` already intercepts the real call the
   same way. The fixture links are ones `toLink` wrote (test/fixtures/
   links.txt, made by tools/link-fixtures — see the file's head), with the
   configuration each carries beside it, so a codec change shows here too. */

type Run = { input: PlanInput; plan: Plan | null };
const runs: Array<Run> = [];
vi.mock("../src/core/plan.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/core/plan.js")>();
  return {
    ...real,
    planMission: async (input: PlanInput, opts: PlanOpts) => {
      const plan = await real.planMission(input, opts);
      runs.push({ input, plan });
      return plan;
    },
  };
});

const { render, cleanup } = await import("@testing-library/react");
const { settle } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");
const { fromLink } = await import("../src/ui/link.js");
const { craftOf } = await import("../src/core/craft.js");
const { billOfCraft, billOfPlan } = await import("../src/core/bill.js");
const { checkCraft, readCraft, writeCraft } =
  await import("../src/craft/index.js");

/* `# name`, then the configuration string, then the link, blank line. */
function fixtures() {
  const out: Array<{ name: string; config: string; link: string }> = [];
  const lines = readFileSync("test/fixtures/links.txt", "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("# ")) continue;
    out.push({
      name: lines[i].slice(2),
      config: lines[i + 1],
      link: lines[i + 2],
    });
    i += 2;
  }
  return out;
}

describe("a built rocket, as its link, as a craft, and back", () => {
  const cases = fixtures();
  it("has fixtures", () => {
    expect(cases.length).toBeGreaterThan(3);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s",
    async (_name, c) => {
      /* The link still carries the configuration it was written from. */
      const found = await fromLink(c.link);
      expect(found && "text" in found ? found.text : found).toBe(c.config);

      runs.length = 0;
      location.hash = c.link;
      render(<KSPMissionPlanner />);
      await settle(300_000);
      cleanup();
      location.hash = "";

      const run = runs[runs.length - 1];
      expect(run, "the app never solved").toBeDefined();
      expect(run.plan, "the app's solve delivered nothing").not.toBeNull();
      const { input, plan } = run;
      const stages = plan!.stages;
      expect(
        stages.some((s) => s.sol),
        "no stage solved",
      ).toBe(true);

      const craft = craftOf(stages, input, c.name, "the fixture");
      expect(checkCraft(craft)).toEqual([]);
      const text = writeCraft(craft);
      const back = readCraft(text);
      expect(back).toEqual(craft);
      /* And it is the same rocket: the bill of the craft read back equals
         the plan's, stage by stage. */
      expect(billOfCraft(back)).toEqual(billOfPlan(stages));
    },
    600_000,
  );
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { Plan, PlanInput, PlanOpts } from "../src/core/plan.js";

/* The Download .craft button hands the reader the file the adapter writes
   for the rocket on screen — not a stale one, and with the notes a reader
   needs beside it. jsdom has no `URL.createObjectURL`, so the save is a
   module the test stands in for; where the browser cannot save, the text
   goes to the clipboard and the note says so. #466 */

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

const saved: Array<{ filename: string; text: string }> = [];
let canSave = true;
vi.mock("../src/ui/download.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/download.js")>();
  return {
    ...real,
    saveText: (filename: string, text: string) => {
      if (!canSave) return false;
      saved.push({ filename, text });
      return true;
    },
  };
});

const { render, cleanup } = await import("@testing-library/react");
const { click, settle } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");
const { readCraft, writeCraft } = await import("../src/craft/index.js");
const { craftOf } = await import("../src/core/craft.js");

const button = () =>
  document.querySelector<HTMLButtonElement>(
    'button[aria-label="Download the .craft file"]',
  );
const callouts = () =>
  Array.from(document.querySelectorAll('[role="status"], .callout')).map(
    (el) => el.textContent ?? "",
  );

describe("the Download .craft button", () => {
  it("saves the craft the adapter writes for the rocket on screen, and says where it goes", async () => {
    runs.length = 0;
    saved.length = 0;
    canSave = true;
    render(<KSPMissionPlanner />);
    await settle(300_000);
    const b = button();
    expect(b, "no download button").not.toBeNull();
    expect(b!.disabled).toBe(false);
    await click(b);
    await settle(30_000);

    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toMatch(/\.craft$/);
    const craft = readCraft(saved[0].text);
    const { plan, input } = runs[runs.length - 1];
    expect(plan).not.toBeNull();
    expect(craft.name).toBe(saved[0].filename.replace(/\.craft$/, ""));
    /* The very bytes the adapter writes for the plan the app last made —
       the default mission, to the Mun. */
    expect(saved[0].text).toBe(
      writeCraft(craftOf(plan!.stages, input, craft.name, "Mun")),
    );
    /* The notes: where the file goes, what to add, what it needs. */
    const said = document.body.textContent ?? "";
    expect(said).toMatch(/Ships\/VAB/);
    expect(said).toMatch(/payload on the top node/);
    expect(said).toMatch(/ReStock/);
    cleanup();
  }, 600_000);

  it("copies the text where the browser cannot save a file", async () => {
    runs.length = 0;
    saved.length = 0;
    canSave = false;
    const written: Array<string> = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (t: string) => void written.push(t) },
      configurable: true,
    });
    render(<KSPMissionPlanner />);
    await settle(300_000);
    await click(button());
    await settle(30_000);
    expect(saved).toHaveLength(0);
    expect(written).toHaveLength(1);
    expect(readCraft(written[0]).parts.length).toBeGreaterThan(1);
    expect(document.body.textContent ?? "").toMatch(/Copied/);
    cleanup();
    void callouts;
  }, 600_000);
});

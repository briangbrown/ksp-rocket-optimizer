// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/* The roster surviving a reload.

   It did not, on the deployed site, for as long as the planner has been
   deployed. Both the read and the write were guarded by `window.storage &&` —
   the Claude artifact API, which no browser has — so neither errored and
   neither did anything, and every load came up at the tier 5 default with the
   researched tree thrown away.

   jsdom has a real localStorage, which is what makes this reachable at all:
   set a roster, remount, assert it came back.

   The solver is mocked out. Nothing here depends on a design — the roster is
   entirely upstream of the solve — and a real one would cost seconds per mount
   for no added claim. */

vi.mock("../src/ui/solver-client.js", () => ({
  usingWorker: () => true,
  cancelSolve: () => {},
  solve: () => Promise.resolve(null),
}));

const { render, cleanup } = await import("@testing-library/react");
const { click, settle } = await import("./app-harness.js");
const { DATA } = await import("../src/core/catalogue.js");
const { withDeps } = await import("../src/core/tech.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

const KEY = "ksp-planner:roster";

const tier = (lvl: number) =>
  withDeps(
    DATA.nodes,
    new Set(
      Object.entries(DATA.nodes)
        .filter(([, v]) => v.lvl <= lvl)
        .map(([k]) => k),
    ),
  );

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

/* The collapsed tech header reads "Tech tree · N of M nodes · …", so the node
   count is on screen without opening the panel. */
function nodesShown() {
  for (const el of document.querySelectorAll(".eyebrow")) {
    const m = /Tech tree · (\d+) of/.exec(el.textContent ?? "");
    if (m) return Number(m[1]);
  }
  throw new Error("no tech tree header on screen");
}

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  );

/* Scoped to the row the "Unlock through tier:" label sits in — a bare `.chip`
   reading "3" also matches chips elsewhere in the controls. */
function tierChip(lvl: number) {
  const label = [...document.querySelectorAll("span")].find(
    (s) => (s.textContent ?? "").trim() === "Unlock through tier:",
  );
  const row = label && label.parentElement;
  if (!row) throw new Error("the tech panel is not open");
  return [...row.querySelectorAll("button.chip")].find(
    (b) => (b.textContent ?? "").trim() === String(lvl),
  );
}

async function mount() {
  render(<KSPMissionPlanner />);
  await settle(30_000);
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe("the roster in a browser", () => {
  it("is restored from localStorage on mount", async () => {
    const stored = tier(3);
    localStorage.setItem(
      KEY,
      JSON.stringify({
        unlocked: [...stored],
        excluded: ['48-7S "Spark" Liquid Fuel Engine'],
        expansions: { mh: true, rs: false },
        needGimbal: false,
      }),
    );

    await mount();

    /* Tier 3 is smaller than the tier 5 default, so this cannot pass by
       accident on an app that ignored the saved roster. */
    expect(stored.size).toBeLessThan(tier(5).size);
    expect(nodesShown()).toBe(stored.size);
    expect(document.body.textContent).toContain("1 part excluded");
  }, 60_000);

  it("writes the roster back when it changes", async () => {
    await mount();
    expect(saved(), "nothing was written once hydrated").not.toBeNull();

    await click(button("Tech tree ·"));
    await click(tierChip(9));

    expect(new Set(saved().unlocked)).toEqual(tier(9));
  }, 60_000);

  it("survives a remount", async () => {
    await mount();
    await click(button("Tech tree ·"));
    await click(tierChip(2));
    const before = nodesShown();
    cleanup();

    await mount();
    expect(nodesShown(), "the roster reverted to the default").toBe(before);
  }, 60_000);
});

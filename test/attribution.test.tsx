// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

/* Where the source is and what the terms are.

   The repository is public and the licence is All Rights Reserved, so the page
   has to say both — a working tool with no stated terms reads as open source
   whether or not it is (#52).

   The part worth pinning is not that the links exist but that they keep
   working. Everything inside <Solving> drops to 22% opacity, greys out and
   stops taking clicks while a solve runs, which at full tech is seconds at a
   time. So this drives the app into a solve that never finishes and checks the
   attribution is still readable and still clickable. */

vi.mock("../src/ui/solver-client.js", () => ({
  usingWorker: () => true,
  cancelSolve: () => {},
  /* Never resolves: the veil goes up and stays up. */
  solve: () => new Promise(() => {}),
}));

const { render, cleanup } = await import("@testing-library/react");
const { act } = await import("react");
const { solving } = await import("./app-harness.js");
const { default: KSPMissionPlanner } = await import("../src/ui/app.jsx");

import { must } from "./must.js";

const REPO = "https://github.com/briangbrown/ksp-rocket-optimizer";

const links = () => [...document.querySelectorAll("a")];

/* Anything an ancestor has switched off counts as switched off. */
function suppressed(el: Element) {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.style.pointerEvents === "none")
      return `pointer-events on ${n.tagName}`;
    if (n.style.opacity && Number(n.style.opacity) < 0.5)
      return `opacity ${n.style.opacity} on ${n.tagName}`;
  }
  return null;
}

afterEach(cleanup);

describe("attribution", () => {
  it("links the repository and the licence, and says which it is", async () => {
    render(<KSPMissionPlanner />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    const hrefs = links().map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(REPO);
    expect(hrefs).toContain(`${REPO}/blob/main/LICENSE`);

    /* Stated in the words, not left to whoever follows the link. */
    expect(document.body.textContent).toContain("all rights reserved");
  }, 60_000);

  it("stays readable and clickable while a solve runs", async () => {
    render(<KSPMissionPlanner />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(solving(), "the veil never went up, so this proves nothing").toBe(
      true,
    );

    for (const a of links()) {
      const why = suppressed(a);
      expect(
        why,
        `"${a.textContent.trim()}" is suppressed by ${why}`,
      ).toBeNull();
    }
  }, 60_000);

  it("is the last thing on the page", async () => {
    render(<KSPMissionPlanner />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    const last = must(links()[0].closest("div"), "the attribution's own div");
    expect(
      must(last.parentElement, "a parent to the attribution").lastElementChild,
      "something has been added below the attribution",
    ).toBe(last);
  }, 60_000);
});

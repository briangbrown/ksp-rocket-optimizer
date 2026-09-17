// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import KSPMissionPlanner from "../src/ui/app.jsx";
import { fromLink, toLink } from "../src/ui/link.js";
import { allByLabel, click, settle } from "./app-harness.js";

/* The design as a link, #140, from the page's side. A link that will not
   read is a callout over the default rocket and never a blank page; a link
   that reads arrives with the brief set; and the share button on the set
   brief puts the link on the clipboard and says so. The codec itself is
   test/link.test.ts, and what the seam is handed either way is
   test/seam-input.test.tsx. */

afterEach(() => {
  cleanup();
  location.hash = "";
});

const rocketNote = (severity: string) =>
  document.querySelector(`#rocket .callout[data-severity="${severity}"]`);
/* An `info` note here is a toast: `useNote` fades it on MOTION.linger, 2.4 s,
   and a full solve can outrun that — the whole solve happens inside the first
   `act`, so by the time anything looks, the toast has been and gone. Polling
   for it is therefore a race, and it is one that was lost on CI rather than
   here, on a machine slower than the one it was written on.

   Worse, it failed as the *wrong message* rather than a missing one: the build
   view's "no WebGL" callout shares the section and the severity, it is
   permanent in jsdom, and the query found that instead.

   So notes are recorded as they appear rather than read after the fact. What
   was on screen at any point is what the assertion asks about, and when it
   faded stops mattering. #223 is where the first version of this raced. */
const PERMANENT = /has no WebGL/;

function watchNotes() {
  const seen: Array<string> = [];
  const grab = () => {
    const t = rocketNote("info")?.textContent?.trim();
    if (t && !PERMANENT.test(t) && !seen.includes(t)) seen.push(t);
  };
  const mo = new MutationObserver(grab);
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return {
    /* Every toast that appeared, in order, joined for the assertion. */
    async settled() {
      for (let i = 0; i < 40; i++) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });
        grab();
        if (seen.length) break;
      }
      grab();
      mo.disconnect();
      return seen.join(" | ");
    },
  };
}

const briefFold = () =>
  [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
    b.querySelector(".label")?.textContent?.trim().startsWith("Mission"),
  );

describe("a design as a link", () => {
  it("says so where the link will not read, over the default rocket", async () => {
    location.hash = "#c=not-a-design";
    render(<KSPMissionPlanner />);
    await settle();
    const note = rocketNote("bad");
    expect(note?.textContent).toMatch(/did not carry a design/);
    expect(rocketNote("bad")?.textContent).not.toMatch(/No solution/);
    expect(
      document.querySelectorAll("#rocket .callout[data-severity='bad']").length,
    ).toBe(1);
    expect(document.querySelector("canvas, table")).toBeTruthy();
  }, 120_000);

  it("stays usable on a link whose fields are malformed", async () => {
    /* `{"splits":[1]}` threw a TypeError out of the parser on mount, so the
       app never became hydrated and sat under the solving veil for good, and
       a reload reproduced it. #174 */
    location.hash = await toLink(
      'KSP-PLANNER {"dest":"Mun","payload":2.5,"splits":[1],"cuts":["x"]}',
    );
    const notes = watchNotes();
    render(<KSPMissionPlanner />);
    expect(await notes.settled()).toMatch(/left at their defaults/);
    await settle();
    expect(document.querySelector("canvas, table")).toBeTruthy();
  }, 120_000);

  it("arrives with the brief set and the rocket in view", async () => {
    /* A link the app itself would write: the default mission with the
       payload changed, so that loading it is visible. */
    const text =
      "KSP-PLANNER " +
      JSON.stringify({ dest: "Minmus", payload: 4.5, tech: ["Start"] });
    location.hash = await toLink(text);
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const notes = watchNotes();
    render(<KSPMissionPlanner />);
    /* Before the solve returns: the brief is already set. */
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(briefFold()?.getAttribute("aria-expanded")).toBe("false");
    /* Most settings were left at their defaults, which the link is told. */
    expect(await notes.settled()).toMatch(/left at their defaults/);
    await settle();
    expect(briefFold()?.textContent).toMatch(/Minmus/);
    expect(briefFold()?.textContent).toMatch(/4\.5/);
    expect(scrolled).toHaveBeenCalled();
  }, 120_000);

  it("shares the design from the set brief", async () => {
    const written: Array<string> = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (s: string) => void written.push(s) },
      configurable: true,
    });
    render(<KSPMissionPlanner />);
    await settle();
    const share = allByLabel("Share the link");
    expect(share.length, "no share button on the set brief").toBe(1);
    await click(share[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(written.length).toBe(1);
    const url = new URL(written[0]);
    expect(url.origin + url.pathname).toBe(location.origin + location.pathname);
    const back = await fromLink(url.hash);
    expect(back && "text" in back && back.text).toMatch(/^KSP-PLANNER \{/);
    /* The burns control is in the link: two people opening it get one
       answer. #416 */
    expect(back && "text" in back && back.text).toMatch(/"regime":"standard"/);
    expect(rocketNote("good")?.textContent).toBe("Link copied.");
    /* The address bar carries the same link without asking. */
    expect(location.hash).toBe(url.hash);
  }, 120_000);

  it("keeps the share button while the brief is open", async () => {
    /* It was folded-only: opening the section to change the mission took
       it away, and a reader arriving with the brief open never saw it. #209 */
    const written: Array<string> = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (s: string) => void written.push(s) },
      configurable: true,
    });
    render(<KSPMissionPlanner />);
    await settle();
    await click(briefFold());
    expect(briefFold()?.getAttribute("aria-expanded")).toBe("true");
    const share = allByLabel("Share the link");
    expect(share.length, "no share button on the open brief").toBe(1);
    await click(share[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(written.length).toBe(1);
    expect(rocketNote("good")?.textContent).toBe("Link copied.");
  }, 120_000);
});

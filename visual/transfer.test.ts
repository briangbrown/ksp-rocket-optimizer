import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, open, serve } from "./browser.js";
import { toLink } from "../src/ui/link.js";
import type { Browser, Page } from "puppeteer";

/* The transfer drawings' names, measured (#200). Fixed offsets put
   "Kerbol", "Kerbin" and "Kerbin at launch" on top of one another for every
   pair whose inner orbit is small; the names are placed now, and this holds
   them apart: for a dozen pairs, every `<text>` box in the four drawings
   clear of every other, of every marker, and inside the frame. jsdom has no
   text metrics, so this is the browser's job. */

const PAIRS: ReadonlyArray<[string, string]> = [
  ["Kerbin", "Duna"],
  ["Kerbin", "Eve"],
  ["Kerbin", "Moho"],
  ["Kerbin", "Jool"],
  ["Kerbin", "Dres"],
  ["Kerbin", "Eeloo"],
  ["Eve", "Duna"],
  ["Moho", "Eeloo"],
  ["Duna", "Jool"],
  ["Eve", "Moho"],
  ["Dres", "Duna"],
  ["Jool", "Eeloo"],
];

const config = (from: string, to: string) =>
  "KSP-PLANNER " +
  JSON.stringify({
    from: { body: from, state: "low" },
    to: { body: to, state: "low" },
    returning: true,
    payload: 1,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    objective: "mass",
    boosters: true,
    chutes: true,
    needGimbal: true,
    planeNow: false,
    asparagus: false,
    maxAspect: 14,
    leaveAfter: 0,
    stay: 0,
    transfer: "best",
    expansions: { mh: false, rs: true },
    tech: [],
    excluded: [],
    cuts: null,
    splits: [],
  });

let ctx: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  ctx = await serve();
  ({ browser, page } = await open(ctx.url, DESKTOP));
});
afterAll(async () => {
  await browser?.close();
  await ctx?.close();
});

/* What is on top of what, in every drawing on the page. */
async function collisions() {
  return page.evaluate(() => {
    const out: Array<string> = [];
    const svgs = [
      ...document.querySelectorAll("#fly svg[role=img]"),
    ] as Array<SVGSVGElement>;
    type B = { x: number; y: number; w: number; h: number };
    const hit = (p: B, q: B) =>
      p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    svgs.forEach((svg, i) => {
      const texts = [...svg.querySelectorAll("text")].map((t) => {
        const b = (t as SVGTextElement).getBBox();
        return {
          t: t.textContent?.trim() ?? "",
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
        };
      });
      /* Markers: the small circles and the ship, not the body's own disc. */
      const marks = [...svg.querySelectorAll("circle, polygon")]
        .map((c) => (c as SVGGraphicsElement).getBBox())
        .filter((b) => b.width <= 20)
        .map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
      texts.forEach((a, m) => {
        texts.slice(m + 1).forEach((b) => {
          if (hit(a, b)) out.push(`drawing ${i}: "${a.t}" on "${b.t}"`);
        });
        if (marks.some((k) => hit(a, k)))
          out.push(`drawing ${i}: "${a.t}" on a marker`);
        if (a.x < 0 || a.y < 0 || a.x + a.w > 220 || a.y + a.h > 220)
          out.push(`drawing ${i}: "${a.t}" outside the frame`);
      });
    });
    return { drawings: svgs.length, out };
  });
}

describe("the transfer drawings", () => {
  it("keep every name clear of the others, the markers and the frame", async () => {
    const bad: Array<string> = [];
    for (const [from, to] of PAIRS) {
      const link = await toLink(config(from, to));
      await page.goto("about:blank");
      await page.goto(ctx.url + link, { waitUntil: "networkidle0" });
      await page.waitForFunction(
        () => !document.querySelector('[style*="pulse"]'),
        { timeout: 180_000, polling: 200 },
      );
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button[aria-expanded]")].find(
          (x) => (x.textContent ?? "").trim().startsWith("How to fly it"),
        );
        if (b && b.getAttribute("aria-expanded") !== "true")
          (b as HTMLElement).click();
      });
      await page.waitForFunction(
        () => document.querySelectorAll("#fly svg[role=img]").length >= 4,
        { timeout: 20_000, polling: 100 },
      );
      const c = await collisions();
      expect(c.drawings, `${from} → ${to} drew four drawings`).toBe(4);
      bad.push(...c.out.map((x) => `${from} → ${to}, ${x}`));
    }
    expect(bad).toEqual([]);
  }, 900_000);
});

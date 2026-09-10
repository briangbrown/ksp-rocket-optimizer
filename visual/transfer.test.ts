import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, PHONE, open, serve } from "./browser.js";
import { toLink } from "../src/ui/link.js";
import { LUT } from "../src/ui/cet.js";
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

/* To the transfer card, on whatever page is open. */
async function toFly(link: string) {
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
}

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
      await toFly(await toLink(config(from, to)));
      const c = await collisions();
      expect(c.drawings, `${from} → ${to} drew four drawings`).toBe(4);
      bad.push(...c.out.map((x) => `${from} → ${to}, ${x}`));
    }
    expect(bad).toEqual([]);
  }, 900_000);

  /* The Δv plot (#213): a canvas painted from the search's grid in CET-L08,
     blue where the window is, the scale bar climbing to four times the
     cheapest. jsdom paints no canvas, so the pixels are checked here. */
  it("paints the Δv plot, blue at the window, the scale climbing", async () => {
    await toFly(await toLink(config("Kerbin", "Duna")));
    const r = await page.evaluate(() => {
      const plots = [...document.querySelectorAll("#fly [data-plot]")];
      return plots.map((plot) => {
        const canvas = plot.querySelector("canvas") as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const { width, height } = canvas;
        const img = ctx.getImageData(0, 0, width, height).data;
        const seen = new Set<number>();
        let blank = 0;
        for (let k = 0; k < img.length; k += 4 * 97) {
          seen.add((img[k] << 16) | (img[k + 1] << 8) | img[k + 2]);
          if (img[k + 3] === 0) blank++;
        }
        const mark = plot.querySelector(
          "[data-mark=window]",
        ) as SVGGraphicsElement;
        const mb = mark.getBoundingClientRect(),
          cb = canvas.getBoundingClientRect();
        const px = Math.round(
            ((mb.left + mb.width / 2 - cb.left) * width) / cb.width,
          ),
          py = Math.round(
            ((mb.top + mb.height / 2 - cb.top) * height) / cb.height,
          );
        const k = (py * width + px) * 4;
        return {
          distinct: seen.size,
          blank,
          inside:
            mb.left >= cb.left - 1 &&
            mb.right <= cb.right + 1 &&
            mb.top >= cb.top - 1 &&
            mb.bottom <= cb.bottom + 1,
          marker: [img[k], img[k + 1], img[k + 2]],
          scale: [...plot.querySelectorAll("[data-scale]")].map((e) =>
            Number(e.getAttribute("data-scale")),
          ),
          css: { w: cb.width, h: cb.height, px: width, py: height },
        };
      });
    });
    expect(r.length).toBe(2);
    for (const plot of r) {
      expect(plot.blank).toBe(0);
      expect(plot.distinct).toBeGreaterThan(30);
      expect(plot.inside).toBe(true);
      /* The window sits in the cheapest cell, so the pixel under its
         marker is at the map's blue end: within the first dozen entries
         of 256. */
      let nearest = 0,
        d = Infinity;
      LUT.forEach((c, i) => {
        const dd = Math.hypot(
          c[0] - plot.marker[0],
          c[1] - plot.marker[1],
          c[2] - plot.marker[2],
        );
        if (dd < d) {
          d = dd;
          nearest = i;
        }
      });
      expect(d, `marker colour ${plot.marker} is not on the map`).toBeLessThan(
        6,
      );
      expect(nearest, `marker at ${nearest} of 255`).toBeLessThan(12);
      expect(plot.scale.length).toBe(5);
      for (let k = 1; k < 5; k++)
        expect(plot.scale[k]).toBeGreaterThan(plot.scale[k - 1]);
    }
  }, 300_000);

  it("fits the phone, and the page does not scroll sideways under it", async () => {
    const phone = await open(ctx.url, PHONE);
    const desk = page;
    try {
      page = phone.page;
      await toFly(await toLink(config("Kerbin", "Duna")));
      const r = await page.evaluate(() => {
        const plot = document.querySelector("#fly [data-plot]")!;
        const card = plot.closest("section") ?? document.body;
        const pb = plot.getBoundingClientRect(),
          cb = card.getBoundingClientRect();
        const canvas = plot.querySelector("canvas")!.getBoundingClientRect();
        const svg = plot.querySelector("svg")!.getBoundingClientRect();
        return {
          sideways:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
          plotW: pb.width,
          cardW: cb.width,
          canvasInside:
            canvas.left >= pb.left && canvas.right <= pb.right + 0.5,
          svgW: svg.width,
          ok: pb.right <= cb.right + 0.5 && pb.left >= cb.left - 0.5,
        };
      });
      expect(r.sideways).toBe(false);
      expect(r.ok, `plot ${r.plotW} wide in a card ${r.cardW}`).toBe(true);
      expect(r.canvasInside).toBe(true);
      expect(Math.abs(r.svgW - r.plotW)).toBeLessThan(1);
    } finally {
      page = desk;
      await phone.browser.close();
    }
  }, 300_000);
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, open, serve, settle } from "./browser.js";
import type { Browser, Page } from "puppeteer";

/* The staging steps as stops on the phone's scrubber (#210): each a 44 px
   target on the track with a short label under it, in place of the chips.
   jsdom has no WebGL and so no scrubber, which is why this is the browser's
   to check. */

let ctx: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  ctx = await serve();
  ({ browser, page } = await open(ctx.url, PHONE));
  await settle(page);
});
afterAll(async () => {
  await browser?.close();
  await ctx?.close();
});

const stops = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("button.stop")].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        name: b.getAttribute("aria-label") ?? "",
        current: b.getAttribute("aria-current") === "step",
        w: r.width,
        h: r.height,
        x: r.left,
        right: r.right,
      };
    }),
  );

describe("the stops on the phone's scrubber", () => {
  it("stand in for the chips, one 44 px target a step, inside the page", async () => {
    const s = await stops();
    /* The default Mun mission: a Skipper with two boosters, three Terriers,
       one Terrier — three stages since #347 gave the lander its own floor;
       four before. */
    expect(s.map((x) => x.name)).toEqual([
      "On the pad",
      "Boosters away · core burns on",
      "Stage 1 spent",
      "Stage 2 spent",
      "Payload alone",
    ]);
    for (const x of s) {
      expect(x.w, x.name).toBeGreaterThanOrEqual(44);
      expect(x.h, x.name).toBeGreaterThanOrEqual(44);
      expect(x.x, x.name).toBeGreaterThanOrEqual(0);
      expect(x.right, x.name).toBeLessThanOrEqual(PHONE.width);
    }
    expect(s.filter((x) => x.current).map((x) => x.name)).toEqual([
      "On the pad",
    ]);
    /* No chips under the drawings any more: the step is the stop's. */
    const chips = await page.evaluate(
      () =>
        [...document.querySelectorAll("button.chip")].filter((b) =>
          /^(On the pad|Stage \d spent|Payload alone)$/.test(
            b.textContent?.trim() ?? "",
          ),
        ).length,
    );
    expect(chips).toBe(0);
  });

  it("name themselves short underneath, and never on each other", async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll(".stop-label")].map((l) => {
        const r = l.getBoundingClientRect();
        return { t: l.textContent?.trim() ?? "", x: r.left, right: r.right };
      }),
    );
    expect(labels.map((l) => l.t)).toContain("Pad");
    expect(labels.map((l) => l.t)).toContain("Payload");
    const sorted = [...labels].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++)
      expect(
        sorted[i].x,
        `${sorted[i - 1].t} / ${sorted[i].t}`,
      ).toBeGreaterThanOrEqual(sorted[i - 1].right);
  });

  it("carry the handle one way through a play, and back", async () => {
    /* Sampled every few milliseconds through a play from the pad and a
       tap on the pad from the end: the handle never steps the wrong way,
       and neither does the lit stop. A frame's timestamp can precede the
       clock's start, and the first step of every separation went the
       wrong way by it before the progress was clamped. */
    const value = () =>
      page.evaluate(() =>
        Number(
          (document.querySelector('input[type="range"]') as HTMLInputElement)
            .value,
        ),
      );
    const litAt = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("button.stop")].findIndex(
          (b) => b.getAttribute("aria-current") === "step",
        ),
      );
    const run = async (ms: number) => {
      const vs: Array<number> = [],
        ls: Array<number> = [];
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        vs.push(await value());
        ls.push(await litAt());
        await new Promise((r) => setTimeout(r, 15));
      }
      const dir = Math.sign(vs[vs.length - 1] - vs[0]);
      const against = (xs: Array<number>) =>
        xs.filter((x, i) => i > 0 && Math.sign(x - xs[i - 1]) === -dir).length;
      return {
        from: vs[0],
        to: vs[vs.length - 1],
        handle: against(vs),
        lit: against(ls),
      };
    };
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.getAttribute("aria-label") === "Play the staging",
      ) as HTMLElement;
      b.click();
    });
    const fwd = await run(12_000);
    await settle(page);
    expect(fwd.to, "the play reached the end").toBeGreaterThan(fwd.from);
    expect(fwd.handle, "the handle went backwards during the play").toBe(0);
    expect(fwd.lit, "the lit stop went backwards during the play").toBe(0);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button.stop")].find(
        (x) => x.getAttribute("aria-label") === "On the pad",
      ) as HTMLElement;
      b.click();
    });
    const back = await run(8_000);
    await settle(page);
    expect(back.to, "the run reached the pad").toBeLessThan(back.from);
    expect(back.handle, "the handle went forwards on the way back").toBe(0);
    expect(back.lit, "the lit stop went forwards on the way back").toBe(0);
  }, 120_000);

  it("sit exactly under the handle at every step", async () => {
    /* The thumb is the stylesheet's, eighteen wide, so its centre runs from
       nine in at either end; the dots are placed on the same rule. Measured
       off the pixels: the amber column run of the thumb against the dot's
       box, at the pad, a middle step and the end. A native thumb's width is
       the platform's — larger on Android — and the dots sat off it there. */
    const centre = async () => {
      const inp = (await page.$('input[type="range"]'))!;
      const b64 = (await inp.screenshot({ encoding: "base64" })) as string;
      return page.evaluate(async (png: string) => {
        const el = document.querySelector(
          'input[type="range"]',
        ) as HTMLInputElement;
        const r = el.getBoundingClientRect();
        const img = new Image();
        img.src = "data:image/png;base64," + png;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const x2 = c.getContext("2d")!;
        x2.drawImage(img, 0, 0);
        const d = x2.getImageData(0, 0, c.width, c.height).data;
        const scale = c.width / r.width;
        const amber: Array<number> = [];
        for (let x = 0; x < c.width; x++) {
          let hit = 0;
          for (let y = 0; y < c.height; y++) {
            const i = (y * c.width + x) * 4;
            if (d[i] > 200 && d[i + 1] > 130 && d[i + 1] < 190 && d[i + 2] < 90)
              hit++;
          }
          if (hit >= 8 * scale) amber.push(x);
        }
        const lit = document.querySelector(
          '.stop-dot[data-on="1"]',
        ) as HTMLElement;
        const b = lit.getBoundingClientRect();
        return {
          thumb: amber.length
            ? (amber[0] + amber[amber.length - 1]) / 2 / scale
            : NaN,
          dot: b.left + b.width / 2 - r.left,
        };
      }, b64);
    };
    for (const label of ["On the pad", "Stage 2 spent", "Payload alone"]) {
      await page.evaluate((l: string) => {
        const b = [...document.querySelectorAll("button.stop")].find(
          (x) => x.getAttribute("aria-label") === l,
        ) as HTMLElement;
        b.click();
      }, label);
      await settle(page);
      const c = await centre();
      expect(
        Math.abs(c.thumb - c.dot),
        `${label}: thumb ${c.thumb}, dot ${c.dot}`,
      ).toBeLessThan(1.5);
    }
  }, 120_000);

  it("take the stepper to their step when tapped", async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button.stop")].find(
        (x) => x.getAttribute("aria-label") === "Stage 1 spent",
      ) as HTMLElement;
      b.click();
    });
    await settle(page);
    const s = await stops();
    expect(s.filter((x) => x.current).map((x) => x.name)).toEqual([
      "Stage 1 spent",
    ]);
    const caption = await page.evaluate(
      () =>
        document
          .querySelector("canvas")
          ?.parentElement?.getAttribute("aria-label") ??
        document.querySelector("[role=img]")?.getAttribute("aria-label") ??
        "",
    );
    expect(caption).toContain("Stage 1 spent");
  });
});

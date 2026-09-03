import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, PHONE, open, serve, settle } from "./browser.js";
import { focused, measure } from "./measure.js";
import type { Viewport } from "./browser.js";
import type { Measure } from "./measure.js";
import type { Page } from "puppeteer";

/* The UI's budgets, measured the way the solver's output is.

   Each number below is what the application measured on the day this suite
   was written — the audit in #127, at 390 px with touch and at 1280 px —
   and the assertion is that it has not grown. A pull request that improves
   one lowers it, in the same commit, so the improvement is held; a pull
   request that cannot say what it did to them is unverified. None of these
   is a target. The targets are in docs/design.md, and the budgets walk
   toward them one step at a time. #129

   Properties, not pixels: the screenshots are written for a person to look
   at in the CI artefact and are never compared, for the reason
   render.test.ts gives. */
const BUDGET = {
  phone: {
    height: 9240, // px, the whole page with the default mission solved: 9057, with 2% for a different Chrome's fonts
    words: 1752, // visible words on that page
    tinyText: 0, // text under 12 px
    smallBody: 81, // text under 13 px: the labels, at 12
    targets: 63, // pressable things under 44 × 44 — of 65
    sideways: 7, // things wider than their box: six sliders by 4 px, the parts table by 136
    unreachable: 0, // targets a keyboard cannot reach
    axe: 16, // nodes axe objects to, wcag2a + wcag2aa
  },
  desktop: {
    height: 4980, // 4884
    words: 1753,
    tinyText: 82, // the labels, at 11
    smallBody: 153, // labels and notes
    targets: 24, // under 24 × 24 — of 65
    sideways: 6,
    unreachable: 0,
    axe: 15,
  },
};

/* The bar a target has to clear on each screen: a thumb, and a pointer. */
const TARGET_PX = { phone: 44, desktop: 24 };

/* Where the screenshots go. Gitignored; the Visual job uploads it. */
const OUT = "visual/.out";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");

type Screen = keyof typeof BUDGET;
const SCREENS: ReadonlyArray<[Screen, Viewport]> = [
  ["phone", PHONE],
  ["desktop", DESKTOP],
];

/* One table line per offender, for the assertion message. */
const list = (
  rows: ReadonlyArray<{ text: string } & Record<string, unknown>>,
) =>
  rows
    .slice(0, 12)
    .map((r) =>
      Object.entries(r)
        .filter(([k]) => k !== "text" && k !== "k")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
        .concat("  ", JSON.stringify(r.text)),
    )
    .join("\n") + (rows.length > 12 ? `\n… and ${rows.length - 12} more` : "");

let ctx: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  ctx = await serve();
  mkdirSync(OUT, { recursive: true });
}, 300_000);

afterAll(async () => {
  await ctx?.close();
});

describe.each(SCREENS)("%s", (screen, viewport) => {
  const budget = BUDGET[screen];
  let page: Page;
  let m: Measure;

  /* Everything is measured once, up front, and written beside the
     screenshot as numbers, so a pull request can quote what it moved
     without reading it off a failure. The `it`s only compare. */
  let n: Record<string, number>;
  let under: Measure["targets"];
  let tiny: Measure["text"];
  let small: Measure["text"];
  let missed: Measure["targets"];
  let axe: Array<{ text: string; nodes: number; impact: string }>;

  beforeAll(async () => {
    ({ page } = await open(ctx.url, viewport));
    await settle(page);
    m = await page.evaluate(measure);
    await page.screenshot({ path: `${OUT}/${screen}.png`, fullPage: true });

    const px = TARGET_PX[screen];
    under = m.targets.filter((t) => t.w < px || t.h < px);
    tiny = m.text.filter((t) => t.px < 12);
    small = m.text.filter((t) => t.px < 13);

    /* Tab from the top until focus comes back round or stops moving. The
       cap is a guard against a focus trap, not a limit on the page. */
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const seen = new Set<number>();
    let last: number | null = null;
    for (let i = 0; i < m.targets.length * 2 + 50; i++) {
      await page.keyboard.press("Tab");
      const k = await page.evaluate(focused);
      if (k !== null) {
        if (seen.has(k) && k !== last) break;
        seen.add(k);
      }
      last = k;
    }
    const groups = new Set(
      m.targets.filter((t) => seen.has(t.k)).map((t) => t.group),
    );
    missed = m.targets.filter(
      (t) => !seen.has(t.k) && !(t.group !== null && groups.has(t.group)),
    );

    await page.addScriptTag({ path: AXE });
    axe = await page.evaluate(async () => {
      const a = (window as unknown as { axe: any }).axe;
      const r = await a.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      });
      return r.violations.map((v: any) => ({
        text: v.id,
        nodes: v.nodes.length,
        impact: v.impact,
      }));
    });

    n = {
      height: m.height,
      words: m.words,
      overflow: m.overflow,
      sideways: m.sideways.length,
      tinyText: tiny.length,
      smallBody: small.length,
      targets: under.length,
      of: m.targets.length,
      unreachable: missed.length,
      axe: axe.reduce((a, v) => a + v.nodes, 0),
    };
    writeFileSync(`${OUT}/${screen}.json`, JSON.stringify(n, null, 2));
  }, 300_000);

  afterAll(async () => {
    await page?.browser().close();
  });

  it("the page is no taller than budget", () => {
    expect(n.height, `page height ${n.height}px`).toBeLessThanOrEqual(
      budget.height,
    );
  });

  it("shows no more words than budget", () => {
    expect(n.words, `${n.words} visible words`).toBeLessThanOrEqual(
      budget.words,
    );
  });

  it("never scrolls sideways", () => {
    expect(n.overflow, `document ${n.overflow}px wider than the viewport`).toBe(
      0,
    );
    expect(
      n.sideways,
      `things wider than their box:\n${list(m.sideways)}`,
    ).toBeLessThanOrEqual(budget.sideways);
  });

  it("keeps text above the floor", () => {
    expect(n.tinyText, `text under 12 px:\n${list(tiny)}`).toBeLessThanOrEqual(
      budget.tinyText,
    );
    expect(
      n.smallBody,
      `text under 13 px:\n${list(small)}`,
    ).toBeLessThanOrEqual(budget.smallBody);
  });

  it(`keeps targets at ${TARGET_PX[screen]} px`, () => {
    expect(
      n.targets,
      `of ${n.of} targets, under ${TARGET_PX[screen]} px:\n${list(under)}`,
    ).toBeLessThanOrEqual(budget.targets);
  });

  it("can be reached from the keyboard", () => {
    expect(
      n.unreachable,
      `of ${n.of} targets, Tab never reaches:\n${list(missed)}`,
    ).toBeLessThanOrEqual(budget.unreachable);
  });

  it("clears axe within budget", () => {
    expect(n.axe, `axe:\n${list(axe)}`).toBeLessThanOrEqual(budget.axe);
  });
});

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, PHONE, open, scheme, serve, settle } from "./browser.js";
import { focused, measure } from "./measure.js";
import { MOTION } from "../src/ui/tokens.js";
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
    height: 4180, // px, the whole page with the default mission solved and the brief set: 4090 with the rocket as the hero (#138), with 2% for a different Chrome's fonts
    words: 633, // visible words on that page — the paragraphs are behind disclosures, #135
    tinyText: 0, // text under 12 px
    smallBody: 59, // text under 13 px: the labels, at 12
    targets: 0, // pressable things under 44 × 44 — of 25, #136
    sideways: 0, // things wider than their box
    unreachable: 0, // targets a keyboard cannot reach
    axe: 0, // nodes axe objects to, wcag2a + wcag2aa
    folded: 860, // px, every section folded: the brief, four lines and the footer — 844, which is the viewport
  },
  desktop: {
    height: 2610, // 2583 — the two-column shell (#137) with the rocket at six tenths of the window (#138)
    words: 634,
    tinyText: 60, // the labels, at 11
    smallBody: 87, // labels and notes
    targets: 0, // under 24 × 24 — of 25
    sideways: 0,
    unreachable: 0,
    axe: 0,
    folded: 920, // 900, the viewport
  },
};

/* The page's sections, in the order a reader uses them. On the phone the
   route comes last, after the answers (#134); on the desktop it sits under
   the brief in the left column, and it is moved there in the tree rather
   than by the stylesheet so that reading order and DOM order agree (#137). */
const ORDER = {
  phone: [
    "Brief",
    "Your rocket",
    "How to build it",
    "How to fly it",
    "Where it goes",
  ],
  desktop: [
    "Brief",
    "Where it goes",
    "Your rocket",
    "How to build it",
    "How to fly it",
  ],
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
  type Axe = Array<{ text: string; nodes: number; impact: string }>;
  let axe: Axe;
  let axeLight: Axe;

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
    const run = (): Promise<Axe> =>
      page.evaluate(async () => {
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
    axe = await run();

    /* The same page in the light theme, for the contrast check and for a
       person: the geometry is the same, the colours are not. #131 */
    await scheme(page, "light");
    await settle(page);
    await page.screenshot({
      path: `${OUT}/${screen}-light.png`,
      fullPage: true,
    });
    axeLight = await run();

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
    /* And what each number is made of, since a failure lists only the first
       twelve and a pass lists nothing: which targets, which text, which
       boxes. For a person working a budget down. */
    writeFileSync(
      `${OUT}/${screen}-detail.json`,
      JSON.stringify(
        { under, tiny, small, sideways: m.sideways, missed, axe, axeLight },
        null,
        2,
      ),
    );
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

  it("keeps a selected chip legible under the pointer", async () => {
    /* The hover rule outranked the selected rule and set the text to the
       colour the selection had set the ground to — paper on paper — so the
       chip just pressed went blank until the pointer left it, which on a
       phone is the next tap. Computed colours, because the CSSOM and jsdom
       cannot see which rule won. #146 */
    const el = await page.$('button.chip[data-on="1"]');
    if (!el) throw new Error("no selected chip on the page");
    await el.hover();
    /* The chip transitions its colours, so read them once it has arrived. */
    await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    const { fg, bg } = await el.evaluate((b) => {
      const s = getComputedStyle(b);
      return { fg: s.color, bg: s.backgroundColor };
    });
    expect(fg, `selected chip under the pointer: ${fg} on ${bg}`).not.toBe(bg);
    await page.mouse.move(0, 0);
  });

  it("names every icon button, and no two alike", async () => {
    /* An icon-only control is what its `aria-label` says it is — to a
       reader, and to `press()` in render.test.ts. Two with the same name
       would be the same control to both. #132 */
    const labels = await page.$$eval("button.iconbtn", (bs) =>
      bs.map((b) => b.getAttribute("aria-label") ?? ""),
    );
    expect(labels.length, "no icon buttons on the page").toBeGreaterThan(0);
    expect(
      labels.filter((l) => !l),
      "unnamed icon buttons",
    ).toEqual([]);
    expect(new Set(labels).size, `duplicates in ${labels.join(", ")}`).toBe(
      labels.length,
    );
  });

  it("opens every disclosure where it stands", async () => {
    /* Each `i` on the page — the slider hints, the objectives, the method,
       the callouts' second paragraphs — shows its words when pressed: a
       popover under it on desktop, a sheet on the phone. The brief is set
       and folded by now, so it is opened first, and its "More options" with
       it. Escape closes each before the next. #135 */
    const brief = await page.$('section button[aria-expanded="false"]');
    await brief?.click();
    await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    const more = await page.$$('section section button[aria-expanded="false"]');
    for (const b of more) await b.click();
    await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    const count = await page.$$eval(
      "button[aria-controls][aria-expanded]",
      (bs) => bs.length,
    );
    expect(count, "no disclosures on the page").toBeGreaterThanOrEqual(8);
    for (let i = 0; i < count; i++) {
      const b = (await page.$$("button[aria-controls][aria-expanded]"))[i];
      const name = await b.evaluate(
        (el) => el.getAttribute("aria-label") ?? el.textContent?.trim(),
      );
      await b.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await b.click();
      await new Promise((r) => setTimeout(r, MOTION.quick * 3));
      const shown = await b.evaluate((el) => {
        const r = document.getElementById(
          el.getAttribute("aria-controls") ?? "",
        );
        if (!r) return 0;
        const box = r.getBoundingClientRect();
        return box.width * box.height;
      });
      expect(shown, `${name}: nothing shown`).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    }
  });

  it("fills the screen with the build view when asked", async () => {
    /* The desktop's full screen: the rail on the left and the drawings at the
       size `panelSizes` gives the window, which the screenshot is for a
       person to look at — render.test.ts holds the arithmetic. The one
       thing measured here is that the drawings are inside the window and use
       most of its height, since a build view that fills the screen with air
       is the bug this step was for. #137 */
    if (screen !== "desktop") return;
    await page.click('[aria-label="Full screen"]');
    await settle(page);
    await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    await page.screenshot({ path: `${OUT}/${screen}-full.png` });
    const box = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      canvases: [...document.querySelectorAll("canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, right: r.right, bottom: r.bottom };
      }),
    }));
    expect(box.canvases.length).toBe(2);
    for (const c of box.canvases) {
      expect(c.right).toBeLessThanOrEqual(box.w + 1);
      expect(c.bottom).toBeLessThanOrEqual(box.h + 1);
    }
    const tallest = Math.max(...box.canvases.map((c) => c.h));
    expect(tallest, `elevation ${tallest} of ${box.h}px`).toBeGreaterThan(
      box.h * 0.6,
    );
    await page.keyboard.press("Escape");
    await settle(page);
  });

  it("puts the sections in reading order, and folds to a page of lines", async () => {
    /* Top-level sections only — the brief's own folds and the build view's
       are inside one. Then every fold closed, and the page measured again:
       what is left is the brief, one line a section, and the footer. Last,
       because it leaves the page folded. #134 */
    const tops = () =>
      [...document.querySelectorAll("section")].filter(
        (s) => s.parentElement?.closest("section") === null,
      );
    const headings = await page.evaluate(
      (f) =>
        (0, eval)(f)().map(
          (s: HTMLElement) =>
            document.getElementById(s.getAttribute("aria-labelledby") ?? "")
              ?.textContent ?? "",
        ),
      tops.toString(),
    );
    expect(headings).toEqual(ORDER[screen]);
    await page.evaluate((f) => {
      for (const s of (0, eval)(f)()) {
        const b = s.querySelector('button[aria-expanded="true"]');
        if (b instanceof HTMLElement) b.click();
      }
    }, tops.toString());
    /* React commits the folds after the clicks return, not during them. */
    await new Promise((r) => setTimeout(r, MOTION.quick * 3));
    const folded = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    writeFileSync(`${OUT}/${screen}-folded.txt`, `${folded}\n`);
    expect(folded, `folded page ${folded}px`).toBeLessThanOrEqual(
      budget.folded,
    );
  });

  it("reads in both themes", () => {
    /* Contrast is the one rule a theme can break on its own, so it is held at
       zero in each rather than folded into the budget above. */
    const contrast = (v: Axe) => v.filter((x) => x.text === "color-contrast");
    expect(
      contrast(axe).reduce((a, v) => a + v.nodes, 0),
      `dark:\n${list(contrast(axe))}`,
    ).toBe(0);
    expect(
      contrast(axeLight).reduce((a, v) => a + v.nodes, 0),
      `light:\n${list(contrast(axeLight))}`,
    ).toBe(0);
  });
});

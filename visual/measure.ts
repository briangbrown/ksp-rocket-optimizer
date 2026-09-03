/* The measurements the layout suite takes. `measure` runs inside the page —
   puppeteer serialises it — so it is one self-contained function: nothing it
   uses can live outside it, and the helpers are declared within. */

export type Box = {
  k: number;
  tag: string;
  text: string;
  w: number;
  h: number;
  group: number | null;
};
export type Small = { tag: string; text: string; px: number };
export type Measure = {
  height: number;
  overflow: number;
  sideways: Array<{ text: string; by: number }>;
  words: number;
  targets: Array<Box>;
  text: Array<Small>;
};

export const measure = (): Measure => {
  const name = (el: Element) => (el.textContent ?? "").trim().slice(0, 40);

  /* Whether an element takes part in layout and is on screen. */
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  /* Everything a finger can press: the form controls, and anything that asks
     for a pointer cursor whose parent does not — which is how a `div` with an
     `onClick` and a `span` in the tech tree are found, since neither is a
     button. A disabled control is not one: nothing presses it and the Tab
     order skips it. A label wrapping a checkbox is the checkbox's target, so
     the input inside it is the label's and is not counted again at 13 px. Each
     target is stamped with its index so the keyboard walk can name what it
     reached, and a chip inside a radiogroup carries the group's index too:
     a `Choice` puts one chip in the Tab order and the arrow keys reach the
     rest, so reaching the group is reaching the chip. */
  const isControl = (el: Element) =>
    /^(BUTTON|A|SELECT|TEXTAREA)$/.test(el.tagName) ||
    (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox");
  const targets: Array<Box> = [];
  const groups = Array.from(document.querySelectorAll("[role=radiogroup]"));
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const pointer =
      cs.cursor === "pointer" &&
      !(
        el.parentElement &&
        getComputedStyle(el.parentElement).cursor === "pointer"
      );
    if (!isControl(el) && !pointer) continue;
    if (!shown(el) || (el as HTMLButtonElement).disabled) continue;
    if (el.tagName === "INPUT" && el.closest("label")) continue;
    const r = el.getBoundingClientRect();
    el.setAttribute("data-k", String(targets.length));
    targets.push({
      k: targets.length,
      tag: el.tagName.toLowerCase(),
      text: name(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      group: (() => {
        const g = el.closest("[role=radiogroup]");
        return g ? groups.indexOf(g) : null;
      })(),
    });
  }

  /* Every element that owns text of its own, with the size it renders at. */
  const text: Array<Small> = [];
  for (const el of document.querySelectorAll("body *")) {
    if (/^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (!own || !shown(el)) continue;
    text.push({
      tag: el.tagName.toLowerCase(),
      text: own.slice(0, 40),
      px: parseFloat(getComputedStyle(el).fontSize),
    });
  }

  /* Anything wider than its own box is scrolling sideways or being cut off,
     and either is a phone layout that has not been done. A table inside an
     `overflow-x: auto` wrapper counts: the wrapper scrolls, the card does
     not, and the reader still cannot see the whole table. */
  const d = document.documentElement;
  const sideways = Array.from(document.querySelectorAll("body *"))
    .filter(shown)
    .filter((c) => c.scrollWidth > c.clientWidth + 1)
    .filter((c) => !c.querySelector("[data-sideways]"))
    .map((c) => {
      c.setAttribute("data-sideways", "");
      return { text: name(c), by: c.scrollWidth - c.clientWidth };
    });

  return {
    height: d.scrollHeight,
    overflow: d.scrollWidth - d.clientWidth,
    sideways,
    /* `innerText` is what is rendered — hidden text and `<style>` do not
       count — so this is the words a reader is shown. */
    words: (document.body.innerText.match(/\S+/g) ?? []).length,
    targets,
    text,
  };
};

/* Which target has focus, by the stamp `measure` left on it. A checkbox
   inside a label reports the label. Null when focus is nowhere useful. */
export const focused = (): number | null => {
  const el = document.activeElement?.closest("[data-k]");
  return el ? Number(el.getAttribute("data-k")) : null;
};

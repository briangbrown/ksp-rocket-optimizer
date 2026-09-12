# Accessibility as engineering

**Syllabus:** [L10](../../README.md#part-3--language-and-platform)

**Why it matters:** Accessibility here matters as engineering because each
of its parts is a mechanism with a rule about when it applies, not a
sentiment: a dialog that does not hold the keyboard's focus lets Tab wander
onto a page the dialog covers, a focus ring that shows for pointer clicks
is noise and one that hides for the keyboard is a lost reader, a bar hidden
with `aria-hidden` while its button stays focusable is a control a screen
reader cannot reach but Tab can, a solving state shown only by fading a
pill tells a reader nothing, and a button under 44 pixels is one a thumb
misses; and all five are measured by a suite in a real browser rather than
asserted, so a change that breaks one fails the build with the element
named.

**Before this:** [L7](../react/react-effects-refs-and-drafts.md), _React
effects, refs, and drafts_.

## A worked case

A small page in the visual suite's own Chromium: two buttons, 32 px and 44
px square, a `<nav>` hidden with `aria-hidden="true"` that still holds a
button, and another hidden with `visibility: hidden`. Ask it five
questions:

| Question                                   | Answer                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Focus ring after a mouse click on a button | `outline: none`                                                                                                      |
| Focus ring after a Tab                     | `outline: solid 2px`                                                                                                 |
| Where Tab goes, from the top               | first button, second button, then the button inside the `aria-hidden` nav; never the one inside `visibility: hidden` |
| What axe reports                           | `aria-hidden-focus (serious) on #nav1`                                                                               |
| Which button a thumb can hit               | 44 × 44 ok; 32 × 32 under 44                                                                                         |

The first two rows are one selector doing what the reader wants without
being told who they are: `:focus-visible` matches after a keyboard move and
not after a click, so the ring is there for the person who needs it to find
their place and absent for the person who just clicked and knows where they
are. The third and fourth rows are the trap the jump bar avoided:
`aria-hidden` takes an element out of the accessibility tree and leaves its
button in the Tab order, so a keyboard reader lands on a control a screen
reader cannot name, and axe calls it serious; `visibility: hidden` takes the
element out of both at once. The fifth is the phone's floor: 44 CSS pixels
is a fingertip, and the layout suite counts every pressable thing under it.

```js
// run at the repository root: node a11y-demo.cjs — the visual suite's Chromium and its axe
const puppeteer = require("puppeteer");
const { existsSync } = require("fs");
const exe =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "linux" && process.arch === "arm64"
    ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync)
    : undefined);
const html = `<!doctype html><style>body{margin:16px;font:14px sans-serif} button{font:inherit} :focus-visible{outline:2px solid #F5A623;outline-offset:2px}
.small{width:32px;height:32px} .big{width:44px;height:44px}</style>
<button id=b1 class=small aria-label="Fewer">−</button> <button id=b2 class=big aria-label="More">+</button>
<nav aria-hidden="true" id=nav1><button id=inside1>jump</button></nav>
<nav style="visibility:hidden" id=nav2><button id=inside2>jump</button></nav>`;
(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    args: ["--no-sandbox"],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 300 });
  await p.setContent(html);
  const ring = () =>
    p.evaluate(() => {
      const el = document.activeElement,
        cs = getComputedStyle(el);
      return `${el.id || el.tagName}: outline ${cs.outlineStyle} ${cs.outlineWidth}`;
    });
  await p.click("#b2");
  const afterClick = await ring();
  await p.keyboard.press("Tab");
  const afterTab = await ring();
  const order = [];
  await p.evaluate(() => document.activeElement.blur());
  for (let i = 0; i < 4; i++) {
    await p.keyboard.press("Tab");
    order.push(
      await p.evaluate(
        () => document.activeElement.id || document.activeElement.tagName,
      ),
    );
  }
  await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const axe = await p.evaluate(async () =>
    (await window.axe.run(document)).violations
      .filter(
        (v) => !/document-title|html-has-lang|landmark|heading-one/.test(v.id),
      ) // page-level rules this fragment does not try to meet
      .map(
        (v) =>
          `${v.id} (${v.impact}) on ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
  );
  const sizes = await p.evaluate(() =>
    ["b1", "b2"].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return `${id} ${Math.round(r.width)}×${Math.round(r.height)}: ${r.width < 44 || r.height < 44 ? "under 44" : "ok"}`;
    }),
  );
  console.log(
    [
      "after a mouse click: " + afterClick,
      "after Tab: " + afterTab,
      "Tab order: " + order.join(" → "),
      "axe: " + (axe.join("; ") || "none"),
      ...sizes,
    ].join("\n"),
  );
  await b.close();
})();
```

## The idea

A **focus trap** keeps keyboard focus inside an open dialog: when a sheet
or a full-screen overlay is up, Tab from its last control wraps to its
first, Shift-Tab from the first wraps to the last, Escape closes it, the
page behind does not scroll, and on close focus returns to where it came
from. Each clause is a mechanism. Wrapping is a `keydown` listener that
finds the focusable elements inside the panel and intercepts Tab at the
ends. The page not scrolling is `overflow: hidden` on the body for the
duration. Returning focus is recording `document.activeElement` when the
trap opens; and because that is read in an effect, after the commit, a
control that unmounts as the trap opens has already lost focus to the body
by then, so the trap takes a fallback that says where "back" is.

**`:focus-visible`** is the focus ring shown for keyboard users and not
pointer clicks: the browser matches it when focus arrived by a keyboard
move, or when the focused element is one that takes typed input, and does
not match after a mouse click on a button. It replaces the old choice
between a ring on everything, which annoys the pointer user, and `outline:
none`, which loses the keyboard user. The rule that follows is one ring, one
width, one colour, on every element that can take focus, buttons and fields
and the few plain elements with a tabindex, and a container that focus is
put into rather than reached opts out inline. A transition that fades the
ring in is a ring that arrives late, which is why the stylesheet's
transition names its colour properties and not `all`.

`aria-hidden` against `visibility` is the difference between two trees. The
accessibility tree is what a screen reader reads; the Tab order is what the
keyboard walks; `aria-hidden="true"` removes an element from the first and
not the second, so a focusable control inside it is reachable and unnamed,
and axe reports `aria-hidden-focus`. `visibility: hidden` removes it from
both and from the page, and it animates, so a bar that slides off screen
can hold its visibility until the slide has finished and then disappear
from every tree at once. `display: none` does the same without animating;
an element clipped to one pixel and kept on the page, the `sr-only` idiom,
does the reverse: gone from view, present to a screen reader.

A **live region** is an element whose changes screen readers announce. A
solving pill that fades in and out is a picture of a state; a reader is told
nothing by opacity. So the same state is written as text into an off-screen
element with `role="status"`, and a stepper's count into a span with
`aria-live="polite"`, and each change is spoken when the reader is not in
the middle of something else. `sr-only` is clipped rather than hidden,
because `display: none` is silent.

A **target** is the area a finger can hit: 44 CSS pixels square on a phone,
24 on a desktop with a pointer. A 44 px icon button in a 28 px row needs
room beside it; a number field is 16 px on the phone because iOS zooms into
anything smaller; and a control that is too small is not made larger by
being important.

```
   the two trees, and what each hiding does

                        in the accessibility tree?   in the Tab order?   on screen?
   aria-hidden="true"          no                          YES               yes      ← a control Tab reaches and a reader cannot name
   visibility: hidden          no                          no                no       ← out of all three, and it animates
   display: none               no                          no                no       ← the same, without a transition
   .sr-only (clipped)          YES                         yes               no       ← words for a reader and nobody else
```

What makes this engineering rather than a checklist is that every one of
these is measured. The layout suite opens the built page in a real browser
at a phone's width and a desktop's, and: measures every pressable thing and
counts those under the target size; presses Tab until focus comes back
round and records which targets were never reached and what ring each stop
drew, requiring one ring style across the whole walk; runs axe with every
rule on, in both themes, and counts the nodes it objects to; and holds each
count against a budget that is today's number, zero for targets, zero
unreachable, zero axe nodes. A change that adds a small button, an
unreachable control or a ring that differs fails with the element named,
and the numbers are written beside the screenshot so a pull request can
quote what it moved.

## In this codebase

`useTrap` in [`src/ui/components/primitives.tsx`](../../../../src/ui/components/primitives.tsx)
is the focus trap, and its shape is the four clauses:

```ts
useEffect(() => {
  if (!open) return;
  const was = document.activeElement; // where to go back to
  const had = document.body.style.overflow;
  document.body.style.overflow = "hidden"; // the page behind holds still
  panel.current?.focus();
  const onKey = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab" && panel.current) {
      /* wrap from the last focusable to the first, and back */
    }
  };
  window.addEventListener("keydown", onKey);
  return () => {
    /* remove, restore overflow, and focus `was` if it is still on the page, else back?.() */
  };
}, [open, onClose, panel, back]);
```

The ring is one line in [`src/ui/styles.ts`](../../../../src/ui/styles.ts),
`:focus-visible { outline:2px solid ${C.amber}; outline-offset:2px; }`, with
the comment "one ring, on anything that can take focus", and `.sr-only` a
few lines below it, clipped rather than hidden. `Solving` in
[`src/ui/components/solving.tsx`](../../../../src/ui/components/solving.tsx)
writes its status into an `sr-only` `role="status"` span beside the fading
pill; `Stepper` in the primitives puts `aria-live="polite"` on its count.
The jump bar in [`src/ui/components/jump.tsx`](../../../../src/ui/components/jump.tsx)
hides with `visibility` and a transition that holds it until the slide is
done, with the comment on why not `aria-hidden`. The measurement is
[`visual/layout.test.ts`](../../../../visual/layout.test.ts): `TARGET_PX`
at 44 for the phone and 24 for the desktop, the Tab walk that records each
stop's computed outline, axe run from `axe-core/axe.min.js` in both themes,
and the `BUDGET` table with the history of every number in its comments.
The rules are in [`.claude/rules/ui.md`](../../../../.claude/rules/ui.md):
_The jump bar hides with `visibility`, not `aria-hidden`_, _A control that
unmounts as it opens a trap has to say where focus goes back_, and the
target-size entries.

## What made it real

The demo's five rows are the measurement of the mechanisms; the suite's
budgets are the measurement of the page. Today the phone and the desktop
each hold zero targets under size of 26, zero unreachable by Tab, zero axe
nodes with every rule on in both themes, and one ring style across every
stop of the walk, which the suite requires to be more than ten stops so an
empty walk cannot pass.

Each rule has its finding. The jump bar was an `aria-hidden` nav with a
focusable button in it, an `aria-hidden-focus` failure until it hid with
`visibility`. The focus ring faded in over 120 ms with the browser's default
3 px ring visible first, because `transition` defaulted to every property,
and the layout suite read it mid-flight. The build view's _Full screen_
button unmounts as its overlay opens, so the trap recorded the body as the
place to return to and focus went nowhere on close, until the hook took its
fourth argument. And the solving state was a pill fading in and out and a
bar across the page, two pictures and no words, until #141 gave it a live
region.

## Where it breaks

- **Hiding with `aria-hidden` what still has a button in it.** The keyboard
  reaches a control the reader cannot name. `visibility: hidden` takes it
  out of both trees.
- **A ring on click, or no ring at all.** `:focus` shows it to the pointer
  user; `outline: none` hides it from the keyboard user. `:focus-visible`
  is the selector that knows the difference.
- **A trap that records focus after the control has gone.** The effect runs
  after the commit, and a button that unmounted has already dropped focus to
  the body. Tell the trap where back is.
- **A state shown only visually.** Opacity says nothing to a screen reader.
  Write the state as text into a live region, clipped rather than hidden.
- **Asserting instead of measuring.** A rule that says "44 px targets" is
  held by nothing; a suite that measures every target in a real browser and
  names the ones under is what keeps the count at zero.

## Try it

Run the script at the repository root and read the five lines. Then change
the first nav's `aria-hidden="true"` to `style="visibility:hidden"`: the
Tab order no longer reaches `inside1` and axe reports nothing. Then run
`npm run test:visual` and open `visual/.out/phone-detail.json`: `under`,
`missed` and `axe` are the lists the budgets count, and each names its
element.

## Check yourself

<details><summary>Why does the jump bar hide with `visibility: hidden` rather than `aria-hidden="true"`?</summary>

Because `aria-hidden` removes an element from the accessibility tree and
leaves its buttons in the Tab order, so a keyboard reader lands on a control
a screen reader cannot name, which axe reports as `aria-hidden-focus`.
`visibility: hidden` takes the bar out of the Tab order and the tree
together, and it transitions, so the slide can finish before it goes.

</details>

<details><summary>How does one CSS selector show a focus ring to keyboard users and not to pointer users?</summary>

`:focus-visible` is matched by the browser when focus arrived by keyboard,
or the element takes typed input, and is not matched after a mouse click on
a button. The demo shows `outline: none` after a click and `solid 2px` after
a Tab from the same stylesheet. One rule on `:focus-visible` replaces both a
ring on everything and a ring on nothing.

</details>

<details><summary>Why does `useTrap` take a function saying where focus should return, when it already records the focused element on open?</summary>

Because it records it in an effect, after the commit, and the control that
opened the trap may have unmounted in that same commit; the build view's
_Full screen_ button does. By the time the effect runs, focus has fallen to
the body and there is nothing to record, so the caller supplies a lookup
for the new button by name.

</details>

## Further reading

- WAI-ARIA Authoring Practices, the dialog (modal) pattern, for the focus
  trap's clauses and the return of focus.
- The CSS Selectors Level 4 specification on `:focus-visible`, and the MDN
  page's account of the heuristics browsers use.
- WCAG 2.2, success criterion 2.5.8 "Target Size (Minimum)", and the axe-core
  rule descriptions, `aria-hidden-focus` in particular.

## Key takeaway

Each accessibility feature is a mechanism with a rule: a trap wraps Tab and
returns focus to where it came from or where it is told, `:focus-visible`
shows one ring to the keyboard and none to the pointer, `visibility` hides
from both trees where `aria-hidden` hides from one, a live region says in
words what a fading pill only shows, and 44 pixels is a fingertip; and a
suite in a real browser counts every target, every Tab stop, every ring and
every axe node against a budget of zero, so none of it is asserted.

_As of f98d1b2._

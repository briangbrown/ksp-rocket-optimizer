# Layout: flex basis, sticky, and stacking contexts

**Syllabus:** [L9](../../README.md#part-3--language-and-platform)

**Why it matters:** These three CSS behaviours matter because the desktop's
two-column sheet, the phone's bottom bar and every overlay on the page
depend on them and each does something other than its name suggests:
`flex: 1` sets a basis of zero, so a row containing one never breaks and
the build section's tabs sat on top of its heading; a sticky box is its own
stacking context, so a tooltip inside the sticky brief drew under the
results column whatever its `z-index`; and `position: fixed` is fixed to
the nearest ancestor with a filter or an opacity, not to the viewport, so a
full-screen overlay rendered inside the solving veil re-anchored itself to
a column halfway through a solve.

**Before this:** [L8](../styling/inline-styles-the-cssom-and-design-tokens.md),
_Inline styles, the CSSOM, and design tokens_.

## A worked case

Three small pages rendered in headless Chromium at 600 pixels wide, each
measuring one behaviour.

A 300 px row that may wrap holds a heading 230 px wide and a button whose
text can wrap:

| The button's `flex` | Row breaks? | Button width | Button height | Where the button is         |
| ------------------- | ----------- | ------------ | ------------- | --------------------------- |
| `1`                 | no          | 71 px        | 57 px         | squeezed beside the heading |
| `1 1 auto`          | yes         | 300 px       | 27 px         | on its own line under it    |

Same row, same content; the shorthand `flex: 1` asked for no room and the
line never broke, so the button was crushed to 71 px and its text stacked
four lines high. With a basis of `auto` the button asked for its own width,
the two did not fit, and the row wrapped.

A sticky box 60 px tall holds a tooltip at `z-index: 999`; a sibling that
comes later in the document sits at `z-index: 1`, and the tooltip hangs
down over it. Ask the browser what is at a point inside the overlap:

| Point                    | Element on top                     |
| ------------------------ | ---------------------------------- |
| inside the tooltip's box | the later sibling, at `z-index: 1` |

The tooltip's 999 counts only against things inside the same sticky box.
Against the sibling, the sticky box competes as a whole, at its own
`z-index`, which is `auto`, and the sibling's 1 wins.

A `position: fixed` square sits inside a tall element with `filter:
grayscale(1)`. Scroll the page 300 px:

| Property of the ancestor | The fixed square's top after scrolling 300 px |
| ------------------------ | --------------------------------------------- |
| `filter: grayscale(1)`   | −16 px: it scrolled away with the page        |
| none                     | 0 px: pinned to the viewport                  |

The filter made the ancestor the square's containing block. "Fixed" now
means fixed relative to that element, which scrolls.

```js
// run at the repository root: node layout-demo.cjs — uses the visual suite's Chromium
const puppeteer = require("puppeteer");
const { existsSync } = require("fs");
const exe =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "linux" && process.arch === "arm64"
    ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync)
    : undefined);
const html = `<!doctype html><style>body{margin:0;font:14px sans-serif}
.row{display:flex;flex-wrap:wrap;width:300px;border:1px solid #888;margin:8px 0} .row h2{margin:0;padding:4px;white-space:nowrap}
.a{flex:1} .b{flex:1 1 auto} .row button{padding:4px}
.stick{position:sticky;top:0;height:60px;background:#eee} .tip{position:absolute;left:20px;top:40px;width:200px;height:60px;background:gold;z-index:999}
.later{position:relative;height:60px;background:#88f;z-index:1}
.veil{filter:grayscale(1);height:400px} .fixed{position:fixed;top:0;left:0;width:50px;height:50px;background:red}</style>
<div class=row id=r1><h2>Rocket, the build view</h2><button class=a>Front elevation and plan</button></div>
<div class=row id=r2><h2>Rocket, the build view</h2><button class=b>Front elevation and plan</button></div>
<div style="height:20px"></div><div class=stick><div class=tip id=tip>tooltip z 999</div></div><div class=later id=later>later sibling z 1</div>
<div class=veil><div class=fixed id=fixed></div></div><div style="height:2000px"></div>`;
(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    args: ["--no-sandbox"],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 600, height: 500 });
  await p.setContent(html);
  console.log(
    await p.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      const rows = ["r1", "r2"].map((id) => {
        const row = box(id),
          btn = document.querySelector(`#${id} button`).getBoundingClientRect();
        return `${id}: button ${Math.round(btn.width)}×${Math.round(btn.height)}, breaks the row: ${btn.top - row.top > 5}`;
      });
      const tip = box("tip");
      const on = document.elementFromPoint(tip.left + 10, tip.bottom - 5).id;
      window.scrollTo(0, 300);
      return [
        ...rows,
        `inside the tooltip's box, on top: ${on}`,
        `fixed square's top after scrolling 300: ${Math.round(box("fixed").top)}`,
      ].join("\n");
    }),
  );
  await b.close();
})();
```

## The idea

**Flex basis** is the size a flex item starts from before it grows or
shrinks, and it is the part of the `flex` shorthand nobody writes. `flex: 1`
means `flex: 1 1 0%`: grow 1, shrink 1, basis zero. A flex line that may
wrap decides where to break on the items' bases, not on their content, so an
item with a basis of zero asks for no room at all, the line never breaks
because of it, and whatever room is left after the other items is what it
grows into. That is right for a spacer and wrong for a button with words in
it: the words wrap inside a crushed button rather than the button moving to
the next line. `flex: 1 1 auto` starts from the item's own width and wraps
when that does not fit. The build section's fold button sat on top of its
heading until it became `1 1 auto`, and the brief's summary inside it is
`contain: inline-size` so its words do not count towards the line either.

**Sticky** positioning scrolls with the page until it reaches an edge, then
holds; the brief on the desktop is sticky so it stays beside the results.
Two things about it are not in the name. A sticky box is a **stacking
context**: a group whose z-order is settled internally, so a `z-index`
inside it cannot rise above anything outside it; against the rest of the
page the box competes as one unit at its own `z-index`. The brief's chips
carry tooltips, and a tooltip reaching past the column's edge drew under
the results column, whatever its own z, until the sticky column was given
`Z.brief` of its own. And a sticky element taller than the viewport pinned
by its top keeps its foot out of reach for the length of the page; the
column is pinned by its foot instead, with a negative `top` computed from
its height and the window's, and holds when its last line is in view.

```
   flex basis                       stacking context                 fixed's containing block

   [heading 230][btn flex:1]        sticky box (z auto) ┐            .veil { filter: … }
    ↑ basis 0: asks for nothing,      tooltip z:999 ────┼── inside    └─ .fixed { position: fixed }
      crushed, never breaks           only               │               fixed to the veil, not the viewport;
   [heading 230]                    sibling z:1 ────────┘ wins          scrolls away with it
   [btn flex:1 1 auto  300      ]
    ↑ basis auto: its own width,
      so the line breaks
```

A **stacking context** is created by more than `z-index` on a positioned
element: `position: sticky` and `position: fixed` create one, and so do
`opacity` below 1, `filter`, `transform`, `contain`, `isolation` and
`will-change`. Two of those, `opacity` and `filter`, also change what
"fixed" is fixed to. A fixed element's containing block is normally the
viewport, which is why a solving pill stays put while the page scrolls;
inside an ancestor with a filter or a transform, the containing block
becomes that ancestor, and the element is fixed to it. The solving veil dims
its children to `opacity: .22` and `filter: grayscale(1)`, so a full-screen
overlay rendered inside it re-anchored itself to the results column halfway
through a solve. The build view's overlay therefore goes through a portal to
`document.body`, outside the veil, at a `z-index` below the solving pill,
which is fixed at 50 and outside the veil too, so a full-screen rocket about
to be replaced still says so.

One more thing "fixed" is not, on a phone: the top of the screen. An
on-screen keyboard shrinks the visual viewport, not the layout one, and the
browser scrolls the focused field up into what is left, so a fixed overlay
ends up above the visible area at the moment it is wanted. The pill
translates by `visualViewport.offsetTop`, and so does the set brief, which
is sticky rather than fixed but pinned to the same wrong top.

## In this codebase

The fold button in [`src/ui/components/primitives.tsx`](../../../../src/ui/components/primitives.tsx)
carries the basis rule as a comment on its own line:

```tsx
/* `1 1 auto`, not `1`: a basis of zero is what the shorthand gives, and
   a flex line wraps on the items' bases … */
flex: "1 1 auto",
```

with `contain: "inline-size"` on the summary inside it. The sticky brief in
[`src/ui/app.tsx`](../../../../src/ui/app.tsx) is `position: "sticky"`, its
`top` from `useStickyTop`, which measures the column through a callback ref
and returns `min(margin, window − height − margin)` so a tall column is
pinned by its foot, and `zIndex: Z.brief` with the comment "sticky is a
stacking context of its own, and the results come later." `Z` in
[`src/ui/tokens.ts`](../../../../src/ui/tokens.ts) is the stacking order
named: brief 10, jump 20, overlay 40, solving 50, sheet 60, popover 70, with
the note that the brief's entry exists because of the tooltip. `Solving` in
[`src/ui/components/solving.tsx`](../../../../src/ui/components/solving.tsx)
is the fixed pill, translated by the visual viewport's offset; the build
view's overlay in [`src/ui/components/build.tsx`](../../../../src/ui/components/build.tsx)
is `createPortal`ed to the body. The rules are in
[`.claude/rules/ui.md`](../../../../.claude/rules/ui.md): _`flex: 1` never
wraps_, _A sticky column taller than the viewport is pinned by its foot_,
_`position: fixed` is not the viewport inside the solving veil_, and
_`position: fixed` is not the top of the screen on a phone_.

## What made it real

The three tables above are the measurement, taken in the same Chromium the
visual suite uses: a `flex: 1` button crushed to 71 by 57 pixels beside its
heading against 300 by 27 on its own line with `1 1 auto`; a 999 that lost
to a 1; a fixed square 16 pixels off the top and scrolling after a 300 px
scroll because of one `filter` on an ancestor.

Each was found on the page first. The build section's tabs sat on top of its
heading (#136). The brief's tooltips drew under the results column (#184).
The full-screen overlay re-anchored to the results column during a solve,
and its chips came out in Times because a portal is a second root. The
layout suite is where these show: it renders the page at a phone's width
and a desktop's, holds the page height, the count of things wider than their
box, and every target's size, and takes a screenshot for a person to look
at, which is how a heading with a button on top of it is seen.

## Where it breaks

- **`flex: 1` on an item with content.** Basis zero; the line never breaks
  for it and the content is crushed. Spacers may be `flex: 1`; anything with
  words is `1 1 auto`, or the words are contained.
- **A `z-index` inside a sticky or fixed box.** It ranks only against its
  siblings in the box; the box ranks as a whole at its own z. Give the box
  the z it needs, from the `Z` scale.
- **`position: fixed` under an opacity or a filter.** The ancestor becomes
  the containing block and "fixed" scrolls with it. Portal the overlay out
  of the veil.
- **A sticky column pinned by its head.** Taller than the window, its foot
  is never reachable. Pin by the foot with a negative `top`.
- **Fixed to the layout viewport on a phone.** The keyboard shrinks the
  visual viewport and the browser scrolls the field up; a fixed bar is above
  the visible area. Translate by `visualViewport.offsetTop`.

## Try it

Run the script at the repository root and read the four lines. Then change
`.a{flex:1}` to `.a{flex:1 1 auto}` and both rows break; change `.veil`'s
`filter` to `opacity:.99` and the fixed square still scrolls away, because
opacity below 1 makes a containing block too; remove the filter and it
reads 0 after the scroll. Then give `.stick` a `z-index:2` and the tooltip
is on top, because the sticky box now outranks the sibling as a whole.

## Check yourself

<details><summary>Why did the fold button with `flex: 1` sit on top of its heading instead of wrapping under it?</summary>

Because `flex: 1` is `flex: 1 1 0%`, a basis of zero, and a flex line
breaks on the items' bases. The button asked for no room, so the line never
broke for it; it took whatever was left beside the heading and its text
wrapped inside. With `1 1 auto` its basis is its own width, the two did not
fit in the row, and it moved to the next line.

</details>

<details><summary>A tooltip inside the sticky brief has `z-index: 999`. Why did it draw under the results column?</summary>

Because a sticky box is a stacking context: z-indices inside it are settled
among themselves and the box competes with the rest of the page as one unit
at its own `z-index`, which was `auto`. The results column came later in the
document and won. Giving the brief `Z.brief` made the whole box, tooltips
included, rank above the column.

</details>

<details><summary>Why is the build view's full-screen overlay rendered through a portal to the body rather than in place?</summary>

Because in place it would be inside the solving veil, whose `opacity` and
`filter` make it the containing block for any fixed descendant, so the
overlay would be fixed to the veil and re-anchor to the results column
during a solve. Outside the veil, at `Z.overlay`, it is fixed to the
viewport and sits under the solving pill, which is outside the veil too.

</details>

## Further reading

- The CSS Flexible Box Layout specification, "Flex Base Size" and the
  line-breaking algorithm, for why wrapping consults bases.
- The CSS Positioned Layout specification, on sticky positioning and on the
  containing block of fixed elements, and the CSS Filter Effects
  specification's note that a filter establishes a containing block.
- The MDN reference "Stacking context", for the full list of properties
  that create one.

## Key takeaway

`flex: 1` is a basis of zero and a row never breaks for it, a sticky box is
a stacking context that ranks as a whole at its own `z-index`, and a fixed
element inside an ancestor with a filter or an opacity is fixed to that
ancestor rather than the viewport: three facts measured in the visual
suite's own browser, each behind a bug the page showed and a rule the code
now carries.

_As of c7156a5._

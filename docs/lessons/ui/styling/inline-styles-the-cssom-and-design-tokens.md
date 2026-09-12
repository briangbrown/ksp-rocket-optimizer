# Inline styles, the CSSOM, and design tokens

**Syllabus:** [L8](../../README.md#part-3--language-and-platform)

**Why it matters:** How the interface is styled matters because there is no
CSS file: one stylesheet string is generated from a table of tokens and
mounted once, and everything else is 268 `style={{}}` objects written by
script into the browser's style object model property by property; and that
model has rules a stylesheet author never meets, it silently discards a
value it cannot parse so a `NaN` width leaves no trace, and React diffs the
object property by property so a shorthand and its longhand in one object
can leave a padding at zero when one of them goes, so what can be styled at
all, and what a green test can see, follows from how the CSSOM takes what
it is given.

**Before this:** nothing.

## A worked case

Write four bad values into an element's style and read them back, then
watch React remove one property from a style object:

| Written                           | Read back |
| --------------------------------- | --------- |
| `el.style.width = "NaN%"`         | `""`      |
| `el.style.opacity = "NaN"`        | `""`      |
| `el.style.height = "undefinedpx"` | `""`      |
| `el.style.fontFamily = "NaN"`     | `"NaN"`   |

Three of the four vanish. The style object validates each value against the
property's grammar and discards what does not parse, so a width of `NaN%`,
which is what a division by zero somewhere upstream produces, is not a
visible error but an absent style; the element is laid out as if nothing had
been set. The fourth survives, because any string is a valid font family
name, which is why a `NaN` reaching `font-family` is the one case a text
scan of the page can catch.

Then React. Render `style={{ padding: 16, paddingTop: 4 }}` and the element
reads `padding: 4px 16px 16px`. Rerender with `style={{ padding: 16 }}`, the
longhand gone, and the element's `cssText` is `padding-right: 16px;
padding-bottom: 16px; padding-left: 16px;`: the top padding is zero. React
noticed that `paddingTop` left the object and cleared it, and did not notice
that `padding` should now cover it, because `padding` is unchanged and React
diffs property by property. The brief opened flush to its top edge that way.

```tsx
// @vitest-environment jsdom
import { it } from "vitest";
import { render } from "@testing-library/react";
it("what the CSSOM keeps, and what React clears", () => {
  const el = document.createElement("div");
  el.style.width = "NaN%";
  el.style.opacity = "NaN";
  el.style.height = "undefinedpx";
  el.style.fontFamily = "NaN";
  console.log(
    JSON.stringify([
      el.style.width,
      el.style.opacity,
      el.style.height,
      el.style.fontFamily,
    ]),
  ); // ["","","","NaN"]
  const { container, rerender } = render(
    <div style={{ padding: 16, paddingTop: 4 }} />,
  );
  const d = container.firstChild as HTMLElement;
  console.log("before:", d.style.padding); // 4px 16px 16px
  rerender(<div style={{ padding: 16 }} />);
  console.log("after:", d.style.cssText); // padding-right: 16px; padding-bottom: 16px; padding-left: 16px;  — no top
});
```

Save it as `test/cssom-try.test.tsx` and run
`npx vitest run test/cssom-try.test.tsx --reporter=verbose`.

## The idea

The **CSSOM** is the browser's object model of styles: every element has a
`style` object, and every property on it is written and read by script, one
at a time. React's `style={{}}` is nothing but writes into that object, and
so the object's rules are the rules of inline styling. The one that matters
most is validation on assignment. A stylesheet with a bad value is a file a
linter can read; a style object given a bad value keeps its previous value
and says nothing, and the value read back is the empty string. Numbers are
the usual source: `width: NaN%`, `opacity: NaN`, `height: undefinedpx` are
all a computation that went wrong and all vanish. Only string-valued
properties keep whatever they are given, which makes `font-family: NaN` the
type case of a bug that shows. This is the same in jsdom and in every real
browser, so no test that reads styles back can see a bad number in a CSS
value; the project's guidance says so plainly, and `fmt` turns every
non-finite number into an em-dash before it reaches the page for the same
reason.

A **design token** is a named value every component draws from: a colour,
a size, a radius, a z-order, a duration. The tokens here are one table,
`DARK`, of thirty-odd colours, each with a job and a contrast figure in the
comment, and a `LIGHT` table of the same names with different values; a
spacing scale on 4 px; two radii; six z-orders; three durations; and six
type roles. The application does not use the colour values directly. `C` is
the same table with every value replaced by `var(--name)`, a CSS custom
property, and the stylesheet defines the properties once for each theme, so
a theme change is the stylesheet's business and no component knows which
theme it is in. The exception is the drawing, whose shaders are handed
numbers and cannot resolve a `var()`; they take `palette(theme)` and are
rebuilt when it changes.

The type roles are the token idea applied to text. A component never sets a
font size; it names a role, `display`, `heading`, `label`, `body`, `figure`
or `note`, as a class, and the stylesheet, generated from the roles table,
gives each class its face, weight, tracking and line height, with the size
switching once at the 1024 px breakpoint. Fifty `note`s, twenty-five
`label`s, twelve `figure`s and twelve `body`s in the components, and no
`fontSize` anywhere: "thirteen font sizes and five jobs for one class is how
the refresh started."

```
   tokens.ts                     styles.ts (one string, mounted once)          a component
   ─────────                     ──────────────────────────────────           ───────────
   DARK.paper = "#E6EDF6"  ───►  :root { --paper:#E6EDF6; … }                 <span className="label">
   LIGHT.paper = "#0F1720" ───►  :root[data-theme=light] { --paper:… }          style={{ marginTop: SPACE.md,
   C.paper = "var(--paper)" ───────────────────────────────────────────►               color: C.paper }}
   TYPE.label = { size:[11,12], … } ─► .label { font-size:11px } @media(min-width:1024px){ .label{ font-size:12px } }
```

A **shorthand** is one property that sets several: `padding` sets four
longhands, `margin` four, `transition` several, `flex` three. A
**longhand** is one of the several. Two things about shorthands bite inline
styling in particular. The first is React's diff, above: a longhand that
leaves the object is cleared, and a shorthand that stayed is not re-applied,
so a shorthand and its longhand must never share a `style={{}}`, and where a
style overrides one side of a box the base sets the four longhands. The
second is a shorthand's defaults. `transition: 120ms` transitions every
property, which had the focus ring fading in from the browser's default over
the same 120 ms and arriving late on every chip; the stylesheet names the
four colour properties it means. `flex: 1` sets the basis to `0`, and a flex
line wraps on the items' bases, so a `flex: 1` item asks for no room and its
row never breaks, which is [L9](../../README.md#part-3--language-and-platform),
_Layout: flex basis, sticky, and stacking contexts_.

Why inline at all, rather than a stylesheet. The reference is one file of
tokens and one generated string; a component says what a thing is and what
token it uses, and the values live in one place. The cost is that the CSSOM
is the only arbiter of what a value means, and the two facts above are its
price.

## In this codebase

[`src/ui/tokens.ts`](../../../../src/ui/tokens.ts) is the table: `DARK` and
`LIGHT` with a job and a contrast ratio in every colour's comment, `C` as
custom-property references, `SPACE`, `RADIUS`, `Z`, `MOTION` and `TYPE`.
[`src/ui/styles.ts`](../../../../src/ui/styles.ts) writes the stylesheet
from them:

```ts
const vars = (pal: Palette, scheme: "dark" | "light") =>
  Object.entries(pal)
    .map(([k, v]) => `--${k}:${v};`)
    .join(" ") + ` color-scheme:${scheme};`;
const THEMES = `
:root { ${vars(PALETTE.dark, "dark")} }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${vars(PALETTE.light, "light")} } }
:root[data-theme="light"] { ${vars(PALETTE.light, "light")} }`;
const STYLES = `${THEMES} ${roles.map(roleBase).join("\n")} ${roles.map((n) => role(n, 0)).join("\n")}
@media (min-width: ${BREAK}px) { ${roles.map((n) => role(n, 1)).join("\n")} } …`;
```

and `EASE`, the transition that names its four properties, with the comment
on the focus ring that arrived late. [`src/ui/app.tsx`](../../../../src/ui/app.tsx)
mounts it once, `<style>{STYLES}</style>`, global from there so the build
view's portal, a second root, still finds `.chip`. The rules are in
[`.claude/rules/design.md`](../../../../.claude/rules/design.md), _A role,
not a size_ first, and in [`.claude/rules/ui.md`](../../../../.claude/rules/ui.md),
_A shorthand and its longhand never share a `style={{}}`_ and _`fmt` turns
every non-finite number into an em-dash before display_; `Section` sets its
four padding longhands for the first, and `test/brief.test.tsx` holds the
open brief's `paddingTop`. The project's `CLAUDE.md`, under what the checks
cannot reach, records the CSSOM fact: "No check can see a bad number in a
CSS value."

## What made it real

The brief opening flush to its top edge is the measurement for the diff:
`{ padding: 16, paddingTop: X }` rerendered as `{ padding: 16 }` left
`padding-top` at zero, and the snippet reproduces the `cssText` with three
sides and no top. The focus ring is the measurement for the shorthand's
defaults: with `transition: all` the ring faded in over 120 ms on every chip
and icon button, and the layout suite read it mid-flight.

The `NaN` fact was measured by forcing one: liftoff mass set to `NaN`
produced no textual trace on the page at all, because `fmt` made it an
em-dash and every numeric style it reached was discarded. That is why the
mission sweep keeps `solvability.txt`, a snapshot of whether each mission
solves, rather than trusting a text scan of the rendered page to notice a
design collapsing into a row of dashes.

The roles are counted by the layout suite, which holds the page's word
count, its type floor and the count of text under 13 px in a real browser
at a phone's width and a desktop's; a component that set its own size would
move those numbers, and the rule that it may not is what keeps them
meaningful.

## Where it breaks

- **A bad number in a style.** It is not an error; it is an absent style,
  in jsdom and in Chrome alike. Guard the arithmetic, format through `fmt`,
  and do not expect a test that reads styles back to see it.
- **A shorthand and its longhand in one object.** The longhand's removal is
  seen and the shorthand's coverage is not re-applied. Set the longhands
  where any side is ever overridden.
- **A shorthand's default.** `transition` means every property, `flex: 1`
  means basis 0, `margin: 0 auto` means four values. Name what is meant.
- **A colour or a size in a component.** It escapes the tokens, both
  themes and the contrast tables. Name a role or a token; the drawing is the
  one place that takes numbers, and it takes `palette(theme)`.
- **Styling the portal from the root.** A portal is a second root; `button
{ font-family: inherit }` reached the browser's default in the overlay and
  the chips came out in Times. `FONT` on both roots is the fix, and the
  stylesheet is global for the same reason.

## Try it

Run the test file above and read the two lines. Then change the rerender to
`style={{ paddingTop: 0, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 }}`,
the four longhands, and rerender from it to `{ padding: 16 }`: React clears
the four and sets the shorthand, and the top is 16. Then open the
application and, in the browser's element inspector, set a chip's `width` to
`NaN%` and read it back.

## Check yourself

<details><summary>Why can no test in the suite see `width: NaN%` on an element, in jsdom or in a real browser?</summary>

Because the style object validates on assignment and discards what does not
parse; the property reads back as the empty string and the element is laid
out as if nothing were set. Only string-valued properties keep an arbitrary
value, which is why `font-family: NaN` is the one such bug a text scan
catches, and why `fmt` makes every non-finite number an em-dash first.

</details>

<details><summary>Why did removing `paddingTop` from a style object leave the top padding at zero rather than at the shorthand's 16?</summary>

Because React diffs the object property by property: the longhand left, so
React cleared `padding-top`; the shorthand `padding` was unchanged, so React
did not write it again, and a cleared longhand is zero. A shorthand and its
longhand never share one style object; a base that is ever overridden on
one side sets the longhands.

</details>

<details><summary>How does a component take part in both themes without knowing which one it is in?</summary>

Through `C`, whose values are `var(--name)` references rather than colours.
The stylesheet defines the custom properties once per theme, selected by
`data-theme` on the root or the OS preference, so a theme change is a change
to the stylesheet and every component's `color: C.paper` resolves to the
right value without re-rendering. Only the shaders, which need numbers, take
`palette(theme)` and rebuild.

</details>

## Further reading

- The CSSOM specification, section on the `CSSStyleDeclaration` interface,
  for validation on set and what `cssText` contains.
- The React documentation on the `style` prop, for how the object is
  applied and diffed.
- The CSS Backgrounds and Borders and CSS Box Model specifications, for
  which properties are shorthands and what their omitted values default to.

## Key takeaway

Inline styling is writes into the browser's style object, so a value that
does not parse is silently absent and a bad number leaves no trace a test
can read, and React's property-by-property diff means a shorthand and its
longhand must never share one object; the tokens and the six type roles,
written once into a stylesheet as custom properties and classes, are what
let 268 style objects share one palette in two themes without a component
ever naming a colour or a size.

_As of 83ec53f._

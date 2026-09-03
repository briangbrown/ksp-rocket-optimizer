---
paths:
  - "src/ui/**"
---

# The application

Traps in the React layer: layout, overlays, and the difference between what a
control shows and what it committed.

- **A panel is never narrower than the label above it.** The elevation's header
  — the word and the `Iso` chip beside it — runs to about 110 px, and a column
  is as wide as the widest thing in it. Sizing the drawing below 110 widened
  the column anyway, so the arithmetic that laid the row out described a row
  narrower than the one on screen and the plan spilled three pixels past the
  card. `MIN_PANEL` in `src/ui/views.ts` is that floor, and it is a layout
  number rather than a drawing one: `fitOrtho` is happy to draw a pencil in a
  wide panel with air either side of it.

- **A ref that an effect installs stops working when the element moves.** The
  build view's drawing row is unmounted and rebuilt inside a portal every time
  full screen is toggled. An effect with an empty dependency list goes on
  observing the element that left, which reports a zero box — and both panels
  came out one pixel. A callback ref is called with the new element and with
  null on the way out, which is the shape this needs.

- **`position: fixed` is not the viewport inside the solving veil.** `Solving`
  drops its children to `opacity: .22` and `filter: grayscale(1)` while a solve
  runs, and either of those makes the wrapper the containing block for a fixed
  descendant. A full-screen overlay rendered inside it re-anchors itself to the
  results column halfway through a solve. The build view's goes through
  `createPortal` to `document.body` for that reason, and sits at a z-index
  below the app's own solving pill — which is fixed at 50 and outside the
  veil — so a full-screen rocket about to be replaced still says so.

  What a portal costs is that it is a second root. The type stack is set on the
  application's own root div, and `button { font-family: inherit }` in the
  style block therefore reaches the browser's default in anything portaled out
  of it — the chips in the overlay came out in Times. `FONT` in
  `src/ui/tokens.ts` exists so the two roots cannot disagree about it.

- **`fmt` turns every non-finite number into an em-dash before display.** A
  `NaN` travelling through any `Stat` is therefore invisible to a text scan —
  forcing liftoff mass to `NaN` produced no textual trace at all. What a reader
  would actually notice is the design collapsing into a row of dashes, which is
  why `solvability.txt` exists rather than the sweep relying on its own scan.

- **`position: fixed` is not the top of the screen on a phone.** An on-screen
  keyboard shrinks the visual viewport, not the layout one, and the browser
  scrolls the focused field up into what is left — so a fixed overlay ends up
  above the visible area at exactly the moment it is wanted. The solving pill
  translates by `visualViewport.offsetTop` for this reason, and so does the
  set brief, which is `sticky` rather than `fixed` but pinned to the same
  wrong top. `viewTop` in `app.tsx` is the one subscription both read.

- **The brief folds itself exactly once.** The first design that solves folds
  it; after that the reader owns it. That is a `touched` ref, set by opening
  the brief or by any control on it, and read by the solve effect — state
  would do, but a ref does not put "has the reader touched the form" into a
  dependency array that is about the mission. A test that reaches for a
  control on the brief has to open it first, which is what `openBrief` in the
  harness is for; opening counts as touching, so it then stays open.

- **`Sheet`'s `onClose` is an effect dependency.** The effect installs the
  Escape and Tab handling and moves focus into the panel; an inline arrow for
  `onClose` re-runs it every render, which re-focuses the panel on every
  keystroke inside it. Wrap it in `useCallback`, as `closeSetup` is.

- **Nothing interactive goes inside a `Section`'s fold button.** The header
  is a `<button>`, and a button inside a button is invalid HTML that axe
  flags as `nested-interactive` and a screen reader reads as one control.
  The `aside` slot is rendered beside the button for this reason, which is
  what lets the build section keep its tabs in the header.

- **The route starts folded.** It has a summary line and no cut, so a test
  that reaches for a scissor has to `openFold("Where it goes")` first, as
  the cut case in `resolve-wiring` does. Summaries show only while folded:
  to read one after opening a section, fold it again.

- **A portal is at the end of `body`.** The setup sheet's chips come after
  everything on the page in DOM order, so a test that finds "the button
  containing Light" now finds the brief's _Lightest_ first. Match exactly.

- **A text field renders its draft, not its value.** `Field` holds a draft
  string while focused so half-typed values are not fought. A typed number
  therefore looks accepted whether or not it ever reached state, so "the value
  updated" is not evidence that anything did — the slider moving is, because the
  range input renders the committed value. Two fixes were built on the wrong
  reading of this before the real cause turned up.

- **The roles carry their leading.** `body` is 1.5, `note` 1.45, `figure`
  1.4, where the inline sizes they replaced left the browser's `normal` — so
  moving a block of text onto a role makes it taller without making it
  bigger. Setting every role back to `normal` put the page 170 px _under_
  what it measured before the roles; the 400 px it gained were leading, not
  type. Do not reach for a `lineHeight` override to win a budget back: the
  leading is the design, and the budget is what moves.

- **A disclosure's `i` needs room beside it.** The glyph is a 44 px
  `IconButton` on the phone sitting in a 28 px row, and the 8 and 6 px it
  hangs over are a negative margin on the wrapper span, not the button — on
  the button the border box overflows the wrapper, and the layout suite
  reads any box with `scrollWidth > clientWidth` as the page scrolling
  sideways. On the wrapper it overflows into its neighbour, which therefore
  has to be room: `Field`'s label group is `flex: 1` for this, `Callout`
  puts `more` in a third grid column so the overhang lands in the padding,
  and a `Disclosure` dropped into a hugging container will show up in the
  `sideways` count as its own hidden text. A `caption`ed one has no negative
  margin at all.

- **`Choice`'s `hint` is a CSS tooltip, and only under a pointer.** It is
  `data-hint` rendered by `::after` under `@media (hover: hover)`, so it is
  neither in `innerText` nor in the phone's reach; the sentences it shows
  go in a `Disclosure` beside the group as well, which is what the render
  sweep and the phone read.

- **The phone's targets are the stylesheet's, not the components'.** A
  chip and anything with the `tap` class take `min-height: 44px` under the
  phone's media query and nothing above it; a fold's button and a link in
  running text get their 44 as padding a negative margin gives back, so the
  line they sit in is no taller. Setting a height on a control inline makes
  it that tall on desktop too, where the target is 24. A number field is
  16 px on the phone (`.field-in`) because iOS zooms into anything smaller
  on focus, and that is a size, not a role — the one place `font-size` is
  set outside `TYPE`. #136

- **`flex: 1` never wraps.** The shorthand's basis is `0`, and a flex line
  wraps on the items' bases, so a `flex: 1` item asks for no room and its
  row never breaks — the build section's tabs sat on top of its heading
  until the fold's button became `flex: 1 1 auto`. And the brief's summary
  is `contain: inline-size` inside that button, or its words would count
  towards the row and push the Δv aside under the heading. #136

- **The jump bar hides with `visibility`, not `aria-hidden`.** It is off
  screen until the reader scrolls past the header, and an `aria-hidden` nav
  with a focusable button in it is an axe failure (`aria-hidden-focus`).
  `visibility: hidden` takes it out of the Tab order and the accessibility
  tree together, and transitions with the slide.

- **The visual suite runs against `dist/`.** `npm run test:visual` builds
  first; running `vitest --config vitest.visual.config.js` by hand does not,
  and measures whatever was last built — a change that "had no effect" on a
  budget usually was not built.

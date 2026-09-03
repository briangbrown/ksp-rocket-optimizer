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
  below the app's own solving bar — which is fixed at 50 and outside the veil —
  so a full-screen rocket about to be replaced still says so.

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
  above the visible area at exactly the moment it is wanted. The solving bar
  translates by `visualViewport.offsetTop` for this reason.

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

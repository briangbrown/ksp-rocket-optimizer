# aria-hidden Hides From Readers, Not From the Keyboard

**Why it matters:** any control that slides off screen and back — a bottom bar,
a drawer, a toast with a button in it.

## The concept

`aria-hidden="true"` removes a subtree from the accessibility tree and nothing
else. Its buttons are still in the DOM's focus order, so a keyboard user can
Tab onto a control a screen reader says does not exist; focus lands and nothing
is announced. axe reports it as `aria-hidden-focus`. `opacity: 0` and a
`transform` that slides the element out of view leave it both focusable and
announced. `display: none` removes it from focus, from the tree and from paint
together, but cannot transition. `visibility: hidden` does the same three
things and _can_ transition — it is interpolated as a discrete step that stays
`visible` for the whole duration whenever either end is visible — so an element
can slide out while still visible and become hidden the instant the slide ends.

## In this codebase

`JumpBar` in `src/ui/components/jump.tsx` is a `<nav>` fixed to the phone's
bottom edge that shows once the page has scrolled past the header:

```tsx
transform: shown ? "none" : "translateY(100%)",
visibility: shown ? "visible" : "hidden",
transition: `transform ${MOTION.settle}ms ease-out, visibility ${MOTION.settle}ms`,
```

Off screen, its four section buttons and the arrow are out of the Tab order and
the accessibility tree together; on the way out the bar stays visible until the
slide has finished. The stylesheet's `.jump { display: none }` above the
breakpoint is a separate matter — the desktop has the page in view at once.

## What made it real

The layout suite runs axe at WCAG 2 A and AA on both screens and both themes,
and the count held at zero with the bar in the tree. An `aria-hidden` nav with
five focusable buttons is a failure of that check, which is what decided the
property; no other measurement was needed.

## Key takeaway

To take something out of reach, use `visibility: hidden` — `aria-hidden`
silences it for one audience and leaves it under the fingers of another.

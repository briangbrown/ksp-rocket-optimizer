# A Check Must Fail on the Fault First

**Why it matters:** any time a check is written after a fix, for a fault that
reached a person rather than a test.

## The concept

A check written beside its fix is only known to pass; nothing says it would have
failed. Run it against the build with the fault still in place before trusting
it. And when the reading is pixels, choose what to read by asking what the
broken and the fixed screen have in common. A ground colour is the wrong probe
whenever the thing hidden behind and the thing in front can share one; text is
the right probe, because glyphs change the pixels wherever they land. A line of
text has gaps, so demand that a fraction of the points change, not all of them.

## In this codebase

The desktop check in `visual/layout.test.ts`, _draws a hint from the brief over
the results column_, shows a tooltip where it crosses into the results column
and compares two screenshots at points along it. Headless Chrome answers
`hover: none` and will not emulate otherwise, so the test cannot fire the hint's
own hover rule; it adds a `[data-probe]` rule of its own that shows the same
`::after` box. A first version compared the sampled pixels against the hint's
background colour and passed with the fault in place: in the light theme the
hint and a card share a ground, so a pixel where the card was painted over the
hint read as the hint's colour anyway. The reading is now taken along the hint's
first line of text, hint shown against hint hidden.

## What made it real

Against the build without the column's `z-index` — the fault — the text reading
changed 0 of 16 points, where the colour reading had passed. With the fix it is
green at the quarter of points required. The phone's counterpart in the same
file needs no pixels: it taps an icon and reads its tooltip's `display` twice,
`block` at once and `none` after `MOTION.linger` and a `settle`.

## Key takeaway

A check earns its place by failing on the broken build; when it reads pixels,
read where the two states cannot agree.

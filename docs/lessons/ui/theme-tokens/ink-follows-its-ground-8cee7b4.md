# Ink Follows Its Ground, Not the Theme

**Why it matters:** whenever text or marks are drawn over something whose colour
does not come from the theme — a colour map, a photograph, a chart's painted
cells, a filled hue — in an interface that has a light and a dark mode.

## The concept

Theme tokens come in pairs. A foreground like `paper` and a background like
`panel` flip together, and the palette guarantees their contrast against each
other, not against anything else. Ink drawn over a ground that does not flip
breaks the pair: the ground stays dark in both themes, the ink follows the theme
and goes dark in one of them, and the mark disappears — in the theme that was
not open while it was being drawn. A mark's colour has to be chosen against what
is actually under it, so a design system needs a second pair, ink for dark
grounds and ink for light grounds, that is the same value in both palettes. And
once every mark takes that one invariant ink, colour can no longer tell two
marks apart; shape or line style has to.

## In this codebase

The Δv plot's ground is the CET-L08 colour map, whose cheap end is deep blue in
either theme. Its marks were `C.paper` for the window's crosshair and diamond
and `C.amber` for the reading, and in the light theme `paper` is `#0F1720`, so
the marker sat near-black on dark blue at exactly the cell the reader came to
find (#221). `src/ui/components/porkchop.tsx` now draws every mark over the
image in `MARK = C.onDark` with `MARK_SHADE = C.onLight` for haloes and the
hollow marker's fill — the pair `src/ui/tokens.ts` defines identically in both
palettes and that `inkOn` already uses for ink on a drawing's fill. The reading
crosshair gives up its amber and is told apart by `strokeDasharray` and its
hollow ring. `visual/transfer.test.ts` reads the marks in the dark theme,
switches with `scheme()`, and requires them equal and light.

## What made it real

With the fix reverted, the test failed on the light-theme pass with
`expected 'rgb(15, 23, 32)' to be 'rgb(230, 237, 246)'` — the light theme's
`paper` against the dark theme's, on a marker that has to sit on the same blue
in both. The layout suite's budgets did not move, since nothing changed size.

## Key takeaway

Choose a mark's colour against what it sits on; if the ground does not follow
the theme, neither may the ink — and then colour cannot be what tells two marks
apart.

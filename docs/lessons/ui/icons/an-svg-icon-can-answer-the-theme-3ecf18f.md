# An SVG Icon Is a Document, and Can Answer the Theme

**Why it matters:** any icon handed to a tab bar, a bookmark list or a home
screen — a ground you do not control, in a theme you do not know.

## The concept

A favicon that is a tile of your own background looks like yours on your own
page and like a dark blob on a light tab bar. An SVG icon is a whole SVG
document: it can carry a `<style>` with `@media (prefers-color-scheme: dark)`,
and a browser that takes SVG icons draws it for the OS's theme on the tab's own
ground, so the mark can be ink on a light bar and paper on a dark one with no
tile at all. The raster fallbacks cannot switch, so each freezes the answer for
where it lands: the small PNG for browsers that refuse SVG icons gets the
light-scheme drawing on transparency, since tab bars are light more often than
not; the home-screen icon keeps an opaque tile, because iOS composites a
transparent touch icon onto black. Rendering both rasters from the one SVG, with
the media feature emulated, keeps a single drawing.

## In this codebase

`public/favicon.svg` is the nut (#206): a hex stroked in ink, a rocket in a
deeper teal, and inside its `<style>` a dark-scheme rule that swaps the hex to
paper and the rocket to Kerbin's teal. `tools/favicon.mjs` renders the two PNGs
from it in headless Chromium with `emulateMediaFeatures` — light for
`favicon-32.png` on a transparent ground, dark for `apple-touch-icon.png` on an
ink tile — and `index.html` links all three. `WorksMark` in
`src/ui/components/primitives.tsx` redraws the same mark beside the name in the
header, at a size where it can be read, so the reader knows the tab by it.

## What made it real

Nothing was measured. The first icon sat on an ink tile and read as a dark blob
on a light tab bar; the fix rests on what each host does with transparency — a
browser draws an SVG icon in the OS's scheme, iOS paints black behind a
transparent touch icon — and on a look at the tab. The visual suite holds only
that the three files are served (`ctx.missed` stays empty); no check here can
see the tab bar or the home screen.

## Key takeaway

Let the vector icon answer the theme itself, and pick each raster fallback for
the ground it will actually sit on.

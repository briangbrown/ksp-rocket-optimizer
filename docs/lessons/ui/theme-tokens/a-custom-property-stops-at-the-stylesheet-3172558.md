# A Custom Property Stops at the Stylesheet

**Why it matters:** theming anything that draws outside CSS — WebGL, a canvas,
a contrast calculation — from tokens the rest of the page reads as `var(--x)`.

## The concept

Turning a palette into CSS custom properties makes theming free for everything
the cascade paints: swap the values on the root and every consumer re-themes
without a component re-rendering. But `var(--panel)` is a string only the
cascade can resolve. A shader uniform, a canvas fill, a WCAG luminance need the
number, and nothing in the stylesheet hands it to them. So the same token table
has two readers: the stylesheet, through the variable, and everything numeric,
through a resolver that takes the theme in force. And where numbers went in as
data, a theme change is a data change — not a repaint of what was built but a
rebuild of it.

## In this codebase

`C` in `src/ui/tokens.ts` is `var(--token)` for every key; `palette(theme)`
returns the hex table, `DARK` or `LIGHT`, and `themeNow()` reads `data-theme`
or `matchMedia`. Every material in `src/ui/components/shaders.ts` —
`goochMaterial`, `compositeMaterial`, `panelClear` — takes a `Palette`, and
`ThreeView` in `three-view.tsx` takes `theme` as a prop and lists it in the
build effect's dependencies, so a switch rebuilds the meshes as though the
rocket had changed. `edgeOf` and `hueFor` take the theme too, because they
compute with the number (#131; `.claude/rules/renderer.md`, _A theme change is
a rocket change_).

## What made it real

`visual/render.test.ts` presses _Light_ then _Dark_ and reads the elevation's
ground back from the canvas, expecting the theme's `panel` to the bit under
each and an outline in the theme's `paper` covering more than 0.2% of the
pixels. A material still holding the dark panel under the light theme fails the
first read. jsdom draws nothing and could not have seen any of it.

## Key takeaway

A `var()` is a promise only the cascade can keep; give everything that needs a
number its own resolver, and treat a theme change there as a change of data.

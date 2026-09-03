---
paths:
  - "src/ui/**"
---

# The design

`docs/design.md` is the reference: type roles, colour semantics for both
themes, the spacing and z scales, the component inventory, the icon table, the
accessibility bar. This file is the short form — what you must not do in
`src/ui/` without reading it.

- **A role, not a size.** Nothing in a component sets `fontSize`, `fontFamily`,
  `letterSpacing`, `borderRadius`, `zIndex` or a colour literal. It names a
  role (`display`, `heading`, `label`, `body`, `figure`, `note`) or a token
  from `tokens.ts`. Thirteen font sizes and five jobs for one class is how the
  refresh started.

- **One idiom per job.** A boolean is a `Toggle` and its label never changes.
  A choice is a `Choice`. A warning is a `Callout` with a severity and an
  icon. An explanation over a sentence is a `Disclosure`. If the thing you want
  is not in `primitives.tsx`, add it to the guide first, then to the file.

- **Colour is never the only carrier.** Every severity has its icon; a cut has
  its scissors; a selected chip inverts. Both themes have to pass the contrast
  bar in the guide's tables, and `dim` is at the floor on `panel2` in dark —
  do not put it on `ink`.

- **`title=` is not a tooltip.** It does not exist on touch and screen readers
  disagree about it. An icon-only control is an `IconButton` with an
  `aria-label` and the tooltip that component provides.

- **The phone first.** Lay it out at 390 px, 44 px targets, 13 px body floor,
  no horizontal overflow. A second column is earned at 1024, and nothing goes
  side by side below it.

- **The drawing takes its colours from the same tokens, but not the same
  way.** `C.panel` is the string `var(--panel)`, which a stylesheet resolves
  and a shader cannot. Anything that needs a number — `panelClear`, the fills,
  `edgeOf`, a luminance — takes `palette(theme)`, and a theme change is a
  rebuild of the scene — `.claude/rules/renderer.md` has the colour-space
  reason.

- **Budgets are measured, not asserted.** The layout suite holds page height,
  word count, target size, type floor and contrast. A PR that improves one
  lowers the number; a PR that cannot say what it did to them is unverified.

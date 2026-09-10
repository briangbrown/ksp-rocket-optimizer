# A Radiogroup Is One Tab Stop

**Why it matters:** building or auditing a keyboard-reach check over a page
that contains composite widgets — radiogroups, toolbars, tab lists, listboxes.

## The concept

The accessible pattern for a set of mutually exclusive options is a roving
tabindex: one member sits in the Tab order — the selected one, or the first
enabled — and the arrow keys move focus and selection within the group. Tab
reaches the group, not each option, by design; it is what keeps a page of forty
chips a handful of presses long. A reach check that walks Tab and expects to
land on every control will mark every unselected option unreachable, and what
it is really objecting to is the pattern working. The unit of reach is the
composite: a member counts as reached when its group was.

## In this codebase

`Choice` in `src/ui/components/primitives.tsx` renders a `role="radiogroup"`,
puts the tab stop on the chosen chip or the first live one, and moves by arrow
key in `onKey`. `measure()` in `visual/measure.ts` stamps each target with the
index of its enclosing radiogroup, and the walk in `visual/layout.test.ts`
treats a target as missed only when neither it nor its group took focus (#130).

## What made it real

Before the group rule every `Choice` on the page — profile, objective, staging
step, stage count — read as unreachable. With it, and the two picker `div`s and
two tech-tree `span`s turned into buttons, the count went 4 → 0 of 65 targets on
both screens, and held at 0 when #131 added a three-way theme `Choice`.

## Key takeaway

Tab reaches groups and arrows reach members; a check that counts members as Tab
stops is testing for a pattern nobody should build.

# Transition the Properties You Mean

**Why it matters:** any stylesheet with `transition: <duration>` on an
interactive control — the shorthand's default property is `all`.

## The concept

`transition: 120ms` sets `transition-property: all`, so every animatable
property a state change touches animates, including ones nobody thought of as
state: `outline-width`, `outline-color`, `outline-offset`. When a
`:focus-visible` rule sets a 2 px ring, the browser animates from whatever the
outline was to the ring over the duration, so the indicator arrives late and,
for a moment, wrong — and a user tabbing quickly never sees it settled. Name
the properties a state change is meant to animate — colours for a hover, a
transform for a slide — and the focus indicator is instant, because it was
never in the list.

## In this codebase

`.chip`, `.iconbtn`, `.disc-cap` and `a` in `src/ui/styles.ts` carried
`transition:${MOTION.quick}ms`. `EASE` now names `color`, `background-color`,
`border-color` and `text-decoration-color` at that duration and nothing else,
and the ring is one rule, `:focus-visible { outline: 2px solid amber }`, on
every element rather than on buttons and fields. #141

## What made it real

The layout suite's Tab walk in `visual/layout.test.ts` reads each stop's
computed `outline` the instant focus lands and holds all 26 stops to the same
`solid 2px`. Before `EASE`, chips and icon buttons read the browser's
`3px currentColor` — 120 ms into a transition nobody had written. The fix moved
no layout budget (desktop 2583 px / 634 words, phone 4090 / 633), since it
moved no layout.

## Key takeaway

A bare `transition: <time>` animates everything, focus ring included — name the
properties and the indicator is instant.

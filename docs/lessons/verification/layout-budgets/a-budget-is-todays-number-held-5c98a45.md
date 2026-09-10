# A Budget Is Today's Number, Held

**Why it matters:** whenever a suite should stop a quality from regressing —
page height, word count, target size, bundle size, warnings — and the code is
nowhere near the number it ought to reach.

## The concept

A target you cannot meet today is not something you can assert: the check is
red on the day it lands, and a check that is red for weeks gets skipped, then
deleted. A _budget_ set at today's measurement asserts `≤` and passes at once,
and from then on it catches every regression. The improvement is held by the
other half of the rule: the commit that improves a number lowers the budget to
match, so the ratchet turns one way and a later change cannot quietly spend
what was won. It works because the numbers are exact — slack only where the
measurement itself wobbles — and because they are properties a pull request can
quote, not pixels it can only match.

## In this codebase

`BUDGET` at the top of `visual/layout.test.ts` holds, per screen, the page
height, visible words, things wider than their box, text under 12 and 13 px,
targets under 44 px (phone) or 24 (desktop), targets Tab cannot reach, and axe
nodes. `measure()` in `visual/measure.ts` runs inside the page and produces
them; the `it`s only compare. Height carries 2% for another Chrome's font
rasterisation; everything else is exact. The real targets — 44 px, a 4,500 px
phone page — live in `docs/design.md`, and the budgets walk toward them one
commit at a time (#129; principle 8 of #127).

## What made it real

The day-one numbers were 7,441 px and 4,371 px tall, 1,754 words, 66 of 66
targets under 44 px on the phone, four unreachable, sixteen axe nodes.
Asserting the guide's targets would have failed all fourteen assertions before
the first step of the redesign began. Over the next six steps the phone height
went 7,441 → 9,057 — raised on purpose, with the reason in the commit — then
7,219, and `main` today holds 4,817. The suite also found two faults the day it
ran, six slider rows 4 px over their box and the parts table 136 px over on the
phone, and left both in the budget for the step that fixed them.

## Key takeaway

Assert what you measure today and lower it as you improve; a budget that starts
at the target is a test you will turn off.

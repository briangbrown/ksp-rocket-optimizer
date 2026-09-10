# Height Is Leading, Not Type

**Why it matters:** when a page grows after a typography change and the
instinct is to blame the font size.

## The concept

A block of text is lines × line-height. A larger font size lengthens each line
a little and wraps a few more; line-height multiplies every line the block has.
The browser's `normal` is about 1.2, and a reading role's 1.5 is a quarter more
height on every line of body text without one glyph getting larger. So a
migration that moves text onto roles carrying their own leading grows the page
even when no size changes, and the way to know which is which is an
experiment, not an argument: set every role's line-height to `normal`, measure
again, and whatever growth remains is size. The rest is leading you chose, and
a budget should move for it rather than a `lineHeight` override taking it back.

## In this codebase

`TYPE` in `src/ui/tokens.ts` gives every role a `line` — body 1.5, note 1.45,
figure 1.4 at that commit — and `src/ui/styles.ts` writes them into `.body`,
`.note` and `.figure`. The first commit of #130 kept today's sizes so the diff
would read as a move, and the page grew anyway; `.claude/rules/ui.md` keeps the
finding under _The roles carry their leading_.

## What made it real

The phone page measured 7,441 px on `main`. With every role at its old size and
line-height `normal` it measured 7,268 — 173 px _under_ `main`, the move having
tidied some slack. With the roles' leading it measured 7,864: nearly 600 px of
growth and none of it type. The flip to the guide's sizes then took it to 9,057
(desktop 4,371 → 4,884), with the budget raised and the reason written down;
the words came off in #133, 9,095 → 7,219.

## Key takeaway

When type grows the page, measure once with every line-height at `normal` —
what comes back is size, and the rest is leading you chose.

# Lazy Rules Need an Eager Index

**Why it matters:** whenever instructions for an agent — or any context loaded
on demand — are split so that most of them load only when a matching file is
opened.

## The concept

Loading a rule only when its file is opened is lazy loading, and it has lazy
loading's one gap: whatever is decided before the trigger fires is decided
without the thing. A plan for a change to the solver can be formed, and half
executed, before any solver file is read. The mitigation is the one every
lazy-loading scheme uses — keep the index eager and the content lazy. A short
table naming each rule file and what it covers costs a few lines in every
session and means the pointer is always in context even when the content is not.
It is a weaker guarantee than always-loaded, and it is the price of not paying
for the other four hundred lines every time. Note the trap on the way: an
`@path` import _looks_ like a split and is not one, because imports load at
launch — it moves the text without saving the context.

## In this codebase

`CLAUDE.md` was 612 lines against Anthropic's stated target of under 200, and
313 of them were one section of 42 traps, loaded into every session whether the
work was the ascent simulator or a CSS value. #116 moved every entry verbatim
into `.claude/rules/` under `paths:` frontmatter — `solver.md` for `src/core/**`
with 17, `renderer.md` for the build view and shaders with 16, `ui.md` with 6,
`part-data.md` with 1, and `verification.md` for `test/**` and `visual/**` — and
left a table at the top of `CLAUDE.md` naming each file and what it holds. Two
things the issue proposed were rejected. `@path` imports, for the reason above.
And a fourth phase splitting each rule from its rationale into a decision log:
its stated benefit was context cost, which the path scoping had already removed,
and the same issue listed keeping the _why_ beside the rule as a non-goal, since
a rule that says why is the kind that gets followed.

## What made it real

612 lines became 196, with all 42 entries present exactly once across the new
files — checked by matching their text mechanically, not by eye. Nothing here
measures whether the agent adheres better; that rests on Anthropic's guidance
that long instruction files reduce adherence, and on the observation that two
guarantees written in the old file had gone unenforced for weeks (#114, #116).
The gap the index mitigates is real and was not closed: a plan formed before
`src/core` is opened is still formed without the solver rules.

## Key takeaway

When instructions load on demand, a decision made before the file is opened is
made without them — keep a one-line index of every rule file in the part that
always loads.

# A Tap Leaves :hover Set

**Why it matters:** any hover style on a control that will also be used on a
touch screen, and especially one that also has a selected state.

## The concept

Two facts meet here. On a touch screen there is no pointer to move away, so a
tap sets `:hover` and it stays set until the next tap lands somewhere else — the
hover style becomes the resting look of whatever was pressed last. And a hover
rule and a state rule that set complementary properties are in a specificity
contest they were never designed for: `.chip:hover:not(:disabled)` is three
simple selectors to `.chip[data-on="1"]`'s two, so hover wins, and if hover sets
the text to the colour the state set the ground to, the selected chip under the
pointer is invisible. Fix both halves. Put hover behind `@media (hover: hover)`
so a device with nothing to hover with gets none of it, and make every
selected-state rule outrank hover by repeating it with `:hover`. Which rule won
is not something the CSSOM will tell you; read `getComputedStyle` in a real
browser, after the transition has finished.

## In this codebase

The `.chip` rules in `src/ui/styles.ts`: the hover rule is inside
`@media (hover: hover)`, and the selected rule is written as
`.chip[data-on="1"], .chip[data-on="1"]:hover`. `visual/layout.test.ts` hovers a
`button.chip[data-on="1"]` on each screen, waits `MOTION.quick × 3` for the
colours to arrive, and asserts the computed `color` differs from
`backgroundColor` (#146). `main` today gates the icon buttons' hover and their
tooltips the same way.

## What made it real

Before the fix the check read `rgb(230, 237, 246) on rgb(230, 237, 246)` on both
screens — paper on paper — and in the light theme the same two rules read as
dark on dark. On the phone that was the chip just tapped going blank until the
next tap. The layout budgets did not move.

## Key takeaway

Hover is a pointer's state, not a finger's: gate it behind `(hover: hover)`,
and make every selected-state rule outrank it or the two will paint the same
colour.

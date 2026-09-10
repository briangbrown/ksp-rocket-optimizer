# Automation Yields Once

**Why it matters:** any interface that reorganises itself on an event — folds a
form, dismisses a panel, scrolls to a result — while the reader may be using
it.

## The concept

An automatic change of layout is a convenience the first time and an
interruption every time after. The rule that resolves the two: the automation
acts until the reader has expressed intent, then never again — from that moment
the reader owns the thing. "Has the reader touched it" is a fact about the
session, not about the data being rendered, so it does not belong in state that
schedules renders or in the dependency array of the effect that does the real
work. A ref is the right shape: written by any interaction, read by the
automation, invisible to the renderer. And opening the thing counts as touching
it, or the next event folds what the reader just opened.

## In this codebase

The brief in `src/ui/app.tsx` opens as the form, and the solve effect folds it
when the first design solves — but only while `!touched.current`. The `touched`
ref is set by `edit`, which wraps every control on the brief, and by the
header's toggle; _Done_ folds it regardless. `test/brief.test.tsx` holds the
four rules: open on mount, folded by the first design, stays where the reader
put it across every re-solve, folds on _Done_ (#133; `.claude/rules/ui.md`,
_The brief folds itself exactly once_).

## What made it real

The fold is where the phone page went 9,095 → 7,219 px and 1,741 → 1,418 words;
the _once_ has no number. It was reasoned from the failure it prevents — a form
folding under someone mid-edit is worse than one that has to be closed — and
pinned in jsdom. The test harness felt the rule too: `openBrief()` has to
precede any test that reaches for a control on the brief, and because opening
counts as touching, the brief then stays open for the rest of that test.

## Key takeaway

Let an automatic layout change happen until the reader touches the thing, then
stop for good — and keep "touched" out of the state the render depends on.

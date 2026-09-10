# Two Readings That Agree Cannot Check the Rule

**Why it matters:** whenever a test holds two derivations of the same quantity to
each other — a count against a list, a total against its rows, a drawing against
a table — instead of to a fact.

## The concept

A consistency check between two readings catches the case where one of them
drifts. It is blind, by construction, to an error in the rule both readings
apply: if each reads the same field the same wrong way, they agree, and the
check passes with both wrong by the same amount. A third reading of the same
field does not close the gap. What closes it is pinning at least one reading to
an independent statement of the fact — the input that produced the quantity, or
a case where the right answer is known without computing it — so that the shared
misreading has something to disagree with.

## In this codebase

A stage whose joint is made by the engine plate above it buys no decoupler, and
`fitStructure` in `src/core/tanks.ts` says so with a fit of
`{ n: null, m: 0, qty: 0, viaPlateAbove: true }`. Three readers turned that zero
into a one. `eachRow` in `src/core/manifest.ts` had `qty || 1`, put there to
guard a division, which let a row with no part and no mass past the filter that
drops rows of quantity zero. `stageParts` in `src/core/performance.ts` had
`c.decoupler && c.decoupler.qty ? c.decoupler.qty : 1`, where zero is falsy and
falls to the one. `stageGeom` in `src/core/geometry.ts` tested `sol.decoupler ?`
and gave a fit with no part in it `heightOf`'s 0.15 m fallback, which reached
`stageSize` and the slenderness limit. `test/manifest.test.ts` holds
`manifestCount` to `stageParts`, and they agreed — both one too many. The new
case in `test/parts-order.test.tsx` starts from the fit itself and asserts
nothing listed, nothing counted, nothing drawn and no empty row in the rendered
table; on the old code it fails with `a decoupler is listed` and
`a row with no part in it`. The fix guards the division rather than the
number — `q ? m / q : 0` — so the zero is handed on as the zero it is.

## What made it real

12 of 81 design signatures moved, in exactly two fields: `parts` down by one on
9 lines, `ar` on 22 lines by at most 0.12. No `slim` flipped, no stage count
changed, and no engine, tank, mass, cost or score moved anywhere — no rocket was
different; two recorded numbers were wrong and are now right. Mass and cost were
already zero, so the totals hid it and only an empty row with 0.000 against it
gave it away. The mission sweep did not move at all, because it pins ReStock+
off and engine plates are ReStock+ parts; the one check that did reach the case
compared two readings of the same misread field, which is why it was green.

## Key takeaway

A check that two derivations agree cannot see a rule that is wrong in both — pin
one of them to the input that produced the number, or the shared misreading will
pass every time.

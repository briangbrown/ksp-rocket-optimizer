# Widen a Search Without Moving Its Answer

**Why it matters:** whenever a sampled search's span is extended and its
previous answers are pinned — by a snapshot, or by what readers have already
been shown.

## The concept

A sampled search's answer depends on exactly where the samples fell. Extend the
span by rescaling the step — `span / N` with a bigger span — and every sample
moves, so the answer moves with it even where the new region holds nothing
better: a different cell is now nearest the minimum, and the refinement starts
from a different place and ends at a different one. Keep the old lattice
instead. Derive the step from the old span and let the new span take more steps
of it, and compute each sample as `t0 + i * step` rather than by accumulation,
so the old samples are the same floating-point numbers, not merely close ones.
An unchanged snapshot is then proof that the extension added information
without changing the answer.

Two more things follow. A coarse grid's ranking is noisy at the percent level,
so a "better" cell in the new region is only claimed after it has been refined
and only past a threshold. And a search that now sees two answers should be
clear about their roles: report the one that was asked for, and offer the other
as information rather than silently substituting it.

## In this codebase

`search` in `src/core/transfer.ts` (#199). The span went from one synodic
period to two, and the window reported stayed the first — the one a reader
starting on that date can make. The step is the first period's, `first / NT`
with `NT = 48`, and `t = t0 + i * step`:

```ts
const first = 1.05 * synodic;
const tSpan = 2.05 * synodic;
const step = first / NT;
```

The loop keeps two best cells, `early` and `later`; `refine` — a 7 × 7 grid
about the best, shrinking, nine rounds — runs on `early` always and on `later`
only where its coarse total is under 98% of the refined first, and the result
rides on `Window.next` only if it is still under 98% after its own refinement.
The transfer card offers it with a chip that moves the brief's start date to
just before it, so the search then finds it as the first.

## What made it real

From a new save, Moho's first window is Y1 D97 at 5,124 m/s; the one
alexmoon's planner calls cheapest, Y1 D269, is offered at 144 m/s less. Eve
offers 181 m/s, Dres 443, Eeloo 80; Duna and Jool have nothing past two
percent. The design snapshot, mission sweep, routes table and solvability
snapshot did not move — every route is priced on the window it was — which is
what the unrescaled step was for.

## Key takeaway

Extend a search by adding steps to the lattice it already has, never by
rescaling the step, and let the unchanged snapshot prove the old answer is the
old answer.

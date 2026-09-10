# A Mission Is Two Symmetric Ends

**Why it matters:** when a form has grown a special case per feature — a
pseudo-destination here, a profile toggle there — and each is handled by its
own branch of the code.

## The concept

A destination, a profile, an origin and a return flag were four controls for
one question: from where, in what state, to where, in what state, and back?
Writing the model as two endpoints of the same type — a body and a state —
with a return meaning "back to the From end, state and all" turns every
special case into a value: "Low orbit" is To = the same body, low; a profile
is the To state. The payoff of a symmetric model is what the asymmetric one
could not express. A leg that exists only when both ends are described the
same way is a leg the special cases were quietly skipping.

## In this codebase

The old `buildRoute` in `src/core/orbits.ts` special-cased the
pseudo-destinations "Low orbit" and "Stationary orbit" and, for them, passed
`returning = false` whatever the toggle said — "the origin's own orbits never
had a return leg". `routeFor(from, to, …)` has no such case: a return trip
from Kerbin's surface to Kerbin's stationary orbit comes down from stationary
before it arrives. `app.tsx` holds `from` and `to` and nothing else about the
mission; `parseConfig` in `src/ui/config.ts` still reads `origin`, `dest` and
`profile` and maps them onto the ends through `endpointsOf`, so every link
shared before loads (#188). `possible(from, to)` is the one rule for which
pairs are missions, and the sentence a disabled chip carries.

## What made it real

The solvability snapshot's "Stationary orbit" row went from 29.9 t and two
stages to 50.6 t and three: the return trip the form had always shown ticked
now includes the descent from stationary orbit, which the old form never
charged. "Low orbit" did not move, because its return is the free aerobrake
every return gets. Design snapshot and mission sweep untouched,
`test/routes.test.ts` still holds all 5,904 old routes, and the layout
budgets held at both widths — the seven state chips replaced the three
profile chips and the origin fold.

## Key takeaway

When special cases become values of a symmetric model, the legs they were
skipping show up in the numbers — a heavier answer that was wrong before,
not wrong now.

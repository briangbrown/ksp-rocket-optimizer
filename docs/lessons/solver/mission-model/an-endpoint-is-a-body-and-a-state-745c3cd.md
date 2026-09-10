# An Endpoint Is a Body and a State

**Why it matters:** when a form has grown several controls that are really one
question, and some combinations of them mean nothing.

## The concept

A "profile" that is really an arrival state, a pseudo-destination that is really
"the same body, a different state", and an origin that is always a surface are
three encodings of one two-variable thing: an endpoint is a body and a state,
and a mission is two of them. Modelling it that way does two things. The space
becomes a finite cross product, so it can be walked exhaustively rather than
sampled. And the combinations that mean nothing become explicit refusals instead
of inputs that fall between the branches of code written for the ones that do —
the builder never sees a pair the filter has not allowed. Have the filter return
the reason rather than a boolean, and the sentence a disabled control shows, the
test's assertion and the builder's guard are one rule.

## In this codebase

`possible(from, to)` in `src/core/orbits.ts` returns `true` or a sentence —
_Jool has no surface to land on_, _Mun has no stationary orbit_, _That is where
the mission starts_ — and `routeFor` returns no legs for a pair it refuses. The
states are `surface | low | sync | flyby`, with the From end never a fly-by.
`test/routes.test.ts` walks every body against every body in every state: an
allowed pair must build finite legs, a refused pair must carry a reason and
build none. The old `buildRoute(dest, profile, …)` is kept as an adapter through
`endpointsOf`, mapping _Low orbit_ to the origin's low orbit, _Stationary orbit_
to its stationary one and `profile` to the To state.

## What made it real

17 bodies × 4 states at each end is 4,624 pairs, every one of them checked,
where the old form's three controls could not be enumerated without knowing
which combinations the UI happened to prevent. The pair the old model could not
refuse was the bug: `land` at Jool, which has no surface. The app forced that
profile to orbit, but `buildRoute` itself accepted it, took neither the landing
branch nor the orbit branch on the return, and came home from Jool orbit without
the escape burn of about 3,000 m/s. In the new model that pair is Jool's low
orbit, and the escape is charged. The other 5,844 of the 5,904 old routes are
unchanged.

## Key takeaway

Model a request as the cross product of its parts and refuse the meaningless
combinations with a reason at the door — the input a model cannot express is
the one its branches will silently mishandle.

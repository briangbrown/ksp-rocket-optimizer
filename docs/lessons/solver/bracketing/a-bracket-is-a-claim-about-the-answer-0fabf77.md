# A Bracket Is a Claim About the Answer

**Why it matters:** any one-dimensional minimisation seeded from a physical
guess — golden section, Brent, bisection — especially one run inside every cell
of a grid whose whole point is to price the cases the guess is not good for.

## The concept

A bracket is not a neutral starting point. Seeding a search at a Hohmann guess
and looking ±90° around it encodes the claim "the answer is near Hohmann". The
claim is true for the cells the guess was made for and false everywhere else,
and a bracketed minimiser does not report that it has been given the wrong
interval: it converges on whatever local minimum the interval contains and
returns it with the same confidence. When the range the answer can take spans
the whole domain, no fixed bracket is right. The remedy is to let the bracket
come from the data: a coarse scan of the entire domain, then a refinement
inside the winning interval. On a periodic domain the scan is cheap and the
alternative fails silently.

## In this codebase

`raiseCell` in `src/core/transfer.ts` (#223) prices one cell of a departure
from low orbit to the body's own moon by searching the burn's longitude on the
parking orbit, with a Lambert solve per candidate. The sweep from burn to
arrival runs from a few degrees on a fast flight to most of a turn on a slow
one, so the best longitude can be anywhere on the circle. The first cut seeded
half a turn back from the arrival and searched ±90°, which found the minimum
for near-Hohmann flight times and missed it for the rest. It now scans sixteen
points round the whole circle and runs twelve rounds of golden section inside
the best sixteenth.

## What made it real

Nothing was measured as a figure; what was observed was a picture. The Δv
plot's short-flight half came back painted as though no transfer existed there
— every cell in it had converged on a wrong local minimum inside its bracket,
and none had said so. With the scan in place the same cells priced normally,
and the window's figures landed on the community map: 856 and 280 m/s against
860 and 280 for the Mun.

## Key takeaway

A search bracket is a hypothesis about where the answer lies; when the answer
can be anywhere in the domain, scan the domain first and let the bracket come
from the scan.

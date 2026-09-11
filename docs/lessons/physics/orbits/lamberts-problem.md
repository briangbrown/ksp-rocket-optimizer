# Lambert's problem

**Syllabus:** [P21](../../README.md#part-1--physics)

**Why it matters:** Lambert's problem matters because a transfer window is
found by asking, for thousands of candidate departure dates and flight
times, what orbit about the Sun would carry a ship from where Kerbin is on
that date to where Duna will be after that flight, and how fast it would
have to leave and arrive; the Hohmann transfer of
[P17](hohmann-transfer-and-synodic-period.md) answers that for two circles
and a half-turn only, the real planets are on tilted ellipses at arbitrary
angles, and without a solver that answers the general question in under a
microsecond the porkchop plot could not be drawn at all, let alone redrawn
on every keystroke.

**Before this:** [P14](keplers-equation.md), _Kepler's equation: where a body
is at time t_, and [P15](orbital-elements-and-frames.md), _Orbital elements
and reference frames_.

## A worked case

The Duna window from a new save leaves at UT 4,972,697 s, Year 1 Day 231,
and flies for 5,844,838 s, 270.6 days. [Kepler's equation](keplers-equation.md)
says where the two planets are at those two moments:

| Body, when             | Distance from the Sun | Speed     | Position                                                        |
| ---------------------- | --------------------- | --------- | --------------------------------------------------------------- |
| Kerbin, at departure   | 13.600 Gm             | 9,285 m/s | in the ecliptic                                                 |
| Duna, 270.6 days later | 20.005 Gm             | 7,787 m/s | 170.2° round from Kerbin's position, 15.8 Mm above the ecliptic |

The question is: what orbit about the Sun passes through the first point at
the first moment and the second point at the second? Not a circle, not a
half-turn, not in one plane. The answer is an ellipse of semi-major axis
16.836 Gm and eccentricity 0.192, on which the ship leaves Kerbin's position
at 10,138 m/s and arrives at Duna's at 6,897 m/s. Check it against
[vis-viva](vis-viva-and-circularising.md): at 20.005 Gm on an ellipse of a =
16.836 Gm the speed is √(μ(2/r − 1/a)) = 6,897.27 m/s, which is the arrival
speed to the centimetre, and the angular momentum r × v is the same at both
ends.

Subtract the planets' own velocities and the two numbers the route needs
appear: 854 m/s relative to Kerbin on leaving, 891 m/s relative to Duna on
arriving, which [P18](ejection-energy-and-the-hyperbolic-leg.md) turns into
the ejection and capture burns. Compare the Hohmann: a half-turn, in the
plane, 302 days, leaving at 10,203 m/s. The real window is 30° short of a
half-turn, a month shorter, and tilted to reach a Duna that sits above the
plane, and every one of its numbers is different. There is no formula for
it; there is a solver.

Because the solver is in TypeScript, the snippet is a test file rather than
a plain script. Save it as `test/lambert-try.test.ts` and run it with
`npx vitest run test/lambert-try.test.ts --reporter=verbose` (the default
reporter hides console output):

```ts
import { it } from "vitest";
import { lambert } from "../src/core/lambert.js";
import { stateAt, sub, norm, elements } from "../src/core/kepler.js";
it("the Duna window's arc", () => {
  const m = elements("Kerbin").mu; // the Sun's μ, the parent of Kerbin's orbit
  const depart = 4_972_697,
    tof = 5_844_838;
  const s1 = stateAt("Kerbin", depart),
    s2 = stateAt("Duna", depart + tof);
  const l = lambert(m, s1.r, s2.r, tof)!;
  console.log(norm(l.v1), norm(l.v2)); // 10138 6897: leave and arrive, about the Sun
  console.log(norm(sub(l.v1, s1.v)), norm(sub(l.v2, s2.v))); // 854 891: relative to the planets
});
```

## The idea

**Lambert's problem** is: given two positions about a body and the time to
get from one to the other, find the orbit. It is the two-point boundary
problem of orbital mechanics. Kepler's equation goes forward, from an orbit
and a time to a position; Lambert's problem goes backward, from two positions
and a time to the orbit, and it is the harder direction.

The **time of flight** is the span between the two moments, and it is what
picks the orbit out. Through any two points about a focus there is a whole
family of conics: fast, nearly straight hyperbolas; a parabola; ellipses of
every size up to the one that takes the long way round. Each takes a
different time to travel the arc between the points, and for a single pass
the time increases smoothly as the orbit gets slower, so exactly one member
of the family fits a given time. Lambert's theorem, from 1761, is that the
time depends only on three numbers: the semi-major axis a, the sum of the two
distances r₁ + r₂, and the chord c between the two points. Not on the
eccentricity, not on where the focus sits. That is what makes the problem one
equation in one unknown.

```
              ● r₂ (Duna, at arrival)
            ╱ ·  ·  ·
      fast ╱      ·     ·  slow: a bigger, more swollen ellipse
   (hyperbola)     ·      ·   takes longer over the same arc
          ╱         ·      ·
         ╱   chord c ·      ·
        ╱             ·      ·
       ╱               ·     ·
      ╱      Sun ●      ·    ·
     ╱                   ·  ·
    ● r₁ (Kerbin, at departure)

   Every curve through r₁ and r₂ with the Sun at a focus is a candidate.
   The time of flight picks one.
```

**Izzo's method** is the modern way to solve that equation quickly, from a
2015 paper, _Revisiting Lambert's problem_. Its steps:

1. Reduce the geometry to two numbers. With s = (r₁ + r₂ + c)/2, the half
   perimeter of the triangle Sun, r₁, r₂, define λ = ±√(1 − c/s), which
   encodes the shape of the triangle, and T = √(2μ/s³) × tof, the time of
   flight made dimensionless. Every Lambert problem with the same λ and T
   has the same solution up to scale.
2. Parametrise the family by one variable x, related to the semi-major axis
   by a = s / (2(1 − x²)): x < 1 is an ellipse, x = 1 the parabola, x > 1 a
   hyperbola. The time of flight T(x) is a known, smooth, decreasing
   function on the single-revolution branch.
3. Guess x from two anchors that have closed forms: T₀, the time along the
   minimum-energy ellipse at x = 0, and T₁, the time along the parabola at x
   = 1. Where the wanted T falls relative to those two says roughly where x
   is.
4. Iterate with Householder's method, a cousin of [Newton's method](keplers-equation.md)
   that uses the first three derivatives of T(x) instead of the first one
   and so converges in three or four steps rather than a dozen.
5. Recover the two velocities from x by splitting each into a part along the
   radius and a part across it, with closed forms in λ, x and the geometry.

Older methods, Gauss's and Battin's among them, iterate on a different
variable and need more steps or more care near the parabola; Izzo's
contribution was choosing x so that T(x) is well behaved everywhere and the
initial guess lands close, so the solver is both fast and safe to call
thousands of times without supervision.

## In this codebase

[`src/core/lambert.ts`](../../../../src/core/lambert.ts) is the paper written
out, in three functions. `lambert` does steps 1, 2 and 5: the triangle, λ and
T, the plane of the transfer from r₁ × r₂, and at the end the velocities:

```ts
const s = (r1 + r2 + c) / 2;
let lambda = Math.sqrt(1 - c / s);
// ...
const T = Math.sqrt((2 * mu) / s ** 3) * tof;
const x = findX(T, lambda);
// ...
const vr1 = (gamma * (lambda * y - x - rho * (lambda * y + x))) / r1; // radial part at departure
const vt = gamma * sigma * (y + lambda * x); // the part across the radius, shared
```

`tofOf` is T(x), in three regimes because no one closed form keeps its digits
everywhere: Lagrange's form away from the parabola, Battin's series where x
is within a hundredth of 1, and a general expression between. `findX` is
steps 3 and 4, the initial guess and up to fifteen Householder steps that
stop when the correction is below 10⁻¹².

Two choices in `lambert` are about the plane rather than the arc. When the
two positions are exactly opposite each other, r₁ × r₂ is zero and the
transfer plane is undefined, so the code takes the ecliptic, where every
stock transfer very nearly lies. And when the two positions would make a
retrograde orbit about +z, the code flips λ and the tangential directions so
the solution returned is the prograde one, which is the one a launch from a
prograde parking orbit can reach.

The callers are in [`src/core/transfer.ts`](../../../../src/core/transfer.ts).
`price` solves one Lambert problem for the ballistic arc and one more for the
mid-course arc, whose arrival point is the target's projection into Kerbin's
plane ([P19](plane-change-and-inclination.md)); `raiseCell` solves one for the
climb out to a moon. A planetary window is a grid of 94 departure dates by 41
flight times, both arcs at each, then nine rounds of a 7 × 7 refinement:
about 8,600 Lambert solutions per window.

## What made it real

The solver is held against orbits whose velocities are already known. The
test "returns a Kepler orbit's own velocities between two of its points" in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) takes Eeloo, the
most eccentric planet, at two moments a third of a period apart and asks
Lambert for the orbit between them; the only orbit through two points of
Eeloo's orbit in Eeloo's own time is Eeloo's, and the solver's departure and
arrival velocities match the ephemeris to under a millimetre per second at
three different pairs of points. The next test puts the two points a
half-turn apart at Kerbin's and Duna's distances with the Hohmann's time of
flight, and the solver returns the Hohmann's 10,203 m/s.

Speed is the other measurement. Twenty thousand solutions of the Duna arc at
varying flight times take 9 ms, under half a microsecond each, and a whole
window search, some 8,600 solutions plus the ephemeris calls and the pricing
around them, takes about 15 ms. That is what lets the application search a
window on every change to the mission and draw the plot from the search's
own grid rather than a coarser one.

## Where it breaks

- **The half-turn.** Two positions on opposite sides of the Sun fix a line,
  not a plane, and the cross product that should give the plane is zero. The
  code substitutes the ecliptic. A true 180° transfer between tilted orbits
  would need a plane change of up to 90°, which is why real windows sit tens
  of degrees short of it.
- **The parabola.** At x = 1 the derivatives of T(x) are singular and the
  closed forms lose digits. `tofOf` switches to Battin's series within a
  hundredth of it, and `findX` nudges x off exactly 1 if a step lands there.
- **Going round more than once.** The single-revolution branch is the only
  one implemented. For times of flight longer than about one orbit there are
  also solutions that loop the Sun before arriving; the window search never
  asks for them, since it caps flight times at twice the Hohmann's.
- **Degenerate inputs.** Coincident positions, or a time of flight that is
  zero or negative, have no orbit, and `lambert` returns null rather than a
  number. The window search treats a null cell as unpriceable.
- **The wrong direction.** Lambert's problem has a prograde and a retrograde
  solution through the same two points. The code always returns the
  prograde one; a caller wanting the other has to ask a different question.

## Try it

Run the test file above, then change `tof` to `0.8 * 5_844_838` and, because
Duna moves, let `s2` follow it: the arrival point is now where Duna is 216
days out, and the arc to reach it leaves at 10,191 m/s, 909 m/s relative to
Kerbin, and arrives at 1,189 m/s relative to Duna. At `1.2 *` the figures are
921 and 1,034. The window search found the flight time between them, where
the two relative speeds together are least: that minimum, over both date and
time, is [P22](../../README.md#part-1--physics), _Transfer windows and the
porkchop plot_.

## Check yourself

<details><summary>Kepler's equation and Lambert's problem both relate orbits, positions and times. What is the difference in what each takes and gives?</summary>

Kepler's equation takes an orbit and a time and gives a position: forward.
Lambert's problem takes two positions and the time between them and gives
the orbit: backward. The forward problem is one transcendental equation in
one unknown per body; the backward one is a boundary problem, and it is
Lambert's theorem, that the time depends only on a, r₁ + r₂ and c, that
reduces it to one equation too.

</details>

<details><summary>Why does a time of flight pick out exactly one orbit through two given points?</summary>

Because through two points about a focus there is a one-parameter family of
conics, and along that family the time to travel between the points changes
monotonically for a single pass: fast hyperbolas take least, the
minimum-energy ellipse more, swollen ellipses more still. A monotonic
function takes each value once, so one time means one orbit. Solutions
that loop the Sun first belong to other branches, which the code does not
search.

</details>

<details><summary>The window search solves about 8,600 Lambert problems per window. What would change if each took a millisecond instead of half a microsecond?</summary>

A window would take about nine seconds instead of fifteen milliseconds, the
application could not re-search on every change to the mission, and the
porkchop plot could not be drawn from the search's own grid. The speed of the
solver is not a nicety; it is what makes the window a live answer rather
than a table.

</details>

## Further reading

- Dario Izzo, "Revisiting Lambert's problem", _Celestial Mechanics and
  Dynamical Astronomy_ 121 (2015), the paper the solver is written from.
- Richard Battin, _An Introduction to the Mathematics and Methods of
  Astrodynamics_, chapter on Lambert's problem, for the classical theory and
  the near-parabolic series.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the section on
  Lambert's problem in the chapter on preliminary orbit determination, for a
  gentler derivation with worked examples.

## Key takeaway

Lambert's problem is the orbit through two given positions in a given time,
and Lambert's theorem makes it one equation in one unknown; Izzo's choice of
that unknown and a third-order iteration from a good guess solve it in under
half a microsecond, which is what lets the window search price 8,600
candidate transfers in the time it takes to draw one frame.

_As of 2ecc64f._

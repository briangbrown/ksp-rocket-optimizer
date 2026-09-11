# The Hohmann transfer and the synodic period

**Syllabus:** [P17](../../README.md#part-1--physics)

**Why it matters:** The Hohmann transfer and the synodic period matter
because together they are the first answer to the two questions every
interplanetary leg asks, how much and when: the Hohmann transfer is the
cheapest two-burn route between two circular orbits and so the estimate every
leg starts from, and the synodic period is how long until the same departure
comes round again and so the span of departure dates every window search has
to scan; without the first the search has no flight-time axis, and without
the second it has no departure axis and no idea when to stop looking.

**Before this:** [P13](vis-viva-and-circularising.md), _Vis-viva, circular
speed, and circularising_, and
[P16](patched-conics-and-the-sphere-of-influence.md), _Patched conics and the
sphere of influence_.

## A worked case

Price a trip from Kerbin's orbit to Duna's, with a calculator, and then work
out when to leave.

Both planets ride nearly round orbits about the Sun. Kerbin is 13,599,840 km
out, Duna 20,726,155 km, and the Sun's gravitational parameter μ is
1.1723 × 10¹⁸ m³/s². [Vis-viva](vis-viva-and-circularising.md) gives the speed
at any point of any orbit from μ, the distance r and the semi-major axis a:
v² = μ(2/r − 1/a). Use it four times.

| Speed                                         | Where                                      | Value      |
| --------------------------------------------- | ------------------------------------------ | ---------- |
| Kerbin's orbital speed                        | circular at r = 13.60 Gm                   | 9,285 m/s  |
| Speed at the low end of the transfer ellipse  | r = 13.60 Gm on an ellipse of a = 17.16 Gm | 10,203 m/s |
| Speed at the high end of the transfer ellipse | r = 20.73 Gm on the same ellipse           | 6,695 m/s  |
| Duna's orbital speed                          | circular at r = 20.73 Gm                   | 7,521 m/s  |

The transfer ellipse is the one whose periapsis touches Kerbin's orbit and
whose apoapsis touches Duna's, so its semi-major axis is the average of the
two radii, 17.16 Gm. The first burn speeds the ship up from 9,285 to 10,203,
a gain of 918 m/s. The ship then coasts half an ellipse and arrives at Duna's
distance doing 6,695 while Duna does 7,521, so the second burn makes up 826
m/s. The two together, 1,744 m/s, are the price of the trip as seen from the
Sun, and the coast lasts half the ellipse's period: π√(a³/μ) = 302 days.

That is how much. Now when. The ship arrives at Duna's distance 180° round
the Sun from where it left, so Duna must be there when it arrives. In 302
days Duna, whose year is 801.6 days, moves 135.6°. Duna must therefore be
180 − 135.6 = 44.4° ahead of Kerbin at the moment of departure. On a new save
Duna is 135.5° ahead. Kerbin goes round in 426.1 days and Duna in 801.6, so
Kerbin gains on Duna at 360/426.1 − 360/801.6 = 0.396° a day, and closing the
gap from 135.5° to 44.4° takes 91.1/0.396 = 230 days. The first window is
Year 1, Day 231, and every launch-window tool for the game says the same.

After that the two planets are back in the same relative position every
360/0.396 = 909.5 days, two years and change. That is how often Duna comes
round.

```js
const G0 = 9.80665;
const mu = 1.74684656 * G0 * 261600000 ** 2; // the Sun
const r1 = 13599840256, // Kerbin
  r2 = 20726155264; // Duna
const a = (r1 + r2) / 2;
const v = (r, a) => Math.sqrt(mu * (2 / r - 1 / a));
const out = v(r1, a) - v(r1, r1), // 918: the burn that leaves
  back = v(r2, r2) - v(r2, a); // 826: the burn that arrives
const T = (a) => 2 * Math.PI * Math.sqrt(a ** 3 / mu),
  DAY = 21600;
const tof = T(a) / 2, // 302 days
  T1 = T(r1),
  T2 = T(r2);
const lead = 180 - (360 * tof) / T2; // 44.4°: how far ahead Duna must be
const synodic = 1 / Math.abs(1 / T1 - 1 / T2); // 909.5 days
const wait = ((135.5 - lead) / 360) * synodic; // 230 days from a new save
console.log(out, back, tof / DAY, lead, synodic / DAY, wait / DAY);
```

## The idea

A **Hohmann transfer** is the half-ellipse that touches two circular orbits
about the same body, its periapsis on the inner orbit and its apoapsis on the
outer, flown with one burn at each end. It is the cheapest way between two
circular orbits using two burns, and the reason is in where the burns are
made. At each end the ship's velocity and the orbit's velocity point the same
way, so every metre per second of burn goes into changing speed and none is
wasted turning. Any other ellipse that reaches from one orbit to the other
crosses at least one of them at an angle, and a burn that has to turn the
velocity as well as change its size costs more for the same result. Walter
Hohmann worked this out in 1925, three decades before anything flew.

```
                                ◆ burn 2: arrive at apoapsis, speed up to Duna's pace
                 .  .  .  .  ╱  .  .  .  .  .  .
             .             ╱                       .
          .              ╱                            .
        .              ╱        .  .  .  .              .
       .              │      .             .             .
      .               │     .     Sun ●     .             .
      .               │     .               .             .
       .              │      .             .             .
        .              ╲        .  .  .  .              .
          .              ╲            ╱               .
             .             ╲  ─  ─  ◆ burn 1: leave at periapsis, speed up onto the ellipse
                 .  .  .  .  .  .  .  .  .  .  .

      outer ring   Duna's orbit, radius r₂
      inner ring   Kerbin's orbit, radius r₁
      the arc      the transfer half-ellipse, a = (r₁ + r₂)/2, from burn 1 round to burn 2
```

The two burns come straight from vis-viva. With μ the central body's
gravitational parameter, r₁ and r₂ the two radii and a = (r₁ + r₂)/2 the
transfer ellipse's semi-major axis:

    Δv₁ = √(μ(2/r₁ − 1/a)) − √(μ/r₁)     leave the inner orbit
    Δv₂ = √(μ/r₂) − √(μ(2/r₂ − 1/a))     settle onto the outer one
    time of flight = π √(a³/μ)            half the ellipse's period

Going inward the same two numbers apply with the signs turned round: the
ship slows to drop its periapsis, then slows again at the bottom. The
formulas are symmetric in the two radii, which is why the code below computes
one function and takes absolute values.

Two things the Hohmann is not. It is not the cheapest route when the outer
radius is more than about 11.9 times the inner; past that a three-burn route
out to a very high apoapsis and back wins, but no two bodies in the game's
system are that far apart (Kerbin to Eeloo is 6.6 to 1), so the two-burn
answer is always the one wanted here. And it is not a burn a ship makes. The
918 m/s above is the change in the ship's speed about the Sun, taken after it
has climbed clear of Kerbin's gravity. A ship in low Kerbin orbit is deep in
Kerbin's well and must pay to climb out as well as to speed up; from 80 km
that burn is about 1,070 m/s, not 918. How the two numbers are related is
[P18](../../README.md#part-1--physics), _[Ejection: characteristic energy and
the hyperbolic leg](ejection-energy-and-the-hyperbolic-leg.md)_, and why the climb costs less than the sum of the parts
is [P20](../../README.md#part-1--physics), _The Oberth effect_.

The **synodic period** is how long until two bodies orbiting the same centre
return to the same relative position. Seen from the Sun, Kerbin goes round at
360°/T₁ a day and Duna at 360°/T₂, so the angle between them changes at the
difference of the two rates, and comes back to where it started after

    S = 1 / |1/T₁ − 1/T₂|

Because a Hohmann transfer arrives 180° from where it left, the target has to
be a particular angle ahead at departure, 180° less what the target covers
during the flight, and that angle recurs once per synodic period. So does the
window. A few of the game's pairs, with Kerbin's year of 426.1 days as the
unit:

| Pair           | Target's year | Synodic period | Flight time | Target must lead by   |
| -------------- | ------------- | -------------- | ----------- | --------------------- |
| Kerbin → Moho  | 102.6 d       | 135.1 d        | 123.0 d     | −251.8° (108° behind) |
| Kerbin → Eve   | 261.9 d       | 680.0 d        | 170.4 d     | −54.1° (behind)       |
| Kerbin → Duna  | 801.6 d       | 909.5 d        | 302.0 d     | 44.4°                 |
| Kerbin → Dres  | 2,217 d       | 527.4 d        | 603.2 d     | 82.1°                 |
| Kerbin → Jool  | 4,845 d       | 467.2 d        | 1,123 d     | 96.6°                 |
| Kerbin → Eeloo | 7,268 d       | 452.6 d        | 1,586 d     | 101.4°                |
| Mun → Minmus   | 49.9 d        | 7.4 d          | 12.4 d      | 90.5°                 |

The shape of the middle column is worth a look. Duna's year is close to
Kerbin's, so Kerbin gains on it slowly and the windows are more than two
years apart. Jool and Eeloo barely move in a Kerbin year, so Kerbin laps them
every year and a bit, and their windows come round almost annually. Moho is
the other way: it laps Kerbin every 135 days. A synodic period is short when
the two periods are very different and long when they are nearly the same;
for two bodies with the same period it is infinite, because they never change
their relative position at all.

## In this codebase

`hohmann` in [`src/core/orbits.ts`](../../../../src/core/orbits.ts) is the
two-burn formula, written once for either direction:

```ts
function hohmann(centre: string, r1: number, r2: number) {
  const m = mu(centre),
    at = (r1 + r2) / 2; // the transfer ellipse's semi-major axis
  const v1 = Math.sqrt(m / r1),
    v2 = Math.sqrt(m / r2); // the two circular speeds
  const vp = Math.sqrt(m * (2 / r1 - 1 / at)),
    va = Math.sqrt(m * (2 / r2 - 1 / at)); // vis-viva at the ellipse's two ends
  return { out: Math.abs(vp - v1), in: Math.abs(v2 - va) };
}
```

Its two numbers are used in three places, and each shows a different face of
the idea.

**As the whole price, inside one body's field.** `syncLegs` prices the trip
from low Kerbin orbit up to the stationary orbit at 2,864 km as a Hohmann
about Kerbin and nothing else: raise apoapsis 668 m/s, circularise 431 m/s.
Both orbits are round, both are about Kerbin, and there is no sphere of
influence to leave, so the textbook answer is the delivered one. The same
function, called with equal radii, returns zero at both ends; `transferDv`
does that for a moon whose orbit the ship is already matching.

**As the estimate a window replaces.** `transferDv` in the same file finds
the body the origin's and the destination's chains share, takes the Hohmann
between the origin's orbit and the destination's about that body, and then,
when the caller gives a start time, asks `findWindow` for the real transfer
and puts the window's two end speeds in place of the Hohmann's:

```ts
const h = hohmann(common, rO, rD);
// ...
let c3out = h.out * h.out,
  c3in = h.in * h.in;
if (w) {
  h.out = w.vinfOut; // the window's numbers replace the estimate
  h.in = w.vinfIn;
  c3out = w.c3Out;
  c3in = w.c3In;
}
```

Everything downstream, the ejection from the low orbit it leaves and the capture at
the far end, is the same code either way; only the two end speeds differ.
Without a start time the route is the Hohmann one, which is what
[`test/routes.test.ts`](../../../../test/routes.test.ts) pins in its snapshot.
The application always passes a start time.

**As the axes of the search.** `findWindow` in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts) has to decide which
departure dates and which flight times to price. Both come from this lesson:

```ts
const synodic = 1 / Math.abs(1 / T1 - 1 / T2);
const hohmann = Math.PI * Math.sqrt(((o1.a + o2.a) / 2) ** 3 / m);
// ...
const first = 1.05 * synodic; // the departure dates that hold the first window
const tSpan = 2.05 * synodic, // and a second period, for a cheaper one to mention
  fLo = 0.3 * hohmann, // flight times from a third of the Hohmann's
  fHi = 2 * hohmann; // to twice it
```

One synodic period of departure dates is guaranteed to contain a window, so
that is the span the reported window is the cheapest of; the flight times
bracket the Hohmann's, since a real transfer between eccentric, inclined
orbits is somewhere near the circular half-ellipse but not on it. The
search for a departure out to one of your own moons, `raiseSearch`, spans the
moon's own period instead: the place of the low orbit it leaves from in it is free, so the
opportunity recurs with the moon, not with a synodic period.
[P24](../../README.md#part-1--physics), _Three geometries for moons_, has
that.

## What made it real

The classic Duna window is the check. The test "finds the classic Duna
departure from a new save" in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) holds the
search's first window from Year 1 Day 1 to what every launch-window tool for
the game reports: departure in the 230s, the target 35° to 48° ahead, nine
months in flight. The search finds Year 1 Day 231 with the target 44° ahead
and 271 days of flight. The hand calculation above, four vis-viva speeds and
one division, finds Day 231 and 44.4°.

The next test, "the next window is a synodic period on", starts the search
thirty days after that window and requires the one it finds to be a synodic
period later, within forty days. It is 926 days later against a synodic
period of 909.5. The gap is Duna's orbit not being the circle the formula
assumes: its eccentricity is 0.051 and its tilt 0.06°, so successive windows
are not identical and do not fall exactly one synodic period apart.

The same is true of the price. The window search puts the departure at 802
m/s relative to Kerbin and the arrival at 883 relative to Duna, 1,685
together; the Hohmann said 918 and 826, 1,744. The estimate is within 4% and
the split between the two ends has moved, because the real Duna is not where
a circular Duna would be. For Moho, whose eccentricity is 0.2 and whose
orbit is tilted 7°, the Hohmann's 2,349 and 2,998 become 4,003 and 2,697 at
the first window and the estimate is off by a third. The Hohmann is the
starting point; the window is the answer.

## Where it breaks

- **Reading the Hohmann as the burn.** Its two numbers are speeds relative to
  the two bodies once clear of them, not what the engine has to deliver from
  a low orbit deep in a well. The comment in `transferDv` records the
  opposite mistake as well: running a Hohmann inside one system, Kerbin to the
  Mun, through the ejection formula charges escape velocity on top and
  inflates the trip by a quarter. Inside one field the Hohmann is the whole
  price; between fields it is only the middle of the sum.
- **Trusting it for an eccentric or tilted target.** Moho above. The formula
  is exact for two circles in one plane and an estimate for anything else,
  which is why it sets the search's axes and never its answer.
- **Scanning more than one synodic period for the answer.** Searching two
  once found a cheaper window two years later and reported it, when the
  reader had asked for the first one from the date they gave. The rule in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) under
  _Transfer windows_ records it: the reported window is the cheapest of the
  first period, and the second is scanned only for a cheaper one to
  mention.
- **A synodic period where there is none.** For a departure out to a moon
  from the body it orbits there is no second orbiting body to lap, and the
  formula has nothing to bite on; the span is the moon's own period.
  Between two bodies with the same period it is infinite. The code has a
  branch for the first case and no body pair in the game for the second.

## Try it

Run the snippet above, then change `r2` from Duna's radius to Jool's,
68,773,560,320 m, and Duna's 135.5° head start to Jool's on a new save, which
the test file's `stateAt` will give you. The flight time goes from 302 days
to 1,123, the lead angle from 44° to 97°, and the synodic period from 909
days to 467: Jool barely moves in a Kerbin year, so its window comes round
every year and a bit, and the application's Jool card offers one every
year.

## Check yourself

<details><summary>Why are the two Hohmann burns made where the transfer ellipse touches the two circles, rather than anywhere else on it?</summary>

Because at the touching points the ship's velocity and the orbit's velocity
point the same way, so the burn only has to change the speed. Anywhere else
the two velocities cross at an angle, and a burn that turns the velocity as
well as resizing it costs more Δv for the same change of orbit.

</details>

<details><summary>Kerbin's year is 426 days and Jool's is 4,845. Why is the Kerbin–Jool synodic period only 467 days, shorter than Kerbin–Duna's 909?</summary>

Because the synodic period depends on the difference of the two angular
rates, not on the periods themselves. Jool crawls: in one Kerbin year it
moves only 32°, so Kerbin catches it up again after a year and a bit. Duna
moves at more than half Kerbin's rate, so Kerbin gains on it slowly and takes
over two years to lap it.

</details>

<details><summary>The Hohmann formula says 918 m/s to leave Kerbin's orbit for Duna's. The route charges about 1,070 m/s for the burn from an 80 km orbit. Which number is wrong?</summary>

Neither. The 918 is the change in speed about the Sun, measured once the
ship is clear of Kerbin's gravity. The burn from low orbit must also climb
out of Kerbin's well, and 1,070 is what the two cost together when the burn
is made deep in the well. The Hohmann is the estimate the ejection is priced
from, not the ejection itself.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  orbital manoeuvres, for the Hohmann transfer, its optimality and the
  bi-elliptic alternative, and the chapter on interplanetary trajectories for
  the synodic period and the phase angle at departure.
- Robert Braeunig, _Rocket and Space Technology_, "Interplanetary Flight",
  for the same with worked numbers.
- Walter Hohmann, _Die Erreichbarkeit der Himmelskörper_ (1925), the paper
  the transfer is named for; NASA published an English translation, _The
  Attainability of Heavenly Bodies_, as Technical Translation F-44.

## Key takeaway

Between two circular orbits the cheapest two-burn route is the half-ellipse
that touches both, priced by vis-viva at its two ends, and it is available
again every synodic period, 1/|1/T₁ − 1/T₂|; the application uses the first
as the estimate every leg starts from and the second as the span of dates
its window search scans, and lets the window replace the estimate.

_As of d301944._

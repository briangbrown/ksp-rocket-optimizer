# Kepler's equation: where a body is at time t

**Syllabus:** [P14](../../README.md#part-1--physics)

**Why it matters:** Kepler's equation matters because every transfer window,
every encounter check and every orbit drawn on screen begins with the same
question, where is this planet on this date, and an orbit's own geometry does
not answer it directly: a body sweeps an ellipse at a rate that changes all
the way round, and the one equation that ties the clock to the angle cannot be
solved with algebra, only by iteration, which is why a root-finder sits at the
bottom of the whole transfer model.

**Before this:** nothing. [P13](vis-viva-and-circularising.md) is a useful
companion, for what apoapsis, periapsis and semi-major axis mean.

## A worked case

Moho circles the Sun on a noticeably squashed orbit: semi-major axis 5.263 Gm,
eccentricity 0.2, so its distance from the Sun runs from 4.211 Gm at periapsis
to 6.316 at apoapsis, and it takes 102.6 Kerbal days to go round. Where is it
100 days after the game's clock starts?

If Moho moved at a steady rate round its orbit the answer would be arithmetic.
One orbit is 2π radians in 102.6 days, so the rate is

    n = √(μ / a³) = 2.8357 × 10⁻⁶ rad/s

and after 100 days, starting from the angle the game stores for time zero,
3.14 rad, the angle swept would be 3.14 + n × 100 × 21,600 = 9.265, or, taking
off a full turn, 2.9819 rad: 170.85° round from periapsis.

But Moho does not move at a steady rate. It is fastest at periapsis and
slowest at apoapsis, so after 100 days, most of the way round, it has fallen
behind that steady angle at the start and caught up since. The angle it has
actually reached is the root of

    E − 0.2 · sin E = 2.9819

which has no closed-form solution. Guess E = 2.9819 and correct it by Newton's
method:

| Step | E        | Error in the equation | Correction   |
| ---- | -------- | --------------------- | ------------ |
| 0    | 2.981898 | −3.2 × 10⁻²           | −2.66 × 10⁻² |
| 1    | 3.008458 | +1.1 × 10⁻⁵           | +8.8 × 10⁻⁶  |
| 2    | 3.008449 | +1.0 × 10⁻¹²          | +8.7 × 10⁻¹³ |
| 3    | 3.008449 | 0                     | 0            |

Three steps, and each one squares the error of the last. E = 3.008449 rad, or
172.37°. One more conversion turns that geometric angle into the actual angle
from periapsis, 173.77°, and the distance follows from the ellipse: 6.306 Gm,
nearly at apoapsis. The steady-rate guess was wrong by 2.92°, which at Moho's
distance is 320,000 km, or 130 times the Mun's distance from Kerbin. A
transfer aimed at the steady-rate position would miss.

```js
const mu = 1.74684656 * 9.80665 * 261600000 ** 2; // the Sun: gees × KSP's g₀ × radius²
const a = 5263138304,
  e = 0.2,
  m0 = 3.14; // Moho's orbit and its angle at time zero
const t = 100 * 21600; // 100 Kerbal days of six hours
const n = Math.sqrt(mu / a ** 3);
const M = (m0 + n * t) % (2 * Math.PI); // the mean anomaly: where a steady body would be
let E = M;
for (let i = 0; i < 30; i++) {
  const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); // f(E) / f'(E)
  console.log(
    `step ${i}: E = ${E.toFixed(6)}, correction ${d.toExponential(2)}`,
  );
  E -= d;
  if (Math.abs(d) < 1e-13) break;
}
const nu =
  2 *
  Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  ); // true anomaly
const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
console.log(
  `mean ${((M * 180) / Math.PI).toFixed(2)}°, eccentric ${((E * 180) / Math.PI).toFixed(2)}°, true ${((nu * 180) / Math.PI).toFixed(2)}°, r = ${(r / 1e9).toFixed(3)} Gm`,
);
```

## The idea

Kepler's laws say what an orbit is: an ellipse with the parent at one focus,
swept so that equal areas are covered in equal times. The second law is the
trouble. Equal areas in equal times means the body moves fast when it is close
to the focus and slow when it is far, so the angle it has turned through is
not proportional to the time elapsed. Getting from a time to a position takes
three angles.

An **anomaly** is any angle that marks how far round its orbit a body is,
measured from periapsis. The **mean anomaly**, M, is the angle a body would
have swept if it moved at a uniform rate: M = M₀ + n·t, where n is the **mean
motion**, 2π over the period, and M₀ the mean anomaly at the **epoch**, the
reference instant the orbit's numbers are stated for. M is what the clock
gives you, and it is trivial. The **true anomaly**, ν, is the actual angle
from periapsis to the body as seen from the focus, and it is what a position
needs. Between them sits the **eccentric anomaly**, E, a geometric angle
measured at the centre of the ellipse rather than the focus, and it is the one
Kepler's equation is written in:

    M = E − e · sin E

The **eccentricity**, e, is how far from round the orbit is: 0 for a circle,
where M = E = ν and the whole problem vanishes, approaching 1 for an ellipse
stretched to a line. For a circle the steady-rate angle is the answer. For
Moho at 0.2 it is 3° off; for Gilly at 0.55 it can be 60° off.

The equation gives M from E in one line, and there is no line that gives E
from M. That is not a gap in the mathematics anyone will close; it is a
theorem. So E is found numerically, and **Newton's method** is the standard
tool: start from a guess, compute how far the equation is from balancing, and
follow the tangent line of the function down to where it would cross zero:

    E ← E − (E − e·sin E − M) / (1 − e·cos E)

The denominator is the derivative, and because it is never smaller than 1 − e
the correction is always well behaved for the eccentricities a planetary
system has. Each step roughly squares the error, so from a decent start the
answer is good to machine precision in three or four steps. M itself is a good
start for small e; for large e, π is safer, because the function is steepest
there and the tangent cannot overshoot far.

From E to ν is a closed form again, a half-angle formula, and from ν to a
position is the ellipse's polar equation, r = a(1 − e²)/(1 + e·cos ν). Then the
position is in the orbit's own plane, and turning it into the parent's frame
is three rotations, which [P15](../../README.md#part-1--physics) takes up.

The clock matters as much as the equation. Kerbal time is the game's clock: a
day of six hours and a calendar year of 426 days. Kerbin's actual year, the
time to go once round the Sun, is 9,203,545 s, about 2,000 s longer than the
calendar's 9,201,600. Dates are printed on the calendar; orbits run on the
periods. And the gravitational parameter that sets every period comes from a
surface gravity in gees times a g₀, and the g₀ has to be the game's own,
9.80665, because the periods are what the game computed with it.

## In this codebase

`eccentricAnomaly` in [`src/core/kepler.ts`](../../../../src/core/kepler.ts) is Newton's method on the
equation, exactly as above:

```ts
function eccentricAnomaly(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI; // a safe start for anything stock; Gilly's 0.55 is the largest
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}
```

`stateAt(body, t)` is the whole chain: mean motion from μ and a, mean anomaly
from the stored M₀ and the time, wrapped into [0, 2π) before the solve, E by
Newton, ν by the half-angle formula, r from the polar equation, and velocity
alongside, then `toFrame` to rotate both into the parent's frame:

```ts
const n = Math.sqrt(o.mu / o.a ** 3);
const M = o.m0 + n * t;
const E = eccentricAnomaly(
  ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
  o.e,
);
const nu =
  2 *
  Math.atan2(
    Math.sqrt(1 + o.e) * Math.sin(E / 2),
    Math.sqrt(1 - o.e) * Math.cos(E / 2),
  );
const r = (o.a * (1 - o.e * o.e)) / (1 + o.e * Math.cos(nu));
```

The wrap is not decoration: Newton on an unwrapped M many turns from zero
converges, but to an E many turns from zero, and a Dres burn time once came
out a year long for want of it. `periodOf` is 2π√(a³/μ), `orbitPoints` samples
`stateAt` round one period for the drawings, and `kerbalDate` and `utOf`
convert between seconds and the game's calendar for the brief.

`mu` here uses `G0_KSP = 9.80665`, its own constant, and the comment says why:
at 9.81 Kerbin's year came out 1,600 s short, an hour of drift in the dates by
the second window.

Everything downstream reads `stateAt`. The window search in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts) asks for the departure body at t and the arrival body
at t plus the flight time and hands both positions to the Lambert solver
([P21](../../README.md#part-1--physics)); the encounter check in
[`src/core/encounter.ts`](../../../../src/core/encounter.ts) asks where each other body is as the ship passes; the
transfer drawing in the interface draws the orbits from `orbitPoints`.

## What made it real

The g₀ is the measurement. Kerbin's sidereal year from the elements is
9,203,545 s with the game's g₀ and 9,201,973 with the solver's rounded 9.81:
1,572 s apart, and the comment rounds it to 1,600. That is an hour of drift in
where every planet is by the time the second transfer window comes round, and
it was found because the windows came out on the wrong dates.
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) now holds that the ephemeris runs on the game's clock
and Kerbin's own year, and that the planets are where their stored numbers
say at time zero.

The anomaly wrap is the other one. Without it the plane-change branch of the
window search, which converts a true anomaly back to a time, handed Newton a
mean anomaly several turns from zero and got back a burn time a year off. The
rule is recorded in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) with the window traps.

Newton's convergence is not something this repository measured; it is what
the table above shows. Three steps to 10⁻¹² for Moho, from a start of M, on an
equation whose derivative never drops below 0.8.

## Where it breaks

- **A rounded g₀ in the ephemeris.** Two g₀ constants live in the code for two
  reasons, 9.81 for Isp and 9.80665 for μ, and swapping either for the other
  moves either a snapshot by a metre a second or the calendar by an hour.
  [P1](../staging/dv-and-the-rocket-equation.md) has the other half.
- **An unwrapped mean anomaly.** Newton converges to the nearest root, and the
  nearest root to a mean anomaly of 40 rad is an eccentric anomaly of about
  40 rad. Wrap M into [0, 2π) first, always; the Dres burn a year long is the
  case.
- **The calendar year as the orbital year.** 426 days is the calendar, not
  Kerbin's orbit. Anything that needs "one Kerbin year" for physics wants
  `periodOf("Kerbin")`, and anything that prints a date wants `kerbalDate`.
- **Starting Newton from M at high eccentricity.** Fine to 0.8; beyond it the
  tangent from M can overshoot badly, and π is the safe start. No stock body
  is above 0.55, and the guard is for a caller handing in something the tree
  does not hold.

## Try it

Run the snippet, then set `e` to `0.55`, Gilly's eccentricity, and `a` to
`31500000`, leaving `mu` as the Sun's. That is not Gilly's orbit, only its
shape, and the equation cares only about the shape. Newton takes five steps
instead of three, and the gap between the mean anomaly and the true anomaly
opens to 64°: on an orbit that squashed the steady-rate guess is useless, and
the equation is doing all the work.

## Check yourself

<details><summary>What is the mean anomaly, and why is it the easy one to compute?</summary>

The angle a body would have swept from periapsis if it moved at a uniform
rate: M = M₀ + n·t, with n = 2π over the period. It is easy because it is
linear in time. It is also not where the body is, except on a circular orbit.

</details>

<details><summary>Why can Kepler's equation not simply be solved for E?</summary>

Because E appears both on its own and inside a sine, M = E − e·sin E, and no
finite combination of elementary functions inverts that. It is solved
numerically; Newton's method converges in three or four steps because the
derivative, 1 − e·cos E, never drops below 1 − e.

</details>

<details><summary>Kerbin's calendar year is 426 six-hour days. Is that how long Kerbin takes to go round the Sun, and does it matter?</summary>

No: the calendar year is 9,201,600 s and the orbital period from the
elements is 9,203,545. Orbits must run on the period and dates print on the
calendar; using the calendar for physics, or the rounded g₀ for μ, drifts the
planets' positions by about an hour per year.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  orbital position as a function of time, for the three anomalies and Newton's
  method on Kepler's equation.
- Robert Braeunig, _Rocket and Space Technology_, "Orbital Mechanics", for the
  same with a worked example.
- The KSP wiki, _Orbit_ and _Time_, for the game's elements at epoch and its
  six-hour day and 426-day year.

## Key takeaway

The clock gives the mean anomaly for free, the position needs the true
anomaly, and the only bridge is Kepler's equation M = E − e·sin E, which has no
closed inverse and yields to Newton's method in three or four steps once M is
wrapped into one turn.

_As of 87cd848._

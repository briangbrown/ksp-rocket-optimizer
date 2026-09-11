# Vis-viva, circular speed, and circularising

**Syllabus:** [P13](../../README.md#part-1--physics)

**Why it matters:** Vis-viva matters because it is the one equation that
turns an orbit's shape into a speed, and an ascent is not finished when the
engines stop: the rocket coasts to the top of its arc and buys, in one last
burn, the difference between the speed it arrives with and the speed a round
orbit needs there, and how large that burn is depends entirely on how it
climbed; the simulator prices that burn to completion, and a flight is finally
charged what the orbit needs, never what the tanks happened to hold.

**Before this:** [P1](../staging/dv-and-the-rocket-equation.md), _Δv and the
rocket equation_, and [P6](../ascent/gravity-drag-and-steering-losses.md),
_Gravity, drag and steering losses_.

## A worked case

A round orbit 80 km above Kerbin is 680 km from its centre, and the speed that
holds it there is

    v = √(μ / r) = √(3.5328 × 10¹² / 680,000) = 2,279 m/s

where μ is Kerbin's gravitational parameter, its mass times the gravitational
constant. Nothing about the rocket enters: any object at that height moving at
that speed sideways stays at that height. Slightly higher and the speed is
slightly less, 2,247 m/s at 100 km; a great deal higher and it is much less,
1,486 m/s at 1,000 km.

A rocket does not arrive at 80 km on a round orbit. It arrives at the top of an
arc whose bottom, if the arc were continued, would be somewhere below: a
lopsided ellipse with its highest point, the **apoapsis**, at 80 km and its
lowest, the **periapsis**, low or underground. How fast it is moving at the
top depends on how low the bottom is:

| Periapsis of the arc  | Speed at the 80 km apoapsis | Burn to make it round |
| --------------------- | --------------------------- | --------------------- |
| −400 km (underground) | 1,537 m/s                   | 743 m/s               |
| −200 km               | 1,962 m/s                   | 318 m/s               |
| 0 km (the surface)    | 2,207 m/s                   | 72 m/s                |
| 30 km                 | 2,235 m/s                   | 44 m/s                |
| 60 km                 | 2,262 m/s                   | 17 m/s                |
| 80 km                 | 2,279 m/s                   | 0                     |

The steeper the climb, the deeper the arc's bottom and the slower the rocket
is at its top, and the more speed the final burn has to buy. That burn is the
**circularisation**: the burn at apoapsis that raises the periapsis up to meet
it and makes the orbit round.

Now the same thing on a rocket the simulator flies. Two Torches under a Spark
with a tonne on top, kicked over at 100 m/s by different amounts:

| Kick                    | Speed at apoapsis | Circularisation | Total ascent |
| ----------------------- | ----------------- | --------------- | ------------ |
| 2°                      | 247 m/s           | 2,035 m/s       | 4,116 m/s    |
| 6°                      | 639 m/s           | 1,647 m/s       | 3,829 m/s    |
| 10°                     | 1,394 m/s         | 887 m/s         | 3,626 m/s    |
| Best turn, 4° at 55 m/s | 2,173 m/s         | 108 m/s         | 3,564 m/s    |

The 2° kick is nearly vertical. It reaches 80 km all right, moving at 247 m/s,
almost straight up, and has to buy nearly the entire orbital speed at the top:
a 2,035 m/s burn that runs for three minutes and stages from the Torches to
the Spark part-way through. The best turn arrives at 2,173 m/s and needs 108.
The total is 550 m/s apart, and the difference is almost entirely in that last
burn.

```js
const mu = 3.5328e12,
  R = 600e3; // Kerbin
const visViva = (r, a) => Math.sqrt(mu * (2 / r - 1 / a)); // speed at radius r on an orbit of semi-major axis a
const rA = R + 80e3,
  vCirc = Math.sqrt(mu / rA);
console.log(`circular at ${(rA - R) / 1e3} km:`, vCirc.toFixed(0), "m/s");
for (const peKm of [-400, -200, 0, 30, 60, 80]) {
  const a = (rA + R + peKm * 1e3) / 2; // semi-major axis: half the sum of the two extremes
  const vA = visViva(rA, a);
  console.log(
    `periapsis ${peKm} km: ${vA.toFixed(0)} m/s at apoapsis, burn ${(vCirc - vA).toFixed(0)} m/s`,
  );
}
```

## The idea

An orbit is a trade between speed and height. The total energy of an orbiting
body per kilogram, its kinetic energy ½v² plus its gravitational potential
−μ/r, is constant around the orbit, and it depends only on the orbit's size:

    ½ v² − μ / r = −μ / (2a)

where a is the **semi-major axis**, half the longest diameter of the ellipse,
which for a closed orbit is half the sum of the apoapsis and periapsis
distances from the centre. Solve for v and you have **vis-viva**, the
"living force" equation:

    v = √( μ (2/r − 1/a) )

Given where you are, r, and how big your orbit is, a, it says how fast you are
going, anywhere on the orbit. It is the tool for every question in this part
of the syllabus that begins "how fast".

Two special cases carry most of the weight. A round orbit has r = a everywhere,
so v = √(μ/r): the **circular speed**, which falls as the square root of the
distance. And at the extremes of an ellipse, the apoapsis and periapsis, the
velocity is exactly sideways, which is what makes them the natural places to
burn: a burn there changes the size of the orbit without tilting it.

**Circularising** follows. Arrive at apoapsis on an arc of semi-major axis a,
moving at √(μ(2/rₐ − 1/a)); a round orbit at that height needs √(μ/rₐ); the
burn is the difference. The smaller a, the deeper the periapsis, the slower
the arrival and the larger the burn, which is the table above. An ascent that
climbs steeply gets its height cheaply and its speed expensively, and the bill
comes due at the top. Why buying the speed there is so much worse than buying
it on the way up, when the sum of the speeds looks the same, is
[P20](../../README.md#part-1--physics)'s Oberth effect: a burn made while
moving slowly gains little energy for its Δv.

The stretch between cutoff and apoapsis is the **coast**, unpowered flight,
and above the air it is **Keplerian**: gravity from one body only, no thrust,
no drag, so the orbit's elements are fixed and where the rocket will be at any
moment follows from Kepler's laws, which is
[P14](../../README.md#part-1--physics). The time to apoapsis is a few minutes
on a Kerbin launch, and the flight card counts it down.

The last idea is what a burn is. The arithmetic above treats the
circularisation as an **impulsive burn**, an instantaneous change of speed at
a point. A real burn takes time, and while it runs the rocket moves along its
orbit and, because it is gaining speed, begins to climb; thrust that was level
at the start is no longer level with respect to where the rocket has got to.
For a short burn on a fast arrival the error is small. For a long burn on a
slow arrival it is not negligible, and a burn that runs a stage dry part-way
through is a different thing again. The simulator therefore integrates the
burn rather than subtracting two speeds.

## In this codebase

`flyAscent` in [`src/core/ascent.ts`](../../../../src/core/ascent.ts) leaves the coast when the rocket reaches
the top of its arc or clears the air, and the first thing it does there is
check the apoapsis actually reached, since drag has been eating it on the way
out:

```ts
if (apo < targetR - 1000)
  return { fail: "apoapsis short", t, apo: apo - b.R, dvUsed };
const vApo = Math.sqrt(Math.max(0, mu * (2 / apo - 1 / a))), // vis-viva at the top
  vC = Math.sqrt(mu / apo); // circular there
```

The tolerance is 1 km. Loosely checked, a launch once peaked at 76.6 km
against 80 and scored as the cheapest ascent available, because falling short
is always cheaper than not.

Then the burn is integrated on whatever stage is still live, with the thrust
held level:

```ts
for (; t2 < 1200; t2 += dt2) {
  if (cv >= Math.sqrt(mu / cr)) break; // circular where we are now
  if (cp <= 0) {
    /* this stage is spent: drop it and continue on the one above, circStaged = true; if there is none, circShort = true */
  }
  const acc = (live.mdot * ve) / cm;
  cv += acc * dt2;
  const excess = (cv * cv) / cr - mu / (cr * cr); // net outward acceleration as speed grows
  cr += Math.max(0, excess) * dt2 * dt2 * 0.5;
  cm -= live.mdot * dt2;
  cp -= live.mdot * dt2;
  spent += acc * dt2;
}
const left = Math.max(0, Math.sqrt(mu / cr) - cv);
circDv = Math.max(spent + left, vC - vApo); // what the orbit needs, never what the tanks held
```

Three decisions are in those lines. The burn stages up: when the live stage
runs dry the casing is dropped and the burn continues on the stage above,
because the vehicle has it and the closed form counted its Δv toward this
orbit. The burn is costed to completion: if the last stage runs dry short of
circular, what is left is added impulsively, so a rocket that cannot finish
reports an ascent at least as expensive as one that can. And the total can
never be less than the impulsive figure, `dvUsed + vC − vApo`, which
[`test/ascent.test.ts`](../../../../test/ascent.test.ts) holds as an invariant on the simulator directly.

The circular speed appears once more, in [`src/core/orbits.ts`](../../../../src/core/orbits.ts), as
`vCirc(body)`, the speed of a low orbit ten kilometres above the air, which is
the starting point for every departure leg the route model prices.

The flight card's fixed advice is written for this burn: after cutoff there is
nothing to fly until apoapsis; start the circularisation half its duration
early so it straddles the mark; and hold the burn level rather than on
prograde, because a long circularisation lifts you as it runs, prograde tilts
upward, and following it pushes the apoapsis ahead of you.

## What made it real

Issue #170 is the measurement. The Torch rocket in the test file, flown
lofted, arrived at apoapsis slow, and its Torch stage ran dry 232 m/s into an
1,839 m/s circularisation. The simulator stopped there and reported what that
one stage had spent: a 2,313 m/s ascent, which is below the physical minimum
for the orbit. The turn search preferred that flight, because falling short is
always cheaper than not, and the planner found 2,313 within the 3,762 the
rocket was built to carry and delivered it. Costed to completion, the same
lofted flight is 4,120 m/s and marked short; the turn search, no longer able
to buy a bargain by failing, found a steeper flight for the same rocket that
circularises on one stage at 3,561.

The finite-burn correction itself is small in this integrator. The 2° kick's
three-minute burn costs 2,074 m/s integrated against 2,067 impulsive, seven
metres a second more. The staging-up and the costing to completion are what
changed the answers; the integration is what made them possible to compute.

## Where it breaks

- **Costing a failed burn at what one stage spent.** The #170 bug. A rocket
  that cannot finish must report at least what finishing would cost, or the
  search will prefer it. The rule is in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) under _A
  flight's `total` is what the orbit needs_.
- **Checking the apoapsis only at the peak.** A flight that leaves the air
  short of the target never reaches a peak inside the loop that checks it. The
  check runs on both exits from the coast, and the comment records the flight
  that sailed through 3.4 km short.
- **Following prograde through a long circularisation.** The burn raises the
  rocket as it runs, the prograde marker tilts up, and chasing it pushes the
  apoapsis ahead. The card says to hold the burn level, 0° on the navball.
- **Reading the burn as a speed difference.** The impulsive figure is a floor,
  and on a slow arrival with a small upper stage the real burn can stage and
  can run out. The simulator's number is the one that has been through both.

## Try it

Run the snippet, then change `80e3` in `rA` to `200e3` and the periapsis list
to `[-200, 0, 100, 200]`. The circular speed at 200 km is 2,101 m/s, lower
than at 80, yet the burn from a surface-grazing arc grows from 72 m/s to 156.
A higher orbit is a slower one, but an arc from the surface to 200 km is more
lopsided than one to 80, arrives slower still, and has more to buy. Both
effects are in vis-viva; the snippet shows which wins.

## Check yourself

<details><summary>An arc reaches apoapsis at 80 km with its periapsis at the surface. How fast is the rocket at the top, and how big is the burn to circularise?</summary>

The semi-major axis is (680 + 600) / 2 = 640 km, so v = √(μ(2/680 − 1/640) ×
10⁻³) = 2,207 m/s, and the round orbit needs 2,279: a 72 m/s burn. The
snippet's third row.

</details>

<details><summary>Why does a steeper ascent end with a bigger circularisation burn, when it reaches the same 80 km?</summary>

Because it arrives slower. A steep climb spends its Δv on height and arrives
at the top of a deep arc, whose vis-viva speed is low; the round orbit's speed
at that height is fixed, so the difference the burn must buy is large. The 2°
kick arrived at 247 m/s and needed 2,035.

</details>

<details><summary>The simulator's circularisation staged from the Torches to the Spark part-way through. Why continue the burn rather than report what the Torches spent?</summary>

Because the rocket has the Spark and the closed form counted its Δv toward
this orbit; stopping would report a flight that never reached orbit as cheaper
than one that did, and the search would prefer it. #170 was exactly that: a
2,313 m/s ascent below the physical minimum, delivered.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  the two-body problem, for vis-viva from the energy equation, and the chapter
  on orbital manoeuvres for circularisation.
- Robert Braeunig, _Rocket and Space Technology_, "Orbital Mechanics", for the
  same with worked numbers.
- The KSP wiki, _Orbit_ and _Tutorial: Basic Orbiting_, for apoapsis,
  periapsis and the circularisation burn as the game presents them.

## Key takeaway

Vis-viva, v = √(μ(2/r − 1/a)), gives the speed anywhere on an orbit from its
size; a rocket arrives at the top of its arc slower the steeper it climbed, and
the circularisation buys the difference to √(μ/r), integrated to completion so
that a flight is charged what the orbit needs and not what its tanks held.

_As of 10e7caa._

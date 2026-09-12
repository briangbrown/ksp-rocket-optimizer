# Semi-implicit Euler at 0.1 s

**Syllabus:** [A4](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The integration scheme matters because every flown
number the application reports, the ascent Δv, the losses, the maximum
pressure, the handoff, comes out of stepping a rocket through the air a
tenth of a second at a time nine thousand times, and the simplest way of
stepping, updating position from the old velocity, spirals a perfect
circular orbit outward by three kilometres a turn even at that step; the
one-line change of updating velocity first costs nothing, keeps the orbit to
the metre, and is what lets the flown Δv agree with the game to within a
percent, while the step of 0.1 s is where that percent is bought for under a
millisecond a flight.

**Before this:** [P6](../../physics/ascent/gravity-drag-and-steering-losses.md),
_Gravity, drag and steering losses_.

## A worked case

Put a ship in an 80 km circular orbit about Kerbin, 2,279 m/s, and integrate
one orbit, 1,875 s, with the two simplest schemes there are. Both compute
the same acceleration at each step; they differ only in the order of two
lines.

| Time step | Scheme        | Radius error after one orbit | Energy error |
| --------- | ------------- | ---------------------------- | ------------ |
| 0.1 s     | explicit      | +2,859 m                     | −0.42%       |
| 0.1 s     | semi-implicit | 0 m                          | 0.0000%      |
| 1 s       | explicit      | +28,185 m                    | −3.9%        |
| 1 s       | semi-implicit | −1 m                         | 0.0000%      |
| 10 s      | explicit      | +267,524 m                   | −24%         |
| 10 s      | semi-implicit | +221 m                       | 0.0000%      |

The explicit scheme gains energy every step and spirals out: at a tenth of a
second it is three kilometres high after one orbit, and at ten seconds it is
in a different orbit. The semi-implicit scheme's energy error is zero to
four decimals at every step size, and its radius error at ten-second steps
is smaller than the explicit scheme's at a tenth of a second. Same
arithmetic, same cost, two lines swapped.

Now the step. Fly the 0.8 t launch vehicle from the test grid up its best
turn with the simulator's scheme at four step sizes:

| Time step | Ascent Δv   | Of which circularisation | Gravity loss | Max Q     | Time per flight |
| --------- | ----------- | ------------------------ | ------------ | --------- | --------------- |
| 0.02 s    | 3,765.6 m/s | 231.7 m/s                | 1,423.9 m/s  | 21,691 Pa | 15.8 ms         |
| 0.1 s     | 3,761.5 m/s | 244.6 m/s                | 1,428.8 m/s  | 21,679 Pa | 0.8 ms          |
| 0.5 s     | 3,785.6 m/s | 350.2 m/s                | 1,448.4 m/s  | 21,489 Pa | 0.6 ms          |
| 1.0 s     | 3,816.4 m/s | 600.3 m/s                | 1,480.0 m/s  | 21,454 Pa | 0.5 ms          |

Taking the 0.02 s flight as the truth, 0.1 s is 4 m/s off, a tenth of a
percent, at a twentieth of the cost. Half a second is 20 m/s off and a full
second 51, over one percent, almost all of it in the circularisation burn:
a short burn at apoapsis sampled every second lands the orbit somewhere
other than circular and pays to fix it. The powered climb hardly notices; the
gravity loss moves 4 m/s between 0.02 and 0.1 s and 56 between 0.02 and 1.0.

```js
const mu = 3.5316e12, // Kerbin
  r0 = 680000,
  v0 = Math.sqrt(mu / r0), // a circular orbit at 80 km
  T = 2 * Math.PI * Math.sqrt(r0 ** 3 / mu);
function orbit(scheme, dt) {
  let x = r0,
    y = 0,
    vx = 0,
    vy = v0;
  for (let i = 0, n = Math.round(T / dt); i < n; i++) {
    const r = Math.hypot(x, y),
      ax = (-mu * x) / r ** 3,
      ay = (-mu * y) / r ** 3;
    if (scheme === "explicit") {
      x += vx * dt;
      y += vy * dt; // position from the OLD velocity
      vx += ax * dt;
      vy += ay * dt;
    } else {
      vx += ax * dt;
      vy += ay * dt; // velocity first
      x += vx * dt;
      y += vy * dt; // position from the NEW velocity
    }
  }
  return Math.round(Math.hypot(x, y) - r0); // radius error after one orbit, metres
}
for (const dt of [0.1, 1, 10])
  console.log(dt, orbit("explicit", dt), orbit("semi", dt)); // 0.1 2859 0 · 1 28185 -1 · 10 267524 221
```

## The idea

**Numerical integration** advances a state, here position and velocity, by
small steps in time, using the rates of change at each step. The ascent has
no closed form, because thrust, drag and gravity all change with speed,
height and mass along the way, so its equations of motion are stepped
forward from the pad. The **time step**, dt, is the size of one step, and it
trades cost for fidelity: half the step is twice the steps.

**Explicit Euler** is the first scheme anyone writes: compute the
acceleration, move the position by the old velocity times dt, then update
the velocity. **Semi-implicit Euler** swaps the two lines: update the
velocity first, then move the position by the new velocity. The difference
looks like nothing and is everything.

```
   explicit Euler                          semi-implicit Euler
   a = acc(x, v)                           a = acc(x, v)
   x ← x + v·dt        (old v)             v ← v + a·dt
   v ← v + a·dt                            x ← x + v·dt        (new v)

   on a circular orbit:                    on a circular orbit:
        ·  ·  ·                                 ·  ·  ·
     ·           ·  ← each step lands        ·           ·  ← the step's overshoot
    ·      ●      ·    a little outside      ·      ●      ·    and undershoot cancel
     ·           ·     the circle and         ·           ·     over a period; the
        ·  ·  ·  ·     never comes back          ·  ·  ·        orbit closes
```

**Stability** is whether the scheme's errors shrink or grow as the steps
accumulate. In an orbit the velocity always points along the circle and the
acceleration always points inward, so a position step along the old
velocity lands slightly outside the circle every time, and the outward
errors add: the explicit scheme's radius grows without bound and its energy
drifts. The semi-implicit scheme's step uses a velocity already bent inward
by this step's gravity, and the small errors it makes alternate in sign over
a period and cancel. The technical name is symplectic: the scheme preserves
the area of phase space that the true motion preserves, so its energy error
oscillates about zero instead of accumulating. It is still only first-order
accurate per step, the same as explicit Euler, but its errors do not compound
into a trend, and for an oscillating system that is the property that
matters. The game's own physics engine uses the same scheme, for the same
reason.

The step size is then a separate choice, about accuracy rather than
stability. Its cost is linear: 9,000 steps of 0.1 s for a fifteen-minute
flight, 0.8 ms; 45,000 steps at 0.02 s, 16 ms. Its benefit is set by the
fastest thing in the flight, which is not the climb but the circularisation:
a burn of a few hundred metres per second made in a few tens of seconds at
apoapsis, where each step's worth of thrust is a visible fraction of the
whole. At 1 s that burn is over-sampled into 600 m/s where 232 is right; at
0.1 s it is 245. The climb itself, ten minutes of slowly changing
acceleration, is insensitive: its gravity loss moves 4 m/s between 0.02 and
0.1 s.

So the 0.1 s is chosen where the error, a tenth of a percent, is well under
the one percent the flown-in-game comparison can resolve, and the cost is
under a millisecond, which the search of [A2](../the-search/grid-search-then-seeded-refinement.md)
spends a hundred times per vehicle. Smaller buys accuracy nobody can check;
larger costs accuracy the comparison would see.

## In this codebase

`flyAscent` in [`src/core/ascent.ts`](../../../../src/core/ascent.ts) is the
loop, and the scheme is its last three lines of state update:

```ts
const dt = 0.1;
// ...
for (; t < 900; t += dt) {
  // ... thrust T along dir, drag D against the air-relative velocity, gravity g along up
  const acc = [
    (dir[0] * T) / mass - up[0] * g - ((sr > 0 ? vr[0] / sr : 0) * D) / mass,
    (dir[1] * T) / mass - up[1] * g - ((sr > 0 ? vr[1] / sr : 0) * D) / mass,
  ];
  // ...
  vel = [vel[0] + acc[0] * dt, vel[1] + acc[1] * dt]; // velocity first
  pos = [pos[0] + vel[0] * dt, pos[1] + vel[1] * dt]; // then position, from the new velocity
  mass -= mdot * dt;
}
```

The state is two-dimensional, up and east in the plane of the launch, with
the body's rotation folded into the air-relative velocity `vr`. The losses of
[P6](../../physics/ascent/gravity-drag-and-steering-losses.md) are
accumulated in the same loop by the same dt, and the trace the flight card
draws is sampled every 10 s of it.

Two things are not integrated. The coast from cutoff to apoapsis is
[Keplerian](../../physics/orbits/vis-viva-and-circularising.md), so once the
engine is off above the air the code hands over to the orbit's own
arithmetic rather than stepping through ten minutes of nothing. And the
circularisation is integrated live on whichever stage is lit at apoapsis,
staging up if it runs dry, which is where the step size shows.

## What made it real

The two tables above are the measurement. The orbit test isolates the
scheme: same acceleration, same step, and one scheme is three kilometres out
after a turn while the other is exact. The flight test isolates the step:
the same vehicle on the same turn moves 4 m/s between 0.02 and 0.1 s and 51
between 0.02 and 1.0 s, and the whole of the difference is in the
circularisation column.

The comparison the step was chosen against is in the project's README:
seven rockets the tool designed were flown in the game, and five landed
within one percent of the predicted ascent Δv, the Mun three-stage at 4,115
m/s predicted against 4,134 flown. A step whose own error is a tenth of a
percent is invisible under that; a step of a second would have put its 1.5%
on top of whatever the model gets wrong.

## Where it breaks

- **The wrong order of two lines.** Explicit Euler is not merely less
  accurate; on an orbit it is unstable, and no step small enough to afford
  fixes it. A rewrite that "tidied" the update into position-then-velocity
  would move every flown number and pass every type check.
- **A step sized to the climb.** The climb tolerates a second; the
  circularisation does not. The fastest process in the flight sets the step,
  and here it is a thirty-second burn, not a ten-minute ascent.
- **Trusting the fourth digit.** The 0.1 s step is a tenth of a percent
  off the 0.02 s answer. A flown Δv quoted to the metre per second is
  precise to a few, and the design snapshot pins those digits as the
  regression net, not as physics.
- **A cap that is reached.** The loop runs to 900 s. A vehicle that has not
  cut off by then is reported as failed; a very slow stack on a very long
  climb is a different problem the simulator declines to fly.
- **Integrating the coast.** Ten minutes of ballistic flight at 0.1 s is
  six thousand steps of drift for nothing; the coast is Keplerian and is
  computed, not stepped. The scheme is for the parts with thrust and drag.

## Try it

Run the snippet, then change the `10` in the step list to `100`: explicit
Euler no longer produces an orbit at all, while the semi-implicit radius
error is a few kilometres. Then, in `flyAscent`, change `const dt = 0.1` to
`1.0` and run the design snapshot with `npm test`: the flown totals move by
tens of metres per second and the snapshot fails, which is the check that
would catch a step change made by accident. Put it back.

## Check yourself

<details><summary>Explicit and semi-implicit Euler do the same arithmetic per step. Why does one spiral out of a circular orbit and the other not?</summary>

Because of which velocity moves the position. On a circle the velocity is
tangential and the acceleration inward; stepping position along the old,
purely tangential velocity lands outside the circle every step, and the
errors have the same sign forever. Stepping along a velocity that this
step's gravity has already bent inward makes errors that alternate over a
period and cancel; the scheme preserves phase-space area, so its energy
error oscillates instead of drifting.

</details>

<details><summary>Halving the time step from 0.1 to 0.05 s would double the cost of every flight. What would it buy?</summary>

About 2 m/s on a 3,760 m/s ascent, judging by the 4 m/s between 0.1 and
0.02 s. The flown-in-game comparison resolves about one percent, forty
metres per second, so nothing anyone could check. The step is where the
error is already below what can be measured and the cost is under a
millisecond.

</details>

<details><summary>Which part of the flight sets the step size, and how do the tables show it?</summary>

The circularisation. Between 0.02 and 1.0 s the total moves 51 m/s and the
circularisation column moves from 232 to 600, while the gravity loss over
the whole ten-minute climb moves 56 and the maximum pressure barely changes.
A short burn at apoapsis is the fastest process in the flight, and the step
has to resolve it.

</details>

## Further reading

- Ernst Hairer, Christian Lubich and Gerhard Wanner, _Geometric Numerical
  Integration_, the opening chapter, for symplectic Euler and why it
  conserves what explicit Euler does not.
- William Press et al., _Numerical Recipes_, the chapter on integration of
  ordinary differential equations, for step-size choice and the trade
  between order and cost.
- Glenn Fiedler, "Integration Basics", a short game-physics essay on
  semi-implicit Euler and why game engines use it.

## Key takeaway

Update the velocity before the position: that one swap turns an integrator
that spirals a circular orbit three kilometres outward per turn into one
that closes it to the metre at the same cost, and with it a step of 0.1 s
puts the flown ascent within a tenth of a percent of a fifty-times-finer
flight for under a millisecond, where the circularisation burn, not the
climb, is what the step has to resolve.

_As of 2ecc64f._

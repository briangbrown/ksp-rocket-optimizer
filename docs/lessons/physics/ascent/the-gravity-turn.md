# The gravity turn

**Syllabus:** [P9](../../README.md#part-1--physics)

**Why it matters:** The gravity turn matters because it is how a rocket goes
from pointing up on the pad to pointing along its orbit without spending
propellant on steering, and its two numbers, a kick speed and a kick angle, are
the whole of what the solver searches to fly an ascent and find out what the
climb really costs.

**Before this:** [P6](../../README.md#part-1--physics), _Gravity, drag and steering losses_, and
[P3](../../README.md#part-1--physics), _Thrust-to-weight, and the burn-time limits_. Both are used below
by name only.

## A worked case

Strip the problem to what makes it work. A rocket on a flat world with no air,
whose engines push it along the direction it is already moving with a constant
thrust of 1.8 times its weight. Gravity is 9.81 m/s². It rises straight up until
it is moving at 100 m/s, then tips its nose 10° from vertical, once, and from
then on only ever points the way it is going.

Step it forward a tenth of a second at a time. Call the angle between the
velocity and straight up the _tilt_.

| Time  | Height  | Speed     | Tilt | Lost to gravity |
| ----- | ------- | --------- | ---- | --------------- |
| 13 s  | 0.6 km  | 100 m/s   | 10°  | 125 m/s         |
| 47 s  | 7.7 km  | 408 m/s   | 45°  | 415 m/s         |
| 94 s  | 20.5 km | 1,045 m/s | 80°  | 612 m/s         |
| 116 s | 22.6 km | 1,410 m/s | 90°  | 630 m/s         |

Nobody steered after 13 seconds. The rocket levelled itself. That is the
gravity turn: gravity does the steering, and the pilot's only decisions were
_when_ to tip (100 m/s) and _how far_ (10°).

Now change one number. Tip 6° instead of 10° and the rocket levels out at
51.9 km, moving at 2,138 m/s. Tip 4° and it is still 8° from level at 92.9 km
when it reaches orbital speed. The kick angle chooses where the turn finishes,
and a real ascent to an 80 km orbit wants that to be at 80 km, level, at
2,280 m/s.

Then change the other number that matters. Keep the 10° kick at 100 m/s but
give the rocket a thrust of 1.4 times its weight. It levels out at 7.4 km,
moving at 529 m/s, having lost 552 m/s to gravity. From there it falls back
into the air it just climbed out of. Same kick, a weaker rocket, and the turn
runs away.

Everything in this table came from the snippet below. Run it with `node`
and change the numbers.

```js
const g = 9.81,
  twr = 1.8,
  kick = (10 * Math.PI) / 180,
  vKick = 100;
let v = 0,
  tilt = 0,
  h = 0,
  t = 0,
  loss = 0;
for (; tilt < Math.PI / 2 && v < 2300; t += 0.1) {
  if (!tilt && v >= vKick) tilt = kick;
  v += (twr * g - g * Math.cos(tilt)) * 0.1;
  if (tilt) tilt += ((g * Math.sin(tilt)) / v) * 0.1;
  h += v * Math.cos(tilt) * 0.1;
  loss += g * Math.cos(tilt) * 0.1;
}
console.log(t.toFixed(0), (h / 1000).toFixed(1), v.toFixed(0), loss.toFixed(0));
```

## The idea

A rocket wants to leave the pad pointing up, because the air is thickest at the
bottom and the fastest way out of it is straight up. It wants to arrive in orbit
pointing sideways, because an orbit is a sideways motion. Something has to turn
it through ninety degrees on the way, and turning a rocket by pointing its
engine off the direction of travel costs propellant for no gain in speed. The
**gravity turn** is the trick of getting gravity to do the turning for free.

Point the thrust along the velocity. Then gravity is the only force that acts
across the direction of travel, and it does two things at once:

```
          up
          ^
          |      v  (velocity and thrust, tilted θ from vertical)
          |     /
          |    /
          | θ /
          |  /
          | /
          |/______________> east

   g points straight down. Split it against v:
     g·cos θ  along −v : slows the climb        (the gravity loss)
     g·sin θ  across v : swings v toward level  (the turn)
```

The across-track part swings the velocity vector toward the horizon at a rate
of

    dθ/dt = g · sin θ / v

radians per second. Read the fraction. The turn rate is proportional to
gravity and inversely proportional to speed. At 400 m/s and a 45° tilt it is
9.81 × 0.707 / 400 = 0.017 rad/s, about one degree a second. Double the speed
and the rate halves.

That fraction is the whole mechanism. Early in the flight the rocket is slow,
so any tilt at all grows fast; that is why the tip-over is made small and made
late enough that the rocket has some speed to steady it. As the rocket gains
speed the turn slows on its own, and a rocket whose speed grows quickly finishes
its turn high and fast. A rocket whose speed barely grows keeps turning at the
early rate, reaches horizontal low and slow, and falls. Speed grows at the rate
thrust exceeds the along-track part of gravity, `twr·g − g·cos θ`, so a
thrust-to-weight ratio near one is the case where the turn runs away: the
1.4 rocket above.

So two numbers describe a gravity turn, and they are the two a pilot actually
sets:

- The **kick** is the one deliberate tip of the nose, given as the speed to do
  it at (the _kick speed_) and the angle to tip by (the _kick angle_).
- After the kick the rocket follows **prograde**, which is the direction it is
  already travelling. On the game's instrument that is the prograde marker, and
  the **pitch** it shows is the angle of the nose above the horizon, so a tilt
  of θ from vertical is a pitch of 90° − θ.

Once the rocket is following prograde there is nothing left to decide. Kick
speed and kick angle fix the rest of the flight. That is what makes the ascent
searchable: a whole trajectory is two numbers.

## In this codebase

`flyAscent` in [`src/core/ascent.ts`](../../../../src/core/ascent.ts) flies the turn. It takes `vKick` and `kick`
and integrates the flight in 0.1 s steps ([A4](../../README.md#part-2--algorithms-and-the-solver) covers the
scheme). The kick and the follow are these lines:

```ts
if (!kicked && sr >= opt.vKick) kicked = true; // sr: speed through the air
let pitch = 0; // 0 is straight up; the code's "pitch" is the tilt from vertical
if (kicked) {
  const pro = Math.atan2(/* east part of v */, /* up part of v */);
  if (handT < 0 && pro - lead >= opt.kick) { handT = t; ... } // the handoff
  pitch = Math.min(Math.PI / 2, Math.max(pro - lead, opt.kick));
}
```

Three things differ from the toy above.

The nose does not jump to the kick angle and then follow prograde from the
same instant. It is _held_ at the kick angle while the velocity vector, still
nearly vertical, swings up to meet it. The moment it does is the **handoff**:
from there the nose follows prograde and, as the comment says, "the turn flies
itself". The flight card reports the handoff because it is the moment a pilot
needs to know about.

`lead` is a third parameter, normally zero, that holds the nose a few degrees
above prograde. Zero reproduces the turn described here exactly, and a test
holds that. What it is for is the runaway case, and that is
[P10](../../README.md#part-1--physics), _Why low thrust needs the nose above prograde_.

The `Math.min(Math.PI / 2, …)` floors the nose at the horizon. Following
prograde with no floor lets a shallow flight nose down and fly back into the
ground while its coast still reads as reaching orbit.

`optimiseTurn`, in the same file, is the search over the two numbers. It flies
a grid of kick speeds from 30 to 140 m/s in steps of 20 and kick angles from 3°
to 25° in steps of 4, thirty-six flights, keeps the cheapest that stays under a
cap on air pressure, then flies a finer grid within 15 m/s and 3° of that best.
[A2](../../README.md#part-2--algorithms-and-the-solver) is about why a coarse grid then a local refinement, and
why not a fine grid from the start.

## What made it real

Seven rockets designed by the tool were flown in the game and their ascent Δv
compared with what this model predicted (`README.md`, _What it gets right_).
Five landed within 1%: the Mun three-stage at 4,115 m/s predicted against
4,134 flown, the small probe at 4,183 against 4,151. A two-number description of
an ascent is enough to predict a real one to a percent, when the rocket has
thrust to spare.

The two that missed, by 7.5% and by 44%, were both stacks whose thrust-to-weight
ratio sat near one in the upper stage. On those the model predicted far more
Δv than the pilot needed, because the pilot did something the two numbers cannot
express. That miss is the edge of this lesson and the start of the next.

## Where it breaks

- **When thrust barely exceeds weight.** The runaway in the worked case. The
  two-parameter search's answer on such a stack is the latest, shallowest kick
  on the grid, which is "stay vertical" and pays for it in gravity loss. On the
  six-Hammer Mainsail in [`test/ascent.test.ts`](../../../../test/ascent.test.ts) that flight costs 4,549 m/s.
  The fix is the third parameter, [P10](../../README.md#part-1--physics); the rule is in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) under _The turn has three parameters_.
- **When the search is unconstrained.** Left alone the optimiser finds a violent
  early kick that trades gravity loss for air pressure the rocket could not
  survive. The cap at 40 kPa exists for that, and is [P11](../../README.md#part-1--physics).
- **When the toy is mistaken for the model.** The snippet above holds thrust
  constant, ignore air, and fly over a flat world. The real simulator burns
  propellant so thrust-to-weight rises through the burn, reads drag from the
  atmosphere curves, drops stages, and flies over a curving planet whose
  gravity weakens with height. The mechanism is the same; the numbers are not.

## Try it

Run the snippet above with `twr = 1.8`. Change that one number to `1.05`
and run it again. The rocket takes 204 s just to reach its 100 m/s kick
speed, loses 2,000 m/s to gravity before the turn even starts, and is level at
12.7 km doing 224 m/s thirty seconds later.

## Check yourself

<details><summary>A rocket is moving at 400 m/s tilted 45° from vertical, following prograde. How fast is its velocity swinging toward the horizon, and what would doubling its speed do to that?</summary>

About one degree a second: g · sin θ / v = 9.81 × 0.707 / 400 = 0.017 rad/s.
Doubling the speed halves the rate, because speed is in the denominator and
nothing else changed.

</details>

<details><summary>Why is the kick set at a speed rather than at an altitude or a time?</summary>

Because speed is what governs the turn. The rate the velocity swings is
g · sin θ / v, so the same kick at the same speed produces the same early turn
whatever the rocket's altitude or how long it took to get there. A kick set by
altitude or time would behave differently on every rocket.

</details>

<details><summary>Two rockets both kick 10° at 100 m/s and follow prograde. One has 1.8 times its weight in thrust, the other 1.4. Which levels out lower, and why?</summary>

The 1.4 rocket, at 7.4 km against 22.6 km. Its speed grows more slowly, so
g · sin θ / v stays large for longer and the tilt runs to 90° before the rocket
is high or fast. The 1.8 rocket outruns its own turn.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  rocket vehicle dynamics, section on the gravity-turn trajectory. The same
  equations with the planet's curvature kept.
- Robert Braeunig, _Rocket and Space Technology_, "Rocket Propulsion", for the
  loss terms in the context of a real launch.
- The KSP wiki's gravity-turn tutorial, for what the two numbers feel like at
  the controls.

## Key takeaway

Point the thrust along the velocity and gravity turns the rocket for free at a
rate of g · sin θ / v; a kick speed and a kick angle are then the whole flight,
which is why an ascent can be searched at all.

_As of 191b22f._

# Gravity, drag and steering losses

**Syllabus:** [P6](../../README.md#part-1--physics)

**Why it matters:** The losses matter because an 80 km orbit around Kerbin is
a speed of 2,279 m/s and the cheapest rocket the tool has ever flown there
spent 3,476, so about a third of every launch stage's Δv buys no speed at all;
the sizing formulas cannot see where it goes, and measuring it is the whole
reason the simulator exists.

**Before this:** [P1](../staging/dv-and-the-rocket-equation.md), _Δv and the
rocket equation_, and [P3](../staging/thrust-to-weight-and-burn-time.md),
_Thrust-to-weight, and the burn-time limits_.

## A worked case

Take a rocket the solver designed and fly it. The brief is 3.5 t to low
Kerbin orbit; the design is three Thuds under a 25.3 t first stage and a
Terrier on a 6.9 t second. The simulator flies the best turn it can find and
reports where the propellant went:

| What the engines spent, pad to shutdown | 3,066 m/s     |
| --------------------------------------- | ------------- |
| Lost to gravity                         | 1,046 m/s     |
| Lost to drag                            | 252 m/s       |
| Lost to steering                        | 0.2 m/s       |
| **Left as speed through the air**       | **1,768 m/s** |

Then the engines stop and the rocket climbs on to the top of its arc, arriving
at 80 km doing 1,869 m/s, and a final burn of 410 m/s rounds the orbit off at
2,279. The whole ascent costs 3,476 m/s, and the map's figure for the same
trip, the one [P5](../mission/the-mission-dv-budget.md)'s budget was built
from, is 3,400.

Read the first table again. Of what the engines spent, 42% never became speed.
Most of it, 1,046 m/s, went into holding the rocket up against gravity while it
was still pointed mostly upward. Another 252 went into shoving air aside. Almost none went into steering, because after its kick this
rocket pointed exactly where it was going.

Three other designs from the same solver, flown the same way, show the shape
holds:

| Brief                 | Spent to shutdown | Gravity   | Drag    | Steering | Losses' share |
| --------------------- | ----------------- | --------- | ------- | -------- | ------------- |
| 0.8 t, three Twitches | 3,517 m/s         | 1,429 m/s | 152 m/s | 0.2 m/s  | 45%           |
| 3.5 t, above          | 3,066 m/s         | 1,046 m/s | 252 m/s | 0.2 m/s  | 42%           |
| 12 t, Skipper, Poodle | 3,436 m/s         | 1,317 m/s | 65 m/s  | 0.2 m/s  | 40%           |

Gravity always dominates. Drag is a tenth of it or less, and it falls as the
rocket grows, because a big rocket has much more mass behind each square metre
of nose. Steering is nothing, by design.

The bookkeeping is exact, and in a world without air it is a one-line
identity. Take [P9](the-gravity-turn.md)'s flat-world rocket and keep three
running sums: what the engine spends, the speed it has, and the gravity loss.

```js
const g = 9.81,
  twr = 1.8,
  kick = (10 * Math.PI) / 180,
  vKick = 100;
let v = 0,
  tilt = 0,
  t = 0,
  spent = 0,
  gLoss = 0;
for (; tilt < Math.PI / 2 && v < 2300; t += 0.1) {
  if (!tilt && v >= vKick) tilt = kick;
  v += (twr * g - g * Math.cos(tilt)) * 0.1; // thrust along v, minus gravity's part along v
  spent += twr * g * 0.1; // every m/s the engine produced
  gLoss += g * Math.cos(tilt) * 0.1; // the part of gravity that opposed the motion
  if (tilt) tilt += ((g * Math.sin(tilt)) / v) * 0.1;
}
console.log(
  "spent",
  spent.toFixed(0),
  "= speed",
  v.toFixed(0),
  "+ gravity loss",
  gLoss.toFixed(0),
);
```

At 1.8 times its weight this rocket spends 2,041 m/s, has 1,410 of speed, and
lost 631 to gravity: 1,410 + 631 = 2,041, to the metre a second.

## The idea

The rocket equation says how much Δv an engine can produce. It says nothing
about how much of it turns into speed, and on a launch most of it does not.
Write the acceleration along the direction of travel, which is what changes
speed, and every term that is not thrust is a loss:

    d(speed)/dt = T/m · cos φ  −  g · cos θ  −  D/m

T/m is what the engine produces. φ is the angle between the thrust and the
velocity, θ the tilt of the velocity from vertical, D the drag. Multiply
through by the time step and add up the flight, and what the engine produced
splits into four parts that sum exactly:

    Δv produced = speed gained + gravity loss + drag loss + steering loss

**Gravity loss** is the sum of g · cos θ over the burn: the part of gravity's
pull that points straight back along the motion. It is largest when the rocket
is vertical, cos θ = 1, and it costs 9.81 m/s for every second spent that way,
which is why [P3](../staging/thrust-to-weight-and-burn-time.md) wanted the
burn short and [P9](the-gravity-turn.md) wanted the nose to come down. It is
zero when the rocket is horizontal, because gravity then pulls across the
motion and bends it instead of slowing it. That bending is not a loss; it is
what an orbit is. A launch spends its gravity loss early, while it is slow and
steep, and a rocket that gets fast and level quickly spends less of it.

**Drag loss** is the sum of D/m: the air's resistance divided by the mass it
is resisting. Drag grows as the square of speed and falls as the air thins, so
it peaks a few kilometres up where the rocket is already fast and the air is
still thick, the moment of greatest air pressure that
[P11](../../README.md#part-1--physics) caps. Dividing by mass is why it is
small for big rockets: the air pushes on area, and area grows more slowly than
mass. [P8](../../README.md#part-1--physics) is how D itself is computed.

**Steering loss** is the sum of T/m · (1 − cos φ): the part of the thrust that
is wasted because the engine is not pointing along the velocity. A rocket
holding its nose off prograde is spending propellant to turn rather than to
speed up. Following prograde makes it zero, and the simulator's flights show
0.2 m/s of it, all from the few seconds the kick attitude is held before the
velocity catches up. A pilot fighting a low-thrust stack with the nose held
above prograde pays real steering loss, and pays it gladly, because the gravity
loss it saves is larger.

Losses accrue only while the engine runs. After shutdown the rocket climbs on,
trading speed for height as gravity slows it, and that trade is not a loss:
the height is orbital energy the final burn does not have to buy. Counting
gravity's pull through the unpowered climb as a loss is a natural mistake,
and it was made here once.

Nothing in the closed-form sizing knows any of this. `propellantFor` is given a
Δv and produces a stage; the 3,400 m/s it is given for a Kerbin ascent is the
map's average over the rockets people fly, losses included. Whether this
rocket's losses come to 1,100 or 1,500 depends on its thrust, its shape and
its turn, and the only way to know is to fly it. That is the simulator's job,
and the re-solve against what it finds is
[A7](../../README.md#part-2--algorithms-and-the-solver).

## In this codebase

The accounting is six lines in `flyAscent`, [`src/core/ascent.ts`](../../../../src/core/ascent.ts), run every
0.1 s step while the engines are lit:

```ts
const vh = [vr[0] / sr, vr[1] / sr]; // unit vector along the velocity through the air
if (!coasting) gLoss += g * (vh[0] * up[0] + vh[1] * up[1]) * dt; // g · cos θ
dLoss += (D / mass) * dt; // drag divides by what it is slowing
if (!coasting)
  sLoss += (T / mass) * (1 - (dir[0] * vh[0] + dir[1] * vh[1])) * dt; // T/m · (1 − cos φ)
dvUsed += (T / mass) * dt; // what the engine produced
```

`vr` is the velocity relative to the air, which is what drag and the turn see;
`up` is the local vertical; `dir` is where the thrust points. The
`!coasting` guards are the rule about the unpowered climb: drag still costs
speed while the rocket coasts and is still counted, gravity's pull is not.

The flight card shows the three as _Gravity loss_, _Drag loss_ and _Steering
loss_ under the ascent it describes, next to the total the rocket was built to
carry, so a reader can see where a rocket that costs more than the map said is
spending the difference.

## What made it real

The unpowered climb was the measurement that fixed the rule. A five-minute
ascent with a nine-minute climb to the top of its arc was reporting a gravity
loss 1,200 m/s higher than it should have, because the sum kept running after
**cutoff**, the moment the engines are shut down once the climb will reach the
target height. The rocket was still rising and gravity was still slowing it,
and no propellant was being spent against either; the comment in the code
records the phantom and the reason it was one.

The seven rockets flown in the game against the tool's predictions are a
measurement of the whole sum. Five landed within 1%, the Mun three-stage at
4,115 m/s predicted against 4,134 flown. A model that integrates these three
losses over a two-parameter turn predicts a real ascent to a percent when the
rocket has thrust to spare. The two that missed, by 7.5% and 44%, were stacks
whose gravity loss the two-parameter turn could not bring down, which is
[P10](../../README.md#part-1--physics).

## Where it breaks

- **Counting the climb.** The phantom 1,200 m/s above. Gravity loss is a cost
  of thrusting against gravity, and it stops when the thrust does.
- **Treating the final burn as instantaneous.** A stage that arrives at the
  top of its arc slow has to buy most of the orbital speed there, and on a
  small upper stage that burn runs for minutes. Over that long the thrust that
  started horizontal is no longer horizontal, and the burn costs more than the
  difference of two speeds. The simulator integrates it, and
  [P13](../../README.md#part-1--physics) is about that burn.
- **A loss the turn can inflate without limit.** The six-Hammer Mainsail of
  P3 and P9 paid 2,600 m/s of gravity loss on a stack that had passed every
  floor, because after its boosters dropped it could only climb straight up.
  The losses are a function of the flight, not the rocket, and a search over
  the turn is a search over them.
- **Reading the map's figure as this rocket's.** 3,400 m/s is what an average
  Kerbin ascent costs. The 3,476 above is 76 m/s over it, inside the margin;
  the 4,296 m/s ascent of #167 was 900 over, and only the simulator knew.

## Try it

Run the snippet, then change `twr` to `1.4`. The rocket spends 1,082 m/s, has
529 of speed and lost 553 to gravity: more than half of what it spent, against
less than a third at 1.8, and the identity still closes to the metre a second.
Then open the application, let the default brief solve, and expand the flight
card: the three loss lines there are the same three sums, taken over the real
turn with real air.

## Check yourself

<details><summary>A rocket spent 3,066 m/s of Δv before shutdown and its losses were 1,046, 252 and 0.2 m/s. How fast was it moving through the air at shutdown?</summary>

1,768 m/s. What the engine produced is speed gained plus the three losses, so
speed is 3,066 − 1,046 − 252 − 0.2. The identity is exact because that is how
the three sums are defined.

</details>

<details><summary>Why does gravity loss stop accruing when the engines stop, even though the rocket is still climbing and gravity is still slowing it?</summary>

Because a loss is propellant spent for nothing, and no propellant is being
spent. The slowing during the unpowered climb is speed traded for height, and
the height is energy the final burn does not have to buy. Counting it double
counts the climb.

</details>

<details><summary>Why is the drag loss of the 12 t rocket a quarter of the 0.8 t rocket's, when the big rocket is faster through thick air?</summary>

Because drag loss is drag divided by mass. Air pushes on the rocket's frontal
area, and a rocket fourteen times heavier is nowhere near fourteen times wider,
so each square metre of nose has far more mass behind it and the same push
slows it far less.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapter on
  flight performance, where the four-term split is derived and the losses are
  tabulated for real launchers.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  rocket vehicle dynamics, for the equations of motion the simulator
  integrates.
- The KSP wiki, _Atmospheric flight_, for the game's own account of what an
  ascent through Kerbin's air costs and why.

## Key takeaway

Every metre a second an engine produces becomes speed, gravity loss, drag loss
or steering loss, and the sum is exact; on a Kerbin launch gravity takes about
a third, drag a few percent, steering nothing if the nose follows the velocity,
and the only way to know this rocket's share is to fly it.

_As of 21d6936._

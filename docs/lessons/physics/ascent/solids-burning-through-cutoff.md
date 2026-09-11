# Solids: burning through cutoff

**Syllabus:** [P12](../../README.md#part-1--physics)

**Why it matters:** Solid motors matter because they are the cheapest thrust
in the game and they cannot be turned off, so a stack that lights them has
given up the one control every other ascent relies on, the cutoff; the
simulator has to hold its engines lit until the solids are spent, and the two
settings the pilot still has, the limiter fixed in the editor and the throttle
on the liquid core, are the whole of what the search can do about it.

**Before this:** [P9](the-gravity-turn.md), _The gravity turn_, and
[P11](max-q.md), _Max-Q_.

## A worked case

A Hammer holds 2.813 t of solid fuel and burns it at 118.8 kg/s: 23.7 s from
ignition to burnout, and nothing anyone does in flight changes that. Strap four
Kickbacks, the big 24 t solids that burn for 62.8 s, to a Mainsail core with a
15 t payload above, and fly it:

| Core throttle during the boost | Total     | Top of the climb, at cutoff | Gravity loss |
| ------------------------------ | --------- | --------------------------- | ------------ |
| 100%                           | 3,909 m/s | 124.2 km                    | 598 m/s      |
| 65%                            | 3,753 m/s | 80.1 km                     | 681 m/s      |

The target is 80 km. At full throttle the stack passes the point where a
liquid rocket would shut down while the Kickbacks still have propellant, and
there is no shutting them down. The cutoff is held until they are spent, and
by then the climb is aimed 44 km past the mark. Everything spent lifting the
top of the arc from 80 km to 124 is Δv the orbit does not need.

Throttle the liquid core to 65% for those 63 s and the two finish together:
the solids burn out just as the climb is aimed at 80 km, the core cuts off,
and the ascent costs 156 m/s less despite 83 m/s more gravity loss from the
slower climb. Against the best turn the search could find with the core at
full throttle, 4,115 m/s, the throttled flight is worth 362 m/s, which is the
figure the flight card shows beside the instruction to hold the core at 65%.

The other control is set before launch. A Reliant with two Thumpers on a 3 t
payload is over-thrusted for the air it climbs through and passes 40 kPa on
every full-thrust turn. The search's answer is the boosters' thrust limiter at
85%: the Thumpers make 85% of their thrust for 42.2 / 0.85 = 49.6 s instead of
42.2, and the stack stays under the cap. That is [P11](max-q.md)'s fallback
applied to solids, and it is what a player does by right-clicking the booster
in the editor and dragging the slider.

What the limiter does not do is cost Δv on its own. A solid's **total
impulse**, thrust times burn time, is fixed by the propellant it holds, and the
limiter trades one factor against the other:

```js
const g0 = 9.81,
  g = 9.81;
const isp = 195,
  fuel = 2.813,
  dry = 0.75,
  thrust = 227.1; // a Hammer, in vacuum figures
const mdot = (thrust * 1000) / (isp * g0); // kg/s at 100%
for (const limit of [1.0, 0.7, 0.5]) {
  const burn = (fuel * 1000) / (mdot * limit); // seconds: the limiter scales flow with thrust
  const dv = isp * g0 * Math.log((fuel + dry + 2) / (dry + 2)); // 2 t of payload; the same at any limit
  console.log(
    `${limit * 100}%: ${(thrust * limit).toFixed(0)} kN for ${burn.toFixed(1)} s, Δv ${dv.toFixed(0)} m/s, gravity loss if vertical ${(g * burn).toFixed(0)} m/s`,
  );
}
```

At 100% the Hammer gives 227 kN for 23.7 s; at 50%, 114 kN for 47.4 s. The Δv
it produces on a 2 t load is 1,348 m/s either way, because the rocket equation
sees only the mass ratio. What the limiter changes is how long the burn takes,
and so how long gravity gets to charge for it: 232 m/s of gravity loss for a
vertical 24 s burn, 465 for 47 s. The limiter is free in Δv and paid in time.

## The idea

A **solid** rocket motor is a tube of propellant that burns from the inside
out. There is no pump, no valve and no tank: the fuel and the oxidiser are
mixed in the block, and once lit it burns until the block is gone. That is
what makes solids cheap, simple and reliable, and it is what makes them
unlike every other engine on the rocket. A liquid engine takes a throttle
setting and a shutdown command. A solid takes neither. The only setting it has
is the **thrust limiter**, chosen in the editor before launch, which in KSP
narrows the nozzle in effect: less thrust, proportionally less flow, the same
propellant burned over a longer time. In flight the throttle lever does
nothing to it.

That changes the ascent in three ways.

The cutoff is gone while they burn. A liquid ascent shuts its engines the
moment the climb is aimed at the target height and coasts the rest of the way.
A stack with solids lit cannot; it keeps accelerating until they are spent, and
if the core has put the climb on target early, the solids carry it past. The
overshoot is pure waste: energy put into an arc higher than the orbit needs,
which the final burn then has to work against. The pilot's remedy is the one
control left, the liquid core's throttle. Pull it back so the core and the
solids finish together, and the climb is aimed at the target exactly when the
solids die and the core can cut off. The simulator's core-throttle search is
that remedy made systematic.

The limiter trades thrust for time. Because total impulse is fixed, a solid at
70% gives the same Δv over a burn 43% longer. On an over-thrusted stack that
is exactly what is wanted: slower through the thick air, under the pressure
cap. On a stack that needs the thrust it costs gravity loss for nothing. The
search tries it only when no full-thrust turn stays under the cap.

And a solid's burn time is a property of the part, not the design. A Hammer
burns for 23.7 s whether it is one of two or one of eight, and a Kickback for
62.8 s. A booster's contribution to the ascent is therefore a fixed slice of
the early climb, and the closed-form sizing can treat the boost as a phase of
known length, which is what makes a hundred booster layouts cheap enough to
price.

## In this codebase

`flyAscent` in `src/core/ascent.ts` carries two throttles for a stage with a
ring of boosters, and applies each to the right engines:

```ts
const lim = iS === 0 ? (opt.limit === undefined ? 1 : opt.limit) : 1; // the limiter, set in the VAB
const bLim = st && st.boosters ? lim : 1; // on the boosters when there are any, else the core
const cLim =
  st && st.boosters ? (iS === 0 && opt.core !== undefined ? opt.core : 1) : 1; // the core's throttle
// ...
T += st.mdot * cLim * isp * 9.80665; // the core: thrust and flow scale together
T += bLeft * bo.mdot * bLim * isp * 9.80665; // the ring: likewise
```

The cutoff test holds while the ring has propellant:

```ts
if (!coasting && apo >= targetR && climbing && bProp <= 0) coasting = true;
```

`bProp <= 0` is the sentence "a solid cannot be shut down" as code. Until the
boosters are spent the engines stay lit however far past the mark the climb is
aimed, and the comment there says to record how far, which the flight card
shows. When the pool empties the ring's dry mass is dropped in the same step.

`optimiseTurn` tries the core throttle last, after the turn and the lead have
been chosen, and only when the first stage has a ring:

```ts
if (veh.stages[0] && veh.stages[0].boosters) {
  for (let cr = 1; cr >= 0.35; cr -= 0.05) {
    const r = flyAscent(veh, { ...seedTurn, core: cr });
    if (r.ok && r.maxQ <= qCap && (!found.best || r.total < found.best.total))
      found.best = { ...r, core: cr, fullThrottle: seedTurn.total }; // what it costs without throttling
  }
}
```

`fullThrottle` is kept so the card can say what the throttling was worth. The
limiter is P11's fallback, `limit`, and `bLim` sends it to the ring when there
is one, "the slider people actually reach for".

The closed form in `boostedAscent`, `src/core/solver.ts`, sizes a boosted stage
without flying it. Each solid in the roster becomes a mount with two figures,
its mass flow and its burn time, `tB = fuelM / mdotB`; a solid that burns for
under 20 s is skipped as too brief to be a stage, which excludes the Flea and
the separation motors. A booster ring that would supply less than 8% of the
stage's Δv is skipped too: boosters that burn out in a handful of seconds are a
crutch, not a stage. [A14](../../README.md#part-2--algorithms-and-the-solver)
is the two-phase arithmetic itself.

The flight card knows which kind of ring it is describing. For a solid ring
its steps say to hold the core at N% until the boosters burn out, and its note
says a lit solid ignores the throttle lever and the limiter set in the editor
is the only hold on it; for a liquid ring, which can be throttled, the wording
changes.

## What made it real

The overshoot was a reporting bug before it was a modelling choice. Solids
used to be modelled as stoppable, and the simulator would report a cutoff
while the boosters were still pushing: a climb aimed at exactly 80 km, and a
flight card telling the pilot to cut the engines at a moment when the
Kickbacks would go on burning for another twenty seconds. The comment in the
code records it. Holding the cutoff until `bProp <= 0` made the simulator fly
what the game flies, and the overshoot appeared in the numbers where it had
always been in the game.

The core throttle followed from watching what the overshoot cost. On the
Mainsail with four Kickbacks above, the best full-throttle flight the search
can find costs 4,115 m/s and the throttled one 3,753. The 362 m/s difference is
the flight card's "worth about" figure, and it is the kind of number that
changes which design the solver picks, since a boosted stack the model thinks
is expensive to fly is one it will not choose.

The 20 s and 8% thresholds are judgments, and the lesson should say so. What
they encode is measured on the parts: the Flea's 8.8 s and the Sepratron's 5 s
are the burns they exclude, and a Hammer's 23.7 s is the shortest they admit.

## Where it breaks

- **A lit solid ignores the throttle lever.** The flight card once said
  "throttle down" of a stack whose only throttleable engine was the core, as
  if the boosters would follow. Issue #166 fixed the wording: the limiter is
  the only hold on a solid, and it is set before launch.
- **Cutting the core while the solids burn.** It does not end the burn; it
  removes the one engine that could have been throttled to match. The
  simulator holds the cutoff for the ring and lets the core's throttle do the
  matching instead.
- **Throttling the core on a stack that does not need it.** The core scan is
  gated on the ring existing and the flight staying under the pressure cap,
  and the search keeps the throttled flight only if it is cheaper. On the
  six-Hammer Mainsail of [P10](why-low-thrust-needs-the-nose-above-prograde.md)
  the boosters are spent in 24 s, long before any cutoff, and the search
  leaves the core at 100%.
- **The limiter as a Δv lever.** It is not one. A limiter at 70% on a stack
  that did not need slowing gives the same Δv over a longer burn and pays the
  difference in gravity loss. The search reaches for it only under the
  pressure cap.

## Try it

Run the snippet. Then change the Hammer's figures to the Kickback's: `isp =
220`, `fuel = 19.5`, `dry = 4.5`, `thrust = 670.2`. The burn is 62.8 s at 100%
and the Δv is the same at every limit, but the gravity loss of a vertical burn
at 50% passes 1,200 m/s. A limiter on a big solid is expensive in time even
though it is free in Δv, which is why the search uses it only when the air
leaves no choice.

## Check yourself

<details><summary>A stack's solids will burn for 63 s. The liquid core alone would put the climb on target at 50 s. What happens at full throttle, and what does the pilot do about it?</summary>

The cutoff cannot happen at 50 s because the solids cannot be shut down; the
whole stack keeps accelerating for another 13 s and carries the top of the
climb well past the target. The pilot throttles the core back during the boost
so that the climb is aimed at the target exactly when the solids burn out.

</details>

<details><summary>Why does setting a solid's thrust limiter to 70% not change the Δv it produces?</summary>

Because the limiter scales the mass flow along with the thrust. The same
propellant leaves at the same exhaust speed, only over a longer time, so the
mass ratio and hence the rocket equation's Δv are unchanged. What changes is
the burn time, and with it the gravity loss the stage pays while burning.

</details>

<details><summary>Why does the closed-form sizing skip solids that burn for under 20 s, and rings that supply under 8% of a stage's Δv?</summary>

Because a boost that short is not a stage but a kick: it adds parts, mass and
a separation for a few seconds of thrust the core could have supplied. The
thresholds are judgments, but the parts they exclude are clear cases, the
Flea at 8.8 s and the separation motors at 5.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapters
  on solid propellant motors, for burn rate, grain geometry and why total
  impulse is what a solid fixes.
- The KSP wiki, _Solid rocket booster_ and _Thrust limiter_, for the game's
  own account of what the slider does.
- The Space Shuttle's solid rocket boosters, in any account of the Shuttle
  ascent, for the same problem at full scale: a core throttled while solids
  it could not stop burned out.

## Key takeaway

A solid fixes its total impulse and takes no command once lit, so the cutoff
is held until it is spent; the limiter set before launch trades thrust for
time at no cost in Δv, and the liquid core's throttle is the one control left
to land the solids' burnout where the climb to orbit needs it.

_As of 8c3729e._

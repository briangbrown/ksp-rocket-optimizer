# The Oberth effect

**Syllabus:** [P20](../../README.md#part-1--physics)

**Why it matters:** The Oberth effect matters because a metre per second of
burn buys energy in proportion to how fast the ship is already moving, so the
same 918 m/s of transfer speed that would cost 918 m/s if bought at rest far
from Kerbin costs 128 when it is folded into the escape burn in low orbit;
that ratio is why every departure in this application is priced from the
lowest orbit the body allows, why a capture that only passes through a system
is priced as a kiss at periapsis and not as a circularisation, and why the
ejection formula adds the excess as an energy under a square root instead of
as a speed.

**Before this:** [P18](ejection-energy-and-the-hyperbolic-leg.md), _Ejection:
characteristic energy and the hyperbolic leg_.

## A worked case

A ship in an 80 km [parking orbit](patched-conics-and-the-sphere-of-influence.md)
about Kerbin moves at 2,279 m/s. Escape speed there is 3,223 m/s, so escaping
costs 944 m/s. The Hohmann to Duna from [P17](hohmann-transfer-and-synodic-period.md)
needs the ship to have 918 m/s left once it is clear of Kerbin. [P18](ejection-energy-and-the-hyperbolic-leg.md)
priced the whole burn at 1,072 m/s. Subtract the escape and the transfer
speed cost 128 m/s, not 918.

Where did the other 790 go? Into the speed the ship already had. Kinetic
energy is ½v² per kilogram, so a small burn Δv made at speed v adds about
v × Δv of energy. At 3,223 m/s, each metre per second of burn adds 3,223
joules per kilogram. The transfer needs ½ × 918² = 421,000 J/kg of energy
beyond escape, and at three thousand-odd joules a metre per second that is
about 128 m/s. Bought at rest, far from Kerbin, where the ship's speed is
nearly zero, the same 421,000 J/kg is ½Δv² and costs the full 918.

The community's Δv map, the table every player uses, splits each departure
into "escape" and "escape to transfer", and the second number is this
effect measured in play:

| Target | Transfer speed needed, v∞ | Burn from 80 km | Over the 944 to escape | The map's "escape → transfer" |
| ------ | ------------------------- | --------------- | ---------------------- | ----------------------------- |
| Eve    | 779 m/s                   | 1,037 m/s       | 93 m/s                 | 90 m/s                        |
| Duna   | 918 m/s                   | 1,072 m/s       | 128 m/s                | 130 m/s                       |
| Dres   | 2,088 m/s                 | 1,561 m/s       | 617 m/s                | 610 m/s                       |
| Moho   | 2,349 m/s                 | 1,709 m/s       | 765 m/s                | 760 m/s                       |
| Jool   | 2,713 m/s                 | 1,934 m/s       | 990 m/s                | 980 m/s                       |
| Eeloo  | 2,955 m/s                 | 2,094 m/s       | 1,150 m/s              | 1,140 m/s                     |

Every row agrees within one percent, from the formula alone. And the
discount shrinks as the transfer speed grows: Duna's 918 costs 14% of
itself, Eeloo's 2,955 costs 39%, because a larger excess is a larger share
of the ship's total speed and less of it rides on speed the ship already had.

```js
const G0 = 9.80665;
const mu = 1.000341605 * G0 * 600000 ** 2; // Kerbin
const r = 680000; // an 80 km parking orbit
const vc = Math.sqrt(mu / r), // 2,279
  vesc = Math.sqrt((2 * mu) / r); // 3,223
const burn = (vinf) => Math.sqrt(vesc ** 2 + vinf ** 2) - vc; // P18's formula
for (const [t, vinf] of [
  ["Duna", 918],
  ["Jool", 2713],
  ["Eeloo", 2955],
])
  console.log(t, Math.round(burn(vinf)), Math.round(burn(vinf) - (vesc - vc)));
// Duna 1072 128 · Jool 1934 990 · Eeloo 2094 1150
// the energy the transfer needs, and what a metre per second buys at each speed
console.log(918 ** 2 / 2, 3223, 290, 0.5); // 421362 J/kg; J/kg per m/s at 3,223, at 290, at rest
```

## The idea

The **Oberth effect** is that a burn made while moving fast gains more
orbital energy per unit of Δv than the same burn made while moving slowly.
It is not a special force and it creates nothing; it is what ½v² does when v
changes. A burn from speed v to v + Δv adds

    ½(v + Δv)² − ½v² = v·Δv + ½Δv²

of energy per kilogram, and the first term is the whole story: the same Δv is
worth v times more energy at speed v than it is at rest. The propellant is
the other side of the ledger. Thrown backward from a fast ship, it leaves
with less speed relative to the body, and so less energy, than it would from
a slow one; the energy it does not carry away stays with the ship.

A **gravity well** is the region of a body's pull, drawn as a well because
the potential energy −μ/r falls away toward the body: deep and steep where
gravity is strong, shallow and flat far out. A ship on any orbit moves
fastest at the bottom of the well and slowest at the top, which is
[vis-viva](vis-viva-and-circularising.md). Put the two together and the rule
follows: a burn that changes energy is worth most made deep in the well, at
periapsis or in the lowest orbit available, because that is where the ship
is fastest.

```
   energy
     ↑                                   ship's speed along an orbit:
     │  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·   fast here ─┐        ┌─ slow here
     │·                               ·             │        │
     │ ·   potential −μ/r            ·              ▼        ▼
     │  ·                           ·        ●─────────────────────○
     │    ·                       ·        periapsis            apoapsis
     │      ·                   ·        (bottom of the well)   (top)
     │         ·             ·
     │             ·  ●  ·                 a metre per second here buys
     │            the body                 v × 1 joules per kilogram
     └──────────────────────────────→ distance
```

Why the energy carries to the destination is conservation. Orbital energy
per kilogram, ½v² − μ/r, is constant along a coast, and its value fixes the
speed the ship will have anywhere, including far away where μ/r is nothing
and the energy is all ½v∞². So the question "how much Δv to arrive at
infinity with v∞" is "how much Δv to raise the energy by ½v∞²", and the
answer depends only on how fast the ship is when it pays. The ejection
formula from [P18](ejection-energy-and-the-hyperbolic-leg.md) has exactly
this shape:

    Δv = √(2v_c² + C3) − v_c        with C3 = v∞²

The excess is added as an energy, under the root, to the energy the ship
already has at escape speed, 2v_c². For an excess small against that, the
root barely moves: expanding it, Δv ≈ (√2 − 1)v_c + C3/(2√2 v_c), the escape
burn plus the transfer's energy divided by a speed of the order of the
ship's. Divided by 3,223, Duna's 421,000 J/kg is the 128 m/s above.

Two consequences sound like paradoxes and are not.

**Lower is better, from where you are.** The departure burn alone is
cheapest not from the lowest orbit but from one where the circular speed is
v∞/√2; for Duna that is 7,780 km up, where the burn is only 649 m/s. But
climbing from 80 km to that orbit costs 1,219 m/s, and 1,219 + 649 is 1,867,
against 1,072 for burning where the rocket already is. For Jool's excess of
2,713 the optimum orbit would be below Kerbin's surface, and the lowest real
orbit wins outright. The rule of thumb survives because a rocket starts on
the ground and the low orbit is where it first arrives.

**The opposite rule holds for a plane change.** [P19](plane-change-and-inclination.md)
said to change plane where the ship is slowest, and this lesson says to
change energy where it is fastest. Both are right, because the two burns do
different things: a plane change turns the velocity without changing its
size, and the cost of turning a vector is proportional to its length; an
energy change lengthens it, and the gain from lengthening a vector is
proportional to its length too. The one is a cost that scales with v, the
other a benefit that does.

The same arithmetic runs backward at the far end. A ship arriving at a body
with excess v∞ can shed it cheapest at periapsis, and the deeper the
periapsis the cheaper: arriving at Jool with 1,757 m/s to lose, a burn at
periapsis at Laythe's distance that leaves the ship just bound costs 327
m/s, and circularising there would cost 1,662. If the destination is a moon,
the ship only has to be bound to the planet with its periapsis at the moon's
orbit; the rest of the 1,662 is a circle it never needed to be on.

## In this codebase

`injectC3` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts) is
the formula with the shape above, and every ejection and capture the window
search prices goes through it:

```ts
const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v; // energy under the root, not a speed added outside it
```

The effect is also built into where the burns are made, which is a choice
the code has made before any formula runs. `lowR` in
[`src/core/orbits.ts`](../../../../src/core/orbits.ts) is a body's radius plus
its atmosphere plus ten kilometres, or ten kilometres above an airless one,
and it is the orbit every departure is priced from and every capture into.
Nothing in the route leaves from a higher orbit, because nothing cheaper
exists for a rocket that has just climbed there.

The route's tabulated legs from Kerbin, the `DEST` table in the same file,
are the community map's, validated in play: "LKO → Kerbin escape 950" and
then "Kerbin escape → Duna transfer 130", the pair the worked case
reproduces. Without a start time the route charges those; with one, the
window's excess goes through `injectC3` from `lowR`, and the numbers come
out the same to a few metres per second.

And in `transferDv`, the capture into a system the ship is only passing
through on the way to a moon is priced as the kiss, not the circle:

```ts
/* Passing through on the way to a moon: capture only just enough to be
   bound, with periapsis down at the moon's orbit. Circularising here and
   climbing back out again is what made a Jool trip look like 3 km/s. */
const dv =
  Math.sqrt(Math.max(0, c3 + (2 * m2) / rp)) - Math.sqrt((2 * m2) / rp);
```

`rp` is the moon's orbital radius, the periapsis of the capture; the burn
takes the ship from the arrival speed there to exactly escape speed there,
which is the least that leaves it bound. `dropSearch`, for the trip back
down from a moon to its planet, is the mirror image and comes out burn for
burn the same: 280 m/s to leave low Mun orbit against 280 to capture into
it, 856 to circularise at Kerbin against 856 to leave.

## What made it real

The map is the measurement. Six planets, six figures a community assembled
by flying them, and the formula from an 80 km orbit reproduces every one
within ten metres per second: Duna 128 against 130, Jool 990 against 980,
Eeloo 1,150 against 1,140. The `DEST` table in
[`src/core/orbits.ts`](../../../../src/core/orbits.ts) carries the map's
numbers, [`test/routes.test.ts`](../../../../test/routes.test.ts) pins them,
and the window search, which uses `injectC3` and knows nothing of the map,
lands on the same figures.

The Jool capture is the measurement the other way. Before the pass-through
capture was priced as a kiss, a trip to a moon of Jool circularised at the
moon's orbital radius and climbed out again, and the whole trip came to
about 3 km/s of capture and departure; the comment on the leg records it.
Priced at periapsis it is 327 m/s to be bound with periapsis at Laythe's
distance, against 1,662 to circularise there, and the outbound Laythe route
in the routes snapshot shows the mirror: "Leave Jool 1662", the same 1,662,
because leaving a circular orbit at that radius with that excess is the
circularisation run backward.

## Where it breaks

- **Adding a transfer speed to an escape speed.** 944 + 918 = 1,862 for
  Duna, against 1,072. [P18](ejection-energy-and-the-hyperbolic-leg.md)
  called this the wrong way to add; this lesson is why it is wrong by 790
  m/s and not by a rounding error.
- **Circularising where you are only passing through.** The Jool 3 km/s.
  Capturing into a circular orbit spends Δv slowing down at the top of the
  well, and leaving spends it again; a kiss at periapsis does the one thing
  needed, at the speed where it is cheapest.
- **Climbing to make the burn cheaper.** The burn alone is least from an
  orbit at v∞/√2, but the climb costs more than the burn saves from any
  orbit a rocket actually reaches first. 1,867 against 1,072 for Duna.
- **Applying the rule to a plane change.** A plane change is a turn, not an
  energy change, and it wants the slowest point, not the fastest. The two
  rules are opposite and both correct.
- **Expecting free energy.** The extra energy comes out of the propellant,
  which leaves a fast ship carrying less energy away with it. The rocket
  equation's Δv is unchanged; what changes is how much orbital energy that
  Δv is worth.

## Try it

Run the snippet, then change `r` to 10,680,000, an orbit 10,000 km up. Duna's
burn falls from 1,072 to 651 m/s: the burn alone is cheaper from high up, as
the section above says. Then price the climb to get there with the P17
snippet's Hohmann, 80 km to 10,000 km about Kerbin, and add it. The total is
well above 1,072. Finally put `r` back and change Duna's 918 to 100: the
extra over escape is under 2 m/s, because a tiny excess bought at 3,223 m/s
costs its energy divided by 3,223.

## Check yourself

<details><summary>Escaping Kerbin from 80 km costs 944 m/s. Arriving at infinity with 918 m/s to spare costs 1,072. Why is the difference 128 and not 918?</summary>

Because the burn buys energy at a rate set by the ship's speed. The transfer
needs ½ × 918² = 421,000 J/kg beyond escape; at the 3,223 m/s the ship is
doing as it reaches escape speed, each metre per second of burn adds about
3,223 J/kg, and 421,000 divided by that is about 128. The 918 would only
cost 918 if it were bought at rest, where a metre per second adds half a
joule.

</details>

<details><summary>If a departure burn is cheaper the faster the ship is moving, why not raise the orbit to where the burn alone is smallest before leaving?</summary>

Because raising the orbit costs more than the burn saves. For Duna the burn
alone is least, 649 m/s, from an orbit 7,780 km up, but getting there from
80 km costs 1,219, and 1,867 is worse than 1,072. The rocket is already in
the lowest orbit it can reach, and from there the direct burn is the
cheapest total.

</details>

<details><summary>A ship arrives at Jool bound for Laythe. Why does the route charge 327 m/s to capture and not the 1,662 it would take to circularise at Laythe's distance?</summary>

Because the ship only needs to be bound to Jool with its periapsis at
Laythe's orbit, and a burn at that periapsis from arrival speed down to
escape speed there does exactly that. Circularising would spend a further
1,335 m/s to slow to circular speed, and a ship going on to Laythe would
then have to spend it again to leave; the comment on the leg records that
this is what once made a Jool trip look like 3 km/s.

</details>

## Further reading

- Hermann Oberth, _Wege zur Raumschiffahrt_ (1929), where the effect was
  first described; NASA Technical Translation F-622, _Ways to Spaceflight_,
  is the English edition.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  interplanetary trajectories, for the departure hyperbola from a parking
  orbit and the optimum parking radius.
- Robert Braeunig, _Rocket and Space Technology_, "Interplanetary Flight",
  for the hyperbolic departure burn with worked numbers.

## Key takeaway

A burn is worth v × Δv of energy, so pay for energy where the ship is
fastest, at the bottom of the well: that is why departures and captures are
priced from the lowest orbit, why a pass-through capture is a kiss at
periapsis, and why the ejection formula adds the excess as an energy under
the root, where Duna's 918 m/s costs 128 and the community map, flown by
hand, says 130.

_As of 4269909._

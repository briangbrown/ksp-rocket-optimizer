# Ejection: characteristic energy and the hyperbolic leg

**Syllabus:** [P18](../../README.md#part-1--physics)

**Why it matters:** Ejection matters because every interplanetary leg begins
with one burn that has to do two jobs at once, climb out of the departure
body's gravity and arrive at the transfer speed the Hohmann or the window asks
for, and the price of that burn depends on how the two jobs are added
together: added as an energy the sum is right for a planet and still right
for a moon a ship can leave while bound to it, but added as a speed the moon
case has no answer, and a solver that floored it at zero charged every moon
departure the moon's escape velocity whatever the window cost.

**Before this:** [P16](patched-conics-and-the-sphere-of-influence.md),
_Patched conics and the sphere of influence_, and
[P17](hohmann-transfer-and-synodic-period.md), _The Hohmann transfer and the
synodic period_.

## A worked case

[P17](hohmann-transfer-and-synodic-period.md) priced Kerbin to Duna at 918
m/s: the ship must be moving 918 m/s faster than Kerbin, about the Sun, once
it is clear of Kerbin's gravity. Now price the burn that gets it there from an
80 km orbit.

At 80 km the ship is 680 km from Kerbin's centre, and with Kerbin's
gravitational parameter μ = 3.5316 × 10¹² m³/s² its
[circular speed](vis-viva-and-circularising.md) is √(μ/r) = 2,279 m/s. The
speed at which Kerbin could no longer bring it back is √(2μ/r) = 3,223 m/s.
A burn to that speed, 944 m/s, would leave the ship coasting away from Kerbin
slower and slower, arriving at the edge of Kerbin's influence with nothing to
spare. The Hohmann needs 918 to spare.

The wrong way to add the two is 944 + 918 = 1,862 m/s. The right way is
through energy. A ship's orbital energy per kilogram is ½v² − μ/r, and it is
conserved along the coast: whatever the burn sets it to at 680 km is what it
still has when Kerbin's pull has faded to nothing, where μ/r is zero and the
energy is ½v∞² for the speed v∞ it has left. Double both sides to lose the
half and the number to hit is

    v² − 2μ/r = v∞² = 918² = 842,724 m²/s²

Solve for v at 680 km: v² = 842,724 + 2 × 3.5316 × 10¹²/680,000 = 11,229,800,
so v = 3,351 m/s, and the burn is 3,351 − 2,279 = 1,072 m/s. Not 1,862. The
790 m/s saved is the reason departures leave from low orbit, and
[P20](../../README.md#part-1--physics), _The Oberth effect_, is about it.

The path the burn puts the ship on is an open curve, a hyperbola, whose shape
is fixed by the same number: its [eccentricity](keplers-equation.md) is e = 1 +
r v∞²/μ = 1.162, and a hyperbola of that eccentricity heads off along a
straight line 149° round from the point where the burn was made. So the burn
is made on the far side of Kerbin from the direction the ship wants to leave
in, about 150° before it, which is what every launch-window tool tells a
pilot and what the transfer card in this application draws.

Now do the same for a ship leaving the Mun for Minmus, from a 10 km orbit.
The Hohmann about Kerbin from the Mun's orbit to Minmus's asks for 142 m/s
relative to the Mun once clear of it. At 210 km from the Mun's centre, with μ
= 6.5138 × 10¹⁰, the circular speed is 557 m/s and escape from there costs
231 m/s. But the Mun's sphere of influence, where the game hands the ship to
Kerbin, is only 2,430 km out, and at that distance the Mun's escape speed is
still 232 m/s. The ship needs to cross the edge at 142, which is slower than
escape there. It never gets clear of the Mun's gravity at all; the game takes
it away from the Mun while the Mun still has a hold on it.

So there is no v∞. What there is, is the energy:

    v² − 2μ/r at the edge = 142² − 232² = −33,458 m²/s²

Negative: a closed orbit, an ellipse of eccentricity 0.892 whose far end
would be 3,684 km from the Mun if the Mun's gravity reached that far. It does
not; the sphere ends at 2,430 km, the ellipse crosses it on the way up, and
the ship is Kerbin's. The burn from 10 km that sets that energy is
√(2 × 557² − 33,458) − 557 = 209 m/s. Cheaper than escaping the Mun, because
the ship does not escape the Mun.

```js
const G0 = 9.80665;
const mu = (gee, R) => gee * G0 * R * R;
const burnTo = (mu, r, c3) => Math.sqrt(2 * (mu / r) + c3) - Math.sqrt(mu / r);
// Kerbin → Duna from 80 km: needs 918 m/s clear of Kerbin
const kerbin = mu(1.000341605, 600000);
console.log(burnTo(kerbin, 680000, 918 ** 2)); // 1072
console.log(
  Math.sqrt((2 * kerbin) / 680000) - Math.sqrt(kerbin / 680000) + 918,
); // 1862, paid separately
// Mun → Minmus from 10 km: needs 142 m/s at the Mun's edge, 2,430 km out
const mun = mu(0.1660567, 200000),
  soi = 2429559;
const c3 = 142 ** 2 - (2 * mun) / soi; // -33458: bound, and leaving anyway
console.log(c3, burnTo(mun, 210000, c3)); // 209
console.log(burnTo(mun, 210000, Math.max(0, c3))); // 231: what a floor at zero charges
```

## The idea

An **ejection** is the burn that takes a ship out of a body's
[sphere of influence](patched-conics-and-the-sphere-of-influence.md) and onto
the leg that follows. Three speeds describe where it can send a ship, and one
number ties them together.

**Escape velocity** at a distance r from a body is √(2μ/r), the speed at which
the body's gravity can no longer bring the ship back: a ship moving exactly
that fast coasts outward forever, slowing toward zero and never reaching it.
It is not a property of the body alone but of the body and the distance; at
80 km above Kerbin it is 3,223 m/s and at the edge of Kerbin's sphere 290.

**Excess velocity**, written v∞, is the speed a ship has left over once it has
climbed entirely out of the well: the speed at infinity. A ship that leaves
faster than escape keeps some speed forever, and that remainder is what the
next leg gets to use. For the Hohmann to Duna it must be 918 m/s.

**Characteristic energy**, written C3, is v∞ squared, and it is the number
that does the work. Orbital energy per unit mass is ½v² − μ/r, constant along
a coast. C3 is twice that: C3 = v² − 2μ/r at any point of the path. Where the
ship escapes, C3 is positive and equals v∞²; where it does not, C3 is
negative, and there is no v∞ to take the square root of. Because C3 is
defined either way, it is the quantity to price a burn from. From a circular
orbit of speed v_c, where 2μ/r = 2v_c², the burn onto a path of energy C3 is

    Δv = √(2 v_c² + C3) − v_c

which is the same expression whether C3 is 842,724 or −33,458. The one thing
under the root, 2v_c² + C3, is the square of the ship's speed just after the
burn and is positive for any path that reaches outward at all.

A **bound orbit** is a closed one, an ellipse, that would bring the ship back:
C3 negative. For the real solar system a bound orbit about a body cannot lead
anywhere else. In this game it can, because the sphere of influence is a hard
edge the game enforces rather than the place where a body's gravity actually
runs out. A moon's sphere is a large share of its orbit, so a ship can be
handed to the planet while still on a closed path about the moon, the way a
ball thrown up inside a lift is caught by the ceiling. No planet's sphere is
large enough for that: Kerbin's edge escape speed is 290 m/s against
departures over 800, so at a planet C3 is always comfortably positive and the
question never arises.

```
   Positive C3: a hyperbola                  Negative C3: a bound ellipse
   (a planet's departure)                    that leaves anyway (a moon's)

              ╲  asymptote                        ·  ·  ·  ·  ·
               ╲                              ·                   ·
        · · · · ╲· · · ·  sphere            ·      sphere            ·
      ·          ╲      ·                  ·   · · · · · · · · ·      ·
     ·            ╲      ·                 ·  ·        ellipse   ·     ·
    ·     ●        ╲     ·                 ·  ·   ●      ·  ·  ·  ·  ·  ← the far
     ·  body        │    ·                 ·  ·  body  ·         ·  ·      end is
      ·        burn ◆    ·                  ·   · · ◆ · · · · · ·  ·       outside
        · · · · · · · ·                      ·        burn         ·       the
                                                ·                ·         sphere
   the ship crosses the edge                      ·  ·  ·  ·  ·
   faster than escape there                 the ship crosses the edge
   and keeps v∞ forever                     slower than escape there
```

The direction of departure follows from the shape. A hyperbola of
eccentricity e leaves along a straight line, its asymptote, at an angle
acos(−1/e) past the burn point, measured round the body: 149° for the Duna
case above, and closer to 180° the more energetic the departure. That angle
is where the burn goes on the orbit. A bound ellipse has no asymptote, so the
nearest thing to a departure direction is where the ellipse actually crosses
the sphere, and that is what the code uses on the negative branch.

## In this codebase

The three functions the row names are together in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts). `c3Of` is the
energy at the edge of the sphere:

```ts
const c3Of = (vrel: number, mu: number, rSoi: number) =>
  vrel * vrel - (2 * mu) / rSoi;
```

`vrel` is the ship's speed relative to the body at the sphere's edge, which
is what the Lambert arc gives directly: the arc's velocity about the Sun,
less the planet's. The `2μ/r_SOI` is the well still owed from the edge to
infinity, 290² at Kerbin. Leaving it out and calling the edge speed an excess
priced Kerbin's ejection 12 m/s high and Eve's capture 20 m/s high against a
community planner at the same cell; for a planet that is the 1 to 2% that
[P16](patched-conics-and-the-sphere-of-influence.md) measured. For a moon the
term is larger than the speed, and the result goes negative.

`injectC3` spends the energy from a circular orbit:

```ts
const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;
```

The `Math.max` is a guard against a nonsensical orbit, not a physical floor:
2v² + C3 is the square of the speed after the burn and is positive for any
real departure. The floor that did damage was one step earlier, in a function
that took `sqrt(max(0, c3))` to make an excess velocity and then squared it
again; every negative energy became zero, and zero energy from a circular
orbit is exactly the escape burn, √2 v − v. The same `injectC3` is used in
[`src/core/orbits.ts`](../../../../src/core/orbits.ts) for the route's own
legs, with C3 set to the Hohmann's excess squared when there is no window,
so the route without a start time is byte for byte what it was before the
rewrite.

`ejection` is the burn with its direction, for the transfer card. It turns
the energy into the speed just after the burn, `vpe`, works out the
eccentricity from the energy and the radius, asks `soiAnomaly` how far round
the departure lies, and splits the burn into a part along the orbit and a
part out of its plane:

```ts
const vpe = Math.sqrt(Math.max(0, c3 + (2 * mu) / r)); // speed after the burn
const e = 1 + (r * c3) / mu; // > 1 hyperbola, < 1 bound
const nuOut = soiAnomaly(e, r, rSoi); // asymptote, or the sphere crossing
```

`soiAnomaly` returns acos(−1/e) while e > 1, the asymptote, and only on the
negative branch the angle at which the conic actually meets the sphere. That
split is deliberate: the asymptote is the model every launch-window tool
shares and the one the planetary numbers were checked against, so it is kept
wherever it exists; the sphere crossing is used only where nothing else is
defined.

## What made it real

Two measurements, one for each sign.

For the moons: with the floor in place every departure from a 10 km orbit
about the Mun cost 231 m/s, which is √2 × 557 − 557, the Mun's escape burn
from that height, and had nothing to do with where the ship was going.
Priced from the signed energy, the delivered Mun to Minmus window costs 214.
The test "leaves the Mun below its own boundary escape, and says so in the
energy" in [`test/transfer.test.ts`](../../../../test/transfer.test.ts) holds
that: the window's C3 is negative, the burn is below bare escape and above
half of it, and the speed at the edge it implies is positive and below the
edge's escape speed.

For the planets: nothing may move. The floor never fired at a planet, so the
rewrite had to leave all 84 planetary windows identical to the last digit,
and did. The test "leaves a planetary window exactly where it was" pins the
Kerbin to Duna window's departure to the second and its ejection to six
decimals, 1,042.3387085 m/s. Run the worked case's snippet with the window's
excess of 802 m/s in place of the Hohmann's 918 and it gives 1,042.

The asymptote rule has its own number. Swapping the asymptote for the sphere
crossing everywhere, planets included, moved Jool's ejection by 8 m/s and
its out-of-plane component by 118, because near e = 1 the angle is sharply
sensitive to which of the two is taken. That is why the code keeps the
asymptote wherever one exists.

## Where it breaks

- **Flooring the energy to keep the square root real.** The whole story of
  this row. When a formula clamps a value to stay defined, the clamped case
  is usually a real state the formula cannot express; here it was a bound
  departure, and the clamp priced it at escape. The rule under _A window is
  priced from energy_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) and the
  two tests above guard it.
- **Calling the edge speed an excess.** The ship at the sphere's edge still
  owes the body 2μ/r_SOI. For Kerbin to Duna that is 1,085 m/s instead of
  1,072; for a moon it is the difference between a number and no number.
- **Using the sphere crossing where the asymptote exists.** Jool's 8 and 118
  m/s. The planetary model is the asymptote, and the tools the numbers are
  checked against use it too.
- **Adding escape and excess as speeds.** 1,862 instead of 1,072 for Duna.
  Speeds do not add along a coast; energies do.

## Try it

Run the snippet and change the `Math.max(0, c3)` line's `0` to `-Infinity`,
so the floor does nothing: the last number printed becomes 209 as well. Then
change the Mun's `soi` to `Infinity`, as if the game handed the ship over only
at infinity: `c3` becomes 142² and the burn 243 m/s, above the Mun's escape
burn, which is what the same departure would cost if the Mun's gravity
reached all the way out. The 34 m/s between 209 and 243 is what the edge of
the sphere is worth to a ship leaving the Mun.

## Check yourself

<details><summary>Kerbin's escape velocity at 80 km is 3,223 m/s, so escaping costs 944 m/s from a 2,279 m/s orbit. Why does leaving with 918 m/s to spare cost 1,072 and not 944 + 918?</summary>

Because the burn sets an energy, not a speed, and energy goes as the square
of speed. The burn has to raise v² − 2μ/r from its circular value to 918²;
the 918 is added to the speed at the top of the climb, where the ship is
slow, and a small addition there is bought with a smaller one at the bottom,
where the ship is fast. Paid together in low orbit the two jobs cost 1,072;
paid one after the other they would cost 1,862.

</details>

<details><summary>A ship leaves the Mun's sphere of influence at 142 m/s relative to the Mun, where the Mun's escape speed is 232 m/s. Has it escaped the Mun? Does it matter?</summary>

It has not: its energy relative to the Mun is negative and its path is a
closed ellipse that would bring it back. It does not matter, because the game
hands the ship to Kerbin at the sphere's edge whether or not it has escaped.
What matters is pricing the burn from the energy, which is defined, and not
from an excess velocity, which is not.

</details>

<details><summary>Why does the code keep the asymptote angle for a hyperbola instead of using the sphere crossing for every departure, since the game hands over at the sphere either way?</summary>

Because the asymptote is the model the planetary numbers were checked
against, and the two angles differ enough to matter: swapping to the crossing
moved Jool's ejection by 8 m/s and its out-of-plane part by 118. The crossing
is used only on the bound branch, where a hyperbola's asymptote does not
exist and there is nothing else to use.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  interplanetary trajectories, for the departure hyperbola, C3 and the
  ejection angle, and the two-body chapter for hyperbolic orbits and
  escape.
- Robert Braeunig, _Rocket and Space Technology_, "Interplanetary Flight",
  for the hyperbolic excess and the departure burn with worked numbers.
- [The moment lesson this row grew from](../patched-conics/energy-not-excess-velocity-b80e959.md),
  written when the floor was found, for the shape of the bug as it was met.

## Key takeaway

Price a departure from its characteristic energy, C3 = v² − 2μ/r, which is
the excess velocity squared when the ship escapes and a signed, still
meaningful number when it does not; the burn from a circular orbit is
√(2v_c² + C3) − v_c either way, and it is the sign the game's hard-edged
spheres of influence make a moon's departure need.

_As of ab10354._

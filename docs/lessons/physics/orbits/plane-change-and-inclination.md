# Plane change and inclination

**Syllabus:** [P19](../../README.md#part-1--physics)

**Why it matters:** Plane changes matter because most of the game's targets
orbit in planes tilted a few degrees from Kerbin's, and a ship has to pay to
tilt its own orbit to match, but the price of the same tilt varies by a
factor of fifty depending on how fast the ship is moving when it burns and
where along its path it does so; a route that does not know this either
charges a Minmus trip 239 m/s that a patient pilot pays 5 for, or, worse,
prices the ejection with a formula that assumes the tilt is already gone and
quietly leaves it out of the budget.

**Before this:** [P15](orbital-elements-and-frames.md), _Orbital elements and
reference frames_, and [P18](ejection-energy-and-the-hyperbolic-leg.md),
_Ejection: characteristic energy and the hyperbolic leg_.

## A worked case

Minmus orbits Kerbin 47,000 km out, in a plane tilted 6° to Kerbin's equator.
A ship in an 80 km [parking orbit](patched-conics-and-the-sphere-of-influence.md)
above the equator wants to go there. At some point its orbital plane has to
turn through 6°, and turning a plane means turning the velocity: the ship is
moving at speed v in one direction and must end up moving at the same speed
in a direction 6° away. The two velocities and the change between them make
an isosceles triangle, and the change is its base:

    Δv = 2 · v · sin(Δi / 2)

Everything is in the v. Do the turn in the parking orbit, where the ship is
moving at 2,279 m/s, and it costs 2 × 2,279 × sin 3° = 239 m/s, a quarter
of the 921 m/s the transfer itself costs. Instead, raise the apoapsis
to Minmus's height first and do the turn there, where a ship on that ellipse
crawls at 46 m/s: 2 × 46 × sin 3° = 5 m/s. The same manoeuvre, the same 6°,
one forty-eighth of the price.

Now go interplanetary. Eeloo's orbit is tilted 6.15° to Kerbin's. Turn the
ship's path about the Sun through that angle at Kerbin's orbital speed of
9,285 m/s and it costs 996 m/s. Turn it at the far end of the transfer,
where the ship has slowed to 1,847 m/s, and it costs 198. The route table
charges 198 for it, as a leg of its own. And a transfer window, which knows
where Eeloo actually is, finds a point on the way where a 2.57° tilt is all
that is needed, at 119 m/s, because the arrival falls near one of the two
places where the two orbits cross.

```js
const G0 = 9.80665;
const mu = (gee, R) => gee * G0 * R * R;
const RAD = Math.PI / 180;
const turn = (v, deg) => 2 * v * Math.sin((deg / 2) * RAD);
const vis = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
// Minmus, 6°, from an 80 km parking orbit
const kerbin = mu(1.000341605, 600000);
const rLow = 680000,
  rMin = 47000000;
console.log(turn(Math.sqrt(kerbin / rLow), 6)); // 239, in low orbit
console.log(turn(vis(kerbin, rMin, (rLow + rMin) / 2), 6)); // 5, at the top of the transfer
// Eeloo, 6.15°, about the Sun
const sun = mu(1.74684656, 261600000);
const rK = 13599840256,
  rE = 90118820000;
console.log(turn(Math.sqrt(sun / rK), 6.15)); // 996, at Kerbin's speed
console.log(turn(vis(sun, rE, (rK + rE) / 2), 6.15)); // 198, at the far end
// the angle between two tilted planes is not the difference of their tilts
const relInc = (i1, l1, i2, l2) =>
  Math.acos(
    Math.cos(i1 * RAD) * Math.cos(i2 * RAD) +
      Math.sin(i1 * RAD) * Math.sin(i2 * RAD) * Math.cos((l1 - l2) * RAD),
  ) / RAD;
console.log(relInc(7, 70, 2.1, 15)); // Moho against Eve: 6.0°, not 4.9°
```

## The idea

A **plane change** is a burn that tilts the plane of an orbit. It changes the
direction of the velocity without changing its size, so it adds no energy to
the orbit and is pure cost: the ship arrives moving as fast as it left, in a
different plane. The geometry is the triangle above. Two sides of length v
with the angle Δi between them close with a base of 2v sin(Δi/2), and for
the small angles the game's bodies have, that is very nearly v × Δi in
radians: 6° is about a tenth of the ship's speed.

```
              v after
              ↗
             ╱
            ╱  Δi
    ───────●───────→  v before
            ╲
             ╲  the burn: the third side, 2·v·sin(Δi/2)
              ↘
             (drawn from the tip of "before" to the tip of "after")
```

So the cost is fixed by the speed at the moment of the burn, and a ship's
speed varies enormously along an ellipse: 2,279 m/s in a low Kerbin orbit
against 46 m/s at the apoapsis of an ellipse that reaches Minmus. The rule
that follows is the one every pilot learns: change plane where you are
slowest, which for a transfer is at its far end.

Where the burn can be made is the other constraint. Two orbital planes about
the same body cross along a line through the centre, and a ship can only
move from one plane to the other at a point where the two planes meet. Those
two points are the **nodes**: where the ship's orbit crosses the target's
plane, one going up and one going down. A plane change made anywhere else
tilts the orbit into some third plane that contains neither the ship's old
path nor the target's. So a plane change is a burn at a node, and the
question of price is the question of how fast the ship is moving at the node
it uses.

```
                 target's orbital plane
        ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
      ·                                     ·
    ·           line of nodes                 ·
   ·  ─────────────────●─────────────────────  ·      ← the two planes
    ·        node    centre      node         ·         meet along this line
      ·                                     ·
        ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
                 ship's orbital plane
        (the two ellipses drawn edge-on: tilted Δi apart, crossing at the nodes)
```

The angle between two planes is not the difference of their tilts unless
their nodes coincide. Each body's [inclination](orbital-elements-and-frames.md)
is measured against the ecliptic, and its longitude of the ascending node
says where its tilt is; two orbits tilted 7° and 2.1° whose nodes are 55°
apart are 6.0° from each other, not 4.9°. Spherical trigonometry gives the
angle between them:

    cos Δi = cos i₁ cos i₂ + sin i₁ sin i₂ cos(Ω₁ − Ω₂)

For a departure from Kerbin, whose inclination is zero, this collapses to the
target's own inclination, which is why the table above needed no nodes.

Between planets there is a third place to pay, and it needs saying because it
is where a formula can go quietly wrong. The ejection burn described in
[P18](ejection-energy-and-the-hyperbolic-leg.md) is made from a parking orbit
about the equator, and in this game every body's equator lies in the
ecliptic. If the target is tilted, the ship's departure direction has to
point a little out of that plane, and the ejection burn gets a component
along the normal, the direction perpendicular to the orbit's plane, on top of
its [prograde](../ascent/the-gravity-turn.md) one. That component is the plane
change, folded into the ejection. It is often a good deal: a normal part of
401 m/s on a prograde part of 2,085 costs only √(2,085² + 401²) − 2,085 = 38
m/s more than the prograde part alone, because the two add as a hypotenuse.
But it is not free, and it grows fast: Dres's 5° asks 1,712 m/s of normal on
1,755 of prograde, and the hypotenuse is 2,452. An ejection formula with no
normal term is assuming the parking orbit was already tilted to the
departure, and that tilt was paid somewhere it does not show.

## In this codebase

`relInc` in [`src/core/orbits.ts`](../../../../src/core/orbits.ts) is the
spherical-trigonometry line above, on the stock inclinations and nodes:

```ts
function relInc(a: string, b: string) {
  const i1 = (SYS[a].inc || 0) * RAD,
    i2 = (SYS[b].inc || 0) * RAD;
  const dl = ((SYS[a].lan || 0) - (SYS[b].lan || 0)) * RAD;
  return (
    Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          Math.cos(i1) * Math.cos(i2) +
            Math.sin(i1) * Math.sin(i2) * Math.cos(dl),
        ),
      ),
    ) / RAD
  );
}
```

`planeChanges` in the same file walks the route's chain of bodies and prices
a plane change at every level where one is needed: the origin's own tilt on
the way up, the main one at the body the two chains share, and each moon's
tilt on the way down, so Bop costs Jool's 1.3° against the Sun and then Bop's
15° against Jool. Each comes with two prices:

```ts
const add = (deg: number, v: number, system: string, cheapV?: number) => {
  if (deg < 0.15) return;
  const half = Math.sin((deg / 2) * RAD);
  out.push({
    deg,
    system,
    cheap: Math.round(2 * (cheapV ?? v) * half), // at the transfer's far end
    costly: Math.round(2 * v * half), // in the orbit you leave from
  });
};
```

`routeFor` turns each into a leg of its own, placed just before the capture,
and charges `cheap` or `costly` by the `planeNow` switch, which the route
view shows as "timed at a node" or "burning it now". This is the one leg in
the budget whose cost is a choice rather than a number, so it is the one leg
with a control on it. The comment above the leg is worth reading: the cheap
figure is not really a burn at apoapsis, because a ship that arrives
uncorrected is thousands of kilometres off the target's plane and outside
its sphere of influence. What the pilot actually does is time the departure
so the encounter falls at one of the target's nodes, where the planes already
cross, and the few metres per second trim what is left.

A transfer window replaces all of that at the Sun's level. `price` in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts) costs each cell
two ways and keeps the cheaper. **Ballistic** aims the arc straight at the
target and lets `ejection` pay the tilt as a normal component of the
departure burn, `ejectNor`, charging the resultant. **Plane** flies the arc
in Kerbin's own plane to the point directly below the target and adds one
burn on the way that tilts the arc up to it:

```ts
const cost = (dnu: number) =>
  2 * speed(m, rAt(nu2 - dnu), a) * Math.sin(tilt(dnu) / 2); // 2·v·sin(δ/2) at that point
const g = goldenMin(cost, span * 0.02, span * 0.98); // where along the arc it is cheapest
```

The tilt needed depends on where the burn is made, and the speed does too, so
the search finds the point where their product is least. The window carries
the result as `plane`, the route emits it as its own leg, and the Sun-level
entry from `planeChanges` is dropped because the window has paid it. The
brief's transfer-type control offers ballistic, mid-course and cheapest, and
the card says which was flown.

## What made it real

The routes snapshot, [`test/routes.test.ts`](../../../../test/routes.test.ts),
runs every route with the switch both ways and pins the pairs: Minmus 5
against 239, Eeloo 198 against 996, the Jool orbit 54 against 211. The
comment on `planeChanges` records the Minmus pair as the reason the two
prices exist at all.

The window search's numbers show when each way of paying wins, from a new
save:

| Target | Tilt  | Ballistic: normal part | Ballistic total | Mid-course burn | Mid-course total | Flown      |
| ------ | ----- | ---------------------- | --------------- | --------------- | ---------------- | ---------- |
| Duna   | 0.06° | 197 m/s                | 1,711 m/s       | 7 m/s           | 1,697 m/s        | mid-course |
| Eeloo  | 6.15° | 401 m/s                | 3,633 m/s       | 119 m/s         | 3,595 m/s        | mid-course |
| Jool   | 1.30° | 460 m/s                | 5,091 m/s       | 139 m/s         | 5,022 m/s        | mid-course |
| Dres   | 5.00° | 1,712 m/s              | 4,046 m/s       | 523 m/s         | 3,469 m/s        | mid-course |
| Moho   | 7.00° | 1,282 m/s              | 5,110 m/s       | 1,100 m/s       | 5,487 m/s        | ballistic  |

Dres is the case for the mid-course burn: 577 m/s saved, because a normal
part nearly as large as the prograde part is an expensive hypotenuse. Moho
is the case against it: the arc that stays in Kerbin's plane arrives at Moho
with a worse capture, and the ballistic route wins despite 1,282 m/s of
normal. The Moho checks in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) hold the
ballistic normal part above 500 m/s and its ejection equal to the hypotenuse
of the two parts, and holds that the delivered window is the cheaper of the
two. The rule in [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md)
under _Transfer windows_ records the consequence: because the ejection here
is priced from an equatorial parking orbit, the mid-course burn wins more
often than tools that assume an inclined parking orbit would suggest.

## Where it breaks

- **Paying in low orbit.** 239 for 5, 996 for 198. The formula is the same;
  the speed is not. The switch exists so the reader can choose to pay it,
  not so the route can charge it by default.
- **Reading "cheap" as a burn at apoapsis.** Arrive uncorrected and there is
  nothing to arrive at. The cheap figure is a node-timed encounter plus a
  trim, and the leg's note says so; the comment in `routeFor` records the
  misleading label it replaced.
- **An ejection formula with no normal term.** It assumes the parking orbit
  is already tilted to the departure. From an equatorial orbit the tilt is
  real Δv, and for Dres it is almost as large as the prograde burn.
- **Subtracting inclinations.** Moho against Eve is 6.0°, not 4.9°; the
  nodes matter unless one orbit is flat. `relInc` is the guard.
- **The burn's time on the arc.** The mid-course branch converts the burn's
  position to a time through Kepler's equation, and an angle that was not
  wrapped into one turn put a Dres burn 835 days before departure. The rule
  under _Transfer windows_ has it; the window's `plane.at` is now held
  between departure and arrival by the Moho test.

## Try it

Open the application, set the destination to Minmus, and find the plane
change leg in the route: it reads 5 m/s with the control on "timed at a
node". Switch it to "burning it now" and watch the leg become 239 m/s and the
rocket grow to carry it. Then set the destination to Dres and, in the brief,
change the transfer type from cheapest to ballistic: the window card's
ejection gains a normal part of about 1,700 m/s and the total rises by about 577.

## Check yourself

<details><summary>A 6° plane change costs 239 m/s from an 80 km Kerbin orbit and 5 m/s at Minmus's height. Same angle, same ship. Where did the factor of 48 come from?</summary>

From the speed. The cost is 2v sin(Δi/2), and the ship moves at 2,279 m/s in
low orbit and 46 m/s at the apoapsis of a transfer that reaches Minmus. The
angle contributes the same sin 3° to both; the ratio of the costs is the
ratio of the speeds.

</details>

<details><summary>Why can a plane change only be made at a node?</summary>

Because the burn happens at a point, and the new orbit must pass through that
point. If the point is not in the target's plane, no single burn there can
put the ship into the target's plane: the new orbit would contain the burn
point, which lies outside it. Only at the two points where the ship's orbit
already crosses the target's plane can one burn move it from one to the
other.

</details>

<details><summary>The ballistic Eeloo transfer carries 401 m/s of normal component but costs only 38 m/s more than a purely prograde ejection. How, and why does the same trick fail for Dres?</summary>

Because the two parts add as the sides of a right triangle and the burn is
the hypotenuse: √(2,085² + 401²) is 2,123, only 38 more than 2,085. The
saving is large while the normal part is small against the prograde part.
Dres asks 1,712 of normal on 1,755 of prograde, the hypotenuse is 2,452, and
a separate 523 m/s burn at the slow end of the arc is cheaper by 577.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  orbital manoeuvres, section on plane change manoeuvres, for the
  2v sin(Δi/2) triangle and the combined burn.
- Robert Braeunig, _Rocket and Space Technology_, "Orbital Mechanics", under
  orbit plane changes, for the same with worked numbers and the combined
  plane-and-altitude change.

## Key takeaway

A plane change costs 2v sin(Δi/2) and can only be made at a node, so its
price is set by how fast the ship is moving at the node it uses: the route
offers the tilt at the slow end of the transfer or in low orbit as a choice,
the window search folds it into the ejection or buys it mid-course and takes
the cheaper, and a departure formula that has no normal term has assumed the
tilt was paid somewhere it does not show.

_As of 0790615._

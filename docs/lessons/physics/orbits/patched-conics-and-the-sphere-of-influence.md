# Patched conics and the sphere of influence

**Syllabus:** [P16](../../README.md#part-1--physics)

**Why it matters:** Patched conics matter because they are not an
approximation of how Kerbal Space Program flies, they are how it flies: one
body pulls at a time, the ship changes bodies at a sphere's edge, and so a
transfer priced as a chain of two-body arcs joined at those edges is exactly
what the game will do; where the edge sits decides how much of the climb out
of a well the departure burn has to pay for, and for a moon that is the
difference between a window and none.

**Before this:** [P13](vis-viva-and-circularising.md), _Vis-viva_, and
[P14](keplers-equation.md), _Kepler's equation_.

## A worked case

Every body in the game has a radius around it inside which it, and it alone,
pulls on the ship. Here are a few:

| Body   | Orbits | Sphere of influence | As a share of its orbit's radius | Escape speed at the edge |
| ------ | ------ | ------------------- | -------------------------------- | ------------------------ |
| Kerbin | Sun    | 84,159 km           | 0.6%                             | 290 m/s                  |
| Duna   | Sun    | 47,921 km           | 0.2%                             | 112 m/s                  |
| Jool   | Sun    | 2,455,985 km        | 3.6%                             | 480 m/s                  |
| Mun    | Kerbin | 2,430 km            | 20.2%                            | 232 m/s                  |
| Minmus | Kerbin | 2,247 km            | 4.8%                             | 40 m/s                   |
| Ike    | Duna   | 1,050 km            | 32.8%                            | 188 m/s                  |

Kerbin's sphere is 140 Kerbin radii across, and yet it is six tenths of a
percent of Kerbin's distance from the Sun. A ship leaving Kerbin for Duna is
inside Kerbin's sphere for about a day of a 300-day trip. The Mun's sphere,
by contrast, is a fifth of the Mun's distance from Kerbin: the Mun is small
but Kerbin is close, and the edge of the Mun's gravity is not far out.

Now price a departure at the edge. A Hohmann transfer from Kerbin's orbit to
Duna's needs the ship to leave Kerbin's neighbourhood at 918 m/s relative to
Kerbin. At the sphere's edge, 84,159 km out, the ship still feels Kerbin, and
the escape speed there is 290 m/s; so to have 918 left after climbing the rest
of the way out it must cross the edge at √(918² + 290²) = 963 m/s. The burn
from an 80 km parking orbit that puts it there is 1,072 m/s. Whether the
patch is made at the edge or at infinity makes a difference of a few metres a
second at Kerbin, and the search's numbers agree with a well-known planner to
the metre.

Now do the same for the Mun. A Hohmann transfer about Kerbin from the Mun's
orbit to Minmus's needs the ship to leave the Mun's neighbourhood at 142 m/s
relative to the Mun. But the escape speed at the Mun's edge is 232 m/s. The
ship crosses the edge slower than escape: in the Mun's frame it is still on a
closed orbit, and would fall back if Kerbin were not there to take it. Kerbin
is there, the game hands the ship over at the edge regardless, and the
transfer is real. A formula that assumes the ship escapes cannot express it.
Priced at the edge, from a 10 km orbit about the Mun, the burn is 209 m/s;
priced with escape as a floor it would be 231, the Mun's bare escape burn,
whatever Minmus was doing.

```js
const G0 = 9.80665,
  mu = (gee, R) => gee * G0 * R * R;
const sun = mu(1.74684656, 261600000),
  kerbin = mu(1.000341605, 600000),
  mun = mu(0.166108, 200000);
const soi = (a, m, M) => a * Math.pow(m / M, 0.4); // KSP's sphere of influence: Laplace's formula
const hohmannOut = (M, r1, r2) =>
  Math.sqrt(M * (2 / r1 - 2 / (r1 + r2))) - Math.sqrt(M / r1); // speed to add at r1
const leave = (m, rPark, rSoi, vRel) => {
  const c3 = vRel * vRel - (2 * m) / rSoi; // energy at the edge: speed there, less the well still to climb
  const v = Math.sqrt(m / rPark);
  return Math.sqrt(Math.max(0, 2 * v * v + c3)) - v; // the burn from the parking orbit
};
const rK = 13599840256,
  rD = 20726155264,
  rM = 12000000,
  rMin = 47000000;
const soiK = soi(rK, kerbin, sun),
  soiM = soi(rM, mun, kerbin);
console.log(
  "Kerbin's sphere",
  (soiK / 1e3).toFixed(0),
  "km; the Mun's",
  (soiM / 1e3).toFixed(0),
  "km",
);
const vK = hohmannOut(sun, rK, rD),
  vM = hohmannOut(kerbin, rM, rMin);
console.log(
  "leave Kerbin for Duna: needs",
  vK.toFixed(0),
  "m/s at the edge; escape there",
  Math.sqrt((2 * kerbin) / soiK).toFixed(0),
  "; burn from 80 km",
  leave(kerbin, 680000, soiK, Math.sqrt(vK * vK + (2 * kerbin) / soiK)).toFixed(
    0,
  ),
);
console.log(
  "leave the Mun for Minmus: needs",
  vM.toFixed(0),
  "m/s at the edge; escape there",
  Math.sqrt((2 * mun) / soiM).toFixed(0),
  "; burn from 10 km",
  leave(mun, 210000, soiM, vM).toFixed(0),
  "; with escape as a floor",
  (Math.SQRT2 * Math.sqrt(mun / 210000) - Math.sqrt(mun / 210000)).toFixed(0),
);
```

## The idea

Two bodies attracting each other is a problem with an exact answer: the orbit
is a **conic**, one of the curves a plane cuts from a cone, an ellipse for a
bound body, a parabola at exactly escape speed, or a **hyperbola**, the open
path of a body that escapes; and Kepler's laws say where the body is at any
time. That is the **two-body problem**, and it is the
last gravitational problem with an exact answer. Add a third body and there is
no formula, only numerical integration, and the real solar system is many
bodies pulling at once.

**Patched conics** is the approximation that puts the exact answer back. Cut
space into regions, one per body, and inside each region count only that
body's gravity. Within a region the ship's path is a conic, solved exactly;
where the path leaves one region and enters the next, the **handover**, the
ship's position and velocity are simply re-expressed relative to the new body
and a new conic begins. A trip from Kerbin to Duna is three conics patched end
to end: a hyperbola out of Kerbin's region, an ellipse round the Sun, a
hyperbola into Duna's.

The regions are spheres, and the **sphere of influence** of a body is the
radius within which its pull on the ship, relative to its parent's, is the
larger perturbation. Laplace's formula for it is

    r_SOI = a · (m / M)^(2/5)

with a the body's orbital radius, m its mass and M its parent's. The exponent
is what makes the table above look the way it does: mass enters weakly, at the
two-fifths power, and distance enters directly, so a small moon close to a
small planet has a sphere that is a large share of its orbit, and a large
planet far from a huge star has one that is a tiny share of its own.

For a real spacecraft, patched conics is a first estimate that a trajectory
team refines with integration. For a Kerbal one it is the truth. The game
integrates nothing between bodies: the ship's orbit is a conic about exactly
one body, chosen by which sphere it is inside, and the moment it crosses an
edge the game re-parents it and starts a new conic. A two-body window is
therefore not an estimate of what the game will do but a statement of it,
right up until the ship crosses some third body's sphere it was not supposed
to, at which point the game takes the trajectory over and the flight stops
being the one that was priced. [P23](../../README.md#part-1--physics) is the
check for that.

The handover is where the pricing lives. A departure burn has to do two
things: climb out of the body's well and arrive at the edge with the speed the
next conic needs. Inside the sphere the speed and the depth in the well trade
against each other along the escape path, and the cleanest way to price the
burn is by the energy the ship carries when it crosses: its speed relative to
the body there, less the well it still had to climb, which
[P18](../../README.md#part-1--physics) writes as a signed quantity. For a
planet, whose sphere is far out, the well left at the edge is small and it
hardly matters whether the patch is made at the edge or at infinity. For a
moon it is everything: the Mun's edge is so close in that a ship can cross it
below the local escape speed, still bound to the Mun in the two-body sense,
and still be on its way to Minmus, because past the edge it is Kerbin's ship.
A model that patches at infinity refuses that departure; a model that patches
at the edge prices it.

## In this codebase

The sphere is computed as the game computes it, twice, in two modules that
each need it without wanting the other's imports:

```ts
const soiR = (b: string) => {
  const p = SYS[b].parent;
  return p ? smaOf(b) * Math.pow(mu(b) / mu(p), 0.4) : Infinity; // the Sun has no edge
};
```

`chainOf(body)` in `src/core/orbits.ts` lists a body and its parents out to
the Sun, and `transferDv` finds where two chains meet, the first body they
share, and splits the trip there: the climb `up` from the origin's chain to
the common body, a Hohmann transfer about it, and the descent `down` the
destination's chain. Each edge crossed is a leg. The comment in the code notes
that "any shared primary, not only the Sun" works: Mun to Minmus is the same
problem about Kerbin that Kerbin to Duna is about the Sun.

The patch itself is in `src/core/transfer.ts`. `findWindow` asks Kepler where
the two bodies are, asks the Lambert solver
([P21](../../README.md#part-1--physics)) for the heliocentric arc between
them, takes the ship's velocity on that arc relative to each body, and prices
the energy at each sphere's edge:

```ts
const c3Out = c3Of(norm(sub(l.v1, s1.v)), mu1, soi1); // speed relative to the body at its edge, less the well
const c3In = c3Of(norm(sub(l.v2, s2.v)), mu2, soi2);
const ej = ejection(sub(l.v1, s1.v), c3Out, mu1, rPark1, soi1);
```

`soi1` and `soi2` are the two spheres, and they are what makes the patch a
patch at the edge rather than at infinity. `src/core/encounter.ts` uses the
same sphere the other way round: its `depth` is a closest approach measured in
the met body's sphere radii, so under 1 means the game would have handed the
ship over. `test/encounter.test.ts` holds the spheres against the game's
published figures, Kerbin's 84.16 Mm and the Mun's 2.43, and the shares of
their orbits the moons' spheres cover: the Mun's 6.4%, Ike's 10.4%, Gilly's
under 0.2%.

## What made it real

The planner comparison is the measurement. With the patch made at infinity,
every ejection and capture the search priced ran 1 to 2% over a well-known
community transfer planner at the same departure and arrival: 12 m/s at
Kerbin, 20 at Eve. Made at the edge, removing the 2μ/r_SOI the ship still had
to climb after the patch, nine of that planner's selected transfers agree to
the metre per second, ejection inclination included. The rule records it in
`.claude/rules/solver.md`.

The Mun is the measurement the other way. The Mun's sphere is a fifth of its
orbit and its boundary escape speed 232 m/s; a departure for Minmus leaves at
142 relative to the Mun, below escape. A model that floored the energy at
escape priced every moon departure at bare escape, 231 m/s from a low Mun
orbit, whatever the window; priced at the edge the same departure is 209.
Every one of the 84 planetary windows stayed identical to the last digit when
the change went in, which is what proved it changed the moons and nothing
else. [P18](../../README.md#part-1--physics) has the full story, and the
first lesson in this repository was written on it.

## Where it breaks

- **Patching at infinity.** The 1 to 2% at a planet and the whole answer at a
  moon. The sphere radius is an input to the price, not a detail of the
  drawing.
- **A third sphere in the way.** The two-body arc is the game's flight until
  the ship enters a body's sphere the arc did not account for, and then it is
  not. About a fifth of delivered planetary windows leave through the Mun's
  sphere or arrive through a moon's; two of 6,048 arcs met a planet. The
  encounter check exists for exactly this.
- **Treating the Sun as having an edge.** The Sun orbits nothing, so its
  sphere is infinite and its `elements` throw. A dispatch on parentage has to
  ask `parentOf`, which returns null for it, rather than `elements`; the rule
  is in `.claude/rules/solver.md`.
- **Reading the table as physics.** For the real solar system the sphere is a
  boundary between two approximations and a trajectory crosses it smoothly.
  In the game the ship's reference body changes discontinuously at the edge,
  and its orbit, as the game displays it, jumps. The model here matches the
  game, not the sky.

## Try it

Run the snippet, then change `rMin` from Minmus's 47,000 km to the Mun's own
`rM`, so the "transfer" is to an orbit the same size as the Mun's. The needed
speed at the edge goes to zero, and the burn from 10 km falls to 196 m/s:
the cost of climbing to the Mun's edge alone, and 35 m/s short of the 231 that
escape would cost. That gap is what the edge is worth.

## Check yourself

<details><summary>Why is the Mun's sphere of influence a fifth of its orbital radius when Kerbin's is six tenths of a percent of its own?</summary>

Because of the two-fifths power and the distance. The sphere scales with the
body's orbital radius times (m/M)^0.4. The Mun's mass is a large fraction of
Kerbin's compared with Kerbin's of the Sun's, and the exponent is small, so the
ratio (m/M)^0.4 is 0.2 for the Mun and 0.006 for Kerbin.

</details>

<details><summary>A ship crosses the Mun's sphere edge at 142 m/s relative to the Mun, where escape speed is 232. Is it escaping the Mun, and does it matter?</summary>

In the two-body sense, no: it is on a closed orbit about the Mun and would
fall back. In the game, no such orbit exists past the edge: the ship becomes
Kerbin's, on whatever Kerbin-centred orbit its position and velocity make.
It matters because a model that prices departures as escapes cannot price
this one at all.

</details>

<details><summary>In what sense is a two-body transfer arc "exactly what the game flies", and what is the one thing that can make it not so?</summary>

The game integrates no perturbations: between spheres the ship is on a conic
about one body and nothing else pulls. So the arc the Lambert solver returns is
the arc the game will fly, until the ship enters a third body's sphere the arc
did not account for, at which point the game hands it over and the flight
diverges.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  interplanetary trajectories, for the patched-conic method and the sphere of
  influence.
- Richard Battin, _An Introduction to the Mathematics and Methods of
  Astrodynamics_, for Laplace's derivation of the sphere.
- The KSP wiki, _Sphere of influence_, for the game's own definition and every
  body's figure.

## Key takeaway

Cut space into one sphere per body, solve each as a two-body conic, and patch
them at the edges; in the game that is the flight itself, and pricing a
departure by the energy at the edge rather than at infinity is a few metres a
second at a planet and the whole answer at a moon.

_As of cf42952._

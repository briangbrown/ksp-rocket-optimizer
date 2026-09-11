# Orbital elements and reference frames

**Syllabus:** [P15](../../README.md#part-1--physics)

**Why it matters:** Orbital elements matter because the game does not store
where its planets are; it stores six numbers per body that describe the orbit,
and every position the transfer model needs, from a planet on a date to two
planets a flight time apart, has to be built from them by the same rotations
in the same frame, so that one sign wrong in one rotation puts a planet on the
far side of the Sun and every window computed from it on the wrong date.

**Before this:** [P14](keplers-equation.md), _Kepler's equation_, and
[P13](vis-viva-and-circularising.md), _Vis-viva_, for semi-major axis,
eccentricity, apoapsis and periapsis.

## A worked case

Here is everything the game stores about Dres's orbit:

| Element                            | Dres      |
| ---------------------------------- | --------- |
| Semi-major axis, a                 | 40.839 Gm |
| Eccentricity, e                    | 0.145     |
| Inclination, i                     | 5°        |
| Longitude of the ascending node, Ω | 280°      |
| Argument of periapsis, ω           | 90°       |
| Mean anomaly at epoch, M₀          | 3.14 rad  |

Where is Dres at time zero, in the frame the whole system shares? Two of the
six give the shape, one gives the clock, and three give the orientation, and
the answer is built in that order.

[P14](keplers-equation.md) turns M₀ = 3.14 and e = 0.145 into a true anomaly:
Dres is 179.93° round from its periapsis, almost at apoapsis, 46.761 Gm from
the Sun. In the orbit's own plane, with periapsis on the +x axis, that is the
point (−46.761, 0.056) Gm.

Now three rotations, each about one axis, carry that point into the shared
frame:

| Step                                     | Position (Gm)             |
| ---------------------------------------- | ------------------------- |
| In the orbit's plane, periapsis along +x | (−46.761, 0.056, 0)       |
| Turn by ω = 90° about the vertical       | (−0.056, −46.761, 0)      |
| Tilt by i = 5° about the line of nodes   | (−0.056, −46.583, −4.076) |
| Swing by Ω = 280° about the vertical     | (−45.885, −8.034, −4.076) |

Dres at epoch is at longitude 189.93° in the shared frame, 4.08 Gm below its
plane, moving at 4,630 m/s. `stateAt("Dres", 0)` returns exactly these
numbers.

Now make one mistake. Swing by −280° instead of +280°, the sign a rotation
matrix can pick up from a transposed row. Dres lands at longitude 349.93°: the
mirror image of the right answer across the line of nodes. Kerbin at epoch is
at 179.91°, so the phase angle from Kerbin to Dres is 10° in the right frame
and 170° in the wrong one. A transfer window is a search over that phase
angle. With the sign wrong, the search finds a window, prices it, draws it,
and it is on the opposite side of the Sun from where Dres will be.

```js
const mu = 1.74684656 * 9.80665 * 261600000 ** 2; // the Sun
const a = 40839348203,
  e = 0.145,
  m0 = 3.14; // Dres: shape and clock
const [i, lan, ape] = [5, 280, 90].map((d) => (d * Math.PI) / 180); // orientation
let E = m0; // Kepler's equation for the true anomaly at t = 0, as P14
for (let k = 0; k < 30; k++) {
  const d = (E - e * Math.sin(E) - m0) / (1 - e * Math.cos(E));
  E -= d;
  if (Math.abs(d) < 1e-13) break;
}
const nu =
  2 *
  Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );
const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
// The three rotations, as toFrame composes them: turn by ω, tilt by i, swing by Ω.
const frame = (i, lan, ape) => (x, y, z) => {
  const [cO, sO, ci, si, cw, sw] = [
    Math.cos(lan),
    Math.sin(lan),
    Math.cos(i),
    Math.sin(i),
    Math.cos(ape),
    Math.sin(ape),
  ];
  return [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y + sO * si * z,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y - cO * si * z,
    sw * si * x + cw * si * y + ci * z,
  ];
};
const lon = (p) => ((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360;
const right = frame(i, lan, ape)(r * Math.cos(nu), r * Math.sin(nu), 0);
const wrong = frame(i, -lan, ape)(r * Math.cos(nu), r * Math.sin(nu), 0);
console.log(
  "Dres at epoch:",
  right.map((x) => (x / 1e9).toFixed(3)).join(", "),
  "Gm, longitude",
  lon(right).toFixed(2) + "°",
);
console.log(
  "with the node's sign flipped: longitude",
  lon(wrong).toFixed(2) + "°",
);
```

## The idea

An orbit around one body is fixed by six numbers, the **orbital elements**,
and it helps to hear them in three groups.

Two describe the shape: the semi-major axis a for its size and the
eccentricity e for how far from round it is. One describes the clock: the mean
anomaly at the epoch, M₀, which is where the body was when time started. The
other three describe how the ellipse is oriented in space, and they are the
subject of this lesson.

The **inclination**, i, is the tilt of the orbit's plane against a reference
plane. The **longitude of the ascending node**, Ω, says where the tilted orbit
crosses the reference plane going upward, measured as an angle round from a
reference direction. The **argument of periapsis**, ω, says where the
periapsis sits within the orbit's own plane, measured round from that crossing.
Three angles, because a plane in space needs two to fix it and an ellipse
within the plane needs one more.

Angles are meaningless without something to measure them from, and that
something is the **reference frame**: three perpendicular axes and an origin.
The reference plane is the x–y plane, the reference direction is +x, and z
points up out of the plane. A frame is **right-handed** when turning x toward
y advances a right-handed screw along +z; in a right-handed frame a body that
goes round counter-clockwise, seen from +z, has its angular momentum along +z,
and every rotation formula in the textbooks assumes that convention. Get the
handedness wrong and every rotation goes the other way.

For the real solar system the reference plane is the **ecliptic**, the plane
of Earth's orbit, and the reference direction is the vernal equinox. Kerbal
space is simpler in a way that matters here: no stock body's equator is
tilted, so every planet's equator, the Sun's equator and Kerbin's orbital
plane are all parallel, and a moon's inclination against its planet's equator
is an inclination against the same plane as a planet's against the Sun's. One
frame serves the whole system, with +x the game's reference direction and
prograde counter-clockwise about +z. That is the frame `stateAt` returns
positions in, for the Sun's planets and Kerbin's moons alike.

Getting from the elements to a position is a change of frame. Kepler's
equation gives the true anomaly, and the polar equation gives the distance, so
the position is known in the orbit's own frame, the **perifocal frame**, whose
x axis points at periapsis and whose plane is the orbit's. Three rotations take
it into the shared frame: turn by ω about the perifocal z, so that +x points at
the ascending node instead of periapsis; tilt by i about that x, so the
orbit's plane leans over to its true inclination; and swing by Ω about the
shared z, so the node points where it should. Composed, the three are one
3 × 3 matrix, and it is the same matrix for position and velocity.

The order and the signs are the whole content. Rotations do not commute:
tilting before turning gives a different plane. And each rotation's sign is a
convention that must match the frame's handedness and the direction the angles
are measured in. There is no check inside the mathematics. A wrong sign gives a
perfectly good orbit, the same size and shape, on the wrong side, and the only
way to know is to compare against a position you trust.

## In this codebase

`elements(body)` in [`src/core/kepler.ts`](../../../../src/core/kepler.ts) reads the six numbers from
[`src/data/bodies.json`](../../../../src/data/bodies.json) and converts them to what the mathematics wants:
metres, radians, and the parent's gravitational parameter. `toFrame` is the
composed matrix:

```ts
function toFrame(o: { i: number; lan: number; ape: number }) {
  const cO = Math.cos(o.lan),
    sO = Math.sin(o.lan),
    ci = Math.cos(o.i),
    si = Math.sin(o.i),
    cw = Math.cos(o.ape),
    sw = Math.sin(o.ape);
  return (x: number, y: number, z: number): Vec3 => [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y + sO * si * z,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y - cO * si * z,
    sw * si * x + cw * si * y + ci * z,
  ];
}
```

The comment on it says "rotate by the argument of periapsis, tilt by the
inclination, then swing by the node — the usual three", and the file's header
says why one frame is enough: every stock equator is parallel to the ecliptic,
so a moon's elements against its planet's equator and a planet's against the
Sun's are in the same frame. `stateAt` builds the perifocal position and
velocity and pushes both through `toFrame`.

Downstream, everything assumes one frame. The Lambert solver takes two
position vectors and a time and returns velocities; it never asks which frame,
so the departure body's position and the arrival body's must be in the same
one, which they are because both came from `stateAt`. The encounter check
compares the ship's position with each body's, same frame. The transfer
drawing is top-down: it takes `stateAt`'s x and y and drops z, which is why an
inclined orbit is drawn as the ellipse it projects to, foreshortened by the
cosine of its inclination.

[`test/transfer.test.ts`](../../../../test/transfer.test.ts) pins the frame at epoch: every stock planet starts at
mean anomaly 3.14, opposite its periapsis, so Kerbin is at 180° and Duna at
its node plus 180°, and the phase angle between them is Duna's node, 135.5°,
which the test checks to a tenth of a degree; Kerbin's speed is 9,285 m/s, and
a period later it is back within 100 m.

## What made it real

There is no recorded incident of a mirrored solar system in this repository,
and the lesson should not invent one. What there is instead is the check that
would catch it: the epoch test above. A sign wrong in `toFrame`'s node rotation
would put Duna at 44.5° instead of 315.5°, the phase angle from Kerbin at
224.5° instead of 135.5°, and the test would fail on it. The Dres demonstration in the worked case is the same mistake
computed deliberately, and it shows the size of it: 10° against 170° of phase
from Kerbin, a window on the opposite side of the Sun.

The thing that was measured was the frame's foundation. The first window
search, in #197, was validated against the classic Duna departure a player
knows from a new save, and the test holds it, with the phase angle at epoch as
the anchor. Once the planets are where a player sees them at Year 1 Day 1 and
move at the right rate, every later position follows.

## Where it breaks

- **A sign in a rotation.** The mirror above. A transposed row, an angle
  measured the other way round, or a left-handed frame give a valid orbit in
  the wrong place, and nothing in the algebra objects. The epoch test is the
  guard.
- **Mixing frames.** Two positions handed to the Lambert solver from different
  frames give a transfer between two points that do not both exist. Here it
  cannot happen because every position comes from `stateAt`, but a second
  source of positions would have to match it to the rotation.
- **Degrees where radians are wanted.** The table stores degrees and the
  mathematics wants radians; `elements` converts once, and everything after it
  is radians. A value read from the table directly is 57 times too large.
- **Assuming the equator is the ecliptic elsewhere.** The single-frame trick
  works because no stock body is tilted. A modded system with an axial tilt,
  or the real one, needs a rotation between a planet's equatorial frame and
  the system's, and the moons' elements would no longer be in the planets'
  frame.

## Try it

Run the snippet, then swap the order of two rotations: use `frame(i, ape, lan)`
for `right`, so the node's angle and the periapsis angle trade places. Dres's
longitude hardly changes, 189.97° against 189.93°, because the two angles add
to nearly the same total round the plane, but its height flips from 4.08 Gm
below the reference plane to 4.01 above: the orbit has been tilted about the
wrong line. Rotations do not commute, and the three are only "the usual three"
in the usual order.

## Check yourself

<details><summary>Which three elements fix an orbit's orientation, and what does each one do?</summary>

Inclination tilts the plane against the reference plane; the longitude of the
ascending node says where round the reference direction the tilted plane
crosses upward through the reference plane; the argument of periapsis says
where the periapsis lies within the plane, measured from that crossing. Two
angles for the plane, one for the ellipse within it.

</details>

<details><summary>Why can one reference frame serve the whole Kerbal system, moons included?</summary>

Because no stock body's equator is tilted. A moon's inclination is stated
against its planet's equator, a planet's against the Sun's, and every equator
is parallel to Kerbin's orbital plane, so all those planes are the same plane
and one set of axes measures every orbit.

</details>

<details><summary>What would a sign error in the node rotation look like from the outside, and what catches it?</summary>

A planet in a correct orbit at the mirror-image longitude across the line of
nodes: Dres at 350° instead of 190°, Duna at 44.5° instead of 315.5°. The
epoch test catches it, because it holds the phase angle between Kerbin and
Duna at time zero to a tenth of a degree.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  orbits in three dimensions, for the classical elements and the perifocal-to-
  geocentric rotation.
- David Vallado, _Fundamentals of Astrodynamics and Applications_, for the
  conventions, and the many ways they differ between sources.
- The KSP wiki, _Orbit_, for the game's elements and the fact that no stock
  body has an axial tilt.

## Key takeaway

Six elements fix an orbit, three of them its orientation, and a position is
the perifocal point pushed through three rotations in one right-handed frame;
the algebra cannot tell a right sign from a wrong one, so the frame is only as
trustworthy as the position it has been checked against.

_As of 26affa0._

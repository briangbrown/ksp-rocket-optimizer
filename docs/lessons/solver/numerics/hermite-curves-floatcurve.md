# Hermite curves: KSP's FloatCurve

**Syllabus:** [A5](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The curve type matters because every number the game
looks up along a curve, an engine's Isp against pressure, the air's pressure
and temperature against altitude, is stored as a handful of keys and read
between them by one particular rule, and a solver that reads the same keys
by a different rule, straight lines say, gets the Swivel's Isp wrong by 4 s
at the pressure where max Q happens and Kerbin's air pressure wrong by 10%
at 19 km, so the flown ascent would disagree with the game not because the
physics is wrong but because the lookup is.

**Before this:** [P2](../../physics/engines/specific-impulse-and-pressure.md),
_Specific impulse, and how it falls with pressure_, and
[P7](../../physics/atmosphere/the-atmosphere-as-a-spline.md), _The atmosphere
as a spline_.

## A worked case

The Swivel's Isp curve, as the game stores it, is three keys: 320 s at 0
atm, 250 s at 1 atm, and 0.001 s at 6 atm, each with two slopes, all zero.
What is the Isp at 0.62 atm, the pressure at about 4 km where a Kerbin
launch is near its maximum dynamic pressure?

A straight line between the first two keys gives 320 − 0.62 × 70 = 276.6 s.
The game gives 272.6. The difference is the slopes: with the slope at both
ends held at zero, the curve leaves 320 flat, falls fastest in the middle,
and arrives at 250 flat, an S rather than a ramp. At t = 0.62 of the way
across, the S is at 3t² − 2t³ = 0.677 of the drop instead of 0.62, so the
Isp is 320 − 0.677 × 70 = 272.6 s. At a quarter of an atmosphere the gap is
the other way and larger: the S has fallen only 0.156 of the way, so 309.1 s
against the line's 302.5, a 6.6 s difference on a number every stage sizing
depends on.

Kerbin's pressure curve has 21 keys with real slopes at each, and reading it
by straight lines is a different kind of wrong:

| Altitude | Hermite   | Straight line | Line's error |
| -------- | --------- | ------------- | ------------ |
| 0.6 km   | 92.64 kPa | 92.96 kPa     | +0.4%        |
| 9.8 km   | 18.65 kPa | 19.00 kPa     | +1.9%        |
| 15.0 km  | 6.72 kPa  | 7.07 kPa      | +5.2%        |
| 18.9 km  | 3.14 kPa  | 3.45 kPa      | +9.9%        |
| 37.8 km  | 0.111 kPa | 0.140 kPa     | +26%         |

Low down, where the keys are 1.2 km apart, a line is within half a percent.
Higher, where the keys spread to 4 and 6 km and the pressure falls by a
factor of two or three between them, a line overshoots the concave curve by
5 to 26%. That is the region where the rocket is fastest in the air, so the
drag it would be charged is 5 to 26% high there too.

```js
const { SYS, BODY } = require("./src/data/bodies.json");
const { REAL_CURVE } = require("./src/data/curves.json");
// KSP's FloatCurve evaluation: each key is [x, value, slope in, slope out]
const hermite = (keys, x) => {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0, , m0] = keys[i], // the left key's slope OUT
    [x1, y1, m1] = keys[i + 1]; // the right key's slope IN
  const h = x1 - x0,
    t = (x - x0) / h,
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m1
  );
};
const line = (keys, x) => {
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i],
    [x1, y1] = keys[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};
const swivel = REAL_CURVE['LV-T45 "Swivel" Liquid Fuel Engine'];
console.log(hermite(swivel, 0.62).toFixed(1), line(swivel, 0.62).toFixed(1)); // 272.6 276.6
console.log(hermite(swivel, 0.25).toFixed(1), line(swivel, 0.25).toFixed(1)); // 309.1 302.5
const P = BODY.Kerbin.P;
for (const km of [0.6, 9.8, 15, 18.9, 37.8])
  console.log(
    km,
    hermite(P, km * 1000).toFixed(3),
    line(P, km * 1000).toFixed(3),
  );
```

## The idea

A **Hermite spline** is a curve through a list of points that is fixed, on
each stretch between two neighbouring points, by four numbers: the value at
each end and the slope at each end. Four numbers fix a cubic, so each
stretch is a cubic polynomial, and because neighbouring stretches share a
point and are each given a slope there, the whole curve is continuous and so
is its slope. A **tangent** is the slope given at a point. Where a plain
interpolating spline computes its slopes from the neighbours to make the
curve as smooth as possible, a Hermite spline is told them, which is what
lets a data file say not only where a curve passes but how it is heading
there.

The cubic on one stretch, with t running from 0 to 1 across it, h the
stretch's width, y₀ and y₁ the values and m₀ and m₁ the slopes, is a sum of
four basis functions:

    y(t) = (2t³ − 3t² + 1)·y₀ + (t³ − 2t² + t)·h·m₀ + (−2t³ + 3t²)·y₁ + (t³ − t²)·h·m₁

The first and third are the S-curves that carry the values: 1 falling to 0
and 0 rising to 1, each flat at both ends. The second and fourth carry the
slopes and are zero at both ends, so they bend the middle without moving the
endpoints. Set both slopes to zero and only the S-curves remain, which is
the 3t² − 2t³ of the Swivel above. The h multiplying the slopes is because a
slope is a change per unit of x and t is a fraction of the stretch.

```
    value
      │  ●────·                          y₀ with m₀ = 0: leaves flat
      │        ·  ·                            ╲
      │            ·  ·  ·   Hermite, zero slopes: an S      ╲   straight line
      │                    ·  ·  ·                            ╲
      │  straight line ─────────────·  ·  ·  ─────────────────╲
      │                                      ·  ·  ·  ·  ·  ·  ●   y₁ with m₁ = 0: arrives flat
      └──────────────────────────────────────────────────────────→ x
         t = 0                                                 t = 1
      at t = 0.62 the S has fallen 0.677 of the way; the line 0.62
```

A **FloatCurve** is the game's curve type: a list of keys, each a position,
a value, an in-tangent and an out-tangent, evaluated as the Hermite spline
above using the left key's out-tangent and the right key's in-tangent on
each stretch, and clamped to the end values outside the first and last keys.
Two tangents per key rather than one lets a curve have a corner where the
author wants one; most keys in the game's data have the two equal. Every
engine's `atmosphereCurve`, every body's pressure and temperature curve, and
many other things in the game's part files are FloatCurves, and the game's
authors set the tangents by hand or by tool: the engine curves mostly with
zeros, which gives the S between keys; the atmosphere curves with slopes
fitted so that 21 keys reproduce a smooth 70 km profile.

The rule matters because the keys alone do not fix the curve. Given the same
three Swivel keys, straight lines, a smooth interpolating spline and the
game's zero-tangent Hermite are three different curves that agree only at
the keys, and the engine's thrust at 4 km is a fact about one of them. A
solver that wants to agree with the game has to evaluate the keys exactly
the way the game does, tangents included, not merely pass through the same
points.

## In this codebase

`evalCurve` in [`src/core/atmosphere.ts`](../../../../src/core/atmosphere.ts)
is the evaluation above, written once and used for every curve:

```ts
function evalCurve(keys: Curve, x: number) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1]; // clamped outside the keys, as the game does
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0, , m0] = keys[i], // out-tangent of the key on the left
    [x1, y1, m1] = [keys[i + 1][0], keys[i + 1][1], keys[i + 1][2]]; // in-tangent of the key on the right
  const h = x1 - x0,
    t = (x - x0) / h,
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m1
  );
}
```

The keys are data. [`src/data/bodies.json`](../../../../src/data/bodies.json)
carries each atmosphere's pressure and temperature keys under `BODY`, 21 and
9 for Kerbin, taken from the game's own configuration.
[`src/data/curves.json`](../../../../src/data/curves.json) carries `REAL_CURVE`,
the `atmosphereCurve` of 44 engines as the game's part files state them,
tangents included; the Dart is the one with non-zero tangents at every key,
because its aerospike is meant to hold its Isp into thick air and its
authors shaped the curve to say so. `curveFor` in
[`src/core/performance.ts`](../../../../src/core/performance.ts) returns an
engine's real curve where one is recorded and otherwise `synthCurve`, a
three-key curve with zero tangents built from the vacuum and sea-level Isp
and the inferred cutoff, which is the shape the game's own curves have for
nearly every engine. `ispAt` evaluates it at the stage's pressure, and
`atmoFor` evaluates the pressure and temperature curves at the flight's
altitude every step of the ascent.

## What made it real

The Swivel at 0.62 atm is the number [P2](../../physics/engines/specific-impulse-and-pressure.md)
used to make the point: 272.6 s by the game's rule against 276.6 by a
straight line. The tests in [`test/ascent.test.ts`](../../../../test/ascent.test.ts)
hold that the Isp the simulator flies with at 0.62, 1 and 5 atm is exactly
`ispAt`'s, and that above 1 atm it is the real `atmosphereCurve` rather than
the inferred cutoff, which for the Swivel is a factor of four apart at 5
atm.

The atmosphere is checked against the game's published profile in
[P7](../../physics/atmosphere/the-atmosphere-as-a-spline.md): the spline
through the game's 21 keys reproduces the pressure the game reports at
every altitude, and Kerbin's profile is the Earth standard atmosphere scaled
by 0.8, which the keys and their tangents encode and a formula only
approximates. The table above is the size of the straight-line error
against that: half a percent where the keys are dense, ten percent at 19 km,
a quarter at 38 km.

## Where it breaks

- **Reading the keys by straight lines.** 4 s of Isp at 4 km and 10% of
  pressure at 19 km, in opposite directions at different pressures, so the
  flown ascent would disagree with the game by amounts that vary with the
  turn. The keys are only half the curve; the tangents are the other half.
- **Using one tangent per key.** A FloatCurve key has an in-tangent and an
  out-tangent, and the stretch between two keys uses the left one's out and
  the right one's in. Using the wrong one, or averaging them, changes the
  curve wherever an author set them apart.
- **Extrapolating.** Outside the first and last keys the game holds the end
  values, and so does `evalCurve`. A cubic extended past its last key heads
  off wherever its slope points; the Swivel's curve past 6 atm would go
  negative.
- **Inferring a curve where the game has one.** An engine's real curve
  above 1 atm was once replaced by a synthesised one that let it keep
  thrusting at pressures where the game's curve had it dead; the record is
  in [P2](../../physics/engines/specific-impulse-and-pressure.md) and the
  rules. Where the game's data exists, the game's data is used.
- **Assuming the S.** Zero tangents give the S between keys, and almost
  every engine has them; the Dart does not. A shortcut that hard-codes
  3t² − 2t³ is right for 43 engines and wrong for the one whose curve was
  shaped on purpose.

## Try it

Run the snippet, then change the Swivel's key at 1 atm to give it a slope
in and out of −70, the straight line's slope, so `[1, 250, -70, -70]`: the
value at 0.62 atm moves from 272.6 toward the line, and the curve now has a
corner-free ramp into that key. Then look up the Dart in `REAL_CURVE` and
evaluate it at 2 and 3 atm: with its authored tangents it gives 270.7 and
254.7 s, where a zero-tangent curve through the same keys would give 280.6
and 260.0; its authors bent it lower between the keys, and only the
tangents carry that.

## Check yourself

<details><summary>The Swivel's three keys are the same whether the curve between them is a Hermite spline or straight lines. Why is the Isp at 0.62 atm different?</summary>

Because the keys fix where the curve passes and not how it gets there. With
zero tangents at both keys the Hermite curve leaves and arrives flat, so it
is an S that has fallen 0.677 of the way at t = 0.62, where a line has
fallen 0.62. That is 272.6 s against 276.6, and at 0.25 atm the S has fallen
only 0.156 of the way, 309.1 s against 302.5.

</details>

<details><summary>Why does a straight line between Kerbin's pressure keys err by 0.4% at 1 km and 26% at 38 km?</summary>

Because the keys are 1.2 km apart low down and 6 to 8 km apart high up, and
pressure falls by a factor of two or three across the high stretches. A
chord across a concave-up curve lies above it, and the further apart the
keys and the more the curve bends between them, the further above. The
tangents at each key are what let the spline follow the bend with so few
keys.

</details>

<details><summary>Each FloatCurve key carries two tangents. Which one does the stretch between two keys use from each?</summary>

The out-tangent of the key on the left and the in-tangent of the key on the
right. The two tangents at one key belong to the two stretches that meet
there, so a key can be a smooth point, with both equal, or a corner. In the
code that is `m0` from `keys[i][3]` and `m1` from `keys[i + 1][2]`.

</details>

## Further reading

- The Unity scripting reference for `AnimationCurve` and `Keyframe`, which
  is what KSP's FloatCurve wraps: keys with `inTangent` and `outTangent`,
  evaluated as a cubic Hermite spline.
- Richard Bartels, John Beatty and Brian Barsky, _An Introduction to Splines
  for Use in Computer Graphics and Geometric Modeling_, the chapter on
  Hermite interpolation, for the basis functions and their derivation.
- The Kerbal Space Program wiki's page on the Kerbin atmosphere, for the
  published pressure profile the keys reproduce.

## Key takeaway

A curve in the game's data is its keys and their tangents evaluated as a
cubic Hermite spline, the left key's out-slope and the right key's in-slope
on each stretch, clamped beyond the ends; read that way the Swivel is 272.6
s at 0.62 atm and Kerbin's air is 3.14 kPa at 19 km, and read by straight
lines through the same keys it is 4 s and 10% wrong at exactly the heights
where a launch is fighting the air hardest.

_As of 2ecc64f._

# The atmosphere as a spline

**Syllabus:** [P7](../../README.md#part-1--physics)

**Why it matters:** The atmosphere matters because every step of a simulated
ascent asks it three questions, how thick is the air here, how hard does it
push, and how fast does sound travel through it, and the answers set the
engine's thrust, the drag on the nose and the drag law's own coefficient at
once; a body's air is a pair of curves against altitude, and a wrong number
anywhere on them moves every predicted flight from that body.

**Before this:** [P2](../engines/specific-impulse-and-pressure.md), _Specific
impulse, and how it falls with pressure_.

## A worked case

Kerbin's air is stored as two tables in [`src/data/bodies.json`](../../../../src/data/bodies.json): pressure
against altitude, 21 points from the surface to 70 km, and temperature against
altitude, 9 points. Read the first few pressures off the table:

| Altitude | Pressure    |
| -------- | ----------- |
| 0 m      | 101.325 kPa |
| 1,241 m  | 84.03 kPa   |
| 2,440 m  | 69.68 kPa   |
| 3,597 m  | 57.78 kPa   |
| 4,715 m  | 47.91 kPa   |
| 8,815 m  | 22.63 kPa   |
| 21,143 m | 2.05 kPa    |
| 70,000 m | 0           |

Those altitudes are odd numbers, and they are odd for a reason. Multiply each
by 1.25. 1,241 becomes 1,551; 8,815 becomes 11,019; 21,143 becomes 26,429.
Now look those up in the tables for Earth's own air, the standard atmosphere
engineers use: 22.63 kPa is Earth's pressure at 11 km, and 2.05 kPa is Earth's
at 26.4 km. Kerbin's atmosphere is Earth's, with every altitude multiplied by
0.8. The game's designers took the real profile and squashed it to fit a
planet a tenth the size, and the temperature table says the same: 288 K at the
surface, falling to 217 K at 8.8 km and holding there, which is Earth's
tropopause at 11 km with the same factor applied.

Between the points the game does not draw straight lines. It draws a **spline**,
a smooth curve pieced together from short polynomial arcs between the fixed
points, so that both the value and the slope are continuous. Evaluate it
between the tabulated altitudes and derive the rest:

| Altitude | Pressure  | Temperature | Density     | Speed of sound |
| -------- | --------- | ----------- | ----------- | -------------- |
| 0 m      | 101.3 kPa | 288 K       | 1.225 kg/m³ | 340 m/s        |
| 2,500 m  | 69.0 kPa  | 268 K       | 0.898 kg/m³ | 328 m/s        |
| 5,000 m  | 45.6 kPa  | 248 K       | 0.642 kg/m³ | 315 m/s        |
| 10,000 m | 17.9 kPa  | 217 K       | 0.288 kg/m³ | 295 m/s        |
| 20,000 m | 2.5 kPa   | 222 K       | 0.040 kg/m³ | 298 m/s        |
| 40,000 m | 0.08 kPa  | 271 K       | 0.001 kg/m³ | 330 m/s        |

Density is pressure over temperature, scaled by what the air is made of, and
1.225 kg/m³ at the surface is Earth's sea-level figure exactly. The speed of
sound depends on temperature alone, which is why it falls to 10 km and then
rises again as the upper air warms.

The pressure column is what the drag law and the engine curve both read. At
10 km the air is a sixth as dense as at the surface; at 20 km, a thirtieth. A
rocket at 20 km is nearly out of the air as far as drag is concerned, and its
engines are already within a few percent of their vacuum figures.

```js
const P = [
  [0, 101.325, 0, -0.015016],
  [1241, 84.029, -0.012898, -0.012898],
  [2440, 69.681, -0.011079, -0.011079],
  [3597, 57.78, -0.009515, -0.009515],
  [4715, 47.909, -0.008173, -0.008172],
  [5794, 39.721, -0.007019, -0.007019],
  [6837, 32.932, -0.006028, -0.006028],
  [7843, 27.301, -0.005177, -0.005177],
  [8815, 22.632, -0.004446, -0.004446],
  [10786, 15.368, -0.003017, -0.003016],
  [12101, 11.873, -0.002329, -0.002329],
  [13417, 9.173, -0.001799, -0.001799],
]; // Kerbin's first twelve pressure keys, from bodies.json
// A Hermite spline: each key is [altitude, value, slope in, slope out].
const evalCurve = (keys, x) => {
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0, , m0] = keys[i],
    [x1, y1, m1] = keys[i + 1];
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
const R = 8.31446,
  M = 0.0289644; // gas constant, and the molar mass of Kerbin's air (Earth's)
const T = (h) => (h < 8815 ? 288.1 - (288.1 - 216.7) * (h / 8815) : 216.7); // the table's first two legs, straightened
for (const h of [0, 2500, 5000, 10000]) {
  const p = evalCurve(P, h),
    rho = (p * 1000 * M) / (R * T(h)),
    a = Math.sqrt((1.4 * R * T(h)) / M);
  console.log(
    h,
    "m:",
    p.toFixed(1),
    "kPa",
    rho.toFixed(3),
    "kg/m³",
    a.toFixed(0),
    "m/s",
  );
}
```

## The idea

An atmosphere thins with height because each layer of air has to hold up
everything above it. Pressure falls by a constant factor for every fixed step
of altitude, which makes it an exponential, and the **scale height** is the
step over which it falls by a factor of e, about 2.7. Kerbin's is around 5.6
km near the surface: climb 5.6 km and the pressure is 37% of what it was, climb
another 5.6 km and it is 37% of that. Earth's is about 7 km near the surface,
and the 0.8 that turns Earth's profile into Kerbin's is the ratio of the two.

But it is only roughly an exponential, because the scale height depends on
temperature, and temperature changes with altitude in layers: falling through
the lowest one, flat through the next, rising, flat, falling again. A single
exponential is 9% low at 5 km and 12% high at 20 km against the real profile.
So rather than a formula the game stores the measured shape as a curve with a
few dozen fixed points and fits a spline through them. That is the same trick
as the engine's `atmosphereCurve` in
[P2](../engines/specific-impulse-and-pressure.md), and the same curve type:
[A5](../../README.md#part-2--algorithms-and-the-solver) explains the
particular spline, Hermite, and how it is evaluated. For this lesson the point
is that a spline through the right points is the shape, and a formula is only
ever an approximation to it.

Two tables give three quantities, because air behaves as an ideal gas. The
**ideal gas law** says pressure, density and temperature are tied together:
density is pressure times the **molar mass**, the mass of one mole of the gas,
over the gas constant times the temperature. Kerbin's air has Earth's molar
mass, 0.029 kg/mol, so the surface density is Earth's 1.225 kg/m³. The speed
of sound in an ideal gas depends only on temperature and molar mass, which is
why it is a third column derived from the same two tables, and why it dips at
10 km where the air is coldest.

The three quantities go to three different consumers. Pressure, in
atmospheres, is what the engine's Isp curve is looked up against, so it sets
thrust. Density is what drag is proportional to, so it sets how hard the air
pushes. The speed of sound gives the ratio of the rocket's speed to it, which
[P8](../../README.md#part-1--physics) will need because the drag law's own
coefficient changes sharply as a body passes the speed of sound. One pair of
curves, three questions a simulated ascent asks every tenth of a second.

Each body has its own pair. Eve's surface is 5 atm at 420 K and its air is
heavier, 0.043 kg/mol, so its surface density is 6.2 kg/m³, five times
Kerbin's; its atmosphere reaches 90 km. Duna's surface is 0.067 atm, its air
reaches 50 km, and its surface density is an eighth of Kerbin's. Laythe's is
0.6 atm with Kerbin's air. The same code reads all of them, and the numbers
in the tables are what make a launch from Eve cost what it does.

## In this codebase

`makeAtmo` in [`src/core/atmosphere.ts`](../../../../src/core/atmosphere.ts) turns a body's two curves into three
lookup tables, once per body:

```ts
function makeAtmo(b: AtmoBody) {
  const step = 20,
    n = Math.ceil(b.top / step) + 2;
  const P = new Float64Array(n),
    D = new Float64Array(n),
    A = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = i * step;
    const p = h >= b.top ? 0 : Math.max(0, evalCurve(b.P, h));
    const T = Math.max(1, evalCurve(b.T, Math.min(h, b.top)));
    P[i] = p;
    D[i] = (p * 1000 * b.M) / (Rgas * T); // ideal gas: ρ = pM / RT
    A[i] = Math.sqrt((1.4 * Rgas * T) / b.M); // speed of sound, γ = 1.4
  }
  // ... `get` interpolates linearly between the 20 m samples ...
  return {
    p: (h) => get(P, h),
    rho: (h) => get(D, h),
    a: (h) => get(A, h),
    P0: P[0],
  };
}
```

The spline is evaluated once every 20 m and stored; the simulator then reads
the tables by linear interpolation, which is far cheaper than evaluating a
cubic at every step of every candidate flight. `atmoFor(name)` caches one of
these per body. `b.top` is where the game says the air ends, 70 km on Kerbin,
and above it everything reads zero.

`flyAscent` asks the three questions each step:

```ts
const pa = atmo.p(h) / 101.325; // absolute atmospheres, for the engine's Isp curve
// ...
const rho = atmo.rho(h),
  q = 0.5 * rho * sr * sr, // the air's push, for drag
  mach = sr / atmo.a(h); // speed over the speed of sound, for the drag coefficient
```

The curves themselves come from the game's own configuration, by way of the
Kopernicus planet-pack format, which exposes each body's pressure and
temperature keys; the tables in `bodies.json` are those keys as extracted, not
re-derived.

## What made it real

The scaled-Earth match is the measurement that says the tables are right.
Earth's standard atmosphere gives 22.63 kPa at 11 km, 5.53 at 20 km, 2.55 at
25 km and 0.0798 at 50 km; Kerbin's spline gives 22.7, 5.53, 2.55 and 0.079 at
0.8 times each altitude. Seven points across five decades of pressure agree to
three figures, which is not a coincidence a hand-typed table would produce.

The exponential comparison is the measurement that says a formula would not
do: 9% low at 5 km, 12% high at 20 km, against the profile the game flies.
Drag is proportional to density, and the simulator's drag losses in
[P6](../ascent/gravity-drag-and-steering-losses.md) ran from 65 to 252 m/s on
Kerbin launches, so a 10% error in density through the thick part of the climb
is a 10 to 25 m/s error in the ascent before the engine curve has even been
consulted. Nothing here was tuned; the tables were extracted, the spline is
the game's, and the flown-in-game table in the README is the check on the
whole.

## Where it breaks

- **Relative pressure.** The engine curve is keyed on Kerbin's sea level as
  1 atm, so the pressure has to be converted from kilopascals to absolute
  atmospheres before it is looked up, whichever body the rocket is on. The
  division by 101.325 in `flyAscent` is that conversion, and
  [P2](../engines/specific-impulse-and-pressure.md) has the consequence on Eve.
- **The top is a cliff.** Above `b.top` every table reads zero, and the spline
  is not consulted. A rocket that crosses 70 km on Kerbin leaves the air in one
  step, which is what the game does too, but a curve that did not reach zero at
  the top would leave a step in density the integrator would feel as a jolt.
- **Sampling too coarsely.** The 20 m table is a compromise: fine enough that
  linear interpolation between samples is inside the spline's own accuracy,
  coarse enough to build in a millisecond. A coarser table would put kinks in
  the density where the spline has none, and the drag at maximum air pressure
  would move with them.
- **A body with no curves.** `buildVehicleFor` returns nothing for a body that
  is not in `BODY`, and the solver treats such a launch as airless. A body that
  has air in the game but no tables here would be flown with no drag and full
  vacuum thrust from the pad.

## Try it

Run the snippet, then change `M` from `0.0289644`, Earth's molar mass, to
`0.043`, Eve's and Duna's heavier air, leaving the pressures alone. The
densities rise by half and the speed of sound falls by a fifth, with the
pressure column unchanged: the same pressure profile in a heavier gas is a
thicker atmosphere to fly through, which is part of why Eve is what it is.

## Check yourself

<details><summary>Kerbin's pressure at 8,815 m is 22.63 kPa. What altitude on Earth has that pressure, and what does the answer tell you about how the table was made?</summary>

About 11 km, 8,815 / 0.8. Every altitude in Kerbin's table is 0.8 times the
Earth altitude with the same pressure, so the table is Earth's standard
atmosphere compressed to fit a smaller planet, not a profile invented for the
game.

</details>

<details><summary>Why does the speed of sound fall from 340 m/s at the surface to 295 at 10 km and then rise again by 40 km?</summary>

Because in an ideal gas the speed of sound depends only on temperature and
molar mass. The air cools from 288 K to 217 K through the lowest layer, holds
there, and warms again to 271 K by 40 km, and the speed of sound follows the
square root of that.

</details>

<details><summary>Why store the atmosphere as a spline through tabulated points rather than as an exponential with a scale height?</summary>

Because the scale height is not constant: it depends on temperature, which
changes in layers. A single exponential is 9% low at 5 km and 12% high at 20 km
against the game's own profile, and drag is proportional to density, so the
error would go straight into every predicted ascent. The spline reproduces the
layered shape exactly at the points and smoothly between them.

</details>

## Further reading

- The U.S. Standard Atmosphere, 1976, whose tables Kerbin's are a scaled copy
  of; any engineering handbook prints them.
- John Anderson, _Introduction to Flight_, the chapter on the standard
  atmosphere, for the layered temperature model and why pressure follows from
  it.
- The KSP wiki, _Kerbin_ and _Atmosphere_, for the game's own description of
  its air and the 70 km edge.

## Key takeaway

A body's air is two tables, pressure and temperature against altitude, with a
spline through each, and the ideal gas law turns them into the three numbers an
ascent needs at every step: pressure for the engine, density for the drag, and
the speed of sound for the drag law's coefficient.

_As of 06b4cb6._

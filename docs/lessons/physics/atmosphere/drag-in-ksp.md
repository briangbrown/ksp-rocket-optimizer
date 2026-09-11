# Drag in KSP: drag cubes and the Cd chain

**Syllabus:** [P8](../../README.md#part-1--physics)

**Why it matters:** Drag matters because it is the one loss that depends on
the rocket's shape rather than its thrust, and it falls hardest on the
smallest rockets: a solver design for a 0.1 t probe loses 583 m/s to the air
and one for a 40 t payload loses 155, so how the frontal area is measured and
how the drag coefficient is computed decides which small rockets the tool can
send to orbit at all.

**Before this:** [P7](the-atmosphere-as-a-spline.md), _The atmosphere as a
spline_, and [P6](../ascent/gravity-drag-and-steering-losses.md), _Gravity,
drag and steering losses_.

## A worked case

Ask the solver for a rocket to low Kerbin orbit at six payloads, and fly each
one:

| Payload | Liftoff mass | Frontal area | Gravity loss | Drag loss | Drag per tonne of rocket |
| ------- | ------------ | ------------ | ------------ | --------- | ------------------------ |
| 0.1 t   | 2.3 t        | 1.34 m²      | 1,092 m/s    | 583 m/s   | 253 m/s per t            |
| 0.3 t   | 2.8 t        | 1.41 m²      | 1,046 m/s    | 473 m/s   | 169                      |
| 0.8 t   | 7.3 t        | 1.41 m²      | 1,429 m/s    | 152 m/s   | 21                       |
| 3.5 t   | 25.3 t       | 2.73 m²      | 1,046 m/s    | 252 m/s   | 10                       |
| 12 t    | 72.8 t       | 4.86 m²      | 1,317 m/s    | 65 m/s    | 0.9                      |
| 40 t    | 274 t        | 4.85 m²      | 887 m/s      | 155 m/s   | 0.6                      |

Gravity loss barely moves across two orders of magnitude of rocket. Drag loss
falls by a factor of nine from the smallest to the largest, and the last column
says why: the area the air pushes on grows from 1.3 to 4.9 m², less than four
times, while the mass behind it grows a hundred and twenty times. The air
pushes on area and slows mass. A small rocket is all skin.

Now the push itself. Drag is the air's pressure on the moving rocket, times the
area it acts on, times a coefficient for the shape:

    D = q · Cd · A        with  q = ½ ρ v²

At the moment of greatest air pressure on the 3.5 t design, 7.1 km up, q is
23.6 kPa. The air there is about 0.45 kg/m³, so the rocket is doing 324 m/s,
just past the speed of sound at that height. The coefficient for a cylinder
nose at that speed comes out at 1.46, the area is 2.73 m², and

    D = 23,600 × 1.46 × 2.73 = 94 kN

on a rocket that at that moment weighs about 25 t: 3.7 m/s² of deceleration,
more than a third of gravity's pull, from air alone.

The coefficient is the surprising part. It is not one number for a shape. Here
it is for the same cylinder face at different speeds, the speed measured in
multiples of the speed of sound:

| Mach | Cd   |
| ---- | ---- |
| 0.3  | 0.32 |
| 0.6  | 0.33 |
| 0.85 | 0.36 |
| 1.0  | 1.15 |
| 1.1  | 1.68 |
| 1.3  | 1.65 |
| 2.0  | 1.04 |
| 5.0  | 0.98 |

Below the speed of sound the coefficient sits near 0.3. Crossing it the
coefficient jumps to 1.7, more than five times, and then settles back to about
1.0 and stays there. A rocket pays most of its drag in the few seconds it
spends passing through Mach 1, and it pays a lot more if it does that low, in
thick air, than high.

```js
// The five curves of Physics.cfg, as src/data/curves.json holds them.
const DRAG_CD = [
  [0.05, 0.0025, 0.15, 0.15],
  [0.4, 0.15, 0.396397, 0.396397],
  [0.7, 0.35, 0.906699, 0.906699],
  [0.75, 0.45, 3.213604, 3.213604],
  [0.8, 0.66, 3.49833, 3.49833],
  [0.85, 0.8, 2.212924, 2.212924],
  [0.9, 0.89, 1.1, 1.1],
  [1, 1, 1, 1],
];
const DRAG_CD_POWER = [
  [0, 1, 0, 0.00716],
  [0.85, 1.25, 0.778036, 0.778036],
  [1.1, 2.5, 0.24928, 0.24928],
  [5, 3, 0, 0],
];
const DRAG_TIP = [
  [0, 1, 0, 0],
  [0.85, 1.19, 0.696042, 0.696042],
  [1.1, 2.83, 0.730473, 0.730473],
  [5, 4, 0, 0],
];
const DRAG_MULT = [
  [0, 0.5, 0, 0],
  [0.85, 0.5, 0, 0],
  [1.1, 1.3, 0, -0.0081],
  [2, 0.7, -0.110486, -0.110486],
  [5, 0.6, 0, 0],
  [10, 0.85, 0.021983, 0.021983],
  [14, 0.9, 0.007695, 0.007695],
  [25, 0.95, 0, 0],
];
const DRAG_REYNOLDS = [
  [0, 4, 0, -2975.412],
  [0.0001, 3, -251.1479, -251.1479],
  [0.01, 2, -19.63584, -19.63584],
  [0.1, 1.2, -0.784604, -0.784604],
  [1, 1, 0, 0],
  [100, 1, 0, 0],
  [200, 0.82, 0, 0],
  [500, 0.86, 0.000193, 0.000193],
  [1000, 0.9, 1.5e-5, 1.5e-5],
  [10000, 0.95, 0, 0],
];
// KSP's FloatCurve: each key is [x, value, slope in, slope out], and the game's own Hermite
// evaluation sits between them. Zero slopes give an ease-in, ease-out arc between neighbours.
const evalCurve = (keys, x) => {
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
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
// The chain, exactly as cdOf applies it. cube is the face's own drag-cube Cd: 0.85 for a tank.
const cdOf = (mach, rhoV = 100, cube = 0.85) =>
  Math.pow(evalCurve(DRAG_CD, cube), evalCurve(DRAG_CD_POWER, mach)) *
  evalCurve(DRAG_TIP, mach) *
  evalCurve(DRAG_MULT, mach) *
  evalCurve(DRAG_REYNOLDS, rhoV) *
  0.8;
for (const m of [0.3, 0.6, 0.85, 1.0, 1.1, 1.3, 2.0, 5.0])
  console.log(m, cdOf(m).toFixed(2));
const q = 0.5 * 0.45 * 324 ** 2; // Pa, at 7.1 km on the 3.5 t design
console.log(
  "D =",
  ((q * cdOf(324 / 305, 0.45 * 324) * 2.73) / 1000).toFixed(0),
  "kN",
);
```

## The idea

Air resists a body moving through it, and the resistance is proportional to
the air's density, to the square of the speed, and to the area the body
presents to the flow. The first two are wrapped up as **dynamic pressure**, q =
½ ρ v², the pressure the moving air exerts on anything that stops it, and the
third is the **frontal area**, A, the area you would see looking at the rocket
from dead ahead. What is left after those, everything about the shape and the
nature of the flow, is the **drag coefficient**, Cd, a dimensionless number
that says how much drag this shape makes for its area. A flat plate is about
1.2; a streamlined body can be under 0.1; a blunt cylinder nose is around 0.8
in the game's own terms.

Cd is not a constant for a shape because the air does not flow around a body
the same way at every speed. The number that matters is the **Mach number**,
the speed over the local speed of sound. Below about Mach 0.8 the air moves
aside smoothly. Between 0.8 and 1.2, the **transonic** range, shock waves form
on the body and the pressure distribution around it changes completely; drag
rises steeply, and this is the hump in the table. Above about Mach 1.2 the
shocks are established and the coefficient falls back and levels off. The
speed of sound comes from [P7](the-atmosphere-as-a-spline.md)'s temperature
table, which is why Mach 1 is 340 m/s on the pad and 295 m/s at 10 km.

There is a second dimensionless number in the flow, the **Reynolds number**,
which compares the inertia of the moving air with its viscosity and says
whether the flow round a body is smooth or turbulent. It depends on density,
speed and size together. For a rocket in thick air at speed it is large and
its effect on drag is small; in very thin air, or at very low speed, it rises
and so does the coefficient. KSP models it through the product of density and
speed alone, and for a launch it is a correction of a few percent.

KSP does not compute any of this from the rocket's geometry in flight. Each
part carries a **drag cube**: six numbers, one per face of a box around the
part, each recording the area that face presents and a drag coefficient for
it, baked once from the part's model. In a stack, faces that touch other parts
are occluded, and the face meeting the airflow carries nearly all the drag.
The game then runs that face's cube coefficient through a chain of five
curves, tuned by the developers so that stock rockets fly the way they wanted:
one maps the cube's coefficient onto a working range, one raises it to a power
that grows with Mach number, one multiplies by a tip factor that also grows
with Mach, one multiplies by a Mach-dependent factor that makes the hump, and
one applies the Reynolds correction. Two global constants scale the result.
None of the five is physics; all five are the game's fit, and a model that
wants to predict what the game does has to run the same chain on the same
inputs.

That is also why the frontal area has to be measured from the drag cube and
not from the part's nominal size. A part's size class says which node it
mounts on; its cube says how big it is. A Twitch engine mounts on a 1.25 m
node and is 0.29 m across, presenting 0.077 m² against the 1.23 m² its size
class implies. On a small rocket the difference is the difference between a
design that reaches orbit and one that does not.

## In this codebase

The frontal area of a rocket in flight is the largest face of anything still
aboard, plus the payload, plus whatever boosters are still bolted on:

```ts
function frontalArea(
  stages,
  iStage,
  boostersOn,
  payloadArea = 0,
  boostersLeft = null,
) {
  let A = payloadArea; // often the widest thing on a small rocket
  for (let i = iStage; i < stages.length; i++) A = Math.max(A, stages[i].area);
  const b = stages[iStage] && stages[iStage].boosters;
  if (b && boostersOn)
    A += (boostersLeft == null ? b.n : boostersLeft) * b.area * 0.85;
  return A;
}
```

Only the leading face counts; everything behind it is occluded, and the game
charges occluded faces almost nothing. Radial boosters sit outside the core's
shadow and add their own area, thinning as pairs drop under asparagus. Each
stage's `area` is the largest drag-cube face of its parts, read from
`src/data/geometry.json` through `areaOf` in `src/core/geometry.ts`: the file
is a transcription of the game's `PartDatabase.cfg`, with a stock table and a
ReStock one because the mod changes the models.

The coefficient is the chain, in `src/core/atmosphere.ts`:

```ts
function cdOf(mach: number, rhoV = 100, cubeCd = CUBE_CD_STACK) {
  const base = Math.pow(
    evalCurve(DRAG_CD, cubeCd),
    evalCurve(DRAG_CD_POWER, mach),
  );
  return (
    base *
    evalCurve(DRAG_TIP, mach) *
    evalCurve(DRAG_MULT, mach) *
    evalCurve(DRAG_REYNOLDS, rhoV) *
    DRAG_GLOBAL
  );
}
```

The five curves are in `src/data/curves.json`, copied from the game's
`Physics.cfg`; `DRAG_GLOBAL` is its two constants, 8 and 0.1, multiplied; and
`CUBE_CD_STACK`, 0.85, is the cube coefficient of a cylindrical tank face, from
`PartDatabase.cfg`. `flyAscent` puts the pieces together each step:

```ts
const rho = atmo.rho(h),
  q = 0.5 * rho * sr * sr,
  mach = sr / atmo.a(h);
const A = frontalArea(veh.stages, iS, bProp > 0, veh.payloadArea || 0, bLeft),
  D = (q * cdOf(mach, rho * sr) * A) / 1000; // N → kN, since masses are in tonnes
```

and `D / mass` is the drag loss of
[P6](../ascent/gravity-drag-and-steering-losses.md).

## What made it real

The chain replaced a curve that had been calibrated by hand, and the comment
above it records the measurement: the hand curve ran at about a third of the
game's value through the transonic range. A rocket's drag is mostly paid there,
so the simulator was crediting every launch with a third of its real drag loss
on exactly the part of the flight where the loss is largest.

The areas were wrong in the other direction. Before they were read from the
cubes, a radial engine's width fell back to the node it bolts to, so a Twitch
was charged 1.23 m² of frontal area against a true 0.077, sixteen times too
much, and a payload that was wider than its tanks was not counted at all: a
1.25 m probe on 0.625 m tanks presents four times the tankage's area. Both
fixes moved the small end of the design grid, which is where the table above
says drag decides the outcome.

And the cubes themselves can lie. Three parts in the reference install came
with cubes the game had generated from broken models, the Mammoth's bounding
box coming out 499 by 25 by 741 metres. A cylinder fills its own bounding box
to 0.983 across 524 parts; the three bad ones read 0.00003, 0.014 and 0.055,
and their areas are taken from a stock install instead. `.claude/rules/part-data.md`
carries the check for the next extraction.

## Where it breaks

- **Occlusion is a model, not a measurement.** Counting only the leading face
  is what a clean stack does in the game, and boosters are charged 85% of
  their face for the shadow the core casts on them. A rocket with exposed
  side faces, a wide adapter or a part sticking out, would draw drag the
  simulator does not see.
- **Measured width is not occupied width.** The cube gives a Twitch 0.29 m,
  which is right for drag and for drawing it, and wrong for asking whether a
  booster can stand beside it: it mounts on a 1.25 m node. `.claude/rules/solver.md`
  has the rule under _What an engine measures is not what it occupies_.
- **A cube that does not describe its part.** The three corrupt cubes above.
  Any new extraction should run the fill-factor check before trusting an area.
- **The payload's width is the reader's to give.** The brief asks for it, and
  the simulator uses it as a floor on the frontal area. Leave it at zero for a
  wide probe on narrow tanks and the drag is understated by exactly the factor
  the comment warns about.
- **Two art tables.** Which set of areas is live depends on whether ReStock is
  installed: the Poodle presents 4.853 m² stock and 2.899 under ReStock.
  Reading the wrong table sizes the wrong rocket; `useArt` picks, once per
  solve.

## Try it

Run the snippet, then change `cube` in the call from its default to `0.94`,
the drag-cube coefficient of a solid booster's face, by calling `cdOf(1.1, 100,
0.94)`. The transonic peak rises from 1.68 to 2.49: a blunter face pays more
everywhere, and most where drag is already worst.

## Check yourself

<details><summary>Why does drag loss per tonne fall from 253 m/s to under 1 m/s across the table, when the big rockets are going just as fast through the same air?</summary>

Because drag acts on area and slows mass. Scale a rocket up and its frontal
area grows with the square of its size while its mass grows with the cube, so
each square metre of nose has more and more mass behind it. The 274 t rocket
has three and a half times the area of the 2.3 t one and a hundred and twenty
times the mass.

</details>

<details><summary>Where in a launch is most of the drag paid, and what does that say about when to tip the rocket over?</summary>

Passing through Mach 1, where the coefficient is five times its subsonic
value. A rocket that reaches Mach 1 low, in thick air, pays that peak at high
dynamic pressure; one that climbs steeply first and goes supersonic higher pays
it in thinner air. That is the pressure the turn search caps, and
[P11](../../README.md#part-1--physics) is about the cap.

</details>

<details><summary>Why is a part's frontal area read from its drag cube rather than from its diameter?</summary>

Because the diameter names the node the part mounts on, not the part's size.
A Twitch mounts on 1.25 m and is 0.29 m across; using the node would charge it
sixteen times its real area. The cube is the game's own measurement of what
each face presents, and it is what the game itself uses for drag.

</details>

## Further reading

- John Anderson, _Introduction to Flight_, the chapters on drag and on
  transonic and supersonic flow, for why the coefficient has the shape it has.
- The KSP wiki, _Aerodynamics_ and _Drag cube_, for the game's own account of
  the cubes and the curves in `Physics.cfg`.
- The KSP forum's community documentation of `PartDatabase.cfg`, for how the
  cubes are baked and how to read one.

## Key takeaway

Drag is q · Cd · A: the air's pressure at speed, times a coefficient that
jumps five-fold passing the speed of sound, times an area that must be measured
from the part's drag cube and not its size class; it acts on area and slows
mass, which is why it is a rounding error on a big rocket and the deciding loss
on a small one.

_As of aabd4ee._

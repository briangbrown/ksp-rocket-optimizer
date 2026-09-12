# Specific impulse, and how it falls with pressure

**Syllabus:** [P2](../../README.md#part-1--physics)

**Why it matters:** Specific impulse matters because it is the exhaust speed
in the rocket equation, and it is not one number: an engine's thrust and the
speed of its exhaust both fall as the air around it thickens, so a first stage
sized with the figure from the top of its burn is oversold by hundreds of
metres a second, and one sized with the figure from the pad is undersold by as
many.

**Before this:** [P1](../staging/dv-and-the-rocket-equation.md), _Δv and the
rocket equation_.

## A worked case

The parts table gives the Terrier two thrusts and two specific impulses:

| Where        | Thrust  | Specific impulse |
| ------------ | ------- | ---------------- |
| In vacuum    | 60.0 kN | 345 s            |
| At sea level | 14.8 kN | 85 s             |

Divide the vacuum thrust by the vacuum specific impulse and g₀:
60,000 / (345 × 9.81) = 17.7 kg of propellant a second. Do the same at sea
level: 14,800 / (85 × 9.81) = 17.7 kg/s. The same number. The engine pumps
propellant at one fixed rate wherever it is; what changes with the air is how
much push each kilogram gives. At sea level the Terrier gets a quarter of the
push per kilogram it gets in vacuum, so it makes a quarter of the thrust and
its exhaust is a quarter as fast: 85 × 9.81 = 834 m/s against 345 × 9.81 =
3,384.

Put that into [P1](../staging/dv-and-the-rocket-equation.md)'s two-tank stage,
which had a mass ratio of 3:

| Specific impulse used | Δv        |
| --------------------- | --------- |
| 345 s, vacuum         | 3,718 m/s |
| 85 s, sea level       | 916 m/s   |

Same tanks, same engine, same propellant. A factor of four in what the stage is
worth, depending only on which number you picked. The Terrier is a vacuum
engine and nobody would light it on the pad, so try one that does get lit
there. The Swivel is 320 s in vacuum and 250 s at sea level, and a Swivel stage
with a mass ratio of 3 is worth

| Specific impulse used         | Δv        |
| ----------------------------- | --------- |
| 320 s, vacuum, all the way    | 3,449 m/s |
| 250 s, sea level, all the way | 2,694 m/s |
| 273 s, the solver's figure    | 2,938 m/s |

The gap between the first two is 755 m/s, a fifth of the stage. Neither is
right: the stage lights in thick air and burns out in thin, so its real figure
is somewhere between, and where exactly depends on how fast it climbs. The
third row is the solver's answer, and the rest of this lesson is where that
number comes from.

```js
const g0 = 9.81;
const flow = (thrust, isp) => (thrust * 1000) / (isp * g0); // kg/s
console.log(flow(60, 345).toFixed(1), flow(14.8, 85).toFixed(1)); // the Terrier, twice
const smooth = (y0, y1, t) => y0 + (y1 - y0) * (3 * t * t - 2 * t * t * t);
const ispAt = (vac, sea, atm) => smooth(vac, sea, Math.min(1, atm)); // below 1 atm
for (const atm of [0, 0.05, 0.62, 1])
  console.log(atm, "atm", ispAt(320, 250, atm).toFixed(1));
for (const isp of [320, 250, ispAt(320, 250, 0.62)])
  console.log(isp.toFixed(0), (isp * g0 * Math.log(3)).toFixed(0));
```

## The idea

**Specific impulse**, written Isp, is how much push an engine gets from each
unit of propellant it burns: thrust divided by the weight of propellant used
per second. The units come out in seconds, which is a historical accident of
dividing by weight rather than mass, and the useful reading is that Isp × g₀ is
the speed of the exhaust. That is why it sits in the rocket equation: v_e =
Isp × g₀. An engine of 345 s throws its exhaust at 3,384 m/s.

**Mass flow** is the other half of the same relation. Thrust = mass flow ×
exhaust speed, so thrust = mass flow × Isp × g₀. In KSP an engine's mass flow is
fixed by its vacuum figures, thrust over Isp × g₀, and never changes; the thrust
it produces at any moment is that flow times whatever the Isp is there.

The Isp falls with air pressure for a reason that is worth seeing once. An
engine's nozzle, the bell, expands the hot gas so that it leaves as fast as
possible, and the gas leaves the bell's mouth at some pressure of its own.
Outside the mouth is the atmosphere, pushing back on the exhaust with its own
pressure. Thrust is the momentum of the exhaust plus the difference between
those two pressures times the area of the mouth. In vacuum there is nothing
pushing back and the whole bell works for you. At sea level the air's push
subtracts, and a bell built for vacuum, wide-mouthed so the gas is expanded a
long way, has a great deal of mouth to push on. That is the Terrier: a big
bell, a tiny engine, 345 s where there is no air and 85 s where there is. A bell
built for the pad is narrower, expands less, and loses less: the Mainsail is
310 s and 285 s, an 8% fall against the Terrier's 75%.

KSP does not model the bell. It stores the result as an **atmosphereCurve**, a
table of Isp against pressure in atmospheres: a key at 0 atm with the vacuum
figure, a key at 1 atm with the sea-level figure, and a third key where the
engine gives up altogether, somewhere between 3 and 12 atm depending on the
engine. Between the keys the game draws a smooth curve rather than straight
lines; [A5](../../README.md#part-2--algorithms-and-the-solver), _[Hermite curves:
KSP's FloatCurve](../../solver/numerics/hermite-curves-floatcurve.md)_, is about
that curve and how it is evaluated. For this lesson it is enough that at 0.62 atm the
Swivel is not 276.6 s, which is what a straight line between 320 and 250 would
give, but 272.6.

Two things follow that a person sizing a rocket needs.

The pressure is absolute, not relative to wherever the rocket is standing. The
curve is keyed on Kerbin's sea level as 1 atm. Duna's surface is 0.067 atm, so
an engine on Duna's pad is already nearly in vacuum. Eve's is 5 atm, past the
Terrier's third key at 3, so a Terrier on Eve's surface produces nothing at
all, and a Swivel, whose curve ends at 6 atm, produces very little.

And a stage does not burn at one pressure. A first stage from Kerbin lights at
1 atm and shuts down near 0. Its Isp is a different number every second of the
burn, and the rocket equation wants one. The honest answer is to fly it, which
is what the simulator does, evaluating the curve at the pressure of each step.
The fast answer, good enough to size a stage before deciding whether it is
worth flying, is a single representative pressure for the burn.

## In this codebase

`ispFnFor` in [`src/core/performance.ts`](../../../../src/core/performance.ts) builds an engine's curve, and it is
the one place the curve comes from:

```ts
function ispFnFor(e: { n: string; iv: number; ia: number }) {
  const real = REAL_CURVE[e.n]; // the engine's atmosphereCurve, from its config
  return real
    ? (x: number) => Math.max(0, evalCurve(real, x))
    : ispCurve(e.iv, e.ia, ispCut(e)); // no config: the same shape, a guessed third key
}
```

`ispAt(e, p)`, next to it, answers "what is this engine's Isp at this
pressure" by calling that function and caching the answer, because the solver
asks it 124 million times in a solve and gets 116 distinct answers.

`iv` and `ia` are the vacuum and sea-level figures from the parts table.
`REAL_CURVE` in [`src/data/curves.json`](../../../../src/data/curves.json) holds the three keys lifted from each
engine's config file; for an engine without one, `ispCurve` builds the same
shape from the two figures and a guess at the third key.

The representative pressure is `STAGE_PRESSURE`, a few lines above:

```ts
const STAGE_PRESSURE = [0.62, 0.05, 0, 0];
```

The first stage of a launch is sized at 62% of the surface pressure, the second
at 5%, anything higher at 0. The comment above it says where those came from:
the simulator was run over Kerbin, Duna and Laythe designs and the pressure of
each step was averaged, weighted by the propellant burned in that step. A
first stage burns most of its propellant low, so its mean is high. `solveGroup`
in [`src/core/solver.ts`](../../../../src/core/solver.ts) multiplies by the launch body's surface pressure and
passes the result to `ispAt`, and that Isp is the one `propellantFor` sizes the
stage with. For the Swivel from Kerbin that is 272.6 s, the third row of the
table above.

The simulator does not use a representative pressure. Each 0.1 s step in
`flyAscent` reads the pressure at the rocket's height, converts it to
atmospheres, and computes thrust from the fixed mass flow:

```ts
const pa = atmo.p(h) / 101.325; // absolute atmospheres, keyed on Kerbin sea level
const isp = st.isp(pa);
T += st.mdot * cLim * isp * 9.80665; // thrust = flow × Isp × g₀
```

`mdot` is set once per stage as the vacuum thrust over the vacuum Isp × g₀, the
division the worked case did by hand.

## What made it real

The `STAGE_PRESSURE` figures are measurements, and the comment records how they
were taken. The first stage's 0.62 is a propellant-weighted mean over simulated
ascents, not a guess at "about halfway".

The third key was measured too. Before the real curves were in the data, the
cutoff was inferred from the two figures as 3 + 9 × (Isp_asl / Isp_vac). When
the real configs were read, that formula was wrong by 3.4 atm on average and
right for 4 engines in 60, and systematically optimistic for vacuum bells: it
gave the Terrier a 5.2 atm cutoff against a real 3.0, so on Eve the solver was
crediting it with thrust it does not have. Everything sized at Eve moved when
the real keys went in. Below 1 atm nothing moved, because the third key does
not reach the curve between the first two.

## Where it breaks

- **One Isp for a burn that crosses pressures.** The representative pressure is
  a mean over designs that were flown; a design that climbs unusually fast or
  slow burns at a different mean, and the closed-form Δv is off by the
  difference. The simulator's flown cost is what catches it, and the re-solve
  against it is [A7](../../README.md#part-2--algorithms-and-the-solver).
- **Two places building one curve.** Until #330 the sizer read the real
  atmosphereCurve and the simulator built its own from the inferred cutoff.
  They agreed exactly up to 1 atm, so Kerbin, Laythe and Duna never showed it;
  at Eve's 5 atm a Swivel was 26 s to one and 146 s to the other (#328). Now
  `ispFnFor` is the only source and a test holds a flown stage's Isp equal to
  the sizer's at every pressure. The general trap is the one to remember: a
  curve that two callers build separately agrees only where the test data
  happens to reach.
- **Relative pressure.** The curve is keyed on Kerbin's sea level. A body's
  surface pressure has to be converted to absolute atmospheres before it is
  looked up, and the simulator divides by 101.325 kPa for exactly that reason.
- **Trusting the vacuum figure for a stage that lights in air.** The parts
  table shows `iv` first and it is the larger number. A stage sized at `iv`
  that lights at 1 atm is short by the whole gap in the Swivel table above.

## Try it

Run the snippet above. Then change the Swivel's two figures, 320 and 250, to
the Terrier's, 345 and 85, and read the Isp at 0.62 atm: 169 s, half the
vacuum figure. At the solver's first-stage pressure a Terrier stage is worth
half what its vacuum figure promises, before its 14.8 kN of sea-level thrust is
even asked to lift anything. Both are reasons it is an upper-stage engine.

## Check yourself

<details><summary>An engine has 240 kN of thrust and 310 s of specific impulse in vacuum. What is its mass flow, and what is its thrust at sea level where its specific impulse is 265 s?</summary>

Mass flow is 240,000 / (310 × 9.81) = 78.9 kg/s, and it does not change with
altitude. Sea-level thrust is 78.9 × 265 × 9.81 = 205 kN. That is the Reliant,
and the parts table lists 205.2 kN.

</details>

<details><summary>Why is a vacuum engine's specific impulse hurt so much more by air than a sea-level engine's?</summary>

Because of the bell. A vacuum engine expands its exhaust through a wide bell to
squeeze out the last of its speed, and the air outside pushes back on that
whole wide mouth. A sea-level engine's narrower bell has less mouth to push on
and loses less. The Terrier falls 75%, the Mainsail 8%.

</details>

<details><summary>The solver sizes a Kerbin first stage at 0.62 atm. Where does that number come from, and why is it not 0.5?</summary>

It is the mean pressure over the stage's burn, weighted by the propellant
burned at each pressure, measured by running the simulator over real designs.
It is above 0.5 because a first stage burns most of its propellant low down,
while it is heavy and slow, and so most of its propellant is burned in thick
air.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapter on
  nozzle theory, for the pressure term in the thrust equation and why the bell
  matters.
- The KSP wiki, _Specific impulse_, for the game's own account of the
  atmosphereCurve and its keys.
- Robert Braeunig, _Rocket and Space Technology_, "Rocket Propulsion", for
  worked thrust and Isp calculations.

## Key takeaway

Isp × g₀ is the exhaust speed, mass flow is fixed and thrust follows the Isp
wherever the rocket is, and a stage that climbs through the atmosphere has to
be sized at the pressure it burns most of its propellant in, not at either end.

_As of 97029aa._

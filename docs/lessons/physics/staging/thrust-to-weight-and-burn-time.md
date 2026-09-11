# Thrust-to-weight, and the burn-time limits

**Syllabus:** [P3](../../README.md#part-1--physics)

**Why it matters:** The thrust-to-weight floor matters because the rocket
equation will happily size a stage that cannot leave the pad, or one that
climbs so slowly that gravity takes back most of what the engine gives, and
the solver has to refuse both before it spends a flight on them; the floor and
the burn-time cap are what let a formula that knows nothing about gravity size
a stage gravity will allow.

**Before this:** [P1](dv-and-the-rocket-equation.md), _Δv and the rocket
equation_, and [P2](../engines/specific-impulse-and-pressure.md), _Specific
impulse, and how it falls with pressure_.

## A worked case

A Swivel makes 168 kN of thrust at sea level. Kerbin pulls at 9.81 m/s². Divide
one by the other and you have the heaviest thing a Swivel can hold up: 168,000 /
9.81 = 17.1 t. At exactly that mass the engine balances gravity and the rocket
sits on the pad at full throttle, going nowhere. The solver asks for more: a
first stage must have 1.25 times its weight in thrust, so the heaviest rocket it
will put on one Swivel is 168,000 / (1.25 × 9.81) = 13.7 t.

Build that rocket. Give it a mass ratio of 3, as in P2's table, so it carries
9.13 t of propellant and weighs 4.57 t empty. The Swivel pumps 68.5 kg/s, so the
propellant lasts 9,130 / 68.5 = 133 s. Over that burn the stage gets lighter
and the same thrust lifts it harder: at burnout the ratio of thrust to weight
is 168,000 / (4,570 × 9.81) = 3.75.

Now make the rocket heavier without changing the engine.

| Liftoff mass | Thrust ÷ weight | Propellant at ratio 3 | Burn time | Gravity's take if it climbed straight up |
| ------------ | --------------- | --------------------- | --------- | ---------------------------------------- |
| 8.0 t        | 2.14            | 5.33 t                | 78 s      | up to 764 m/s                            |
| 13.7 t       | 1.25            | 9.13 t                | 133 s     | up to 1,308 m/s                          |
| 20.0 t       | 0.86            | 13.33 t               | 195 s     | up to 1,909 m/s                          |

The last row cannot leave the pad, and the solver never considers it: the check
is one division and it comes before any tank is chosen. The middle row is the
floor. The first row climbs briskly and burns for 78 s. The two right-hand
columns move together, and that is the point of the lesson: for one engine and
one mass ratio, a heavier stage is a weaker and a longer one at once, and a
longer burn is more seconds for gravity to pull on.

```js
const g = 9.81; // Kerbin
const thrust = 168.0,
  mdot = 68.5,
  floor = 1.25; // a Swivel at sea level, kN and kg/s
const R = 3; // full mass over empty mass
for (const m0 of [8.0, 13.7, 20.0]) {
  const twr = thrust / (m0 * g);
  const prop = m0 * (1 - 1 / R); // tonnes
  const burn = (prop * 1000) / mdot; // seconds
  console.log(
    m0,
    "t:",
    twr.toFixed(2),
    twr < floor ? "refused" : "allowed",
    burn.toFixed(0),
    "s",
    (g * burn).toFixed(0),
    "m/s ceiling",
  );
}
```

## The idea

**Thrust-to-weight ratio**, TWR, is an engine's thrust divided by the weight
of what it is lifting: thrust over mass times the local gravity. At 1 the
rocket hovers. Below 1 it cannot rise, whatever its Δv. Above 1 the surplus is
what accelerates it, and a rocket at 1.25 accelerates upward at a quarter of a
g, about 2.5 m/s² on Kerbin.

The floor is not 1. A stage at exactly 1 would burn all its propellant hovering
over the pad and arrive nowhere, having spent every metre a second of its Δv
holding itself up. Gravity charges by the second: for every second a rocket is
climbing, gravity takes up to g, 9.81 m/s, off what the engine adds. That is
the gravity loss of [P6](../../README.md#part-1--physics), and the way to pay
less of it is to spend fewer seconds climbing. So the floor is set where the
climb is brisk enough to be worth it: 1.25 for a launch from Kerbin.

**Burn time** is how long a stage's propellant lasts at full thrust, propellant
mass over mass flow. It looks like an independent fact about the stage, and it
is not. Write the propellant as m₀ (1 − 1/R), the mass flow as thrust over
Isp × g₀, and the thrust as TWR × m₀ × g, and the liftoff mass cancels:

    burn time = (1 − 1/R) × Isp / TWR        (on Kerbin, where g = g₀)

with the Isp being the one at the pressure the stage lights at. The Swivel's
sea-level 250 s, a mass ratio of 3 and a TWR of 1.25 give (2/3) × 250 / 1.25 =
133 s, the middle row above. Burn time and thrust-to-weight are one constraint
seen twice. Raise the TWR and the burn shortens in proportion; ask for more Δv,
which is a larger R, and it lengthens, but only toward a limit of Isp / TWR
that no mass ratio can pass.

That is why the solver has a cap on burn time as well as a floor on TWR. The
floor alone admits a stage that sits exactly at 1.25 with a very high mass
ratio, or a stage whose engine has a very high Isp, and either one burns for a
long time near the floor. An engine with a great Isp and little thrust is the
case that makes it bite. A Nerv has 800 s of Isp and 60 kN: at the upper-stage
floor of 0.8 a Nerv stage with a mass ratio of 3 burns for (2/3) × 800 / 0.8 =
667 s, more than eleven minutes, and the cap of 420 s refuses it. The most Δv
the cap lets a Nerv stage have at that floor is a mass ratio of 1.72, about
4,270 m/s; for more, add engines or split the burn.

The floor depends on where the stage is. A first stage leaving Kerbin needs
1.25. A stage above it is already moving fast and climbing, so it can be
weaker, 0.8: it will not hover, because it does not have to, and a Terrier
stage at 0.8 finishes an orbit that a first stage began. A stage that burns in
space, a transfer or a capture, needs almost nothing: 0.5 is the floor, and it
exists only so that a burn does not take so long that treating it as a single
impulse becomes a lie.

A stage that lands is the interesting case, because what it needs is not a
ratio. It has to stop a fall, and what stops a fall is the thrust left over
after cancelling the body's pull: the net deceleration, (TWR − 1) × g. Ask
every lander for the same ratio and you ask for very different stopping
power: 1.6 on Minmus is 0.29 m/s² in hand, 1.6 on Tylo is 4.7. So the landing
floor is written as a deceleration, 2 m/s² beyond hovering, and turned into a
ratio per body: 1 + 2/g, clamped between 1.3 and 2.5. That is about 2.2 on the
Mun, 1.7 on Duna, 2.2 on Eeloo, 1.3 on Tylo, and 2.5 on the small moons, where
the smallest engine in the catalogue already exceeds it. A landing through
more than an atmosphere of air keeps a lower floor of 1.35, because thick air
punishes a hard descent.

## In this codebase

The floors are chosen in `prepare`, in [`src/core/solver.ts`](../../../../src/core/solver.ts), from what kind of
group a stage belongs to:

```ts
const twrBottom =
  kind === "launch" ? 1.25 : kind === "land" ? (pSurf > 1 ? 1.35 : 1.6) : 0.5;
const twrUpper = kind === "launch" ? 0.8 : kind === "land" ? 1.1 : 0.5;
```

Those are the group-level floors, and they are what a caller that has a Δv
and nothing else gets, the design grid included. When `planMission` calls the
solver it also hands over the group's legs as fractions of its Δv, and
`stageParamsFor` then chooses each stage's floor and gravity from the legs its
own slice covers: 1.25 for a stage that lights on a surface and climbs, 0.8
above it, `landingFloor(g, p0)` for the stage that lands, at the landing body's
gravity, and 0.5 for a stage that only burns in space. Where a stage covers legs of more than
one kind, the one demanding the most acceleration, floor × g, sets it. The
one oddity, a lower landing floor where the surface pressure is above 1 atm,
is Eve: thick air punishes a fast descent because drag goes as speed squared,
so climbing or falling hard low down costs more than the gravity loss it
saves.

`solveStage` applies the floor twice. Before any tank is chosen, it skips
cluster counts that cannot possibly meet it, because the stage will weigh at
least its payload and thrust is proportional to the count:

```ts
const thrust1 = e.fv * (ispAt(e, pSurf) / e.iv); // one engine, where it lights
if (n < Math.ceil((twrMin * (payload + extra) * g) / thrust1)) continue;
```

Then, once the stage is packed and its liftoff mass is known:

```ts
const twr = thrust / (m0 * g);
if (twr < twrMin) continue;
const burn = (tk.prop + adapt.prop) / mdot;
if (burn > maxBurn) continue; // rules out clusters of tiny engines on heavy stages
```

`thrust` is the engine's output at the pressure the stage lights at, scaled
from its vacuum figure by the ratio of the two Isps, which is what
[P2](../engines/specific-impulse-and-pressure.md) showed thrust does. `mdot` is
the fixed mass flow from the vacuum figures. `g` is the local gravity of the
stage's group: Kerbin's for a launch, the target body's for a landing.

`maxBurn` is 420 s, and 200 s for the bottom stage of a launch from a body with
more than half an atmosphere of surface pressure, which is Kerbin, Eve and
Laythe:

```ts
maxBurn: pSurf > 0.5 && bottom ? 200 : 420,
```

Every solved stage also records `twrBurnout`, thrust over its dry mass and g,
and the stage card shows the pair as "1.25 → 3.75". The flight card warns
separately when the stage that has to finish the orbit lights below 1.

## What made it real

The six-Hammer Mainsail from [P9](../ascent/the-gravity-turn.md) is the case.
Its six **boosters**, extra motors strapped beside the stage for liftoff and
dropped when empty, lift 187.5 t at 1.40 for 24 s, to 1.9 km and 100 m/s, and
then leave the Mainsail alone at 0.88. The 0.85 floor for a **sustainer**, the
engine that keeps burning after the boosters drop, admitted that: 0.88 is
above 0.85. The stack then decelerated,
straight up, for forty seconds and paid 2,600 m/s of gravity loss for it, and
the simulator was the only thing that saw it. The floor's own comment had said
a sustainer may sit under one "if it is already fast and climbing", and had never
checked the second half. `sustainerHolds` now estimates the speed at
separation from the boost phase's net acceleration and requires 250 m/s of it
before it admits a sustainer under one; every design it refuses was passing before,
and what replaces one is heavier or more expensive, Minmus at 6.5 t going from
48,761 to 52,765 funds.

The floors themselves were not measured; they are the numbers people fly.
1.25 on the pad is what the game's community settles on as brisk enough
without wasting engine mass.

The landing floor was measured, on the mission sweep, when it stopped being
one number. Before #347 every stage of an uncut mission was held to the
launch floors at Kerbin's gravity, so a Mun lander was asked for 0.8 × 9.81 =
7.85 m/s² and a Tylo lander for the same. Judged by the legs each stage flies,
a flat 1.6 at the landing body's gravity made Mun landers far smaller and
Tylo landers far bigger: Mun 12 t fell from 321 t to 277, and the Tylo 3.5 t
mission, which needed 12.6 m/s² of thrust on its landers, had no design at
all. At the deceleration rule it is the 1,911 t rocket it was, landing at
Tylo-TWR 1.4. On the Mun the landing floor rarely binds at all: the stage that
lands also flies the transfer burn from Kerbin orbit, and that burn's 0.5
against 9.81 asks for 4.9 m/s², more than a Mun landing does.

## Where it breaks

- **Thrust at the wrong pressure.** The floor is only honest if the thrust in
  it is the thrust where the stage lights. A Terrier's vacuum figure, 60 kN,
  would let it lift 4.9 t at 1.25 from the pad; its sea-level 14.8 kN lifts
  1.2 t. The prefilter and the check both scale by the Isp ratio for this
  reason.
- **Passing at liftoff and failing later.** TWR rises through a burn as
  propellant goes, so a stage that passes at liftoff only gets stronger, but a
  stack whose boosters drop can get weaker at that moment. The sustainer case
  above is a rocket that passed every floor and stalled. The rule is in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) under _A sustainer under one_.
- **A floor is a proxy, not the loss.** 1.25 does not bound gravity loss; it
  bounds the ratio that tends to bound it. The simulator's flown Δv is the
  measurement, and the closed-form stage is re-sized against it when they
  disagree; that walk is
  [A7](../../README.md#part-2--algorithms-and-the-solver).
- **A ratio floor across bodies.** The same TWR buys stopping power in
  proportion to the body's gravity, so a floor that is right on the Mun is
  three times too demanding on Tylo and three times too lax on Minmus. Write a
  landing floor as a deceleration and derive the ratio.
- **The burn cap as a Δv cap.** Because burn time is (1 − 1/R) × Isp / TWR,
  capping it caps the mass ratio a stage can have at the floor. A high-Isp,
  low-thrust engine like the Nerv feels this first, and the answer the solver
  gives, more engines or another stage, is the right one, but the reason it
  gives it is the cap and not the floor.

## Try it

In the snippet, replace the Swivel's numbers with the Nerv's: `thrust = 60`,
`mdot = 7.65`, `floor = 0.8`, and try liftoff masses of 5, 7.6 and 10 t. At
7.6 t the Nerv sits on the floor and burns for 662 s. Then read the `maxBurn`
line in `solveStage`: the stage is refused for the burn, not the ratio.

## Check yourself

<details><summary>A stage has 240 kN of thrust at the pad and weighs 20 t. What is its TWR on Kerbin, and would the solver accept it as a first stage?</summary>

240,000 / (20,000 × 9.81) = 1.22. No: the launch floor is 1.25. Take 0.5 t off
it, or add thrust.

</details>

<details><summary>Two stages have the same engine and the same mass ratio. One is twice as heavy as the other. How do their TWR and burn time compare?</summary>

The heavier one has half the TWR and twice the burn time. Burn time is
(1 − 1/R) × Isp / TWR, and with R and Isp fixed it scales inversely with TWR,
which scales inversely with mass.

</details>

<details><summary>Why is the floor for a stage that burns in space 0.5 rather than 1?</summary>

Because there is nothing to hover against. In orbit the engine is not fighting
gravity for altitude; every metre a second it adds goes into the orbit. The
only cost of a low TWR there is a long burn, and 0.5 keeps the burn short
enough to treat as a single impulse.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapter on
  flight performance, for gravity loss as an integral over burn time.
- The KSP wiki, _Thrust-to-weight ratio_, for the game's conventions and the
  numbers players use.
- Robert Braeunig, _Rocket and Space Technology_, "Rocket Propulsion", for the
  burn-time derivation.

## Key takeaway

Thrust over weight says whether a stage can climb and burn time says how long
gravity gets to charge for it, and since burn time is (1 − 1/R) × Isp / TWR
they are one constraint seen twice: the floor and the cap together let a
formula that knows nothing about gravity size a stage gravity will allow.

_As of 2c31ff6._

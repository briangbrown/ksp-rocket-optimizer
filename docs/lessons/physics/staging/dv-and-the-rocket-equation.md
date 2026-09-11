# Δv and the rocket equation

**Syllabus:** [P1](../../README.md#part-1--physics)

**Why it matters:** The rocket equation matters because every stage the tool
proposes is sized by solving it backwards, from a Δv target to the propellant
that closes it, and without it there is no stage to size, no mass to hand to the
stage below, and nothing for the search to search.

**Before this:** nothing.

## A worked case

Take a one-tonne pod. Under it, stack FL-T400 tanks: each holds 2 t of
propellant and weighs 0.25 t empty, so 2.25 t full. Under the tanks, a Terrier,
a small vacuum engine of 0.5 t that throws its exhaust at 3,384 m/s.

How fast can this stage change the pod's speed? Add up the mass with the tanks
full, add it up again with them empty, and take the natural logarithm of the
ratio, times the exhaust speed.

| Tanks | Full mass | Empty mass | Full ÷ empty | Δv        |
| ----- | --------- | ---------- | ------------ | --------- |
| 1     | 3.75 t    | 1.75 t     | 2.14         | 2,579 m/s |
| 2     | 6.00 t    | 2.00 t     | 3.00         | 3,718 m/s |
| 3     | 8.25 t    | 2.25 t     | 3.67         | 4,397 m/s |
| 4     | 10.50 t   | 2.50 t     | 4.20         | 4,857 m/s |
| 10    | 24.00 t   | 4.00 t     | 6.00         | 6,064 m/s |

The first tank buys 2,579 m/s. The fourth buys 460. The tenth buys about 170.
Every tank adds the same 2 t of propellant, and each one is worth less than the
one before, because its propellant has to lift every other tank's empty shell
as well as its own. Keep going for ever and the stage never passes 7,436 m/s: that is the
exhaust speed times the logarithm of 9, and 9 is what a stock tank's full mass
is to its empty mass. A single Terrier stage on stock tanks cannot reach 7,437
m/s with any amount of propellant, and that ceiling is the reason rockets have
stages.

The tool asks the question the other way round. It knows the Δv it needs and
wants the propellant. Say the pod needs 2,000 m/s. The fixed mass, pod plus
engine, is 1.5 t. Then

    R  = e^(2000 / 3384) = 1.806          the full-to-empty ratio the Δv demands
    mp = 1.5 × (1.806 − 1) / (1 + 0.125 − 1.806 × 0.125) = 1.344 t of propellant

and the tanks to hold it weigh 0.125 × 1.344 = 0.168 t empty, so the whole
stage is 1.5 + 1.344 + 0.168 = 3.01 t. Check it: 3.012 ÷ 1.668 = 1.806. Ask
for 5,000 m/s instead and the propellant is 8.8 t, the stage 11.4 t. Ask for
7,500 and the formula's denominator goes negative: no amount of propellant will
do, because the ceiling is 7,436.

The table and both sums come from these lines. Run them with `node` and change
the numbers.

```js
const g0 = 9.81,
  isp = 345,
  ve = isp * g0; // Terrier, in vacuum
const k = 0.125; // a stock tank's empty mass per tonne of propellant it holds
const fixed = 1 + 0.5; // pod and engine, in tonnes
for (const tanks of [1, 2, 3, 4, 10]) {
  const full = fixed + tanks * 2.25,
    empty = fixed + tanks * 0.25;
  console.log(tanks, "tanks", (ve * Math.log(full / empty)).toFixed(0), "m/s");
}
const dv = 2000,
  R = Math.exp(dv / ve);
const mp = ((R - 1) * fixed) / (1 + k - R * k);
console.log(dv, "m/s needs", mp.toFixed(3), "t of propellant");
```

## The idea

A rocket moves by throwing mass backwards. Every kilogram of **propellant** it
throws out at speed v_e pushes the rest of the rocket forward by the same
momentum, and because the rocket is lighter after each throw, each kilogram
moves it a little more than the last. Add up every throw from full to empty and
the total change in the rocket's speed is

    Δv = v_e · ln(m_full / m_empty)

This is the **rocket equation**, Tsiolkovsky's. **Δv**, delta-v, is the change
of speed a burn can produce, and it is the currency of everything that follows:
a mission is a sum of Δv figures for its legs, and a rocket is a set of stages
that supply them. The ratio m_full / m_empty is the **mass ratio**. m_empty is
the **dry mass**, everything that is still aboard when the tanks are empty:
payload, engine, and the tanks themselves. v_e is the speed of the exhaust; the
game states it as a specific impulse in seconds, and [P2](../../README.md#part-1--physics)
is about how that number is defined and why it changes with altitude. Here it is
enough that v_e = Isp × g₀, with g₀ the standard 9.81 m/s².

The logarithm is the whole character of the equation. It grows without bound
but ever more slowly, so Δv is cheap to start with and dear to finish. Doubling
the mass ratio always adds the same v_e × ln 2, about 2,350 m/s for the Terrier,
whether the ratio goes from 2 to 4 or from 4 to 8, and the second doubling costs
twice the propellant of the first.

Tanks put a ceiling on it. A tank that holds m tonnes of propellant weighs k·m
empty, and for the stock tanks k is 0.125, one eighth. Then however much
propellant a stage carries, its dry mass is at least the tanks' k·m, so the mass
ratio can never exceed (1 + k) / k = 9, and the Δv can never exceed v_e · ln 9.
Adding a **stage**, a set of tanks and engines that is dropped once empty,
escapes the ceiling: the next stage starts with a full-to-empty ratio of its
own, not carrying the last one's shells. [P4](../../README.md#part-1--physics)
takes that up.

Solving for propellant instead of Δv is algebra. Write D for the fixed mass
that is neither propellant nor tank, and R for e^(Δv / v_e), the mass ratio the
Δv demands. Full is D + m + k·m and empty is D + k·m, so

    D + m(1 + k) = R · (D + k·m)      →      m = D · (R − 1) / (1 + k − R·k)

The denominator is positive exactly when R is below the ceiling, 1 + 1/k. And
the propellant is proportional to D: a stage for a 5 t pod is the same shape as
one for a 1 t pod, scaled. Every kilogram of payload costs the same extra
kilograms of stage, which is why the tool can size stages from the top down,
each one's mass becoming the next one's payload.

## In this codebase

`propellantFor` in `src/core/performance.ts` is the inverse form, line for line:

```ts
function propellantFor(dv: number, dry: number, isp: number, k: number) {
  if (!isFinite(dv)) return null;
  const R = Math.exp(dv / (isp * G0)); // the mass ratio the Δv demands
  const den = 1 + k - R * k; // positive only below the ceiling
  if (den <= 1e-6) return null; // no amount of propellant will do
  const mp = ((R - 1) * dry) / den;
  return mp > 0 && mp < 1e5 ? mp : null;
}
```

`dry` is D above: the payload, the engines and every structural part the stage
has been fitted with before the tanks are chosen. `k` comes from the tank table,
where each tank carries its own empty-mass-per-tonne, so a stage built from
stock tanks gets 0.125 and one from the lighter add-on tanks gets theirs.
`solveStage` in `src/core/solver.ts` calls it once per engine and cluster count,
then hands the propellant to the tank packer.

The forward form appears wherever the tool checks what a stage actually got,
because tanks come in fixed sizes and the packed set never holds exactly the
propellant asked for:

```ts
const got = ispE * G0 * Math.log(m0 / mf);
if (got < dv * 0.995) continue; // half a percent short is a miss
```

The same forward form, summed once per phase, is how a stage with boosters
strapped beside it is priced without flying it: boosters and core burn together
and the logarithm is taken over that phase, the empty boosters drop, and the
logarithm is taken again over the core alone. That is
[A14](../../README.md#part-2--algorithms-and-the-solver).

`G0` is 9.81 in `src/core/constants.ts`. It is a conversion constant here, from
specific impulse in seconds to exhaust speed in m/s, and not the gravity of any
body; `flyAscent` computes the pull of gravity from the body's own numbers.

## What made it real

Seven rockets sized by this equation were flown in the game, and five of them
reached orbit within 1% of the Δv predicted, which is the measurement that the
stages carried at least what the equation said they would. The two that missed
did so in flight, not in capacity, and [P9](../ascent/the-gravity-turn.md) has
that story.

The constant is worth a number too. The game's own g₀ is 9.80665, and `G0`
rounds it to 9.81, a difference of 0.034%. On a 3,400 m/s stage that is
1.2 m/s, inside the half-percent tolerance above and of no consequence. The same
0.034% in a gravitational parameter made Kerbin's year 1,600 s short and put an
hour of drift into every transfer date by the second window, which is why
`src/core/kepler.ts` keeps its own `G0_KSP = 9.80665`. The equation forgives the
rounding; the calendar does not.

## Where it breaks

- **Asking one stage for more than its ceiling.** Above v_e · ln(1 + 1/k) the
  denominator in `propellantFor` is zero or negative and the function returns
  `null`, which the solver reads as "this engine cannot do this stage". That is
  correct, and it is why a Δv the auto-stager splits across two to six stages
  is never asked of one.
- **Using one exhaust speed for a whole burn.** A first stage burns from sea
  level to near vacuum, and a Swivel's exhaust is 2,453 m/s at the bottom
  against 3,139 at the top. The equation is exact for a constant v_e and the
  solver feeds it a pressure-weighted one; [P2](../../README.md#part-1--physics)
  says how.
- **Trusting the requested propellant.** Tanks are discrete. The packed stage
  holds a little more or less than `propellantFor` asked, so the solver
  re-computes Δv from the packed masses and rejects anything under 99.5%.
  [A8](../../README.md#part-2--algorithms-and-the-solver) is the packing.
- **Two g₀'s in one codebase.** 9.81 for Isp and 9.80665 for μ, each with a
  comment saying why. Change either to match the other and either a snapshot
  moves by a metre a second or the calendar slips an hour.

## Try it

In the snippet above, set `dv` to `7500` and run it. `R` comes out above 9, the
denominator goes negative, and the propellant is a negative number: the
equation's way of saying no Terrier stage on stock tanks will ever do it. Then
put it back to `2000` and change `fixed` to `5.5`, a 5 t pod. The propellant is
4.927 t, 3.67 times the 1.344 for a 1 t pod, exactly the ratio 5.5 : 1.5.

## Check yourself

<details><summary>Every FL-T400 adds the same 2 t of propellant. Why does the fourth one add less Δv than the first?</summary>

Because Δv depends on the ratio of full to empty mass, and the logarithm of a
ratio grows more slowly the larger the ratio is. Each tank also adds 0.25 t of
empty shell that every later kilogram of propellant has to lift, so the ratio
itself grows more slowly with each tank too.

</details>

<details><summary>What is the most Δv a Terrier stage on stock tanks can ever have, whatever the number of tanks?</summary>

v_e · ln 9 = 3,384 × 2.197 = 7,436 m/s. Stock tanks weigh one eighth of their
propellant empty, so full over empty can approach 9 but never reach it.

</details>

<details><summary>The rocket equation has g₀ in it. What is it doing there, given that the rocket may be nowhere near Kerbin's surface?</summary>

Converting units. The game states an engine's performance as a specific
impulse in seconds, and multiplying by the standard g₀ turns that into an
exhaust speed in m/s. Gravity's actual pull on the rocket is not in the rocket
equation at all; it is in the simulator, as a loss.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapter on
  flight performance, for the derivation and the loss terms that sit around it.
- Robert Braeunig, _Rocket and Space Technology_, "Rocket Propulsion", for the
  same derivation with worked numbers.
- The Wikipedia article _Tsiolkovsky rocket equation_, for the momentum
  argument in three lines and the history.

## Key takeaway

Δv = v_e · ln(m_full / m_empty), and the logarithm is why the first tank is
cheap, the tenth is dear, and no single stage on tanks that weigh an eighth of
their propellant can pass v_e · ln 9.

_As of 761e839._

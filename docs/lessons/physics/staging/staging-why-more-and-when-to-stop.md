# Staging: why more stages, and when to stop

**Syllabus:** [P4](../../README.md#part-1--physics)

**Why it matters:** Staging matters because a single stage on stock tanks
cannot pass a ceiling of about 6,500 m/s and is heavy long before it, so every
mission the tool plans is a stack of stages and the solver has to decide how
many and how to divide the Δv between them; the mass-ratio argument is what
tells it a stage count to search up to and why it never needs more than six.

**Before this:** [P1](dv-and-the-rocket-equation.md), _Δv and the rocket
equation_, and [P3](thrust-to-weight-and-burn-time.md), _Thrust-to-weight, and
the burn-time limits_.

## A worked case

Build the same mission several ways and weigh the results. The payload is 1 t.
Every engine has 300 s of specific impulse, and weighs 0.009 t for each
kilonewton of thrust, which is about what a Swivel or a Terrier weighs for
theirs. Each stage is given exactly the thrust its floor demands, 1.25 times
its weight at the bottom and 0.8 above, plus a 0.05 t part to drop it. Tanks
weigh an eighth of their propellant. The Δv is split evenly between the stages.

| Δv needed | 1 stage | 2 stages  | 3 stages   | 4 stages   | 5 stages | 6 stages   |
| --------- | ------- | --------- | ---------- | ---------- | -------- | ---------- |
| 3,400 m/s | 8.8 t   | **6.2 t** | 6.4 t      | 6.8 t      | 7.3 t    | 7.9 t      |
| 5,000 m/s | —       | 15.2 t    | **13.7 t** | 14.0 t     | 14.7 t   | 15.7 t     |
| 7,000 m/s | —       | 67.2 t    | 39.8 t     | **36.6 t** | 36.8 t   | 38.3 t     |
| 9,000 m/s | —       | 2,577 t   | 140.9 t    | 105.4 t    | 97.8 t   | **97.4 t** |

Read across a row. Splitting 3,400 m/s into two stages takes 2.6 t off an
8.8 t rocket. Splitting it into three puts 0.2 t back on, and every stage after
that adds more. Read down the first column. The dashes are stages that cannot
be built, and there are two reasons, one per ceiling. At 7,000 and 9,000 m/s
it is the tank ceiling from [P1](dv-and-the-rocket-equation.md): 300 s of Isp
on tanks that weigh an eighth of their propellant cannot pass 300 × 9.81 × ln 9
= 6,466 m/s however much propellant it carries. At 5,000 m/s the tanks would
allow it and the engine does not. An engine sized to 1.25 times the stage's
weight at 0.009 t per kilonewton weighs 11% of the stage it lifts, and that
11% behaves like a second tank coefficient: every tonne of stage brings 110 kg
of engine that the propellant must also lift, and past 4,604 m/s the stage
grows faster than its engine can carry. Near either ceiling the stage is not
refused but absurd: two stages for 9,000 m/s is 4,500 each, and the rocket
weighs two and a half thousand tonnes.

And read the diagonal of bold entries. The lightest count moves right as the
Δv grows: two stages for 3,400, three for 5,000, four for 7,000, six for 9,000.
Divide each Δv by its best count and the stages come out between 1,500 and
1,750 m/s each. That is the number to remember: a stage wants to supply
somewhere around one and a half to two kilometres a second.

```js
const g = 9.81,
  k = 0.125,
  isp = 300,
  epk = 0.009,
  dec = 0.05;
const stage = (payload, dv, twr) => {
  const R = Math.exp(dv / (isp * g)),
    den = 1 + k - R * k;
  if (den <= 0) return null; // the tank ceiling
  const A = 1 + ((R - 1) * (1 + k)) / den; // full mass per tonne of fixed mass
  const c = 1 - A * epk * twr * g; // the engine is sized to the stage it lifts
  return c <= 0 ? null : ((payload + dec) * A) / c; // c ≤ 0: the engine ceiling
};
const rocket = (dv, n) => {
  let m = 1.0; // the payload, in tonnes; stages are solved from the top down
  for (let i = n - 1; i >= 0; i--)
    m = m && stage(m, dv / n, i === 0 ? 1.25 : 0.8);
  return m;
};
for (const dv of [3400, 5000, 7000, 9000])
  console.log(
    dv,
    [1, 2, 3, 4, 5, 6].map((n) => rocket(dv, n)?.toFixed(1) ?? "—").join("  "),
  );
```

## The idea

A rocket carries its own dead weight: the tanks that held propellant already
burned and the engines that were sized to lift a mass it no longer has. Every
kilogram of that is a kilogram the rocket equation counts in m_empty, and the
smaller m_empty the more Δv the same propellant gives. A **stage** is the unit
that lets a rocket shed it: burn a set of tanks and engines empty, drop them,
and the next set starts with a full-to-empty ratio of its own, uncontaminated
by the last set's shells.

That is why more stages help, and it is also why they compound. Everything
above a stage is that stage's payload. The stage below it has to lift it,
propellant and shells and all, so a kilogram saved at the top of the stack
saves several at the bottom. In the two-stage 3,400 m/s rocket above, a tenth
of a tonne more payload makes the whole rocket 0.58 t heavier: each kilogram on
top costs nearly six on the pad. That multiplier is the rocket's total mass
over its payload, and it grows without bound as the Δv asked of a single stage
approaches the ceiling. Two stages for 9,000 m/s are each asked for 4,500, and
each one multiplies the other's mass by about fifty.

That is also why more stages stop helping. A stage is not free. It brings an
engine sized to its own floor, a decoupler, and structure, and every one of
those is dead mass to every stage beneath it. Run the same table with massless
engines and the curve flattens but does not vanish: at 3,400 m/s two and three
stages tie at 4.2 t, and at six stages the decouplers alone have added a
fifth of a tonne. With real engines the overhead is a tonne or more a stage,
and the minimum is sharp.

Two forces, then. Splitting Δv shrinks the mass ratio each stage needs, which
is worth most when the ratio is large, which is when the Δv per stage is large.
Adding a stage adds fixed mass, which costs the same whether the stage does
much or little. The balance lands where each stage supplies about 1.5 to 2 km/s,
a little more with better engines and a little less with worse, and it does not
move much with the mission: it is a property of how fast the logarithm bends,
not of where the rocket is going. A mission's stage count is therefore roughly
its Δv over two kilometres a second, and past six stages nothing is left to
gain, because no mission the tool plans needs more than about 12 km/s.

The split need not be even. A **Δv share** is the fraction of the total one
stage supplies, and the shares are a free choice. The even split is rarely the
lightest: in the two-stage case above, giving the bottom stage 40% and the top
60% saves 60 kg over 50/50, and 70/30 costs 560 kg. Which way to tilt depends
on the engines available at each end and on whether the bottom stage is
fighting air, so a solver tries several.

## In this codebase

`planMission` in `src/core/plan.ts` decides how many stages to allow for each
stretch of the mission from its Δv:

```ts
const autoK = Math.min(MAX_K, Math.max(2, Math.ceil(dv / 2200) + 1));
```

The comment above it is the measurement: across budgets from 3,700 to
11,600 m/s the cheapest design landed on 1,100 to 2,600 m/s per stage, median
1,870, so the cap follows the budget. The 2,200 is the per-stage figure, the
+1 is one spare because the best split is rarely even, and `MAX_K` is 6. The
search then walks every count from one up to that cap: `minK` is 1 unless the
user has forced a count, so a single stage is always tried and simply loses
where the table above says it should.

`splitShares` in `src/core/solver.ts` is the set of Δv shares tried at each
count. Two stages try 30/70 through 70/30 in steps of ten. Three try a grid of
20 to 50% for each of the first two with the third taking the rest. Four and
more try the even split and four tilts of it toward the bottom and toward the
top. The comment says why it is coarse: a finer grid moves the answer by well
under a tonne and costs the time the interface has between keystrokes.

The stages are solved from the top down, because each one's mass is the next
one's payload:

```ts
let carried = payload;
for (let i = k - 1; i >= 0; i--) {
  const sdv = dv * shares[i];
  const twrMin = i === 0 ? twrBottom : twrUpper;
  // ... the stage is solved for sdv with `carried` as its payload ...
  carried = s.total; // this stage, full, is what the one below lifts
}
```

For each count `k` the search keeps its best chain in `byK`, and the lightest
across counts is `best`. What the user gets is not necessarily `best`: for a
launch, `planMission` flies the candidates through the simulator cheapest first
and delivers the first that reaches orbit, which is
[A7](../../README.md#part-2--algorithms-and-the-solver). A reader can also
force a count for any stretch from the stage stack in the results, and the
search then walks only that count.

## What made it real

The 2,200 m/s figure is measured, and the comment says how: the cheapest design
across budgets from 3,700 to 11,600 m/s landed on 1,100 to 2,600 m/s per
stage, median 1,870. The toy above, built from nothing but the rocket equation
and a thrust floor, puts its minima at 1,500 to 1,750 m/s per stage, inside
the measured band without having been fitted to it.

The cap used to be a fixed four, set when the tool only planned Mun trips. The
comment records what that cost when the missions grew: an Eeloo mission
300,000 funds, because four stages for a budget that wanted six each carried a
mass ratio near the ceiling. Past six, the comment says, nothing improved, and
that is the cap.

## Where it breaks

- **The lightest chain is not the delivered rocket.** `best` is the closed
  form's favourite; the delivered design is the first candidate the simulator
  flies to budget. A change that leaves `best` untouched can still change what
  the user gets, and the design snapshot only sees `best`. The rule is in
  `.claude/rules/solver.md` under _`best` is not what the user gets_.
- **A share pattern of the wrong length.** `splitShares` must return exactly
  `k` entries for a count of `k`. A short one leaves a stage's share undefined,
  its Δv requirement becomes NaN, and because every comparison with NaN is
  false the stage passes the "did it deliver enough" check with nothing in it.
  The function filters for length for that reason.
- **The even split as a default.** Even is the one pattern every count tries,
  and it is rarely the lightest. A solver that only split evenly would be
  60 kg heavy on the two-stage case above and much more where the bottom
  stage's engines are poor in air.
- **Forcing a count the physics refuses.** A forced single stage for a 7,000
  m/s stretch asks the rocket equation for a mass ratio past the ceiling, and
  the brief reports that nothing solves. The count is the reader's to force,
  and the refusal is correct.

## Try it

Run the snippet, then set `epk` to `0` and run it again. With massless engines
the rows flatten: at 3,400 m/s two and three stages both come to 4.2 t, and at
7,000 six stages beat five. The overhead per stage is what puts the minimum
where it is; take it away and more stages are always a little better. And the
5,000 m/s single stage appears, at 13.0 t: that dash was the engine's, not the
tanks'. The 7,000 and 9,000 dashes stay, because those are the tanks'.

## Check yourself

<details><summary>Why is there no single-stage entry for 7,000 m/s, when a stage's Δv is only limited by how much propellant it carries?</summary>

Because it is not only limited by that. Tanks weigh an eighth of their
propellant, so the mass ratio can never pass 9, and at 300 s of Isp that is
300 × 9.81 × ln 9 = 6,466 m/s. Above it the propellant the rocket equation
asks for is infinite, and the solver returns nothing. The 5,000 m/s single
stage is missing for a different reason: with the engine sized to the stage's
own weight, engine mass is a second coefficient on top of the tanks', and the
single stage closes only below 4,604 m/s at the pad floor. A lighter engine
per kilonewton, a Mainsail at 0.0043 t/kN against the 0.009 assumed, lifts
that ceiling toward the tanks'.

</details>

<details><summary>In the two-stage 3,400 m/s rocket, about how much heavier does the whole rocket get for each extra kilogram of payload, and why is it more than one?</summary>

About 5.8 kg. Every kilogram of payload needs propellant and tanks in the top
stage to lift it, and then the bottom stage needs propellant and tanks to lift
that. The multiplier is the rocket's total mass over its payload, 6.2 t for 1 t
less the small part that does not scale.

</details>

<details><summary>Why does the solver's stage-count cap follow the Δv budget instead of being a fixed number?</summary>

Because the lightest count is roughly the budget over 2 km/s: the balance
between shedding dead mass and paying for another engine lands at about that
much Δv per stage whatever the mission. A fixed cap of four was right for the
Mun and cost an Eeloo mission 300,000 funds.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the section on
  multistage vehicles, for the payload-ratio algebra and the optimal split.
- The Wikipedia article _Multistage rocket_, for the history and the
  serial-versus-parallel distinction this lesson leaves for
  [A14](../../README.md#part-2--algorithms-and-the-solver).
- Robert Braeunig, _Rocket and Space Technology_, "Rocket Propulsion", the
  staging worked examples.

## Key takeaway

Each stage sheds the shells and engines the rocket no longer needs, and each
stage adds an engine and a decoupler every stage below it must lift; the
balance lands near 2 km/s a stage, which is why the solver's cap is the budget
over 2,200 plus one, never more than six.

_As of 2be773e._

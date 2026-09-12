# The boosted ascent: two phases in closed form

**Syllabus:** [A14](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** The two-phase closed form matters because solid
boosters, drop tanks and asparagus columns change the rocket's mass and
thrust partway through a burn, so the rocket equation cannot be applied
once to the stage, and flying every layout through the simulator would cost
a millisecond each for the hundreds of thousands the search wants to try;
splitting the burn at the moment the side stacks leave, into a phase with
them and a phase without, prices any layout as two logarithms and a
combined Isp, which is what makes 868,000 boosted sizings affordable on one
launch and lets the solver find the six-Hammer Mainsail that flies and
refuse the one that stalls.

**Before this:** [P1](../../physics/staging/dv-and-the-rocket-equation.md),
_Δv and the rocket equation_, and
[A3](../numerics/bracketing-and-root-finding.md), _Bracketing and root
finding_.

## A worked case

A Mainsail core with six Hammers strapped round it, and above it the rest
of a Minmus rocket, three Poodles, a Reliant and a 17.8 t payload, 87.8 t
in all: the stack behind three of this project's issues. The core carries
64.0 t of propellant and 14.3 t of dry mass; each Hammer is 3.56 t, of which
2.81 t is solid fuel. Price the core stage's burn by hand, in vacuum
figures.

The Hammers burn at a fixed rate: 227.1 kN at an Isp of 195 s is 0.119 t/s
each, so they are spent after 23.7 s. The Mainsail burns 0.494 t/s alongside
them and spends 11.7 t of the core in that time. While everything is lit
the stack is one engine with the total thrust and the total flow, and its
Isp is the one over the other: (6 × 227.1 + 1,500.5) kN over (6 × 0.119 +
0.494) t/s × g₀ is 242 s, between the Hammers' 195 and the Mainsail's 310,
weighted by flow.

| Phase                         | Starts at | Ends at | Isp   | Δv        |
| ----------------------------- | --------- | ------- | ----- | --------- |
| A: boosters and core together | 187.5 t   | 158.9 t | 242 s | 392 m/s   |
| boosters drop                 | 158.9 t   | 154.4 t |       |           |
| B: core alone                 | 154.4 t   | 102.1 t | 310 s | 1,258 m/s |
| Together                      |           |         |       | 1,650 m/s |

Two logarithms, no flight. The same core with no boosters is one logarithm,
166.1 t down to 102.1 at 310 s, 1,479 m/s; the six Hammers add 171 m/s for
21.4 t and 2,400 funds. Whether that is a good trade depends on the mission,
and the search answers it by pricing every count from two to eight of every
solid the roster allows on every core, and choosing.

The one thing the two logarithms cannot say is whether the core can hold
the stack up once the boosters are gone. Here the Mainsail alone against
154 t is a thrust-to-weight of 0.91 at sea-level thrust, and a stack that
goes straight up at 0.91 slows down. The boost phase lifted it at 1.40 for
24 seconds and left it doing about 120 m/s at under 2 km, which is not fast
enough to coast through the stall. The closed form has to be told when a
core under one is acceptable, which is the rule below; this stack is
refused.

```js
const g0 = 9.80665;
const hammer = { fv: 227.1, fa: 198, iv: 195, fuel: 2.813, dry: 0.75 }; // RT-10, one; fa is thrust at sea level
const mainsail = { fv: 1500.5, fa: 1379.5, iv: 310 };
const nb = 6,
  above = 87.8,
  coreDry = 14.3,
  coreProp = 64.0; // 87.8 t of upper stages and payload
const mdotB = hammer.fv / (hammer.iv * g0),
  mdotC = mainsail.fv / (mainsail.iv * g0);
const tB = hammer.fuel / mdotB; // the boosters' burn: 23.7 s
const ispEff = (nb * hammer.fv + mainsail.fv) / ((nb * mdotB + mdotC) * g0); // 242 s
const m0 = above + coreDry + coreProp + nb * (hammer.fuel + hammer.dry);
const mA = m0 - nb * hammer.fuel - mdotC * tB; // end of phase A
const mB0 = mA - nb * hammer.dry; // boosters away
const mB1 = above + coreDry; // core dry
const dvA = ispEff * g0 * Math.log(m0 / mA),
  dvB = mainsail.iv * g0 * Math.log(mB0 / mB1);
console.log(
  tB.toFixed(1),
  ispEff.toFixed(0),
  m0.toFixed(1),
  mA.toFixed(1),
  Math.round(dvA),
  Math.round(dvB),
  Math.round(dvA + dvB),
); // 23.7 242 187.5 158.9 392 1258 1650
const alone = mainsail.iv * g0 * Math.log((above + coreDry + coreProp) / mB1);
const vSep = ((nb * hammer.fa + mainsail.fa) / ((m0 + mA) / 2) - g0) * tB; // speed the boost phase gives, roughly
console.log(
  "core alone:",
  Math.round(alone),
  "m/s; separation TWR:",
  (mainsail.fa / (mB0 * g0)).toFixed(2),
  "at",
  Math.round(vSep),
  "m/s",
); // 1479, 0.91 at 119
```

## The idea

The rocket equation prices a burn during which the exhaust velocity is
fixed and the only mass leaving the rocket is propellant. A stage with side
stacks breaks both conditions once: while the boosters burn, two kinds of
engine exhaust at once, and when they are spent, their dry mass leaves in a
lump. Split the burn at that moment and each half satisfies the conditions
again. Phase A runs from ignition to booster burnout with every engine lit;
phase B runs from burnout to the core's dry mass with the core alone. Each
is one rocket-equation term, and the stage's Δv is their sum.

Phase A's exhaust velocity is not an average that needs a fudge. A KSP
engine's mass flow is constant, its vacuum thrust over its vacuum Isp times
g₀, and its thrust at any pressure is that flow times the Isp there. So the
combined engine has the total thrust and the total flow, and its Isp is
exactly the ratio, evaluated at the pressure the stage flies through. The
solver takes that pressure from the body being left, because Eve's 5 atm
puts a Terrier at zero and a Kickback at 51 s, and the ranking of engines
does not merely shift there, it inverts.

```
   mass
    │ m0  ●─────╲  phase A: every engine lit, Isp_eff = ΣF / (Σṃ·g0)
    │             ╲
    │ mA           ●  boosters spent
    │              │  their dry mass leaves in a lump
    │ mB0          ●─────────────╲  phase B: core alone, Isp_core
    │                             ╲
    │ mB1                          ●  core dry: payload + structure
    └───────────────────────────────────────→ time
            Δv = Isp_eff·g0·ln(m0/mA) + Isp_core·g0·ln(mB0/mB1)
```

Three arrangements share the shape. A **drop tank** is a tank beside the
core with no engine of its own, emptied first and dropped; it feeds the
core, so phase A has the core's Isp and phase B is the same engine on a
lighter rocket. **Crossfeed** is the piping that lets one tank feed
another's engines, a toggle on a radial decoupler in the game or a pair of
fuel ducts, and it is what a drop tank needs and what the third arrangement
is built on. **Asparagus staging** is columns crossfed into the core and
dropped in pairs as they empty: the outermost pair feeds every engine on
the rocket, so it runs dry while the core stays full, that pair leaves,
the next pair feeds everything, and so on until the core arrives at the top
of the stack still full. Its closed form is the same idea with more phases,
one per pair, each a logarithm over the mass a pair's propellant removes,
with a pair's dry mass leaving at the end of it.

The count of layouts is why the closed form has to be closed. For every
core engine and cluster size the search tries every booster part the roster
allows at two, three, four, six and eight, drop tanks at two, four and six,
asparagus columns up to sixteen, each fed two ways where both are possible,
and for each of those it must find the smallest core propellant load that
closes the Δv budget, which is the bracket-and-refine of
[A3](../numerics/bracketing-and-root-finding.md) with the two-phase Δv as
the function being solved. On the 0.8 t launch that is 867,919 boosted
sizings against 226,758 plain ones and 550 flights: the boosted search is
most of the closed-form work, and at a microsecond a sizing it fits in a
second where flights would take a quarter of an hour.

What the two logarithms omit is the one thing the simulator would have
shown at once: whether the core can keep climbing after separation. The
guard is a rule about the moment the boosters leave. A core under one
gravity of thrust-to-weight is admitted only if the boost phase has already
made the stack fast, at least 250 m/s by the net acceleration of the boost
over its burn, and never under 0.85; the six-Hammer Mainsail leaves its core
at 0.88 with the stack at 100 m/s and 1.9 km, and stalls straight up for
forty seconds, paying 2,600 m/s of gravity loss for it, so it is refused.
Every design the rule refuses was passing before, so what replaces one is
dearer or heavier, and the constant is tuned with the sweep, not by hand.

## In this codebase

`boostDv` in [`src/core/solver.ts`](../../../../src/core/solver.ts) is the
two-phase form, and its parallel branch is the worked case in four lines:

```ts
const mA = m0 - nb * b.fuelM - burnA; // boosters spent, and what the core burnt meanwhile
const mB0 = mA - nb * b.dry; // boosters away
const mB1 = fixed + k * mp; // the core dry: payload, structure, tank dry mass
return ispEff * G0 * Math.log(m0 / mA) + ispCore * G0 * Math.log(mB0 / mB1);
```

with the asparagus branch below it looping over pairs. `offsetDv` subtracts
the budget so the root finder has a zero to hunt, and `solveCore` finds the
smallest core propellant load that closes it. `boostedAscent` is the
enumeration: cores and tank pools built once, then `mounts`, the solids the
roster allows, the liquid columns as radial mounts and the tank mounts that
are drop tanks, then the count ladder per kind, then the combined Isp at the
body's pressure:

```ts
const ispEff =
  (nb * b.fv * (ispAt(b, pR) / b.iv) + nc * c.fv * (ispAt(c, pR) / c.iv)) /
  ((nb * mdotB + mdotC) * G0); // total thrust at pressure over total flow
```

`sustainerHolds` is the separation guard, with `SUSTAINER_MIN` at 0.85 and
`SUSTAINER_FAST` at 250 m/s; its `twrSep` rides on the design so the stage
card can show the thrust-to-weight between liftoff and burnout. The
structure each layout needs comes from `fitStructure`
([A10](../geometry/fitting-structure-as-a-graph-walk.md)), which is shared
with the plain stage solver for exactly the reason the rule records: fixing
one copy and not the other produced five bugs.

## What made it real

The stall is the measurement. Six Hammers on a Mainsail lift 187 t at a
thrust-to-weight of 1.40 for 24 seconds, to 1.9 km and 100 m/s, then leave
the Mainsail alone at 0.88; the stack decelerates, straight up, for the next
forty seconds and pays 2,600 m/s of gravity loss. The 0.85 floor's own
comment had always said "already fast and climbing" and never checked it.
[`test/flown-cost.test.ts`](../../../../test/flown-cost.test.ts) holds the
guard both ways: that stack is refused at a 24-second burn and admitted at a
100-second one, when the boost has made it fast. The rule under _A sustainer
under one is admitted only when the boost has made it fast_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records
what the refusals cost: Minmus at 6.5 t cheapest went from 48,761 to 52,765
funds, low orbit at 0.8 t lightest from 5.3 to 7.0 t.

The count is the other measurement, from the plan's own tally on the 0.8 t
launch: 867,919 boosted sizings, 226,758 plain, 550 flights. The comment on
`solveCore` records what the root finder inside each sizing used to cost,
363 million rocket-equation evaluations across a grid run, and the design
snapshot's boosted designs, the three Thoroughbreds under a Mammoth on the
Tylo 0.8 t mission at a separation thrust-to-weight of 1.17, pin what the
enumeration picks.

## Where it breaks

- **One logarithm for a two-phase burn.** Averaging the Isp or the mass
  over the whole burn is wrong in both directions; the burn has to be split
  where the boosters leave.
- **A sustainer that cannot hold.** The two phases price the Δv of a stack
  that stalls as if it climbed. The guard on separation thrust-to-weight
  and boost speed is what refuses it.
- **The wrong pressure.** Eve's surface inverts the engine ranking. The
  combined Isp is taken at the pressure of the body being left, not
  Kerbin's.
- **The parallel rule on asparagus.** "The core must outlast the boosters"
  is a parallel-staging assumption; under asparagus the core burns nothing
  of its own until the last pair is gone, and applying the rule rejected
  every layout where the ring carries most of the propellant, which is the
  layout asparagus exists for.
- **Asparagus as a replacement.** It is an extra way to plumb the same
  hardware. Evaluating a liquid column only as asparagus made the design
  worse whenever parallel was better, which enabling an option must never
  do.

## Try it

Run the snippet, then change `nb` from 6 to 4: phase A's Isp rises toward
the Mainsail's, the boosters add only 117 m/s, and the boost phase leaves
the stack slower still, about 70 m/s, so it is refused as well. Then put
`nb` back and set `coreProp` to 40: the separation thrust-to-weight rises
to 1.08, above one, so no exemption is needed, and the stage's Δv falls to
1,200 m/s because there is less core to burn. The search is walking exactly
this trade, count by count and core by core, 868,000 times on one launch.

## Check yourself

<details><summary>Why does a stage with solid boosters need two rocket-equation terms rather than one?</summary>

Because the rocket equation assumes a fixed exhaust velocity and only
propellant leaving. While the boosters burn, two kinds of engine exhaust at
once, so the exhaust velocity is a flow-weighted combination; when they are
spent, their dry mass leaves in a lump. Splitting the burn at burnout gives
two phases that each satisfy the assumptions, and the Δv is their sum.

</details>

<details><summary>How is the combined Isp of the boosters and the core computed, and why is it not a fudge?</summary>

As total thrust over total mass flow, divided by g₀. A KSP engine's flow is
constant and its thrust is flow times Isp, so the combined engine's Isp is
exactly that ratio, 242 s for six Hammers and a Mainsail against their 195
and 310, weighted by how much each is exhausting.

</details>

<details><summary>The two-phase form priced the six-Hammer Mainsail stage at 1,650 m/s. Why does the solver refuse it?</summary>

Because the form prices the burn as if the climb happened, and this stack's
core cannot hold it up after separation: about 0.9 gravities of thrust with
the stack at about 100 m/s and under 2 km, so it stalls straight up for
forty seconds and pays 2,600 m/s of gravity loss the form never saw. A core under one is admitted
only when the boost has already made the stack fast, 250 m/s, and never
under 0.85.

</details>

## Further reading

- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the chapter
  on flight performance, for multistage and parallel-burn Δv and the
  definition of effective specific impulse.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the section on
  restricted staging in the chapter on rocket vehicle dynamics.

## Key takeaway

Split a boosted burn where the side stacks leave: a phase with every engine
lit at the flow-weighted Isp, a lump of dry mass gone, and a phase with the
core alone, two logarithms that price any layout in a microsecond and let
the search size 868,000 of them on one launch; and because the logarithms
cannot see a core that stalls, a separate rule admits a sustainer under one
gravity only when the boost has already made the stack fast.

_As of 2ecc64f._

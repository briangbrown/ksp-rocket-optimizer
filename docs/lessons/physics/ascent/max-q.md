# Max-Q

**Syllabus:** [P11](../../README.md#part-1--physics)

**Why it matters:** The cap on dynamic pressure matters because the turn
search minimises Δv and nothing else, and the cheapest trajectory for a rocket
with thrust to spare is a violent early pitch-over through the thickest air at
the highest speed the rocket can reach there; that flight is cheap on paper and
in the game it flips or sheds parts, so the cap is what keeps the solver's
answer one a person can fly.

**Before this:** [P8](../atmosphere/drag-in-ksp.md), _Drag in KSP_, and
[P9](the-gravity-turn.md), _The gravity turn_.

## A worked case

Put a Mainsail under a light load: a 62.8 t stack with 2.24 times its weight
in thrust, a Terrier stage above. Ask the simulator for the cheapest turn with
no limit on the air pressure it may fly through, and then with the cap the
solver uses:

| Search           | Kick          | Total     | Gravity loss | Drag loss | Peak pressure    | Thrust |
| ---------------- | ------------- | --------- | ------------ | --------- | ---------------- | ------ |
| No cap           | 25° at 80 m/s | 3,235 m/s | 486 m/s      | 272 m/s   | 64.4 kPa, 8.8 km | 100%   |
| Capped at 40 kPa | 3° at 130 m/s | 3,775 m/s | 630 m/s      | 144 m/s   | 37.9 kPa, 6.8 km | 85%    |

Uncapped, the search finds the flight the comment in the code warned about:
tip the nose 25° while barely moving and go over hard, so the rocket is level
and fast while still low. The gravity loss is a bargain, 486 m/s, because the
rocket spends almost no time pointing up. The bill is the air: 64 kPa of
pressure on the nose at 8.8 km, a ram of over six tonnes per square metre. A
Kerbal rocket at that pressure tends to turn broadside or come apart at a
joint, and the simulator models neither. It reports a cheap ascent that would
not happen.

Capped, no turn at full thrust stays under 40 kPa, so the search does what a
pilot does with an over-thrusted stack: it throttles back. At 85% thrust with
a gentle kick the peak is 37.9 kPa and the ascent costs 3,775 m/s, 540 more
than the flight that would not have happened. The cap did not find a better
trajectory. It refused a fictional one.

On rockets with less thrust to spare the cap rarely touches anything. Four
solver designs from the test grid, 0.8 to 12 t of payload, peak between 16 and
24 kPa with or without the cap: the same kick, the same cost, to the metre.
Their thrust-to-weight ratios are near the 1.25 floor, and a rocket that
climbs at 1.25 is nowhere near fast enough low down to reach 40 kPa. The
Vector design for 40 t, at 39.6 kPa, sits right on it: uncapped it would fly
at 44.3 kPa for 34 m/s less.

Where the peak falls, and why there, shows in a toy. Take
[P9](the-gravity-turn.md)'s flat-world rocket at 1.8 times its weight and
give it air whose density falls by e every 5.6 km, as
[P7](../atmosphere/the-atmosphere-as-a-spline.md) measured Kerbin's does near
the ground:

```js
const g = 9.81,
  twr = 1.8,
  kick = (10 * Math.PI) / 180,
  vKick = 100;
let v = 0,
  tilt = 0,
  h = 0,
  t = 0,
  qMax = 0,
  hMax = 0,
  vMax = 0;
for (; tilt < Math.PI / 2 && v < 2300; t += 0.1) {
  if (!tilt && v >= vKick) tilt = kick;
  v += (twr * g - g * Math.cos(tilt)) * 0.1;
  if (tilt) tilt += ((g * Math.sin(tilt)) / v) * 0.1;
  h += v * Math.cos(tilt) * 0.1;
  const rho = 1.225 * Math.exp(-h / 5600); // kg/m³: thick low, thinning by e every 5.6 km
  const q = 0.5 * rho * v * v; // Pa
  if (q > qMax) {
    qMax = q;
    hMax = h;
    vMax = v;
  }
}
console.log(
  "max Q",
  (qMax / 1000).toFixed(1),
  "kPa at",
  (hMax / 1000).toFixed(1),
  "km,",
  vMax.toFixed(0),
  "m/s",
);
```

The pressure is a race between two exponentials. Speed grows, so v² grows,
while the density falls away by e every 5.6 km. Low down the speed wins; once
the rocket is climbing through thinning air faster than it is gaining speed,
the density wins, and the product peaks in between. For this rocket the peak
is 25.9 kPa at 7.9 km doing 416 m/s; for the real designs above it fell between
5.7 and 8.8 km. That band is where every launch pays its drag, and it is where
a rocket that is going too fast for its altitude gets into trouble.

## The idea

Dynamic pressure, q = ½ ρ v², is the pressure the air exerts on anything that
stops it, and [P8](../atmosphere/drag-in-ksp.md) made it the first factor in
the drag. It is also the load on the rocket's structure. Every fin, every joint
between stages, every part that sticks out sideways feels q times its area as
a force, and a rocket flying at an angle to its velocity feels q trying to
turn it broadside, because the centre of the air's push is usually ahead of
the centre of mass. **Max-Q** is the peak of q during an ascent: the moment of
greatest aerodynamic load, and the moment a rocket is most likely to bend,
break or flip.

Real launchers are designed to a max-Q, and the number is remarkably steady
across very different rockets: the Saturn V, the Space Shuttle and the Falcon 9
all peak in the region of 30 to 35 kPa, and the Shuttle throttled its main
engines down through the "bucket" around a minute into flight precisely to hold
q there. The 40 kPa cap here is a little above that, chosen as the pressure a
Kerbal rocket with ordinary joints flies through without turning over. It is a
judgment, not a measurement, and the comment in the code calls it "a level
people actually fly".

The cap exists because a Δv-minimising search has no reason to respect it.
Gravity loss is paid by the second spent near vertical; drag loss is paid by
the metre travelled through thick air at speed. Both fall if the rocket gets
level fast, and a rocket with thrust to spare can get level very fast indeed.
The optimiser's unconstrained answer is therefore always the most violent turn
the grid allows, and the violence goes straight into q. Left alone, the search
would recommend flights that are cheap because they would not survive.

Two things follow. First, the cap is a constraint on the search, not a term in
the cost: a flight over 40 kPa is not penalised, it is discarded, and the
cheapest flight under the cap is what is delivered. Second, when no full-thrust
flight fits under it, the remedy is not a gentler turn, because the gentlest
turn on the grid still passes 40 kPa on an over-thrusted stack, but less
thrust: throttling the engines back so the rocket is slower where the air is
thick. That costs Δv in gravity loss, since the burn is longer, and it is the
right answer, because it is the one a pilot reaches for.

## In this codebase

`flyAscent` tracks the peak as it flies:

```ts
const rho = atmo.rho(h),
  q = 0.5 * rho * sr * sr, // the air's push, in Pa
  mach = sr / atmo.a(h);
if (q > maxQ) {
  maxQ = q;
  maxQalt = h;
}
```

`optimiseTurn` takes the cap as `qCap = 40000` and keeps two answers as it
scans: the cheapest flight under the cap, and the gentlest flight of all:

```ts
if (!found.gentlest || r.maxQ < found.gentlest.maxQ) found.gentlest = c;
if (r.maxQ <= qCap && (!found.best || r.total < found.best.total))
  found.best = c;
```

When the scan ends with no `best`, nothing at full thrust stayed under the
cap, and the search takes the gentlest flight's turn and walks the thrust
limiter down from 95% in steps of 5% until a flight stays under:

```ts
if (!found.best && found.gentlest) {
  for (let lim = 0.95; lim >= 0.3; lim -= 0.05) {
    const r = flyAscent(veh, { ...gentlestTurn, limit: lim });
    if (r.ok && r.maxQ <= qCap) {
      found.best = { ...r, limit: lim };
      break;
    } // the highest thrust that behaves
  }
}
```

The comment there explains why it scans down rather than searching from zero:
throttle far enough back and the stack cannot leave the pad, so the workable
settings are an interval, not a half-line, and the first setting from the top
that both flies and stays under is the one wanted. The limiter itself, and why
it costs no Δv in itself, is [P12](../../README.md#part-1--physics).

The flight card shows the peak as _Max Q_ with its altitude. When a flight was
throttled it says so and by how much, with the instruction to drag the thrust
limiter in the editor. When nothing stayed under the cap even throttled, it
says so as a fault in the design, unless the body's surface pressure is above
1.5 atm, in which case it is the body's fault and the card says that instead:
on Eve nothing keeps a rocket under 40 kPa, and the gentlest flight that
reaches orbit is the one flown.

## What made it real

The cap has no measurement behind it in this repository, and that should be
said plainly. It is a judgment about where Kerbal rockets come apart, written
into the code as a constant with a comment, and it agrees with where real
launchers are designed to peak. What is measured is what the cap does.

On the four solver designs from the test grid it does nothing: the same turn
and the same cost with the cap and without, because none of them reaches 25
kPa. On the over-thrusted Mainsail it changes everything: the uncapped search
returns a 25° kick at 80 m/s through 64 kPa for 3,235 m/s, and the capped one
returns 85% thrust and 3,775. That 540 m/s is the price of an ascent that
happens over one that does not, and it is paid only by rockets with far more
thrust than the floor demands, which the solver rarely builds because thrust
costs engine mass. The cap binds on the reader's own over-built stacks more
than on the solver's.

The one place it binds on the solver's designs is Eve. Five atmospheres at the
surface put every ascent over 40 kPa, and the flight card's `warn` rather than
`bad` there is the record of the decision that this is a fact about the body.

## Where it breaks

- **A lofted answer.** The README lists it as a known gap: minimising Δv under
  a cap still prefers trajectories that are near-optimal on paper and awkward
  to fly, because the search has no term for how hard a flight is to hold.
  Forty kilopascals bounds the air load; it does not make the turn gentle.
- **The gentlest flight is not the cheapest.** When nothing stays under the
  cap, the fallback starts from the gentlest turn, not the cheapest, on
  purpose: the cheapest is the most aggressive, which is the opposite of what
  an over-thrusted stack needs. A fallback from the cheapest would throttle
  harder than necessary and cost more.
- **Eve.** Above 1.5 atm at the surface nothing keeps a rocket under 40 kPa and
  the model is well outside where it was checked against Kerbin ascents; the
  card says to treat the drag figure as indicative. The cap becomes a report
  rather than a constraint.
- **The cap is not the structure.** A real Kerbal rocket's limit depends on its
  joints, its fins and where its mass sits, none of which the simulator knows.
  Forty kilopascals is a stand-in for all of it, and a rocket with a wide
  payload on a narrow stack can flip well under the cap.

## Try it

Run the snippet. Then give the toy the over-thrusted stack's violent turn:
`twr = 2.24`, a `kick` of 25° and `vKick = 80`. The peak goes to 197 kPa at
6.4 km. There is no drag, no real air and no search in the toy, and the shape
of the answer is already there: a fast rocket tipped hard while low is what a
Δv-minimiser wants and what the cap forbids. Then set `twr` to `1.25`, the
floor, with a 4° kick: 23 kPa at 9.7 km, in the band the solver's own designs
fly.

## Check yourself

<details><summary>Why does dynamic pressure peak a few kilometres up rather than at the surface, where the air is thickest, or high up, where the rocket is fastest?</summary>

Because q = ½ ρ v² is a product of a falling density and a rising speed. At
the surface the rocket is barely moving; high up the air is gone. In between
the speed has grown while the density is still substantial, and the product
peaks where the density starts falling faster than the speed squared is
growing, 6 to 9 km on Kerbin.

</details>

<details><summary>The search found no full-thrust turn under 40 kPa for an over-thrusted stack. Why does it throttle back rather than search for a gentler kick?</summary>

Because it already tried the gentlest kick on the grid and that passed 40 kPa
too. On a stack with far more thrust than weight, every turn is fast where the
air is thick; only less thrust makes the rocket slower there. Throttling costs
gravity loss for the longer burn, and it is what a pilot does.

</details>

<details><summary>Is 40 kPa a measurement or a decision, and how would you tell from the code?</summary>

A decision. It is a default parameter, `qCap = 40000`, with a comment calling
it a level people actually fly, and nothing in the repository measures where a
Kerbal rocket fails. What is measured is its effect: nothing on the solver's
ordinary designs, and 540 m/s on an over-thrusted Mainsail against a flight
that would not have survived.

</details>

## Further reading

- The Wikipedia article _Max q_, for the definition and the max-Q figures of
  real launchers.
- Any account of the Space Shuttle ascent profile, for the throttle bucket and
  why it existed.
- The KSP wiki, _Aerodynamics_, on what high dynamic pressure does to a
  Kerbal rocket: flipping, and joint failure under aerodynamic load.

## Key takeaway

Dynamic pressure peaks a few kilometres up where rising speed and thinning air
cross, a Δv-minimising search will always steer for the most violent turn it
is allowed, and the 40 kPa cap is the judgment that refuses flights a rocket
would not survive and throttles the ones that cannot otherwise fit under it.

_As of 57b6640._

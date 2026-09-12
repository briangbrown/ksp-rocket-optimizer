# Encounters on the way

**Syllabus:** [P23](../../README.md#part-1--physics)

**Why it matters:** Encounters matter because a transfer window is priced
as a chain of two-body arcs, and in this game that chain is exactly what
flies until the ship crosses some third body's sphere of influence, at which
point the game hands the ship to that body and the flight priced is not the
flight flown; about one delivered window in five leaves Kerbin straight
through the Mun's sphere or arrives at Jool through Laythe's, so a search
that did not check would report a date and a Δv for a trip the player cannot
make, when shifting the departure two hours would have cleared it for a few
centimetres per second.

**Before this:** [P16](patched-conics-and-the-sphere-of-influence.md),
_Patched conics and the sphere of influence_, and
[P22](transfer-windows-and-the-porkchop-plot.md), _Transfer windows and the
porkchop plot_.

## A worked case

The Duna window of [P22](transfer-windows-and-the-porkchop-plot.md) leaves
an 80 km orbit on a hyperbola of eccentricity 1.124. Walk it outward. The
Mun's orbit is 12,000 km from Kerbin's centre, and the ship reaches it 2.4
hours after the burn, moving at 1,110 m/s and by then almost straight out.
The Mun's sphere of influence is 2,430 km across in radius, so the ship
spends 1.2 hours inside the band of distances the sphere can occupy, from
9,570 to 14,430 km. If the Mun happens to be there, the game switches the
ship to the Mun's frame the moment it crosses the edge, bends the path, and
the Duna transfer the window described does not happen.

How likely is that? The sphere subtends 23° of the Mun's orbit as seen from
Kerbin, and the Mun moves at 9.3° an hour, 11.5° during the ship's 1.2 hours
in the band. So a departure whose crossing point is within roughly 35° of
where the Mun will be is fouled, about a tenth of them by this rough
geometry. Measured over the windows the search actually delivers, it is
about a fifth that leave through the Mun's sphere or arrive through a moon's
at the far end: in a sample of 72 searches from Kerbin, 13 needed a shift,
11 for the Mun and 2 for Laythe on arrival at Jool.

The fix is nearly free. Wait two hours and the Mun has moved 18.7°, out of
the way, while the transfer arc, a 270-day flight fixed by where Kerbin and
Duna are, has barely changed: the Duna window from Year 5 that meets the Mun
is shifted by exactly two hours for 0.01 m/s. The clearest single case is
the other way round, leaving Duna for Eve on the first window of Year 1: the
cheapest departure passes inside Ike's sphere half an hour after the burn,
and the search moves it two hours later for 0.05 m/s. The card reports the
shifted date and says why.

Because the search is in TypeScript, the snippet is a test file. Save it as
`test/encounter-try.test.ts` and run
`npx vitest run test/encounter-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { findWindow } from "../src/core/transfer.js";
import { kerbalDate } from "../src/core/kepler.js";
import { lowR } from "../src/core/orbits.js";
it("a window that had a moon in the way", () => {
  const w = findWindow("Duna", "Eve", lowR("Duna"), 800_000, 0, true)!;
  const d = kerbalDate(w.depart);
  console.log(`Year ${d.year} Day ${d.day}, ${Math.round(w.total)} m/s`);
  console.log(w.dodged); // { by: 7200, cost: 0.05, cleared: [ 'Ike' ] }: two hours, five centimetres a second
  console.log(w.encounters); // []: nothing left in the way
});
```

## The idea

An **encounter** is the ship passing inside the sphere of influence of a
body other than the two the transfer is between. In the real solar system
every body pulls all the time and a near miss bends the path a little; in
this game one body pulls at a time, so a near miss outside the sphere bends
nothing at all, and a pass inside it changes everything, because the game
changes which body it is integrating against. There is no partial credit: a
two-body arc is exactly right until the edge and wrong after it. The check
therefore asks one binary question of every other body: does the flight
cross its sphere?

The **closest approach** is the nearest the path comes to a body, and the
check measures it in that body's own sphere radii: a depth under 1 is inside,
and an encounter. Depth is the sharp half of the answer, because it is a
minimum over a smooth curve; the moment of closest approach is the blunt
half, because inside a big sphere the minimum is shallow and its time is
poorly defined.

Three legs of a flight can meet something, and they are checked against
different sets of bodies:

- **The escape**, the hyperbola out of the departure body, against that
  body's moons. A Kerbin ejection crosses the Mun's orbit within hours and
  the Mun's sphere covers 6.4% of that orbit; Ike's covers 10.4% of its
  orbit round Duna. This is by far the commonest encounter.
- **The cruise**, the arc about the Sun, against the other planets. Rare:
  of 6,048 arcs sampled, two met a planet, both through Jool's sphere, the
  largest in the system.
- **The capture**, the hyperbola into the arrival body, against its moons,
  where Tylo has the largest moon sphere in the game.

```
                 the Mun, now       ·  ·  ·  the Mun's orbit, 12,000 km
              ·  ·  ○  ·  ·                  (the sphere is 23° of it)
          ·         ↑ 9.3°/h                ·
        ·           ·                         ·
      ·      ·  ·  ·  ·  ·  ·  ·  ·  ·  ·      ·
     ·    ·                             ·        ·
    ·   ·     Kerbin ●          burn ◆──╶╶╶╶╶╶╶╶╶╶╶→  the ejection: 2.4 h to the
    ·   ·                        80 km              Mun's orbit, straight out
     ·    ·                             ·        ·
      ·      ·  ·  ·  ·  ·  ·  ·  ·  ·  ·      ·
        ·                                     ·
          ·                                 ·        leave two hours later and the
              ·  ·  ·  ·  ·  ·  ·  ·  ·              Mun has moved 19°: the same
                                                     arc to Duna, 0.01 m/s dearer
```

Because every leg is a conic, none of this needs an integrator. A conic is
walked by its [true anomaly](keplers-equation.md), and anomaly to time is
the cheap, closed-form direction of Kepler's equation, so each sample point
costs a few trigonometric calls. The expensive part is asking where the
other body was at that moment, and the check avoids asking where it cannot
matter: a coarse walk of the ship alone finds which stretches of the leg lie
within reach of a body's orbit at all, and only those stretches are walked
again finely, at a step sized so that three samples fall across the sphere
being looked for. A Dres-sized sphere is crossed in under two hours on a
thousand-day arc, which no uniform step can afford to catch.

And because the fouling body is a moon that comes round every few days,
while the arc is fixed by two planets that barely move in a day, the remedy
is to shift the departure, not to warn. The search steps the departure
forward two hours at a time, up to nine days, re-prices the cell, and takes
the first departure that is clean and costs no more than 2% extra. On
average the shift is a couple of hours and the cost under a metre per
second. Only where nothing inside nine days is clean does the window stand
as found, with the encounter reported for the pilot to plan around.

## In this codebase

[`src/core/encounter.ts`](../../../../src/core/encounter.ts) is the check.
`hyperLeg` builds the escape or capture hyperbola from the parking orbit and
the relative velocity at the sphere's edge, using the signed energy of
[P18](ejection-energy-and-the-hyperbolic-leg.md) so a moon's bound departure
is walked too; `arcLeg` builds the cruise from the Lambert velocity; both
return a leg as a function from anomaly to a node, position and time.
`scanLeg` is the two-pass walk:

```ts
const near = o.a * (1 - o.e) - soi, // the band of radii the body's sphere can occupy
  far = o.a * (1 + o.e) + soi;
// ...
if (Math.max(p0.rad, p1.rad) < near || Math.min(p0.rad, p1.rad) > far) continue; // the coarse pass: skip it
const moved = norm(sub(p1.r, p0.r));
const steps = Math.max(
  2,
  Math.min(FINE_CAP, Math.ceil((moved * ACROSS) / (2 * soi))),
); // three samples across the sphere
```

`encountersOf` runs the three legs against the right sets of bodies, the
departure body's children for the escape, the primary's children less the
two ends for the cruise, the arrival body's children for the capture, and
returns what was met in time order, each with its depth in sphere radii.

The dodge is in `findWindow`, in
[`src/core/transfer.ts`](../../../../src/core/transfer.ts), right after the
refinement:

```ts
for (let dt = DODGE_STEP; dt <= DODGE_REACH; dt += DODGE_STEP) {
  // two hours at a time, up to nine days
  const cand = at(from0 + dt, tof);
  if (!cand || cand.total > cost0 * 1.02) continue; // a dodge that costs fuel is not a dodge
  if (encAt(from0 + dt, cand).length) continue;
  depart = Math.round(from0 + dt);
  c = cand;
  dodged = { by: depart - from0, cost: cand.total - cost0, cleared: was };
  break;
}
```

The window carries both results across the seam as plain numbers: `dodged`
says how far the departure was moved, what it cost and what it cleared;
`encounters` is what the delivered flight still meets, empty in the usual
case. The transfer card in
[`src/ui/components/transfer.tsx`](../../../../src/ui/components/transfer.tsx)
says each in a sentence: that the departure was moved and why, or that "the
ejection passes inside the Mun's sphere of influence 2 hours after the burn".

## What made it real

The check is held against an integrator. The test "finds the cruise
encounter a brute-force propagation finds" in
[`test/encounter.test.ts`](../../../../test/encounter.test.ts) takes a Dres
to Eeloo arc leaving on Day 718 and flying 1,555 days, one of the two arcs in
6,048 that pass through Jool's sphere, and flies it by a Runge-Kutta
integrator with hour steps instead of the check's conic walk. The two agree
on the depth to a tenth of a sphere radius and on the moment to within ten
days of a four-year flight, which is as sharp as a shallow minimum inside a
sphere the ship spends weeks in can be. A second test walks the same legs at
a uniform fine step and requires the two-pass walk to miss nothing it finds.

The dodge is held over 72 searches across six body pairs: every dodge is
under nine days, every one clears the flight, and none costs 30 m/s. The Ike
case is pinned by name: Duna to Eve on the first window of Year 1 is dodged,
Ike is what it cleared, the shift is under six hours, the cost under 5 m/s.
The measured figures are two hours and 0.05 m/s.

Cost is the other measurement. One check of the Duna window's three legs
takes about 93 microseconds; the rule records 98 against 2.4 milliseconds
for the uniform walk it replaced, on a search that prices thousands of
cells in tens of milliseconds.

## Where it breaks

- **A uniform step.** Dres's sphere is crossed in under two hours on a
  thousand-day arc: a step fine enough to see it everywhere is 2.4 ms per
  check, and a step coarse enough to afford strides over it. The two-pass
  walk is what makes the check both complete and cheap; the rule under _A
  window is checked against every other body_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) has the
  numbers.
- **Refusing to walk a bound departure.** A moon's ejection can leave its
  sphere on an ellipse, below escape ([P18](ejection-energy-and-the-hyperbolic-leg.md)).
  The first `hyperLeg` required a hyperbola and returned nothing for it,
  a silent miss on exactly the case where a moon is most likely in the way.
  It now takes the signed energy and walks either conic.
- **A dodge that costs fuel.** Shifting a Moho departure a day can cost
  hundreds of metres per second ([P22](transfer-windows-and-the-porkchop-plot.md)).
  The dodge is capped at 2% and nine days; past that the window stands and
  the card warns, because a warning is better than a hidden charge.
- **Reading the check as a correction.** It changes no Δv. The game's physics
  is patched-conic, so a body the ship never enters exerts nothing and the
  two-body price is exact; the check only decides whether the flight priced
  is the flight the game will fly.
- **Asking the Sun for its parent.** Choosing which bodies to check against
  asks what each body orbits, and `elements` throws for the Sun. `parentOf`
  reads the table and returns null instead; the rule records the day the
  other way took the application down on any Kerbol destination.

## Try it

Run the test file above. Then change the search to
`findWindow("Kerbin", "Duna", lowR("Kerbin"), lowR("Duna"), 1200 * DAY, true)`,
importing `DAY` from the same module as `kerbalDate`: the Year 5 Duna window
is dodged round the Mun by two hours for 0.01 m/s. Then set the start to
`0`: the Year 1 window needed no dodge, and `dodged` is null.

## Check yourself

<details><summary>A ship's transfer arc passes 5,000 km from Ike, whose sphere of influence is 1,050 km across in radius. How much does Ike bend the arc?</summary>

Not at all. In this game only the body whose sphere the ship is inside
pulls, and 5,000 km is outside Ike's. The two-body arc is exact. Had the
ship passed inside 1,050 km, Ike would have taken over the flight entirely.
There is no in-between, which is why the check asks a yes-or-no question.

</details>

<details><summary>Why is a fouled departure shifted a few hours rather than reported to the reader as a warning?</summary>

Because the thing in the way is a moon that comes round every few days and
the thing being priced is an arc between two planets that barely moves in a
day. Two hours later the Mun has moved 19° and the arc costs 0.01 m/s more.
A warning would leave the reader to find that shift by hand; the search
finds it, reports the moved date and says what it cleared.

</details>

<details><summary>Why can the encounter check walk each leg by true anomaly instead of integrating it?</summary>

Because every leg is a conic: a hyperbola or ellipse about one body, since
the game's physics is two-body between handovers. A conic's position at any
anomaly is closed form, and anomaly to time is the cheap direction of
Kepler's equation. Integration is needed only to check the check, which the
Runge-Kutta test does once.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  interplanetary trajectories, for the patched-conic method and the sphere
  of influence as the handover surface.
- Richard Battin, _An Introduction to the Mathematics and Methods of
  Astrodynamics_, for the geometry of hyperbolic passage and closest
  approach.
- The Kerbal Space Program wiki's page on the sphere of influence, for the
  game's own definition and each body's radius.

## Key takeaway

A window is exactly what the game flies until the ship crosses a third
body's sphere of influence, so every window is walked, by anomaly and in two
passes, against every body under its primaries, and a fouled departure is
shifted two hours at a time until it is clean, because the moon in the way
moves 19° in those two hours and the arc to the planet costs a hundredth of a
metre per second more.

_As of 2ecc64f._

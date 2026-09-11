# Three geometries for moons

**Syllabus:** [P24](../../README.md#part-1--physics)

**Why it matters:** The three geometries matter because the window search
of [P22](transfer-windows-and-the-porkchop-plot.md) prices a transfer
between two bodies that orbit the same primary, with an ejection out of one
sphere of influence and a capture into the other, and two of the three trips
a moon can be part of do not fit that shape at all: out to your own moon
there is no sphere to leave, and down to the planet you are circling there
is no window to wait for; pricing either with the sibling formula charged a
Mun trip escape velocity it never spends, a quarter more than the truth, and
offered a departure date for a flight that costs the same at every moment.

**Before this:** [P18](ejection-energy-and-the-hyperbolic-leg.md),
_Ejection: characteristic energy and the hyperbolic leg_, and
[P22](transfer-windows-and-the-porkchop-plot.md), _Transfer windows and the
porkchop plot_.

## A worked case

Three trips about Kerbin, from a new save, as the search prices them:

| Trip                                   | Leave   | Arrive  | Phase angle | Flight    | Cells searched |
| -------------------------------------- | ------- | ------- | ----------- | --------- | -------------- |
| Low Mun orbit to low Minmus orbit      | 214 m/s | 77 m/s  | 70°         | 12.5 days | 94 × 41        |
| Low Kerbin orbit out to the Mun        | 856 m/s | 280 m/s | 111°        | 7.4 hours | 47 × 21        |
| Low Mun orbit down to low Kerbin orbit | 280 m/s | 856 m/s | none        | 7.4 hours | 1 × 1          |

The first is the Mun and Minmus as siblings about Kerbin, and it is the same
problem as Kerbin and Duna about the Sun: a porkchop grid over a synodic
period, a Lambert arc in every cell, an ejection out of the Mun's sphere and
a capture into Minmus's, a 6° plane change on the way. The one difference is
that the Mun's departure leaves its sphere still bound, as
[P18](ejection-energy-and-the-hyperbolic-leg.md) explained: the energy at the
edge is −26,000 m²/s², and the burn is 214 m/s, below the Mun's escape.

The second has no sphere to leave. A ship in low Kerbin orbit going to the
Mun is already in the Mun's frame of reference, Kerbin's, and simply raises
its apoapsis to 12,000 km, where the Mun will be when it arrives. The burn
is 856 m/s, the community map says 860; the capture into a 10 km Mun orbit
is 280 against the map's 280. There is a phase angle to time the burn by,
111° with the map's 105° to 115°, but there is no window: the search
prices 47 departure dates and every one of them costs exactly 1,136 m/s.
The reason is in the third column of the table: a ship in an 80 km orbit
comes round every half hour, so whatever the date, it can wait for the
point on its orbit from which the Mun is 111° ahead. The only thing the
date could change is free. What is not free is the flight time: a two-hour
dash costs 2,024 m/s and the 7.4-hour Hohmann 1,140, so the grid has a
flight-time axis and nothing to find along the date axis.

The third has neither a sphere nor a window. Leaving a 10 km Mun orbit for
Kerbin, the ship must end on an ellipse about Kerbin whose apoapsis is where
the Mun is and whose periapsis is 80 km up, and that ellipse's speed at
apoapsis follows from vis-viva: 262 m/s against the Mun's own 543, so the
ship must shed 281 m/s relative to the Mun, backward. From the 10 km orbit
that burn is 280 m/s, and circularising at Kerbin is 856: the outward trip
run backward, burn for burn. The Mun's orbit is a circle, so this picture is
the same at every moment and nothing is searched; the one thing a pilot
needs is where on the Mun orbit to burn, 143° round from retrograde, so the
escape leaves the Mun's sphere pointing backward along its motion.

Because the search is in TypeScript, the snippet is a test file. Save it as
`test/moons-try.test.ts` and run
`npx vitest run test/moons-try.test.ts --reporter=verbose`:

```ts
import { it } from "vitest";
import { findWindow } from "../src/core/transfer.js";
import { lowR } from "../src/core/orbits.js";
import type { Window } from "../src/core/transfer.js";
it("three trips about Kerbin", () => {
  const show = (w: Window) =>
    `${w.from} → ${w.to}: leave ${Math.round(w.eject)}, arrive ${Math.round(w.capture)}, phase ${w.phase.toFixed(0)}°, ${w.plot.nt} × ${w.plot.nf} cells`;
  console.log(show(findWindow("Mun", "Minmus", 210_000, 110_000, 0, true)!)); // siblings
  console.log(
    show(findWindow("Kerbin", "Mun", lowR("Kerbin"), 210_000, 0, true)!),
  ); // out to your own moon
  console.log(
    show(findWindow("Mun", "Kerbin", 210_000, lowR("Kerbin"), 0, true)!),
  ); // down to the body you circle
});
```

## The idea

A transfer between two bodies is priced by where the ship changes frames.
Between siblings, bodies that orbit the same primary, the ship leaves one
sphere of influence, coasts in the primary's frame, and enters another, so
the price is an ejection, an arc and a capture, and the arc depends on where
both bodies are, which is why there is a window. That is the geometry every
launch-window tool assumes, and it holds as well for two moons about a
planet as for two planets about the Sun; the only thing the moons add is
that a departure can leave its sphere bound, which the energy form of the
ejection handles.

```
   Siblings                   Out to your own moon          Down to your planet

      ○ Minmus                    ○ Mun, later                  ○ Mun, now
     ↗                           ↗                              ↓ burn backward
    ╱  arc about Kerbin         ╱  raise apoapsis               │
   ●───→ Mun's sphere,         ●  Kerbin: no sphere            ● Kerbin: fall to
   Kerbin  left bound             to leave, burn prograde        80 km, circularise
           ↑ eject                on the parking orbit
           ● Mun                  when the Mun is 111° ahead   the Mun's orbit is a
                                                               circle: same picture
   a window, a grid,           a phase angle, a flight         at every moment,
   an ejection and a capture   time, no window                 nothing to search
```

Out to your own moon, the ship never changes frame on the way out. It is in
the planet's frame in its parking orbit and still in it when it meets the
moon; only the capture is a frame change. So there is nothing to eject from,
and running the raise burn through the ejection formula would charge the
planet's escape speed for a sphere that is never crossed. The burn is a
Hohmann-like apoapsis raise priced by Lambert's problem from a point on the
parking orbit to where the moon will be, and since the parking orbit is
short, the ship can always be at the right point: the burn's place on the
orbit is free, every date costs the same, and what remains to choose is how
long to fly, which is the flight-time axis of a grid with nothing along the
other. The phase angle, how far ahead the moon must be when the ship burns,
is the number a pilot times by.

Down to the body you are circling, the ship starts in the moon's frame,
leaves the moon's sphere, and is then in the planet's frame all the way to
its parking orbit. There is an ejection, out of the moon, but no window: the
moon's orbit is a circle, so the geometry is the same at every moment and
the departure can be priced by one chain of arithmetic without a search.
The ship needs, once clear of the moon, to be on an ellipse whose far end is
the moon's radius and whose near end is the parking orbit; vis-viva gives
its speed at the far end; the difference from the moon's own speed is what
must be shed, backward; and the energy form gives the burn from the moon's
parking orbit. The one thing a pilot needs is where on that parking orbit to
burn so the escape points backward along the moon's motion, which is an
ejection angle measured from retrograde.

The third geometry has one exception. Not every moon goes round in a circle:
the Mun, Minmus, Laythe, Vall and Tylo do, exactly, but Gilly's eccentricity
is 0.55, Bop's 0.235 and Pol's 0.171, and on those the moon's speed and
distance change round its orbit, so when you leave does matter. Gilly's
departure for Eve runs from 1,470 m/s near its apoapsis, where it is
highest and slowest and there is least to shed, to 1,869 near periapsis. For
an eccentric moon the search sweeps the moon's period and refines; for a
circular one it settles on the first moment and says any time will do.

## In this codebase

`findWindow` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts)
dispatches on parentage before it does anything else:

```ts
if (parentOf(to) === from)
  return raiseSearch(from, to, rPark1, rPark2, t0, capture); // out to your own moon
if (parentOf(from) === to)
  return dropSearch(from, to, rPark1, rPark2, t0, capture); // down to your planet
const sys = system(from, to, rPark2); // siblings only: the same parent, or null
if (!sys) return null;
```

`parentOf` reads the body table rather than `elements`, which throws for
the Sun; `system` returns null unless the two bodies share a parent, so a
window is only ever between siblings, a planet and its moon, or a moon and
its planet. `raiseSearch` lays a 24 × 20 grid over two of the moon's periods
and a third to twice the Hohmann time, and each cell, `raiseCell`, is itself
a one-dimensional search over the burn's longitude on the parking orbit,
priced by Lambert, coarse over the whole circle and then golden-section.
`dropSearch` searches nothing but the moon's own period: `priceAt` is the
vis-viva chain above, swept 96 times round the period and refined, which
costs nothing on a circular moon and finds the apoapsis departure on an
eccentric one.

`transferDv` in [`src/core/orbits.ts`](../../../../src/core/orbits.ts)
decides which two bodies the window is between. It walks each end's chain of
parents up to the body they share and asks for a window between the last
body below that on each side: for Kerbin to Laythe that is Kerbin and Jool,
and the route reads "Leave Kerbin for Jool 1,934 (window), plane change 149
mid-course, capture into Jool system 297, capture to low Laythe orbit 775",
with the legs inside Jool's system priced as Hohmanns. For low Kerbin orbit
to the Mun the route keeps the community map's tabulated legs and hangs the
window on the intercept leg for its date and drawing only, because the map's
figures are what players check against.

The card in
[`src/ui/components/transfer.tsx`](../../../../src/ui/components/transfer.tsx)
knows which geometry it has. For a raise it drops the plot, since there is no
window in it, and leads with the phase angle. For a drop it drops the phase
angle, the burn components and the transfer type, none of which say anything,
shows the ejection drawing and a descent, and says "any time will do" for a
circular moon or names the date near apoapsis for an eccentric one.

## What made it real

The community map is the check for the raise. The test "matches the
community map's figures for the Mun and Minmus" in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) holds 856 and
280 against the map's 860 and 280 for the Mun, 921 and 161 against 930 and
160 for Minmus, and the Mun's phase angle inside 95° to 125°. "Burns
prograde in the parking orbit, with nothing to eject through" holds that the
raise's outgoing energy is exactly zero and its normal component under a
metre per second. The 47 departure dates of the Mun grid all cost 1,136 m/s
to the metre, which is the measurement behind "no window".

The drop is held as the raise's mirror: 280 to leave low Mun orbit against
280 to capture into it, 856 to circularise at Kerbin against 856 to leave.
"Works from any moon to its own planet" and "works from any planet to its
own moon" run the two geometries over every pairing in the system. And the
route to the Mun is pinned leg by leg: attaching the Mun window to the
route once flipped the way home from the tabulated mirror to a computed
transfer and moved the default mission by 549 m/s, so the test now names all
seven of that mission's legs.

## Where it breaks

- **The sibling formula on a same-system trip.** Running low Kerbin orbit
  to the Mun through the ejection formula charges Kerbin's escape on top of
  the raise and inflates the trip by a quarter. The comment in `transferDv`
  records it: staying inside one system means no sphere to climb out of.
- **A bracket about the Hohmann guess.** The raise's search over the burn
  longitude once looked ±90° about half a turn back from the arrival, which
  found the Hohmann and missed everything else, painting the plot's
  short-flight half as though no transfer existed. It searches the whole
  circle now; the rule under _Out to your own moon_ in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) has it.
- **A window that became a solver change.** The return leg was found by
  "the leg with a window", and hanging one on the Mun intercept flipped the
  way home: 549 m/s on the default mission. The lookup now ignores a window
  whose destination is a moon of the origin.
- **Every moon a circle.** The first drop priced whatever moment the reader
  asked from. On Gilly that is anywhere between 1,470 and 1,869 m/s. The
  sweep over the period, and the vector difference from the moon's velocity
  with its radial part, are what an eccentric moon needs.
- **Asking the Sun for its elements.** The dispatch on parentage took the
  whole application down on any Kerbol destination until it read the table
  through `parentOf` instead.

## Try it

Run the test file above, then change the Mun to Minmus in the second and
third lines, with a 110,000 m parking radius: the raise reads 921 and 161
with a phase angle of 112°, and the drop 160 and 921. Then change the first
line's start time from `0` to `5 * 21600`, five days on: the sibling window
moves and its cost changes, because siblings have a window; do the same to
the second line and the cost is 1,136 again, because a raise has none.

## Check yourself

<details><summary>Why does a trip from low Kerbin orbit to the Mun have a phase angle but no window, when a trip from Kerbin to Duna has both?</summary>

Because the ship's place on its parking orbit is free. Going to Duna, the
ship must leave Kerbin's sphere when Kerbin itself is in the right place
relative to Duna, and Kerbin comes round once a year. Going to the Mun, the
ship must burn when the Mun is 111° ahead of it, and the ship comes round its
80 km orbit every half hour, so that moment arrives within thirty minutes of
any date. The phase angle times the burn; the date is irrelevant.

</details>

<details><summary>Why is the trip down from the Mun priced by one chain of arithmetic rather than by a search?</summary>

Because the Mun's orbit is a circle, so the geometry is identical at every
moment: the moon's speed, its distance and the ellipse down to the parking
orbit never change. Vis-viva gives the speed the ship needs at the Mun's
radius, the difference from the Mun's own speed is what to shed, and the
energy form gives the burn. Only an eccentric moon such as Gilly makes the
moment matter, and for those the moon's period is swept.

</details>

<details><summary>A player asks for a route from low Kerbin orbit to low Laythe orbit. Which two bodies is the window between, and how are the other legs priced?</summary>

Between Kerbin and Jool: the last body below the shared primary, the Sun, on
each side. The legs inside Jool's system, capture into the Jool system with
periapsis at Laythe's orbit and capture into low Laythe orbit, are priced as
Hohmanns about Jool, since a window is only ever between siblings, a planet
and its moon, or a moon and its planet.

</details>

## Further reading

- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter
  on orbital manoeuvres for the apoapsis raise and phasing, and the chapter
  on interplanetary trajectories for why the sphere of influence is what
  divides the geometries.
- The community Δv map for Kerbal Space Program, whose Mun and Minmus
  figures are what the raise is checked against.

## Key takeaway

Where the ship changes frames decides how a trip is priced: between siblings
there is an ejection, a window and a capture; out to your own moon there is
no sphere to leave and no window, only a phase angle and a flight time,
because the burn's place on the parking orbit is free; and down to the
planet you circle there is an ejection but nothing to search, because a
circular moon offers the same departure at every moment.

_As of 2ecc64f._

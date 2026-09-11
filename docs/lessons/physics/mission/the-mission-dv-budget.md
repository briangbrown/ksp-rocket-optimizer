# The mission Δv budget: legs, margin, and cuts

**Syllabus:** [P5](../../README.md#part-1--physics)

**Why it matters:** The mission budget matters because a rocket is sized for
a number, and that number is not the Δv to orbit or the Δv to the Mun but the
sum of every burn the trip needs, grown by a margin for error and divided at
the points where one set of hardware hands over to another; every figure the
brief shows, every stage the solver builds and every cost it reports descends
from that sum and how it is cut.

**Before this:** [P1](../staging/dv-and-the-rocket-equation.md), _Δv and the
rocket equation_, and [P4](../staging/staging-why-more-and-when-to-stop.md),
_Staging: why more stages, and when to stop_.

## A worked case

Land on Minmus and come home. Here is the trip as the tool writes it down, one
line per burn:

| #   | Burn                                   | Δv            |
| --- | -------------------------------------- | ------------- |
| 0   | Launchpad → 80 km orbit                | 3,400 m/s     |
| 1   | Low Kerbin orbit → Minmus intercept    | 930 m/s       |
| 2   | Plane change, 6°, in the Kerbin system | 5 m/s         |
| 3   | Capture → low Minmus orbit             | 160 m/s       |
| 4   | Descent to Minmus surface              | 180 m/s       |
| 5   | Ascent from Minmus surface             | 180 m/s       |
| 6   | Return transfer to Kerbin              | 935 m/s       |
| 7   | Aerobrake at Kerbin                    | 0 m/s         |
|     | **Total**                              | **5,790 m/s** |

Eight lines, and the last one is free: the rocket comes home by flying into
Kerbin's air and letting it do the braking. The other seven add up to 5,790
m/s, and a rocket that can produce 5,790 m/s in the right order can fly the
mission, if every number is exactly right.

They will not be. The pilot will steer a little wide, the transfer will be a
day off its window, the landing will hover a second longer than planned. So
the tool grows every line by a margin, 10% unless the reader changes it:
5,790 × 1.10 = 6,369 m/s. That is the budget, and with no further instruction
the solver builds one rocket to supply all of it, staged as
[P4](../staging/staging-why-more-and-when-to-stop.md) described.

Now say something a real mission designer says: the lander should fly on its
own hardware. Cut the trip after line 4. Everything from the launchpad through
the descent is one job, 4,675 m/s, and the return is another, 1,115 m/s. With
the margin, 5,143 and 1,227. The solver now builds two rockets: a small one
for the return, and a large one that carries the small one, fully fuelled, all
the way to the surface of Minmus as its payload. The stages on the pad no
longer have to lift propellant for a burn that happens on the way home.

```js
const legs = [
  ["Launchpad → 80 km orbit", 3400],
  ["LKO → Minmus intercept", 930],
  ["Plane change 6°", 5],
  ["Capture → low Minmus orbit", 160],
  ["Descent to Minmus surface", 180],
  ["Ascent from Minmus surface", 180],
  ["Return transfer to Kerbin", 935],
  ["Aerobrake at Kerbin", 0, true], // free
];
const margin = 10,
  extra = 0,
  cuts = [4]; // cut i: a new rocket takes over after leg i
const groups = [];
let cur = [];
legs.forEach(([, , free], i) => {
  if (free) return;
  cur.push(i);
  if (cuts.includes(i)) {
    groups.push(cur);
    cur = [];
  }
});
if (cur.length) groups.push(cur);
groups.forEach((g, gi) => {
  const sum = g.reduce((a, i) => a + legs[i][1], 0);
  const dv = sum * (1 + margin / 100) + (gi === groups.length - 1 ? extra : 0);
  console.log(
    `group ${gi}: legs ${g[0]}–${g[g.length - 1]}, ${sum} m/s, budget ${dv.toFixed(0)} m/s`,
  );
});
```

## The idea

A **route** is the whole trip written as a list of burns. Each burn is a
**leg**: one manoeuvre, the body it happens at, and the Δv it costs. Legs add.
That is not obvious, because the rocket equation is a logarithm, but it is
exactly what the logarithm buys: two burns in a row multiply the mass ratios,
and the logarithm of a product is the sum of the logarithms, so the Δv of the
pair is the sum of the two. A mission's Δv is the sum of its legs, however
many bodies it visits.

Where do the numbers come from? For trips out of Kerbin the tool uses the
**Δv map**, the table of figures for every leg in the Kerbal system that
players have worked out and checked in flight: 3,400 m/s to low orbit, 860 to
the Mun, 930 to Minmus. For everything the map does not cover, a start in
orbit, a return, an arrival at a stationary orbit, the same legs are computed
from the bodies' orbits, and the two agree where they overlap. Two kinds of
leg are special. An **aerobrake**, slowing down by flying through an
atmosphere, costs no propellant and is marked free, so it is on the list for
the reader and left out of every sum. A descent through air with parachutes is
charged at 18% of the powered figure, because the chutes do the rest; the tool
lists the chutes it is assuming and leaves their mass inside the payload the
reader entered.

The **margin** is the fraction added to every leg for error, and it is a
fraction rather than a fixed reserve because the errors scale with the leg. An
ascent flown a little off its profile loses a few percent of 3,400; a landing
hovered a second too long loses a few percent of 180. Ten percent is the
default the brief opens on. A flat reserve, the **extra Δv**, can be added on
top for what the margin does not model, a rendezvous or a contract not yet
planned, and it rides on the last group only. Spare propellant is useful only
if it is still aboard at the end, and putting it lower in the stack means
lifting fuel you then stage away.

A **cut** is a point in the route after which a fresh set of stages takes over.
The legs between two cuts are a **group**, and each group is solved as one
rocket. The groups are solved from the last to the first, because each group,
fully fuelled, is the payload of the group before it: exactly
[P4](../staging/staging-why-more-and-when-to-stop.md)'s top-down walk at the
scale of a mission. A cut is staging by another name, and it pays for the same
reason. The stages that leave the pad do not have to carry the tanks for a burn
that happens at Minmus; the lander does, and it is a small rocket. It costs for
the same reason too: another group is another engine, another decoupler, and
another mass floor, so cutting a mission into many small groups is as wrong as
cutting a rocket into many small stages. No cuts is the default, and the
solver finds the stage count for the whole span itself.

## In this codebase

A leg is a plain record in [`src/core/orbits.ts`](../../../../src/core/orbits.ts):

```ts
type Leg = {
  label: string;
  dv: number;
  kind:
    | "ascent"
    | "ascentBack"
    | "transfer"
    | "capture"
    | "land"
    | "plane"
    | "aero";
  body: string;
  g?: number; // the local gravity a stage flying this leg is judged against
  free?: boolean; // an aerobrake: listed, never charged
  chuted?: boolean; // a descent already discounted for parachutes
  // ...
};
```

`kind` is a fixed set rather than a string because the solver reads it: an
ascent leg makes its group a launch, a landing makes it a landing, and those
decide the thrust floors of [P3](../staging/thrust-to-weight-and-burn-time.md).
`buildRoute(destName, profile, chutes, origin, returning)` turns what the brief
asked for into a From and a To, each a body and a state, and `routeFor`
assembles the legs, taking Kerbin departures from the tabulated map, `DEST`,
and computing the rest. [`test/routes.test.ts`](../../../../test/routes.test.ts) holds every route the brief can
ask for, 5,904 of them, hashed; a diff there is a mission that moved.

`planMission` in [`src/core/plan.ts`](../../../../src/core/plan.ts) cuts the route into groups by index, skips
the free legs, and prices each group:

```ts
route.forEach((leg, i) => {
  if (leg.free) return;
  cur.push(i);
  if (cuts.has(i)) {
    groups.push(cur);
    cur = [];
  } // cut i: separate after leg i
});
// ...
const dv =
  legs.reduce((a, l) => a + l.dv, 0) * (1 + margin / 100) +
  (i === groups.length - 1 ? extraDv : 0); // the flat reserve rides on top
```

The groups are then walked from the last to the first, `carried` starting at
the payload plus the hardware the mission needs, and each solved group's full
mass becoming the next one's `carried`. The brief's Δv margin field and its
extra Δv field are the `margin` and `extraDv` here, and the scissors on the
route map are the `cuts`.

## What made it real

The cut is what made the margin's arithmetic bite. In #167 the reader cut the
Minmus round trip after the descent, so the launch group was the five legs in
the table above: 4,675 m/s, 5,143 with the margin. The simulator then flew the
ascent and found it cost 4,296 m/s against the map's 3,400, 3,740 with margin.
The check that compares the flown ascent with what the rocket carries compared
it with the whole group, 5,304 m/s built, and 4,296 is less than 5,304, so the
design stood, 600 m/s short of orbit, with a callout saying a stage would run
dry. The fix carves the ascent's share out of the group and compares against
that. The lesson of the sum is that its parts have names, and a check has to
compare like with like.

The map legs themselves are the figures players fly by, and the seven builds
flown in game against the tool's predictions, five within 1%, were flown on
budgets built from them.

## Where it breaks

- **Comparing a part with the whole.** The #167 case above. The rule is in
  [`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) under _The flown ascent is compared with what the
  chain carries for the climb_.
- **A discount granted on trust.** The 18% figure for a parachute descent
  assumes parachutes are fitted. The tool lists them under the payload and adds
  nothing for them; leave them off the real rocket and the descent budget is
  wrong by a factor of five.
- **Identity across the seam.** A cut used to be held as a reference to the
  leg object it followed, and a JSON round trip destroys identity, so a saved
  design's cuts stopped matching. Cuts are route indices now, "separate after
  leg i", and the seam carries only values;
  [L1](../../README.md#part-3--language-and-platform) is about why.
- **The map is drawn upside down.** The route map lists the launchpad last,
  the way a rocket is read, so the scissors for cut i sit before leg i's row on
  the page and between it and leg i + 1. A slot too low everywhere is the
  natural bug, and [`test/route-map.test.tsx`](../../../../test/route-map.test.tsx) holds the order.
- **Waiting is not priced.** A plane change timed at a node is nearly free in
  Δv and can cost a 24-day wait; the budget sees only the Δv. The README lists
  it as a known gap.

## Try it

In the snippet, change `cuts` from `[4]` to `[3]`, a cut after the capture
instead of after the descent. The launch group drops to 4,945 m/s with margin
and the second group rises to 1,425: the lander now lands as well as returns,
and the pad no longer lifts propellant for the descent. Then set `cuts` to
`[]` and read the single group of 6,369.

## Check yourself

<details><summary>The rocket equation is a logarithm. Why can the Δv of two burns in a row simply be added?</summary>

Because two burns multiply the mass ratios, m₀/m₁ × m₁/m₂ = m₀/m₂, and the
logarithm of a product is the sum of the logarithms. Δv turns a chain of
multiplications into a sum, which is the whole reason it is the unit a budget
is kept in.

</details>

<details><summary>Why does the extra Δv ride on the last group rather than being spread across the rocket?</summary>

Because spare propellant is only useful if it is still aboard when it is
needed, at the end. Propellant carried in a lower group is burned or dropped
with that group; to keep a reserve there you would have to lift fuel and then
stage it away unused.

</details>

<details><summary>What does a cut after the Minmus descent do to the rocket that leaves the pad?</summary>

It makes the return a separate, small rocket, and makes that rocket, full, the
payload of the launch rocket. The pad stages no longer carry tanks and engines
for the 1,115 m/s of return burns; they carry a finished lander instead, which
is lighter than the propellant it would otherwise have to lift for the whole
trip.

</details>

## Further reading

- The KSP wiki, _Cheat sheet_, for the Δv map as players use it and the
  figures the tabulated legs come from.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  orbital manoeuvres, for where each leg's Δv comes from when it is computed
  rather than tabulated.
- George Sutton and Oscar Biblarz, _Rocket Propulsion Elements_, the section on
  mission velocity requirements, for the budget as engineers keep it.

## Key takeaway

A mission is a sum of legs because the rocket equation's logarithm makes Δv
additive, the margin scales that sum for error, and a cut divides it into
groups solved as separate rockets from the top down, each one the payload of
the group before it.

_As of dbe8104._

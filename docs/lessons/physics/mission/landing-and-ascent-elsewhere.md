# Landing and ascent elsewhere

**Syllabus:** [P25](../../README.md#part-1--physics)

**Why it matters:** The legs on and off other bodies matter because a
mission that lands anywhere is priced mostly by them, a Tylo landing and
return being 4,540 m/s of a route in which the transfer burns are hundreds,
and because a Δv figure alone does not size a lander: the stage that flies
that figure must also push hard enough against that body's gravity to stop,
with an engine delivering what it delivers at that body's surface pressure,
so the route takes the Δv from a table and computes from gravity and
atmosphere everything the table cannot say.

**Before this:** [P5](the-mission-dv-budget.md), _The mission Δv budget:
legs, margin, and cuts_, and [P13](../orbits/vis-viva-and-circularising.md),
_Vis-viva, circular speed, and circularising_.

## A worked case

Every body a ship can stand on carries one number in the body table, the Δv
from its surface to its low orbit, taken from the community's Δv map. Here
it is against the speed of that low orbit, which [vis-viva](../orbits/vis-viva-and-circularising.md)
gives from the body's gravity and radius alone:

| Body   | Surface gravity | Atmosphere | Low-orbit speed | Map's ascent | Ratio | Descent with chutes |
| ------ | --------------- | ---------- | --------------- | ------------ | ----- | ------------------- |
| Mun    | 1.63 m/s²       | none       | 557 m/s         | 580 m/s      | 1.04  |                     |
| Minmus | 0.49 m/s²       | none       | 159 m/s         | 180 m/s      | 1.13  |                     |
| Tylo   | 7.85 m/s²       | none       | 2,152 m/s       | 2,270 m/s    | 1.05  |                     |
| Duna   | 2.94 m/s²       | 50 km      | 891 m/s         | 1,450 m/s    | 1.63  | 261 m/s             |
| Laythe | 7.85 m/s²       | 50 km      | 1,872 m/s       | 2,900 m/s    | 1.55  | 522 m/s             |
| Kerbin | 9.81 m/s²       | 70 km      | 2,279 m/s       | 3,400 m/s    | 1.49  | 612 m/s             |
| Eve    | 16.68 m/s²      | 90 km      | 3,196 m/s       | 8,000 m/s    | 2.50  | 1,440 m/s           |

On an airless body the map's figure is the orbital speed plus a few percent,
4% on the Mun and 13% on Minmus: what it costs to fight gravity for the
minute or two the climb takes, and nothing else. With air the ratio jumps,
to half again on Duna, Laythe and Kerbin and to two and a half times on Eve,
because the ship must climb clear of the atmosphere before it can go fast,
drag takes its share, and the engines lose thrust in the pressure. Coming
down is the same figure reversed on an airless body; with air and
parachutes it is 18% of the figure, because the chutes do the rest.

Now size the lander. The Tylo mission in the test grid puts 3.5 t on the
surface and brings it back, and the stage that lands is a Toroidal
Aerospike carrying 3,313 m/s, with a thrust-to-weight of 1.47 against
Tylo's gravity. The Duna mission's lander is a Terrier at 2.02 against
Duna's, carrying 2,130 m/s, and its Isp is 344 s where the same engine on
the stage above, firing in vacuum, has 345, because Duna's surface pressure
is 0.067 atmospheres. Neither of those numbers is in any table. The floor
under each thrust-to-weight is 1 + 2/g, clamped to between 1.3 and 2.5: 2.23
on the Mun, 1.68 on Duna, 1.30 on Tylo, 2.5 on Minmus, and 1.35 on Eve,
whose air is thick enough to punish a hard descent. The Isp comes from the
engine's pressure curve at the body's surface pressure.

The snippet reproduces the table from the body data. Save it as `try.cjs`
at the repository root and run `node try.cjs`:

```js
const G0 = 9.80665;
const { SYS, BODY } = require("./src/data/bodies.json");
for (const name of [
  "Mun",
  "Minmus",
  "Tylo",
  "Duna",
  "Laythe",
  "Kerbin",
  "Eve",
]) {
  const b = SYS[name];
  const mu = b.gee * G0 * b.R ** 2,
    g = b.gee * G0;
  const low = b.R + (b.atm ? b.atm + 10000 : 10000); // the low orbit the route uses
  const vc = Math.sqrt(mu / low);
  const p0 = BODY[name] ? BODY[name].P[0][1] / 101.325 : 0; // surface pressure, atmospheres
  const floor = p0 > 1 ? 1.35 : Math.min(2.5, Math.max(1.3, 1 + 2 / g));
  console.log(
    name,
    Math.round(vc),
    b.ascent,
    (b.ascent / vc).toFixed(2),
    floor.toFixed(2),
    b.atm ? Math.round(b.ascent * 0.18) : "-",
  );
}
```

## The idea

An ascent to orbit costs the orbital speed plus the losses of getting there,
and [P6](../ascent/gravity-drag-and-steering-losses.md) took those apart for
Kerbin: gravity loss, the thrust spent holding the rocket up while it is
still climbing; drag loss; and steering loss. On another body the same three
terms apply with that body's numbers. Gravity loss scales with the body's
gravity and with how long the climb takes, and a small airless moon has
little of either, so the Mun's ascent is 4% over its orbital speed. Drag and
the need to climb out of the air before going fast exist only where there is
air, and they are why Duna, with a thin atmosphere, costs 63% over its
orbital speed and Eve, with five atmospheres at the surface, two and a half
times. The map's figures are what players have measured flying these
ascents well, and the route trusts them, because a full ascent simulation is
kept for the launch from the mission's origin.

A landing in vacuum is an ascent run backward: the ship arrives at orbital
speed and must shed all of it against the same gravity over the same
distance, so the table's one figure serves both directions. In air the
symmetry breaks. Going up, the air is a cost; coming down, it is free
braking, and with parachutes almost the whole descent needs no engine. The
route charges 18% of the powered figure for a chuted descent, lists the
chutes it assumes, and leaves their mass in the payload.

What the table cannot say is how hard to push. A stage that lands must do
more than carry the Δv: at the end of the burn it must be able to cancel its
fall, and a thrust equal to its weight only hovers. The margin the route
asks for is a deceleration, not a ratio: 2 m/s² of net stopping power beyond
hovering, which is a thrust-to-weight of 1 + 2/g against that body's g. On
Minmus, where g is 0.49, that would be 5.1 and is clamped to 2.5; on Tylo,
where g is 7.85, it is 1.25 and is clamped up to 1.3; a flat ratio of 1.6
would have bought 0.29 m/s² of stopping power on Minmus and 4.7 on Tylo,
which is backward. [P3](../staging/thrust-to-weight-and-burn-time.md) has
the floors and burn-time limits in full; this is where the body enters them.

The body enters the engine too. An engine's specific impulse falls with
ambient pressure ([P2](../engines/specific-impulse-and-pressure.md)), and a
stage that lights on a surface is priced at that surface's pressure: zero on
every airless body, 0.067 atmospheres on Duna, 0.6 on Laythe, 1 on Kerbin
and 5 on Eve, where a vacuum engine may not light at all. The pressure comes
from the same atmosphere tables the simulator flies through.

The last leg of a return is decided by the air as well. Arriving home at
Kerbin, Duna or Laythe the ship aerobrakes, and the leg is listed at zero
and never charged; arriving at a body with no surface to stand on, Jool or
the Sun, there is no aerobrake to credit however much air there is, and the
route charges a capture instead.

## In this codebase

The one tabulated figure is the `ascent` field of each body in
[`src/data/bodies.json`](../../../../src/data/bodies.json), and the comment
on the body type in [`src/core/orbits.ts`](../../../../src/core/orbits.ts)
calls it "the one figure worth keeping tabulated". `ascentLeg` and `landLeg`
in that file turn it into legs, and both carry the body's gravity and
whether it has air:

```ts
const landLeg = (b: string): Leg => ({
  label: `Descent to ${b} surface`,
  dv: SYS[b].ascent ?? 0, // the same figure as the ascent, reversed
  kind: "land",
  body: b,
  g: gOf(b), // the body's own gravity, for the stage that flies it
  atm: !!SYS[b].atm, // whether chutes can discount it
});
```

`routeFor` appends the landing to a route whose destination is a surface,
prefixes the return with an `ascentBack` leg from the same figure, and
applies the chute discount to every landing leg through air when the brief
asks for chutes: `dv * 0.18`, marked `chuted` so the route view can say so.
`arrival` decides the way home: an aerobrake, free, where the origin has air
over a surface, otherwise a capture at 0.41 of the origin's low-orbit speed.
`possible` refuses a landing on a body with no `ascent` figure or with
`noLand` set, which is how "Jool has no surface to land on" is said.

The computed half lives in [`src/core/solver.ts`](../../../../src/core/solver.ts).
`landingFloor(g, p0)` is the deceleration rule above, and `stageParamsFor`
walks the legs each stage flies to give it the floor and the surface
pressure of the body it lights on:

```ts
const landingFloor = (g: number, p0: number) =>
  p0 > 1
    ? 1.35
    : Math.min(
        LANDING_FLOOR_MAX,
        Math.max(LANDING_FLOOR_MIN, 1 + LANDING_MARGIN / g),
      );
```

The surface pressure is `atmoFor(body).p(0)` from
[`src/core/atmosphere.ts`](../../../../src/core/atmosphere.ts), the same
pressure curve the ascent simulator integrates through, divided by 101.325
to make atmospheres; a body without an atmosphere table gets zero. In
[`src/core/plan.ts`](../../../../src/core/plan.ts), a group with an `ascent`
leg is a launch and is the one the simulator flies; a group with a `land` or
`ascentBack` leg is a landing group, priced from the table at its body's
gravity and pressure.

## What made it real

The map's figures against orbital speed are the first measurement: the
ratios in the table are 1.04 to 1.13 for every airless body and 1.49 to
2.50 for every body with air, with nothing in between, which is the
signature of losses that are small without air and large with it. The
routes snapshot in [`test/routes.test.ts`](../../../../test/routes.test.ts)
pins every landing and ascent leg the route can produce, the chuted 612 m/s
descent to Kerbin among them.

The floor is the second. At a flat thrust-to-weight of 1.6 the Tylo 3.5 t
mission in the sweep had no design at all; at Tylo's own floor of 1.3 it is
the 1,911 t rocket in the snapshot, landing at 1.47. The rule under _The
landing floor is a deceleration_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records the
stopping power a flat ratio had bought on each body, and the mission sweep
in [`test/mission-sweep.test.ts`](../../../../test/mission-sweep.test.ts)
holds the Tylo, Duna and Mun landers as they are now.

The pressure is the third. The Duna lander's Terrier is priced at 344 s
against the vacuum stage's 345, a one-second difference that says the stage
was sized for the surface it lights on; before every stage in a group was
sized by the legs it flies, a Duna lander was sized as if it lit on Kerbin's
pad, at Kerbin's pressure and Kerbin's gravity.

## Where it breaks

- **Reading a landing as free where there is air but no surface.** Jool has
  200 km of atmosphere and nothing to land on; the Sun likewise. `arrival`
  credits an aerobrake only over a landable surface, and a return to either
  is a capture. The rule records the Kerbol and Jool cases.
- **A flat thrust-to-weight floor for every lander.** 1.6 is too little on
  Minmus and too much on Tylo, and it cost the Tylo 3.5 t mission its
  design. The floor is a deceleration in the body's own gravity.
- **Sizing a lander on the pad.** A stage that lights on Duna was once given
  Kerbin's pressure and gravity because its group was solved as one rocket
  with one set of parameters. Each stage now takes its own from the legs it
  flies; the rule under _Judge each stage by the legs it flies_ has the
  history.
- **Trusting the table where the simulator should fly.** The map's figures
  are rules of thumb. For the launch from the mission's origin the simulator
  flies the actual vehicle and re-sizes it when the flown cost exceeds the
  table's, which once turned 3,740 m/s built into 4,062 needed. Other
  bodies' ascents are not flown, and a badly shaped lander can fall short of
  the table on Eve without the tool knowing.
- **Chutes on a body without air.** The 18% applies only where `atm` is
  set; a Mun landing is powered all the way down whatever the brief's chute
  switch says.

## Try it

Run the snippet, then add `"Gilly"` to the list: its low-orbit speed is 19
m/s, the map's ascent 30, the ratio 1.58 with no air at all, because on a
body that small the losses are not gravity but the awkwardness of a
minute-long hop at walking pace. Then open the application, set the
destination to Tylo with a surface landing and the payload to 3.5 t, and
read the lander stage's thrust-to-weight on the stage card: it sits just
above 1.3, Tylo's floor.

## Check yourself

<details><summary>The Mun's ascent figure is 580 m/s and its low-orbit speed 557. Why is the difference only 4%, when Kerbin's ascent is 49% over its orbital speed?</summary>

Because the difference is the losses, and the Mun has almost none. Gravity
loss scales with gravity and climb time, both small on the Mun; drag and the
climb out of the air do not exist. Kerbin's 1,121 m/s of excess is mostly
the price of air: climbing above it before going fast, drag through it, and
engines losing thrust in it.

</details>

<details><summary>Why is a landing charged the same Δv as the ascent on the Mun, but 18% of it on Duna?</summary>

Because in vacuum a landing is the ascent reversed, orbital speed shed
against the same gravity over the same distance, and in air the descent has
free braking. On Duna the atmosphere and parachutes do most of the stopping,
and the route charges only the powered part, 18% of the table's figure, with
the chutes assumed and their mass left in the payload.

</details>

<details><summary>Why is the landing floor 1 + 2/g rather than one ratio for every body?</summary>

Because what a lander needs is stopping power, a deceleration in metres per
second squared beyond hovering, and a ratio buys a different amount of it on
each body. At 1.6, a Minmus lander has 0.29 m/s² in hand and a Tylo lander
4.7. Asking every lander for 2 m/s² gives 2.5 on Minmus and 1.3 on Tylo,
and it is the Tylo end that decides whether a mission has a design at all.

</details>

## Further reading

- The community Δv map for Kerbal Space Program, the source of every
  tabulated ascent figure, and its notes on which figures assume chutes and
  aerobraking.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  rocket vehicle dynamics, for gravity loss and the ascent budget.
- The Kerbal Space Program wiki's pages on each body, for the surface
  gravity, atmosphere height and surface pressure the body table records.

## Key takeaway

A body's surface legs cost the map's one tabulated figure both ways, a few
percent over orbital speed without air and half again to two and a half
times with it, and 18% of it coming down through air with chutes; what the
table cannot say, how hard the lander must push and what its engine gives
at that surface, the route computes from the body's gravity and surface
pressure, as a deceleration floor of 1 + 2/g and an Isp at that pressure.

_As of 2ecc64f._

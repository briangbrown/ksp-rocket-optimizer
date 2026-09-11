# Why low thrust needs the nose above prograde

**Syllabus:** [P10](../../README.md#part-1--physics)

**Why it matters:** The lead matters because a rocket whose thrust barely
exceeds its weight cannot fly the gravity turn at all, and without a third
control the simulator's only answer for such a stack was to climb nearly
straight up and pay for it; that answer was 44% over what a pilot actually
spent on the same rocket, and because the solver minimises Δv, a flight it
prices too high is a design it will not choose.

**Before this:** [P9](the-gravity-turn.md), _The gravity turn_, and
[P3](../staging/thrust-to-weight-and-burn-time.md), _Thrust-to-weight, and
the burn-time limits_.

## A worked case

Six Hammers on a Mainsail, three Poodles above, a Reliant above those, 17.8 t
on top: 187.5 t at liftoff. The solids lift it at 1.40 times its weight for
24 s and then drop away, leaving the Mainsail alone at 0.88. This is the stack
issue #10 was closed on, and it is the one the gravity turn cannot fly.

Ask the simulator for the best classic turn, a kick and then prograde:

| Turn                        | Kick          | Total     | Gravity loss | Steering loss |
| --------------------------- | ------------- | --------- | ------------ | ------------- |
| Best classic turn           | 3° at 140 m/s | 4,404 m/s | 2,279 m/s    | 0.4 m/s       |
| Best turn with a lead of 6° | 7° at 125 m/s | 4,223 m/s | 1,954 m/s    | 17.5 m/s      |

The classic answer is the latest, shallowest kick on the search grid: tip 3° at
140 m/s, the corner of the box. It is the simulator saying "stay as vertical as
you can", and the 2,279 m/s of gravity loss is the bill for doing so. Every
earlier or larger kick the search tried fell over and crashed.

Now hold the nose 6° above the direction of travel after the kick, instead of
exactly on it. A larger kick survives, 7° at 125 m/s, and the same stack
reaches orbit for 181 m/s less. It pays 17 m/s of steering loss for pointing
off its velocity, and saves 325 of gravity loss by getting level sooner.

Hold the kick fixed at 7° at 125 m/s and vary only the lead:

| Lead | Outcome                       |
| ---- | ----------------------------- |
| 0°   | crashed at 286 s              |
| 3°   | crashed at 360 s              |
| 6°   | 4,223 m/s, gravity loss 1,954 |
| 10°  | 4,518 m/s, gravity loss 2,201 |
| 15°  | 4,730 m/s, gravity loss 2,226 |

Too little lead and the kick that would have been efficient is fatal. Too much
and the nose is held so high the rocket is back to climbing steeply, and the
gravity loss climbs with it. There is a right amount, and it is not zero.

The mechanism shows in a flat world with no air, [P9](the-gravity-turn.md)'s
toy rocket with one more line. Thrust 1.4 times weight throughout, kick 10° at
100 m/s, and the nose held a fixed angle above the velocity:

| Lead | Levels out at                | Speed then | Gravity loss |
| ---- | ---------------------------- | ---------- | ------------ |
| 0°   | 7.4 km                       | 529 m/s    | 552 m/s      |
| 3°   | 11.9 km                      | 707 m/s    | 685 m/s      |
| 6°   | 36.6 km                      | 1,307 m/s  | 1,167 m/s    |
| 10°  | never; nose back to vertical | —          | —            |

```js
const g = 9.81,
  twr = 1.4,
  kick = (10 * Math.PI) / 180,
  vKick = 100;
for (const leadDeg of [0, 3, 6, 10]) {
  const lead = (leadDeg * Math.PI) / 180;
  let v = 0,
    tilt = 0,
    h = 0,
    t = 0,
    gLoss = 0;
  for (; tilt < Math.PI / 2 && v < 2300 && t < 600; t += 0.1) {
    if (!tilt && v >= vKick) tilt = kick;
    const L = tilt ? lead : 0; // the nose sits L above the velocity once kicked
    v += (twr * g * Math.cos(L) - g * Math.cos(tilt)) * 0.1; // thrust's part along v, less gravity's
    if (tilt)
      tilt = Math.max(
        0,
        tilt + ((g * Math.sin(tilt) - twr * g * Math.sin(L)) / v) * 0.1,
      );
    h += v * Math.cos(tilt) * 0.1;
    gLoss += g * Math.cos(tilt) * 0.1;
  }
  console.log(
    `lead ${leadDeg}°: ${t.toFixed(0)} s, ${(h / 1000).toFixed(1)} km, ${v.toFixed(0)} m/s, tilt ${((tilt * 180) / Math.PI).toFixed(0)}°, gravity loss ${gLoss.toFixed(0)}`,
  );
}
```

## The idea

[P9](the-gravity-turn.md) gave the rate at which gravity swings the velocity
toward the horizon when the thrust points along it: g · sin θ / v. Slow rocket,
fast swing. A rocket with thrust to spare outruns the swing; one at a
thrust-to-weight ratio near 1 does not, its speed barely grows, the swing
continues at the early rate, and the velocity reaches horizontal low and slow.
Following prograde is then not a turn but a fall. The only prograde-following
flight that reaches orbit from such a stack is one that hardly tips at all,
and it pays for that in gravity loss at 9.81 m/s for every second it stays
near vertical.

What a pilot does on such a stack is hold the nose a few degrees above the
prograde marker. The **lead** is that angle. It puts a small part of the thrust
across the velocity, pointing up, and that part fights the swing directly.
With the nose held L above the velocity, the rate at which the velocity tilts
becomes

    dθ/dt = (g · sin θ − a · sin L) / v

where a is the thrust acceleration. The first term is gravity bending the path
down; the second is the thrust bending it back up. They balance where sin θ =
(a/g) · sin L, which is TWR × sin L. At a thrust-to-weight ratio of 1.4 and a
lead of 6°, that is a tilt of 8.4°: gravity cannot swing the velocity past it
while the lead is held. The turn has been given a brake.

In the flat-world toy the thrust-to-weight ratio is constant, so the brake is a
threshold: kick past the balance angle and the fall-over proceeds anyway,
merely slower, which is the 0° to 6° rows of the table; kick short of it and
the velocity is pulled back to vertical and stays there, the 10° row. A real
rocket burns propellant, its thrust-to-weight ratio rises through the burn,
and the balance angle rises with it, so the tilt is held early, when the
rocket is slow and the swing would be fastest, and then released as the rocket
gains speed and can afford to level. That is what the simulator's 6° row does
on the Mainsail stack, and it is why the right lead is a few degrees and not
fifteen: enough to hold the velocity while the rocket is slow, not so much that
the rocket is still climbing steeply when it should be level.

The price is steering loss, [P6](gravity-drag-and-steering-losses.md)'s third
term: the thrust across the velocity, a · (1 − cos L), buys no speed. At 6° that
is half a percent of the thrust, and on the Mainsail stack it came to 17 m/s,
against 325 m/s of gravity loss saved. The trade is lopsided because the
steering loss goes as the square of a small angle and the gravity loss it
prevents does not.

So a turn that follows prograde has two parameters, and a turn a person can
fly on a heavy stack has three. Without the third, a search over the first two
has no way to express the flight the pilot flies, and it returns the corner of
its grid, "go straight up", and prices the stack accordingly.

## In this codebase

`flyAscent` in `src/core/ascent.ts` takes `lead` in radians and applies it in
two places: the handoff test and the pitch that follows it.

```ts
if (handT < 0 && pro - lead >= opt.kick) { handT = t; ... } // handoff: prograde has caught the kick attitude
pitch = Math.min(Math.PI / 2, Math.max(pro - lead, opt.kick)); // the nose sits `lead` above prograde
```

`pro` is the tilt of the velocity through the air from vertical, and `pitch`
is the nose's tilt from vertical, so `pro − lead` is a nose held `lead` above
the velocity. Zero reproduces the classic turn to the bit, and a test in
`test/ascent.test.ts` holds that a flight with `lead: 0` equals one with no
lead at all.

`optimiseTurn` does not add the lead as a third axis of the grid, which would
multiply the flights by the number of leads tried. It runs the two-parameter
search first, then tries `LEADS`, 3°, 6°, 10° and 15°, on a coarse grid round
the best two-parameter turn, then refines round the best of those:

```ts
const LEADS = [3, 6, 10, 15];
// ... after the two-parameter search and its refinement:
scan(
  range(lean.vKick - 20, lean.vKick + 20, 20),
  range(lean.kick - 4, lean.kick + 4, 4),
  [...leads],
);
const led = found.best || found.gentlest;
if (led && led.lead > 0)
  scan(
    range(led.vKick - 10, led.vKick + 10, 5),
    range(led.kick - 2, led.kick + 2, 1),
    range(led.lead - 2, led.lead + 2, 1),
  );
```

A few dozen flights rather than a thousand. Fifteen degrees is the most a pilot
holds a nose off the marker in air without the stack going sideways, and the
comment above `LEADS` says so.

The flight card turned the result into an instruction. Where it used to say
"switch SAS to prograde" it now says, when the lead is not zero, that the
prograde marker rises to N° below the nose at the handoff speed and altitude,
and to keep the nose N° above it from then on.

## What made it real

Issue #10 opened on the flown-in-game table. Five of the seven builds were
within 1% of the simulator's prediction, and the worst of the other two, a
low-thrust Minmus stack, was predicted at 3,964 m/s and flown for 2,750: 44%
over. The issue named the
cause, a two-parameter turn that cannot express what a pilot does when
thrust-to-weight is low, and it named the consequence beyond accuracy: the
solver minimises Δv, so a stack the model thinks is expensive to fly is a stack
it will not choose. An error in the simulator was steering the designs.

The six-Hammer Mainsail is the stack the fix was measured on. Its best classic
flight in the simulator today costs 4,404 m/s with 2,279 m/s of gravity loss;
with the lead it costs 4,223 with 1,954. A stack that already flew well, the
four-Twitch Spark rocket in the same test file, was unchanged: its best lead is
zero, and the third control costs nothing where the first two suffice. The
pairs in the README have not been re-flown in the game against the new
simulator, and #255 is the issue that tracks that.

## Where it breaks

- **A search pinned at its corner.** When the optimum lands on the edge of the
  grid, the model is missing a control, not a wider grid. The classic search's
  answer for the Mainsail stack was the smallest kick at the highest speed the
  grid offered; widening the grid would have found a smaller kick at a higher
  speed and the same fall-over.
  [A2](../../README.md#part-2--algorithms-and-the-solver) is about seeding a
  search and reading its edges.
- **Lead as a fourth grid axis.** Trying every lead at every kick and speed
  multiplies the flights by five. The solver seeds the lead search from the
  two-parameter answer and refines, which is why the interface still answers
  in under a second.
- **A floor that passed the stack.** The Mainsail at 0.88 after separation
  was admitted by a 0.85 floor whose comment said "if it is already fast and
  climbing" and never checked the second half. The lead makes such a stack
  flyable; the sustainer guard in
  [P3](../staging/thrust-to-weight-and-burn-time.md) decides whether it
  should be built at all.
- **Too much lead.** Fifteen degrees on the Mainsail stack costs 4,730 m/s, more
  than the classic turn. The brake can be set so hard the rocket climbs
  steeply on purpose, which is the thing the lead exists to avoid.

## Try it

Run the snippet. Then change `twr` from `1.4` to `1.8`, P9's brisk rocket. The
classic turn levels out at 22.6 km on its own; with a lead of 3° the rocket is
still 7° from level at 80 km, and with 6° it is nearly vertical at 333 km. A
brake on a rocket that does not need one only holds it steep. The control is
for the stack that needs it.

## Check yourself

<details><summary>A stack at a thrust-to-weight ratio of 1.4 holds its nose 6° above prograde. Past what tilt can gravity no longer swing the velocity while the lead is held, and why?</summary>

About 8.4°, from sin θ = TWR × sin L = 1.4 × sin 6°. At that tilt gravity's
across-track pull, g · sin θ, equals the thrust's across-track push, a · sin L,
and the velocity's direction stops changing.

</details>

<details><summary>The lead saved 325 m/s of gravity loss on the Mainsail stack and cost 17 m/s of steering loss. Why is the trade so lopsided?</summary>

Because steering loss goes as 1 − cos L, the square of a small angle, half a
percent of the thrust at 6°, while the gravity loss it prevents is 9.81 m/s for
every second the rocket would otherwise have spent near vertical. A small
angle buys a large change in when the rocket gets level.

</details>

<details><summary>Why did the two-parameter search answer "kick 3° at 140 m/s" for this stack, and what should that answer have told the reader?</summary>

Because every earlier or larger kick fell over and crashed, and 3° at 140 m/s
was the most vertical flight the grid contained. An optimum at the corner of a
search grid usually means the model lacks a control, not that the grid is too
small.

</details>

## Further reading

- The KSP wiki, _Tutorial: Gravity turn_, and the community's threads on flying
  low-TWR stacks, for what "hold the nose above the marker" feels like at the
  controls.
- Howard Curtis, _Orbital Mechanics for Engineering Students_, the chapter on
  rocket vehicle dynamics, for the equations with a thrust angle kept.
- Issue #10 in this repository, for the measured miss and the reasoning that
  led here.

## Key takeaway

Following prograde only turns a rocket that is accelerating; near a
thrust-to-weight ratio of 1 the nose has to lead the velocity, which brakes
the swing at sin θ = TWR × sin L, and a search without that control will always
answer "go straight up" and price the stack as if it had.

_As of 90eb355._

# Measured against the game

**Syllabus:** [V5](../../README.md#part-4--verification)

**Why it matters:** The flown table matters because every other check in
this repository compares the model with itself, a design with yesterday's
design, a page with yesterday's page, and none of them can say whether a
rocket the tool sizes would reach orbit in the game; seven builds were
flown in Kerbal Space Program and compared with the prediction, five landed
within one percent and two missed, one by 44 percent, and those two misses
are what drove the third turn parameter and the costing of circularisation
to completion, after which the predicted column changed and the pairs have
not been re-flown, so the model's claim to describe the game rests on
exactly that table, its date and its caveats.

**Before this:**
[P6](../../physics/ascent/gravity-drag-and-steering-losses.md), _Gravity,
drag and steering losses_.

## A worked case

Read the table out of the README and recompute its last column:

| Build               | Predicted m/s | Flown m/s | Error  |
| ------------------- | ------------- | --------- | ------ |
| 2x Thud + Terrier   | 3,678         | 3,688     | −0.3%  |
| Cheapest + boosters | 3,594         | 3,569     | +0.7%  |
| Cheapest updated    | 3,751         | 3,720     | +0.8%  |
| Mun 3-stage         | 4,115         | 4,134     | −0.5%  |
| Small probe         | 4,183         | 4,151     | +0.8%  |
| Minmus, 4 Kickbacks | 3,539         | 3,293     | +7.5%  |
| Minmus, low TWR     | 3,964         | 2,750     | +44.1% |

Seven builds, five within one percent, the five with a mean absolute error
of 0.61 percent and a worst of 0.83. The other two share a cause the README
names: a two-parameter turn, a kick angle and a kick speed and prograde
thereafter, cannot express the ascent a pilot flies when thrust-to-weight
is low, where the pitch is adjusted continuously and the nose held above
prograde. The 44 percent row is a stack with liftoff thrust-to-weight near
1.3 and an upper stage under 1.0; the model flew it lofted and sluggish
where the pilot did not.

Then the table's history, which is as much a part of the measurement as
the numbers. It was committed with the first import of the project on
2026-08-25 and has not changed since. On 2026-09-08 the paragraph under it
was added, with the third turn parameter (#173): the pairs were flown
against an earlier simulator; since then the circularisation is costed to
completion (#170) and the turn holds the nose above prograde (#10), both of
which change the predicted column; and the fitting of adapters, plates and
boosters has moved several times, so the tool would not necessarily propose
the same stacks today. Issue #255 tracks re-flying the low-TWR pair and is
open.

```ts
// save as test/v5.test.ts and run: npx vitest run test/v5.test.ts --reporter=verbose
import { test } from "vitest";
import { readFileSync } from "node:fs";

test("the flown table, recomputed", () => {
  const md = readFileSync("README.md", "utf8"); // § What it gets right, and what it does not
  const rows = [
    ...md.matchAll(
      /^\| (.+?)\s+\| (\d+)\s+\| (\d+)\s+\| \*{0,2}([+-][\d.]+%)\*{0,2}\s+\|$/gm,
    ),
  ].map((m) => ({
    build: m[1].trim(),
    predicted: +m[2],
    flown: +m[3],
    stated: m[4],
  }));
  for (const r of rows) {
    const err = (100 * (r.predicted - r.flown)) / r.flown;
    console.log(
      `${r.build.padEnd(20)} ${r.predicted} predicted, ${r.flown} flown: ${err >= 0 ? "+" : ""}${err.toFixed(1)}% (the README says ${r.stated})`,
    );
  }
  const within = rows.filter(
    (r) => Math.abs(r.predicted - r.flown) / r.flown < 0.01,
  );
  const errs = within.map(
    (r) => (100 * Math.abs(r.predicted - r.flown)) / r.flown,
  );
  console.log(
    `${rows.length} builds, ${within.length} within 1%: mean |error| ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2)}%, worst ${Math.max(...errs).toFixed(2)}%`,
  );
});
```

## The idea

A model of a game is checked against the game or it is not checked at all.
The design snapshot, the mission sweep, the model checks and the visual
suite all hold the tool to its own earlier output; they catch a change, and
they are blind to a constant that was always wrong. The only measurement
that can see that is to build what the tool proposes, fly it in the game,
read the Δv the flight actually spent, and compare. It is expensive, it is
manual, it needs the game installed and a person at the controls, and it
cannot run in CI, which is exactly why it is rare and why the table of it
has to be kept as carefully as a baseline.

Three things make such a table trustworthy. It records what was compared,
build by build, with the prediction and the flown number side by side, so
the error is a fact anyone can recompute rather than a summary. It records
its own date and which version of the model made the predictions, because
a model that changes after the flights turns the predicted column into a
statement about a program that no longer exists; the honest form is the
README's, the table kept and a paragraph under it saying what has changed
since and that the pairs have not been re-flown. And it keeps the misses.
The two rows that failed are the most valuable in the table: they are where
the model was wrong, they say by how much, and they carry the diagnosis
that drove the fix. A table of only the successes is advertising.

The misses did what a measurement should. The 44 percent row named a
structural limit, not a mistuned constant: no choice of two parameters
could fly that stack the way a pilot does, and because the solver minimises
Δv, a stack the model thought expensive to fly was a stack it would not
choose, so an error in the simulator was steering the designs. The fix was
a third parameter, the nose held above prograde
([P10](../../physics/ascent/why-low-thrust-needs-the-nose-above-prograde.md)),
measured on a six-Hammer Mainsail whose best flight fell from 4,404 m/s to
4,223 with 325 m/s less gravity loss, and unchanged on a stack that already
flew well. And #170, found on a rocket that passed the flown-cost check
having run its last stage dry short of orbit, changed how the
circularisation is costed
([P13](../../physics/orbits/vis-viva-and-circularising.md)). Both change
the predicted column. Neither has been flown.

```
   every other check:  the model today  ◄──compare──►  the model yesterday      (a change is caught; a wrong constant is not)
   the flown table:    the model, 2026-08-25  ◄──compare──►  the game            (seven builds; five within 1%, two misses)
                             │
                             ├── #10, #173: a third turn parameter     ─┐  the predicted column has moved;
                             └── #170: circularisation to completion   ─┘  the pairs have not (#255 open)
```

So the row's phrase is exact: the model's credibility is that table.
Everything else in Part 4 says the model has not drifted from itself.
Seven flights say how far it was from the game on one date, and the
paragraph under them says why that distance is not known today.

## In this codebase

[`README.md`](../../../../README.md) § _What it gets right, and what it
does not_ is the table and its caveats, and the only place the flights are
recorded. The two misses' consequences are in the code:
`optimiseTurn` in `src/core/ascent.ts` searches a third control, the lead
above prograde, since #173, and `planMission` prices the circularisation
to completion since #170; the lessons for [P10](../../physics/ascent/why-low-thrust-needs-the-nose-above-prograde.md)
and [P13](../../physics/orbits/vis-viva-and-circularising.md) carry the
measurements of each fix, taken in the simulator, not in the game. The
_Known gaps_ list beneath the table is the rest of the honesty: what the
turn search prefers, what is not priced, which parts carry no cost. And
[`.claude/rules/verification.md`](../../../../.claude/rules/verification.md)
ends its account of the suites with what none of them reach; the game is
first on that list by implication, because no suite here starts it.

## What made it real

The table is the measurement, and the snippet recomputes it: seven rows,
five within one percent at a mean of 0.61, two misses of 7.5 and 44.1. The
history is in `git log`: the table arrived with the import on 2026-08-25 and
the caveat paragraph with #173 on 2026-09-08. The fixes the misses drove
have measurements of their own, in the simulator: 4,404 to 4,223 m/s on the
six-Hammer Mainsail for the third parameter, and the Torch rocket of #170
that passed at what it had spent and, costed to completion, did not. What
is not measured is written down as such: the pairs have not been re-flown,
the tool would not propose the same stacks, and #255 is open.

## Where it breaks

- **Believing the internal checks measure the game.** They measure drift
  from yesterday. A constant wrong since the first commit passes every one
  of them.
- **A predicted column from a model that has moved.** After #10 and #170
  the predictions are of a program that no longer exists. Say so under the
  table, and re-fly before quoting the errors as current.
- **Dropping the misses.** The 44 percent row is the diagnosis; without it
  the table is a claim, not a measurement.
- **Re-flying the same seven.** The fitting of adapters, plates and
  boosters has moved; the tool may not propose those stacks. A re-flight
  starts from what it proposes today.
- **Reading five within one percent as the model's accuracy.** Five stacks
  with healthy thrust-to-weight, on one date, at Kerbin. The table says
  nothing about Duna, about a low-thrust core, or about today.

## Try it

Run the snippet. Then open the tool, ask for a light payload to low orbit
on the cost objective, and read the Δv its flight card says the ascent
needs; if you have the game, build that stack and fly it, and add the row.
Then read #255 and decide what the re-flight of the low-TWR pair would
have to hold constant for its number to be comparable with the old one.

## Check yourself

<details><summary>Every suite in Part 4 is green. What does that say about whether a proposed rocket reaches orbit in the game?</summary>

Nothing directly. The suites compare the model with its own earlier output
and catch changes; a constant wrong from the first commit passes all of
them. Only a flight in the game compares the model with the game, and the
table of seven is the whole of that evidence.

</details>

<details><summary>Why is the 44 percent row still in the README after the fault it exposed was fixed?</summary>

Because it is the measurement that found the fault and the record of its
size, and because the fix has not been flown: the predicted column is from
the old simulator, so removing or updating the row without a new flight
would replace a measurement with a claim. The paragraph under the table
says what changed and that the pairs have not been re-flown; #255 tracks
the re-flight.

</details>

<details><summary>The five good rows average 0.61 percent error. What would be wrong with quoting that as the model's accuracy?</summary>

Five builds with healthy thrust-to-weight, flown to low Kerbin orbit, on
one date, against a simulator that has since changed in two places. The
number describes those flights. It does not describe a low-thrust core,
another body, or the model as it stands today.

</details>

## Further reading

- The README's own _Known gaps_ list, for the limits the table's authors
  knew about when they wrote it.
- Any text on model validation as distinct from verification: verification
  asks whether the code does what the model says, validation whether the
  model describes the world.
- The KSP community's Δv maps and ascent guides, which are the figures the
  flown column was measured against in practice.

## Key takeaway

Every internal check compares the model with itself, so the only evidence
the model describes the game is the table of seven flights, five within
one percent and two misses that drove the fixes; kept with its date, its
misses and a paragraph saying the simulator has since changed and the pairs
have not been re-flown, it is a measurement, and without any of those it
would be a claim.

_As of 9302248._

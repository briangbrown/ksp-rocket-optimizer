# Reference — categories, why the shape is what it is, and what goes wrong

Read this when you are unsure where a lesson belongs, why a section exists, or
what a good one reads like. `SKILL.md` is the workflow; this is the detail.

## Categories

| Category       | What lives there                                         | Topics it has or would have                           |
| -------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `physics`      | orbital mechanics, atmospheres, ascent, transfer windows | `patched-conics`, `lambert`, `ascent`, `ephemeris`    |
| `solver`       | staging, tank and engine selection, the candidate walk   | `tank-packing`, `the-walk`, `boosters`, `slenderness` |
| `renderer`     | three.js, GLSL, cameras, the build view                  | `framing`, `shaders`, `per-frame-cost`                |
| `ui`           | React, layout, the design system, accessibility          | `layout-budgets`, `type-roles`, `overlays`            |
| `architecture` | the three layers, the `planMission` seam, workers        | `the-seam`, `workers`, `caching`                      |
| `verification` | what the suites reach and what they cannot               | `snapshots`, `jsdom-limits`, `flakes`                 |
| `part-data`    | provenance, measurement, the two art tables              | `drag-cubes`, `art-regimes`                           |
| `typescript`   | language-level patterns this codebase leans on           | `narrowing`, `plain-data`                             |

The category is the part of the system the _idea_ belongs to, not the file you
happened to edit. A lesson about why a jsdom test could not have caught
something is `verification`, even though the fix was in `src/ui/`. Eight
categories cover the system; reaching for a ninth usually means the lesson is
really about one of the eight.

The syllabus's four parts — physics, algorithms and the solver, language and
platform, verification — are the reading order. The categories are the filing.
A row in Part 2 may file under `solver` or `architecture`; a row in Part 3 under
`ui`, `renderer`, `typescript` or `architecture`.

## Why the sections are in this order

The shape is not arbitrary. Each section stands in for a finding about how
people learn, and knowing which is which tells you what the section must do.

- **_Why it matters_ as a because-sentence.** Hulleman and Harackiewicz (2009)
  had students write how course material connected to their own lives; that
  beat summarising it for predicting later interest. The sentence exists to
  give the reader a stake before the work starts, and a sentence about _where_
  the idea applies does not do that. A sentence about what would go wrong
  without it does.
- **Concrete before abstract, in a concept lesson.** Fyfe, McNeil, Son and
  Goldstone (2014) call it concreteness fading: start with the concrete case,
  then the general idea. A moment lesson gets this for free — the reader just
  did the concrete thing — so it can open with the idea. A concept lesson has
  to supply the case itself, which is why _A worked case_ comes first and _The
  idea_ second, and never the other way round.
- **_In this codebase_.** Brown, Collins and Duguid (1989) on situated
  cognition: knowledge abstracted from the situation it was learned in transfers
  worse. The section ties the idea to a place the reader can go and a thing they
  can run.
- **_Check yourself_ and _Try it_.** Roediger and Karpicke (2006): being tested
  beats rereading for retention a week later, though the rereaders felt more
  confident. Dunlosky and colleagues (2013) rated practice testing high-utility
  and rereading low. Questions answered from memory are the difference between
  a lesson that was read and one that was learned.
- **The tree.** Bower, Clark, Lesgold and Winzenz (1969): recall from a nested
  hierarchy was two to three times that from a flat list. Chi, Feltovich and
  Glaser (1981): experts sort problems by principle, novices by surface. The
  category and topic are the principle; the syllabus row is the surface.
- **Spacing**, which nothing here does yet. Cepeda and colleagues (2006):
  practice spread over days beats the same practice massed. A review skill that
  picks a lesson due and asks its _Check yourself_ questions is the missing
  piece, and the questions are written so it can be built.

The findings are from classrooms and labs, on verbal and mathematical material,
not on programmers reading about rockets. The mechanisms are plausible here;
the effect sizes are not to be quoted as if they were measured here.

## The moment lesson: a worked example

The one lesson written before this skill's rules existed, from #223, rewritten
to them in #323. It is
`docs/lessons/physics/patched-conics/energy-not-excess-velocity-b80e959.md`,
quoted whole; the original is in that file's history.

> # Characteristic energy, not excess velocity
>
> **Concept:** [P18](../../README.md#part-1--physics), _Ejection: characteristic
> energy and the hyperbolic leg_.
>
> **Why it matters:** Pricing a departure from its excess velocity matters
> because a moon's sphere of influence is so small that a ship can leave it still
> bound to the moon, and a formula that cannot express a bound departure prices
> every moon window at escape velocity instead of at what the window costs.
>
> ## The idea
>
> When a ship climbs away from a body, the speed it has left once the body's
> pull is spent is its **excess velocity**, v∞. It is the convenient number for
> the leg that follows, but it exists only if the ship escapes. What always exists
> is the **characteristic energy**, C3 = v² − 2μ/r: twice the ship's orbital
> energy per unit mass, equal to v∞² when the ship escapes and negative when it
> does not. Written in energy, the departure burn costs the same algebra when v∞
> exists and stays correct when it does not.
>
> ## In this codebase
>
> KSP hands a ship from one body to the next at the edge of the **sphere of
> influence**, the region in which only that body's gravity is counted, whether
> or not the ship has out-climbed the body's pull. The Mun's sphere ends at 20% of
> its orbital radius, so a ship leaving the Mun for Minmus crosses the edge still
> on a **bound orbit**, a closed one that would bring it back, and its v∞ is
> imaginary. `atInfinity` in `src/core/transfer.ts` computed
> `sqrt(max(0, v² − 2μ/r))`, and the floor at zero turned every such departure
> into one at exactly escape velocity, whatever the window asked for. `c3Of` now
> returns the signed energy and `injectC3` spends it:
>
> ```ts
> const c3Of = (vrel: number, mu: number, rSoi: number) =>
>   vrel * vrel - (2 * mu) / rSoi;
>
> const injectC3 = (v: number, c3: number) =>
>   Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;
> ```
>
> The remaining `max` guards against a nonsensical **parking orbit**, the low
> orbit a ship waits in before it departs; it is not a physical floor. 2v² + C3 is
> the square of the speed at the bottom of the departure path, and it is positive
> for any orbit inside the sphere.
>
> ## What made it real
>
> The Mun's escape speed at the edge of its sphere is 232 m/s, and every Mun
> departure the tool priced came out at 231 m/s: `sqrt(2μ/r) − v_circ`, a number
> with nothing to do with the window. Priced from energy, the same departure is
> 214 m/s. All 84 windows between planets, where v∞ is real, stayed identical to
> the last digit, which is what proved the rewrite changed the moons and nothing
> else.
>
> ## Key takeaway
>
> When a formula floors a value to keep it real, ask what the floored case
> physically is; it is often a valid state the model simply cannot express.

What to notice. The title states the insight, and the _Concept_ line under it
says which syllabus row it is an instance of: the id links back to the
syllabus, the title will link to P18's lesson once that exists. Those are two
different things in two places. _Why it matters_ is one sentence with a because, and the because is a
consequence for the application. Excess velocity, characteristic energy,
sphere of influence, bound orbit and parking orbit are each defined in the
sentence that first uses them, briefly, because the lesson that owns them
(P18, P16, P19) is not yet written; once it is, those definitions become links.
The idea is stated so it holds for any patched-conic model, not only this one.
_What made it real_ has the wrong number, the right number, and the number that
proved nothing else moved. There is no debugging story and no list of files.

## The concept lesson: the worked example

The calibration piece is P9, the gravity turn, at
`docs/lessons/physics/ascent/the-gravity-turn.md`. Until it exists this section
is a placeholder; once the user has accepted it, quote its _A worked case_ and
_Check yourself_ sections here as the model.

## Failure modes

- **A moment lesson for a reader who had no moment.** The first attempt to
  write lessons from the pull-request history produced eighty-five of them, all
  sharp abstractions about a bug nobody reading had met. Withdrawn in #321. If
  the reader did not do the work, write a concept lesson or nothing.
- **An aphorism for a title.** "Refuse a Bomb Before Holding It" is memorable
  once you know what it means, and useless in a table of contents before that.
- **_Why it matters_ that says where, not why.** "Any time X is done" leaves the
  reader waiting for the because. Write the consequence for the application.
- **A term used before it is defined**, or defined in a lesson that does not own
  it. The syllabus's _Defines_ column is the authority; check it.
- **A summary wearing a lesson's clothes.** "We added a search over departure
  longitude and it now works" teaches nothing. Why was the first bracket wrong,
  and what does that tell you about seeding a search?
- **A rule filed as a lesson.** If it is a trap that will bite again, it belongs
  in `.claude/rules/<area>.md`, where it loads for whoever opens that code. A
  lesson nobody reads at the moment of danger is not a guard.
- **A lesson with no measurement** in a repository that decides arguments with
  measurements. If nothing was measured, say so, and say what reasoning stands
  in its place.
- **Abstract first in a concept lesson.** The reader has nothing to attach the
  idea to. Worked case first, always.
- **Writing a concept lesson without reading its prerequisites.** The reader
  following the order has read them; teaching them again wastes their time and
  drifts from the owner's definitions.
- **Written before the commit**, so a moment lesson's hash names the wrong
  change.

## Where lessons sit against the rest of the documentation

`docs/design.md` is the reference for how the interface is built and must stay
true as the code changes. `.claude/rules/` are the traps, loaded by area, and
must stay short. Moment lessons are neither: dated by their hash, never
updated, a record of what was understood at that commit. Concept lessons are
closer to `docs/design.md`: they carry an _As of_ line and are revised when the
code they point at moves. Nothing else should link to a moment lesson as though
it were current documentation.

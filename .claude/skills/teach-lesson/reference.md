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

The first lesson in the repository, from #223 —
`docs/lessons/physics/patched-conics/energy-not-excess-velocity-b80e959.md`.
Read it whole; it is quoted here in part. It predates the rule that _Why it
matters_ is a full sentence with a because, and its opener is the kind the rule
now forbids: it says where, not why.

> # Energy, Not Excess Velocity
>
> **Why it matters:** any time a patched-conic transfer is priced, and
> especially when the body being left is small next to its own sphere of
> influence.
>
> ## The concept
>
> The excess velocity v∞ is what a ship has left after climbing entirely out of
> a body's gravity well. It is a convenient number because it is what the
> heliocentric leg sees, but it only exists when the ship can actually escape.
> The quantity that always exists is the characteristic energy, C3 = v² − 2μ/r,
> which is _signed_: negative means a bound orbit. Writing the burn in energy
> costs nothing when v∞ exists — the algebra is the same — and stays correct
> when it does not.
>
> ## What made it real
>
> The Mun's sphere of influence is 20% of its orbital radius and its boundary
> escape speed is 232 m/s. Every moon ejection came out at exactly 231 —
> `sqrt(2μ/r) − v_circ`, a number with nothing to do with the window. The real
> figure is 214. All 84 planetary windows stayed identical to the last digit,
> which is what proved the rewrite was a rewrite and not a change.

Under today's rules the opener would read: "Pricing a departure from its
excess velocity matters because a moon's sphere of influence is so small that
the ship leaves it still bound, and a formula that cannot express a bound
departure prices every moon window at escape velocity instead." And the title
would state the insight: "Characteristic energy, not excess velocity". The
concept it applies is the syllabus's P18, and that is what the _Concept_ line
is for.

What it does right, and what a moment lesson must keep: one idea, the place it
bit, and the number that settled it. No debugging story, no list of files.

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

# Reference — categories, a worked example, and what goes wrong

Read this when you are unsure where a lesson belongs, or what a good one reads
like. `SKILL.md` is the workflow; this is the detail behind it.

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
something is `verification`, even though the fix was in `src/ui/`.

## A worked example

The first lesson in the repository, from #223 —
`docs/lessons/physics/patched-conics/energy-not-excess-velocity-b80e959.md`.
Read it whole; it is quoted here in part:

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
> ## In this codebase
>
> `atInfinity` in `src/core/transfer.ts` computed `sqrt(max(0, v² − 2μ/r_soi))`.
> The floor at zero was doing real work only for moons: KSP hands a ship over at
> the sphere's boundary whether or not it out-climbed the well, so a Mun → Minmus
> departure legitimately leaves on a _bound ellipse_. Flooring that at zero threw
> the transfer away and left bare escape velocity in its place. `c3Of` returns
> the signed value now, and `injectC3` spends it.
>
> ## What made it real
>
> The Mun's sphere of influence is 20% of its orbital radius and its boundary
> escape speed is 232 m/s. Every moon ejection came out at exactly 231 —
> `sqrt(2μ/r) − v_circ`, a number with nothing to do with the window. The real
> figure is 214. All 84 planetary windows stayed identical to the last digit,
> which is what proved the rewrite was a rewrite and not a change.
>
> ## Key takeaway
>
> When a formula floors a value to keep it real, ask what the floored case
> physically is — it is often a valid state the model simply cannot express.

Note what it does not do. It does not recount the debugging, name the pull
request, or list the files touched. It explains one idea, shows where the idea
bit, and gives the number that settled it.

## Failure modes

- **A summary wearing a lesson's clothes.** "We added a search over departure
  longitude and it now works" teaches nothing. Why was the first bracket wrong,
  and what does that tell you about seeding a search?
- **A rule filed as a lesson.** If it is a trap that will bite again, it belongs
  in `.claude/rules/<area>.md`, where it loads for whoever opens that code. A
  lesson nobody reads at the moment of danger is not a guard.
- **A lesson with no measurement** in a repository that decides arguments with
  measurements. If nothing was measured, say so, and say what reasoning stands
  in its place.
- **Category invention.** Eight categories cover the system. Reaching for a
  ninth usually means the lesson is really about one of the eight.
- **Written before the commit**, so the hash names the wrong change.

## Where lessons sit against the rest of the documentation

`docs/design.md` is the reference for how the interface is built and must stay
true as the code changes. `.claude/rules/` are the traps, loaded by area, and
must stay short. Lessons are neither: they are dated by their hash, they are
never updated, and they may be read years later as a record of what was
understood at that commit. Nothing else should link to them as though they were
current documentation.

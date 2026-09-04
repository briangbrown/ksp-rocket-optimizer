# KSP Mission Planner

A React app that designs Kerbal Space Program rockets for a given mission, then
flies the ascent to check the design actually works.

Point it at a destination and a payload; it picks engines, tanks, boosters and
structure from your researched parts, sizes the stages, and simulates the launch.
The result is drawn in a 3D build view that steps through the staging, written
into the address so a design is a link, and solved on a Web Worker where the
browser has one. The page follows the OS between a light and a dark theme.

## What it models

**Parts, from the real configs.** Engine thrust and mass flow use each engine's
`atmosphereCurve`, interpolated the way KSP does it. Part heights and frontal
areas come from measured drag cubes rather than nominal diameters, so a Twitch is
0.29 m across and not 1.25. Heat shield masses include ablator. Engine plate
shrouds are picked by the height of the engine underneath.

**Drag, from Physics.cfg.** The full curve chain — `DRAG_CD`, `DRAG_CD_POWER`,
`DRAG_TIP`, `DRAG_MULT`, `DRAG_REYNOLDS` — against per-body atmosphere splines
taken from Kopernicus. The payload's own frontal area counts, which matters on
small rockets where it is the widest thing aboard.

**Ascent, integrated.** Semi-implicit Euler at 0.1 s steps through a
two-parameter gravity turn, with a grid search over kick speed and kick angle
plus a refinement pass. Solids burn
through cutoff because they cannot be shut down. The coast is Keplerian and the
circularisation is integrated rather than treated as an impulse.

## What it gets right, and what it does not

Seven builds have been flown in game and compared against the prediction:

| Build               | Predicted | Flown | Error    |
| ------------------- | --------- | ----- | -------- |
| 2x Thud + Terrier   | 3678      | 3688  | -0.3%    |
| Cheapest + boosters | 3594      | 3569  | +0.7%    |
| Cheapest updated    | 3751      | 3720  | +0.8%    |
| Mun 3-stage         | 4115      | 4134  | -0.5%    |
| Small probe         | 4183      | 4151  | +0.8%    |
| Minmus, 4 Kickbacks | 3539      | 3293  | +7.5%    |
| Minmus, low TWR     | 3964      | 2750  | **+44%** |

These pairs still stand as evidence about the **ascent simulator**, whose
physics has not changed since — it has been retyped and refactored with the
baselines byte-identical. They no longer necessarily describe what the tool
would propose today: the pairs were flown before the adapter, plate and booster
fitting moved (#65, #87, #88, #109, #118, #121), and the optimiser now rejects
some stacks it used to build and picks heavier ones instead. Re-flying would be
needed to say whether the affected builds still land this close.

Five within 1%. The two misses share a cause: **the two-parameter turn cannot
express the ascent a person actually flies when thrust-to-weight is low.** A
pilot adjusts pitch continuously; this model has a kick angle, a kick speed, and
prograde thereafter. On a stack with liftoff TWR near 1.3 and an upper stage
below 1.0 that produces a lofted, sluggish climb, and no choice of those two
parameters fixes it.

That limitation has a second symptom: very light payloads produce stages the
simulator cannot fly to orbit at all, so their ascent goes unverified.

## Known gaps

- Making History and ReStock+ are both toggles in the setup sheet. Making
  History is off by default, and seventeen of its tanks carry no price.
- Asparagus staging is opt-in, a switch in the brief that appears once a
  crossfeed part is researched. With it on, the solver takes it where mass is
  the objective; on cost or parts a side stack costs an engine and plain drop
  tanks or solids win.
- The turn search minimises ascent delta-v under a max-Q cap, so it prefers
  lofted trajectories that are near-optimal on paper and awkward to fly.
- Waiting is not priced. Timing a plane change at a node is nearly free in
  delta-v and can cost you a 24-day wait; the tool only sees the delta-v.

## Layout

    src/data/       part tables, bodies, curves — JSON, no logic
    src/core/       the solver and the physics. No React, no DOM.
    src/ui/         the application
    src/ui/solver.worker.ts, unit.worker.ts   the solve off the main thread, and its shards
    src/main.tsx    mounts it
    index.html      the shell, and the fonts it preloads from public/fonts/
    test/           the checks — see How it is verified
    visual/         the checks that need a real browser — see How it is verified
    perf/           solver benchmarks, deliberately outside CI
    docs/optimiser-flow.mermaid    how the search works, and where simulation enters
    docs/design.md                 the design guide: type, colour, space, components, the a11y bar
    .claude/rules/  the traps, split by the code they apply to
    .claude/typescript-style-guide.md   the conventions, and the four this project breaks

`src/core/plan.ts` is the seam: `planMission()` takes a destination and a payload
and returns solved stages. Everything crossing it is plain data, which is what
lets the solver run on a Web Worker today — it does, with an in-process
fallback — and what would let the Rust/WASM port that is the reason the
boundary looks like this stand behind it tomorrow.

Part data was extracted from a Squad 1.12.5 + Breaking Ground + ReStock+ install
and is not re-derived at runtime; the Making History parts sit in the same
tables alongside, off by default. It lives in `src/data/*.json` so that a
native port can embed the same files rather than keeping a second copy.

## How it is verified

The characteristic failure here is silent: a change that is meant to preserve
behaviour quietly designs a different rocket. One refactor believed to be
harmless altered 31 of 72 designs without erroring. So the primary check is a
**design snapshot** — 81 configurations of tech tier, payload, delta-v budget
and objective, solved and compared against a committed baseline part by part,
every number to four decimals. 66 build; the other 15 are legitimately
unbuildable at that tech level.

Around it, a **mission sweep** solves sixteen whole missions the way the
application asks for them and pins the design each one delivers — which is not
the same thing, because the app flies the candidates through the ascent
simulator and takes the first that works. Thirteen are the plain missions, one
of them cut into segments, which was the only way to reach a whole branch of the
slenderness constraint; the other three run one Mun mission with crossfeed on,
once per objective, so asparagus has a baseline too; a **render sweep** drives
the app
across every destination, objective and profile and fails on a bad number
reaching the text or a destination quietly ceasing to produce a design; and a
set of **model checks** asks of the shapes the build view draws — at every
staging step — that no two overlap, that none reaches past the width the solver
sized the stage at, and that the whole stands as tall as the slenderness limit
was applied to, which is where the drawing and the geometry have drifted apart
three separate times.

Alongside them, a **visual suite** builds the application and drives it through
a real WebGL context in headless Chrome, because jsdom implements none and the
3D build view is therefore invisible to everything above. In the same browser a
**layout suite** measures the UI's budgets at a phone's width and a desktop's
— page height, visible words, target size, type floor, overflow, keyboard
reach, what axe objects to — and holds each to the number it measured the day
it was written. Both run separately from `npm test`.

A green build still says nothing about a solver change that these cannot see.
`.claude/rules/verification.md` records what each check reaches and what it
does not.

## Running it

    npm install
    npm run dev        # dev server with hot reload
    npm run build      # production build into dist/
    npm run preview    # serve the production build

    npm test           # the whole suite, about two minutes
    npm run test:bless # accept the solver's current output as the baseline
    npm run test:visual # the build view drawn, and the layout measured, in a real browser
    npm run typecheck  # tsc — the only type gate; vite and vitest strip types unchecked
    npm run lint       # eslint, one rule: no-undef
    npm run format     # prettier; format:check is what CI runs
    npm run perf       # solver benchmarks — perf/README.md has the rest

CI runs `format:check`, `lint`, `typecheck`, `test` and `build`, and the visual
and layout suites in a second job.

Requires Node 24 or newer. Dependencies are React, Vite, lucide-react for the
icons, and three.js — the last loaded only when the build view first draws, so
it is not in the bundle that gets you to a solved rocket.

This began as a single self-contained component written in a Claude artifact.
It is not one any more — it is a Vite application with a tested solver — and the
"drop it into any React project" property has been given up deliberately, in
exchange for a boundary the solver can be lifted out through.

# KSP Mission Planner

A React app that designs Kerbal Space Program rockets for a given mission, then
flies the ascent to check the design actually works.

Point it at a destination and a payload; it picks engines, tanks, boosters and
structure from your researched parts, sizes the stages, and simulates the launch.

## What it models

**Parts, from the real configs.** Engine thrust and mass flow use each engine's
`atmosphereCurve`, interpolated the way KSP does it. Part heights and frontal
areas come from measured drag cubes rather than nominal diameters, so a Twitch is
0.29 m across and not 1.25. Heat shield masses include ablator. Engine plate
shrouds are picked by the height of the engine underneath.

**Drag, from Physics.cfg.** The full curve chain — `DRAG_CD`, `DRAG_CD_POWER`,
`DRAG_TIP`, `DRAG_MULT` — against per-body atmosphere splines taken from
Kopernicus. The payload's own frontal area counts, which matters on small
rockets where it is the widest thing aboard.

**Ascent, integrated.** RK4 at 0.1 s through a two-parameter gravity turn, with a
grid search over kick speed and kick angle plus a refinement pass. Solids burn
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

These pairs still stand as evidence about the **ascent simulator**, which has
not changed. They no longer necessarily describe what the tool would propose
today: a fix to the adapter fitting means the optimiser now rejects some stacks
it used to build, and picks heavier ones instead. Re-flying would be needed to
say whether the affected builds still land this close.

Six within 1%. The two misses share a cause: **the two-parameter turn cannot
express the ascent a person actually flies when thrust-to-weight is low.** A
pilot adjusts pitch continuously; this model has a kick angle, a kick speed, and
prograde thereafter. On a stack with liftoff TWR near 1.3 and an upper stage
below 1.0 that produces a lofted, sluggish climb, and no choice of those two
parameters fixes it.

That limitation has a second symptom: very light payloads produce stages the
simulator cannot fly to orbit at all, so their ascent goes unverified.

## Known gaps

- Making History parts are excluded; ReStock+ is supported and toggleable.
- Asparagus staging is modelled but almost never chosen, because a side stack
  costs an engine and drop tanks buy the same mass-shedding for free.
- The optimiser minimises delta-v, so it prefers lofted trajectories that are
  near-optimal on paper and awkward to fly.
- Waiting is not priced. Timing a plane change at a node is nearly free in
  delta-v and can cost you a 24-day wait; the tool only sees the delta-v.

## Layout

    src/data/       part tables, bodies, curves — JSON, no logic
    src/core/       the solver and the physics. No React, no DOM.
    src/ui/         the application
    src/main.jsx    mounts it
    test/           the checks — see How it is verified
    perf/           solver benchmarks, deliberately outside CI
    docs/optimiser-flow.mermaid    how the search works, and where simulation enters

`src/core/plan.js` is the seam: `planMission()` takes a destination and a payload
and returns solved stages. Everything crossing it is plain data, so the solver
behind it can be replaced — a Web Worker, or the Rust/WASM port that is the
reason the boundary looks like this.

Part data was extracted from a Squad 1.12.5 + Breaking Ground + ReStock+ install
and is not re-derived at runtime. It lives in `src/data/*.json` so that a native
port can embed the same files rather than keeping a second copy.

## How it is verified

The characteristic failure here is silent: a change that is meant to preserve
behaviour quietly designs a different rocket. One refactor believed to be
harmless altered 31 of 72 designs without erroring. So the primary check is a
**design snapshot** — 81 configurations of tech tier, payload, delta-v budget
and objective, solved and compared against a committed baseline part by part,
mass to four decimals and delta-v to three. 66 build; the other 15 are
legitimately unbuildable at that tech level.

Around it, a **mission sweep** solves twelve whole missions the way the
application asks for them and pins the design each one delivers — which is not
the same thing, because the app flies the candidates through the ascent
simulator and takes the first that works; a **render sweep** drives the app
across every destination, objective and profile and fails on a bad number
reaching the text or a destination quietly ceasing to produce a design; and a
**panel-containment check** reads the SVG in the build view and asserts every
part lies inside its panel at every staging step, which is where the drawing and
the geometry have drifted apart three separate times.

A green build still says nothing about a solver change that these cannot see.
`CLAUDE.md` records what each check reaches and what it does not.

## Running it

    npm install
    npm run dev        # dev server with hot reload
    npm run build      # production build into dist/
    npm run preview    # serve the production build

    npm test           # the whole suite, about a minute and a half
    npm run format     # prettier

Requires Node 24 or newer. Dependencies are React and Vite alone.

This began as a single self-contained component written in a Claude artifact.
It is not one any more — it is a Vite application with a tested solver — and the
"drop it into any React project" property has been given up deliberately, in
exchange for a boundary the solver can be lifted out through.

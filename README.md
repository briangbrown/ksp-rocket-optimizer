# KSP Mission Planner

A single-file React app that designs Kerbal Space Program rockets for a given
mission, then flies the ascent to check the design actually works.

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

    src/ksp-mission-planner.jsx    the whole application, self-contained
    src/main.jsx                   mounts the component
    index.html                     page shell
    docs/optimiser-flow.mermaid    how the search works, and where simulation enters

Part data is inline in the source. It was extracted from a Squad 1.12.5 +
Breaking Ground + ReStock+ install and is not re-derived at runtime.

## Running it

    npm install
    npm run dev        # dev server with hot reload
    npm run build      # production build into dist/
    npm run preview    # serve the production build

Requires Node 24 or newer. Dependencies are React and Vite alone — tank and part
tables, atmosphere splines, and the tech tree are all constants in the source.

The planner remains a single self-contained component, so it can still be
dropped into any React 19 project or pasted into a Claude artifact, which is
where it was written.

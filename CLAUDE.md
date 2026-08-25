# CLAUDE.md — ksp-rocket-optimizer

Agent instructions for Claude Code working in this repository.

**Read [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) before changing
`src/ksp-mission-planner.jsx`.** Its "Where the bodies are buried" section
records the traps that have caused repeat regressions — shared stage solutions,
the `stageGeom` / `stageSize` / elevation triangle, `fitStructure` being reached
from two callers. That knowledge is not duplicated here.

---

## Branch protection

`main` is protected, and protection is enforced for administrators. Direct
pushes are rejected by the server. Every change goes through a branch and a pull
request, and the `build` check must pass before the PR can merge.

Do not attempt to push to `main`, including for one-line documentation fixes.

---

## Development commands

```bash
npm run dev        # Vite dev server, hot reload
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Node 24 or newer. Run `npm run build` before every commit — it is what CI runs,
and it is currently the only gate.

---

## The shape of this project

`src/ksp-mission-planner.jsx` is the entire application: part tables, physics,
the design solver, the ascent simulation, and the UI. Roughly 2,500 lines of
data and physics precede the React component. `index.html` and `src/main.jsx`
exist only to mount it and are not where logic belongs.

Part data is inline and extracted from a specific KSP install (Squad 1.12.5 +
Breaking Ground + ReStock+). It is not re-derived at runtime, so changing a
number there is changing a measurement, not a config value.

The single-file layout is deliberate — the component was written as a Claude
artifact and is still meant to be droppable into one. Do not split it into
modules.

---

## Code style

The conventions here differ from a typical React project. Match the file rather
than habit:

- **Inline `style={{}}` is correct here.** There is no Tailwind, no CSS file,
  and no class-based design system. Static styling lives in a `<style>` block
  inside the component, alongside a small set of custom classes (`card`, `chip`,
  `disp`, `eyebrow`, `mono`). Do not introduce a styling framework.
- **The component is a default export.** Solver functions are module-private.
  Export something by name when a caller genuinely needs it — that is how the
  planned snapshot test will reach `solveGroup` — not as a blanket convention.
- **Naming is terse and domain-flavoured** (`cdOf`, `ispAt`, `fitStructure`,
  `solveStage`, `boostedAscent`). Follow it. Do not expand these into prose.
- **Physics constants and part tables are UPPER_SNAKE.**
- **Comment the non-obvious physics** — where a constant came from, why a curve
  has the shape it does, which KSP behaviour is being reproduced. Not what the
  code does.

---

## Verification, and how to talk about it

There are no tests. CI builds, which catches broken imports and syntax and no
regression of substance.

The design snapshot and render sweep described in `docs/DEVELOPMENT.md` are
**planned, not implemented**. Do not cite them as though they run, and do not
treat a green build as evidence that solver output is unchanged.

This matters because the characteristic failure in this codebase is silent: a
refactor believed to be behaviour-preserving once altered 31 of 72 designs
without erroring. When you make a change of that kind, say plainly that it is
unverified rather than implying the build passing covers it.

---

## What not to do

- Do not push directly to `main` — it will be rejected.
- Do not split the single file into modules.
- Do not convert to TypeScript before the snapshot test exists; see the
  sequencing note in `docs/DEVELOPMENT.md`.
- Do not replace inline styles with Tailwind or another CSS framework.
- Do not recompute stage geometry locally, or fix `solveStage` without checking
  `boostedAscent` — see `docs/DEVELOPMENT.md`.
- Do not commit `dist/`; it is gitignored and built by CI and Cloudflare.
- Do not leave `console.log` in committed code.

---

## Recording what you learn

When you work out something non-obvious about the physics, the solver, or a trap
in the code, append it to "Where the bodies are buried" in
`docs/DEVELOPMENT.md`. That file is the established home for this knowledge —
keep it there rather than starting a parallel set of notes.

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
npm test           # design snapshot — solve the grid, compare to the baseline
npm run test:bless # accept current solver output as the new baseline
```

Node 24 or newer. **Run `npm test && npm run build` before every commit** — both
are what CI runs.

`npm test` takes about 35 seconds; it is solving 81 rocket designs, not doing
nothing.

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

> **TypeScript.** `.claude/typescript-style-guide.md` is staged for the
> conversion in [#11](../../issues/11) and does not apply to the current `.jsx`
> source. Its opening section lists four rules this project deliberately breaks
> — read that before applying anything from the rest of it.

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
- **Prettier formats the repository, but not the planner.**
  `src/ksp-mission-planner.jsx` is in `.prettierignore` — its dense style is
  deliberate, and reformatting it changes 10,466 lines and leaves the file 2.5×
  longer ([#16](../../issues/16) has the numbers). Everything else is
  prettier-clean; `npm run format:check` verifies that and `npm run format`
  fixes it. Do not remove that ignore entry as a drive-by.
- **Comment the non-obvious physics** — where a constant came from, why a curve
  has the shape it does, which KSP behaviour is being reproduced. Not what the
  code does.

---

## Verification, and how to talk about it

The **design snapshot** (`npm test`) solves a fixed grid of 81 configurations and
compares every resulting design against a committed baseline. It is the check
that matters here, because the characteristic failure in this codebase is
silent — a refactor believed to be behaviour-preserving once altered 31 of 72
designs without erroring.

A snapshot diff means the physics moved. If that is what you intended, re-bless
with `npm run test:bless` and put the before and after in the commit message.
**Never re-bless to turn a red build green.** A diff you cannot explain is the
bug the test exists to catch, and blessing it destroys the only evidence.

The **render sweep** mounts the app in jsdom and drives it across every
destination, objective and profile, checking that nothing bad reaches the text,
that the module loads, and that the same destinations still produce a design
(`solvability.txt` — liftoff mass and stage count per destination).

The **panel-containment check** reads the SVG shapes in the build view and
asserts every part lies inside its panel at every staging step. SVG geometry
lives in attributes rather than CSS, so it survives jsdom intact — which is why
it catches drawing bugs the render sweep cannot.

Know what none of them reach:

- The snapshot drives `solveGroup`, not `buildRoute`, `missionHardware`, or the
  simulator-guided candidate walk — those are still inside the component's
  effect and are not callable.
- No check can see a bad number in a CSS value. The CSSOM discards what it
  cannot parse, so `width: NaN%` leaves no trace to scan for.
- Containment is checked at the default tech tier and payload. Other rosters
  produce different shapes and are not swept.

A green build on its own says nothing about solver output. When you change
something these checks cannot see, say plainly that it is unverified rather than
implying CI covered it.

---

## What not to do

- Do not push directly to `main` — it will be rejected.
- Do not split the single file into modules.
- Do not re-bless the design snapshot to make a red build green.
- Do not convert to TypeScript without running the snapshot over the result; see
  the sequencing note in `docs/DEVELOPMENT.md`.
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

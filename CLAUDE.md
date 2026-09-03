# CLAUDE.md — ksp-rocket-optimizer

Agent instructions for Claude Code working in this repository.

The traps that have caused repeat regressions live in `.claude/rules/`, split so
each loads when you open the code it is about. **Read the one for the area before
changing it** — every entry is a regression a green build did not catch.

| Working on                          | Read                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/**`                       | `.claude/rules/solver.md` — shared stage solutions, the `stageGeom` / `stageSize` triangle, `fitStructure` reached from two callers, slenderness, `best` is not what is delivered |
| the build view, shaders, `views.ts` | `.claude/rules/renderer.md` — per-frame rebuilds, `setSize`, camera basis, surface ids, GLSL                                                                                      |
| `src/ui/**`                         | `.claude/rules/ui.md` — panel widths, callback refs, `position: fixed`, `Slider` drafts                                                                                           |
| anything visible                    | `.claude/rules/design.md` — type roles, tokens, one idiom per job; the reference is `docs/design.md`                                                                              |
| `src/data/**`                       | `.claude/rules/part-data.md` — measurements, not configuration                                                                                                                    |
| `test/**`, `visual/**`              | `.claude/rules/verification.md` — what each check does                                                                                                                            |
| TypeScript itself                   | `.claude/typescript-style-guide.md` — conventions, and two traps at the end                                                                                                       |

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
npm test           # the whole suite — see Verification below
npm run test:bless # accept current solver output as the new baseline
npm run test:visual # the build view in a real browser — see Verification
npm run lint       # eslint, one rule: no-undef
```

Node 24 or newer. **Run `npm test && npm run build` before every commit** — both
are what CI runs.

`npm test` takes about a minute and a half locally and several minutes on CI. It
is solving 81 rocket designs and mounting the app a few dozen times, not doing
nothing.

Benchmarks are `npm run perf`, `perf:mission`, `perf:save` and `perf:compare`.
Baseline on `main`, compare on the branch, **then run `npm test` and confirm the
design snapshot has not moved** — a faster solver that picks different rockets is
a different solver. They are deliberately outside CI; `perf/README.md` has the
rest.

---

## The shape of this project

Three layers, and the boundary between the first two is the point:

    src/data/   part tables, bodies, curves — JSON, no logic
    src/core/   solver and physics. No React, no DOM, no imports from ui.
    src/ui/     the application

**`src/core/plan.ts` is the seam.** `planMission(input, { signal, onYield })`
takes a destination and a payload and returns solved stages. Everything crossing
it is plain data — no `Set`, no `Map`, no object identity, no functions — so the
solver behind it can become a Web Worker or a Rust/WASM module without the UI
changing. `test/seam-contract.test.ts` enforces that and will fail if it slips.
`test/boundaries.test.ts` enforces the import direction, so `core/` reaching into
`ui/`, React or three.js fails the build rather than the review.

Part data is extracted from a specific KSP install (Squad 1.12.5 + Breaking
Ground + ReStock+). It is not re-derived at runtime, so changing a number in
`src/data/` is changing a measurement, not a config value. It is JSON so a
native port can embed the same files rather than keeping a second copy.

This was one file until it had a test suite worth the name. The "droppable into
any React project" property is gone, deliberately.

---

## Code style

The conventions here differ from a typical React project. Match the file rather
than habit:

> **TypeScript.** All of it, since [#11](../../issues/11): `src/`, `test/`,
> `visual/` and the two `perf/` entry points that go through vite. What is left
> in JavaScript is the configuration at the root and the two benchmark scripts
> node runs directly.
>
> `npm run typecheck` is a CI step and is what stands in `no-undef`'s place —
> eslint here has no TypeScript parser, so it lints none of the source, and
> neither the build nor the suite can see a type error either: vite and vitest
> both strip types with esbuild and never check them.
>
> `.claude/typescript-style-guide.md` is the conventions reference. Its opening
> section lists four rules this project deliberately breaks — read that before
> applying anything from the rest of it.

- **Inline `style={{}}` is correct here.** There is no Tailwind, no CSS file,
  and no class-based design system. Static styling lives in a `<style>` block
  inside the component, alongside a small set of custom classes (`card`, `chip`,
  `disp`, `eyebrow`, `mono`). Do not introduce a styling framework.
- **The component is a default export.** Solver functions are module-private.
  Export something by name when a caller genuinely needs it — that is how the
  snapshot test reaches `solveGroup` — not as a blanket convention.
- **Naming is terse and domain-flavoured** (`cdOf`, `ispAt`, `fitStructure`,
  `solveStage`, `boostedAscent`). Follow it. Do not expand these into prose.
- **Physics constants and part tables are UPPER_SNAKE.**
- **Prettier formats everything.** `npm run format:check` verifies it, `npm run
format` fixes it, and CI runs the former. Nothing in `src/` is excluded.
- **eslint runs one rule, `no-undef`.** Not a style gate — prettier owns
  formatting and the conventions above are this project's own, so a preset would
  spend its time arguing with decisions already made. Do not add rules to it
  without a bug they would have caught.
- **Comment the non-obvious physics** — where a constant came from, why a curve
  has the shape it does, which KSP behaviour is being reproduced. Not what the
  code does.

---

## Verification, and how to talk about it

Six checks: the **design snapshot** (81 configurations against a baseline), the
**render sweep** (the app in jsdom), the **model checks** (the rocket as shapes),
the **visual suite** (`npm run test:visual`, real WebGL in headless Chrome), the
**layout suite** (the same browser, at a phone and a desktop, holding the UI's
budgets — page height, words, target size, type floor, overflow, keyboard
reach, axe), and the **mission sweep** (thirteen missions through
`planMission`). `.claude/rules/verification.md` says what each does and where
it lives.

The layout suite's budgets are today's numbers, not targets, and a change to
`src/ui/` says what it did to them. Lower the one you improved in the same
commit; never raise one to make a red build green without saying why in the
commit message — a taller page or a smaller target is a regression the suite
exists to catch, and the number is the evidence.

A snapshot diff means the physics moved. If that is what you intended, re-bless
with `npm run test:bless` and put the before and after in the commit message.
**Never re-bless to turn a red build green.** A diff you cannot explain is the
bug the test exists to catch, and blessing it destroys the only evidence. The
mission sweep is re-blessed exactly as deliberately.

Know what none of them reach:

- The design snapshot drives `solveGroup`, not `buildRoute`, `missionHardware`,
  or the candidate walk. The mission sweep covers those, but at thirteen
  configurations against the snapshot's 81 — it is a regression net, not a
  survey, and a solver change with a narrow blast radius can still slip between
  its cases.
- No check can see a bad number in a CSS value. The CSSOM validates on
  assignment and silently discards what it cannot parse, so `width: NaN%`,
  `width: undefinedpx` and `opacity: NaN` read back as null rather than as the
  bad value. That is true of real browsers as much as jsdom. Only
  string-valued properties survive to be seen, `font-family: NaN` being the type
  case.
- Containment is checked at the default tech tier and payload. Other rosters
  produce different shapes and are not swept.
- The main suite runs in jsdom, which has no worker, no visual viewport, no
  on-screen keyboard and no IME. `npm run test:visual` covers the WebGL half in
  a real browser and measures the layout at a phone's width; everything else
  on that list is still checked on the Cloudflare preview, by a person, and
  the device is still the only place mobile behaviour is decided. The layout
  suite counts targets and words; it cannot tell whether they are the right
  ones, and a screenshot in the CI artefact is for a person to look at.

A green build on its own says nothing about solver output. When you change
something these checks cannot see, say plainly that it is unverified rather than
implying CI covered it.

---

## What not to do

- Do not push directly to `main` — it will be rejected.
- Do not make `core/` import from `ui/`, and do not put a `Set`, a `Map` or a
  live object reference across the `planMission` boundary — both are the whole
  reason the split exists.
- Do not re-bless the design snapshot to make a red build green.
- Do not make a mechanical, repository-wide change without running the snapshot
  over the result. The TypeScript conversion was held back for exactly this
  reason until there was something able to detect a silently changed design, and
  then done a chunk at a time against it. The next such change gets the same
  treatment.
- Do not replace inline styles with Tailwind or another CSS framework.
- Do not recompute stage geometry locally, or fix `solveStage` without checking
  `boostedAscent` — see `.claude/rules/solver.md`.
- Do not commit `dist/`; it is gitignored and built by CI and Cloudflare.
- Do not leave `console.log` in committed code.

---

## Recording what you learn

When you work out something non-obvious about the physics, the solver, or a trap
in the code, append it to the rules file for the area it belongs to — the table
at the top says which. Keep it there rather than starting a parallel set of
notes or a new document, and keep this file for what applies to every session.

If the thing you learned can be checked instead of asserted, write the check.
A rule a test enforces does not need to be in prose at all.

Work that is outstanding rather than known belongs in a filed issue, not in
prose here.

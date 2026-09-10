# A Data Contract Does Not Guard the Imports

**Why it matters:** whenever a module boundary is meant to be portable — to a
worker, another process, another language — and the tests around it check what
crosses it.

## The concept

A boundary makes two promises, and different things check them. The first is
about the _data_: everything crossing survives serialisation, so the far side
could be anywhere. The second is about the _code_: nothing inside reaches out to
the platform the outside lives on. A test that round-trips the payload through
JSON proves the first and says nothing about the second — a solver that imports
a React component still hands back plain objects. Nor do the ordinary tools
object: a type checker is content with any import that resolves, and a bundler
will inline the renderer into the worker without a word. Until something scans
the imports, the second promise holds on discipline, which is what "holds" means
right up to the day it does not.

## In this codebase

`test/seam-contract.test.ts` pushes `planMission`'s input and output through
`JSON.parse(JSON.stringify(...))` and reports every path holding a `Set`, a
`Map` or a shared reference. `CLAUDE.md` said, twice, that `src/core/` imports
nothing from `ui/`, React or three.js, and nothing checked it: eslint runs one
rule with no TypeScript parser, so it lints none of the source, and `tsc`
typechecks a solver that imports React without comment. #116 added
`test/boundaries.test.ts`, which reads every file under `src/core/` and fails on
a specifier into `ui/`, `react` or `three`; keeps three.js out of
`src/ui/views.ts`, so half a megabyte of renderer stays lazy-loaded off the path
to a solved rocket; and pins the solver's bare third-party imports to an empty
list, so a new dependency is a decision rather than a drift.

The same shape had just bitten next door. `CLAUDE.md` said CI ran
`npm run format:check`; CI did not, and an export list in `src/ui/tokens.ts`
drifted eight characters over the line limit and reached a pull request with six
green checks (#114). Both are one failure: a guarantee written as prose where it
needed to be a mechanism.

## What made it real

Each new test was verified by breaking it — a `react` import in
`src/core/plan.ts`, a `Vector3` import in `views.ts`, a stray `console.log` —
and each failed naming the file, then was restored. #115 had gone over every
rule in `CLAUDE.md` asking whether a machine could hold it; these were the ones
that could, and the rest stayed prose because they are judgement. No source
changed, which is the point: the boundary already held, on discipline, and the
suite went from 91 tests to 95 so that it now holds on a check.

## Key takeaway

A test on what crosses a boundary proves the data is portable, not that the code
behind it is — the import direction needs its own check, because neither the type
checker nor the bundler will ever object.

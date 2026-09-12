# Modules, exports and the import direction

**Syllabus:** [L4](../../README.md#part-3--language-and-platform)

**Why it matters:** The import direction matters because the solver's whole
value as a separate layer, that it could run on a worker today and in Rust
tomorrow, depends on twenty-one files under `src/core` never importing
React, three.js or anything under `src/ui`, and no tool in the chain
enforces that: the type checker is happy to typecheck a solver that imports
a component, the bundler bundles it without complaint, and the linter runs
one rule and parses no TypeScript at all; the direction held on discipline,
which is what "held" means right up until it does not, so a test reads
every import in the layer and fails the build on the first one that points
the wrong way.

**Before this:** [L1](../the-seam/plain-data-across-a-seam.md), _Plain
data across a seam_.

## A worked case

Count the imports. The solver is 21 modules under `src/core`; the
application is the files under `src/ui`. Walk every import statement in
both:

| Direction                                         | Count |
| ------------------------------------------------- | ----- |
| Files in `src/ui` that import from `src/core`     | 23    |
| Files in `src/core` that import from `src/ui`     | 0     |
| Files in `src/core` that import React or three.js | 0     |
| Bare package imports anywhere in `src/core`       | 0     |

The last row is the one that surprises: the solver imports nothing from
`node_modules` at all. Its dependencies are its own modules and five JSON
files. That is what makes it a candidate for porting, and the boundaries
test lists the set and requires it to stay empty, not as a ban but as a
tripwire: a new package in the solver is the moment a port gets harder, and
it should be a decision rather than a drift.

Then the exports. Every module under `src/core` ends with one `export { … }`
block, and often one `export type { … }` block after it, listing by name
what the file offers; `solver.ts` exports seven functions and a handful of
types out of 1,700 lines. The root React component is the one default export
in the application. Nothing is exported because it might be useful; the
design snapshot reaches `solveGroup` because the snapshot needed it, and
that is why it is on the list.

```js
// the boundary, checked the way the test checks it: every import in src/core
const { readdirSync, readFileSync, statSync } = require("fs");
const { join } = require("path");
const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const importsOf = (src) =>
  [
    ...src.matchAll(
      /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g,
    ),
  ]
    .map((m) => m[1])
    .concat(
      [...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]),
    );
const core = files("src/core"),
  ui = files("src/ui");
const specs = core.flatMap((p) => importsOf(readFileSync(p, "utf8")));
console.log(
  core.length,
  "core modules;",
  specs.length,
  "imports;",
  specs.filter((s) => /(^|\/)ui\//.test(s) || /^(react|three)(\/|$)/.test(s))
    .length,
  "into ui, react or three;",
  specs.filter((s) => !s.startsWith(".") && !s.startsWith("/")).length,
  "bare packages",
);
console.log(
  ui.filter((p) =>
    importsOf(readFileSync(p, "utf8")).some((s) => /(^|\/)core\//.test(s)),
  ).length,
  "ui files import core",
);
```

## The idea

The **import direction** is which layers may depend on which. Three layers
here: data, solver, application. Data is JSON and imports nothing. The
solver imports data and itself. The application imports the solver, the
data and the libraries it is built from. The arrows all point one way, down
toward the data, and the value of the arrangement is entirely in the arrows
that are absent: because nothing in the solver points up at the
application, the application can be replaced, moved to another thread, or
removed, and the solver does not know. The seam of [L1](../the-seam/plain-data-across-a-seam.md)
is the one function call the top arrow goes through; this lesson is about
every other arrow.

**Module-private** means not exported: visible only inside its file. A
function that is module-private has exactly the callers the file gives it,
so it can change signature, split, or vanish, and the compiler proves
nothing else notices. An exported function has callers the file cannot see,
and every change to it is a change to a contract. The convention here is
therefore that solver functions are private unless a caller genuinely needs
them, and the export list at the foot of each module is the contract in one
place: what this file offers, by name, and nothing else. A default export is
reserved for the one thing a module is, the root component, and a module of
many functions has none, because "the default" of a solver module would be a
claim about which of its functions matters most.

```
   src/data/*.json       measurements; imports nothing

          ▲
   src/core/*.ts         21 modules; import data and each other; zero packages
          │              export { a, b, c } — named, and only what a caller needs
          ▲
   src/ui/**             React, three.js; 23 files import core through the seam and the model

   the arrows that must never appear:   core ─► ui    core ─► react    core ─► three
```

Why a test and not a convention is a fact about the toolchain
([L17](../../README.md#part-3--language-and-platform), _What the toolchain
checks and what it strips_). `tsc` checks types, and a solver module that
imports a React component is perfectly well typed. Vite bundles whatever is
imported, and a solver that pulled in three.js would simply ship three.js.
ESLint here runs a single rule, `no-undef`, and lints none of the TypeScript
besides. Not one of them has an opinion about direction. So the direction is
written as a test: read every file in the layer, extract every specifier
from every `import … from`, `export … from` and dynamic `import()`, and fail
on any that names `ui/`, `react` or `three`. The dynamic form is included
because lazy-loading three.js is exactly the way one would be tempted to
sneak it in.

The same test holds a second, narrower line for a different reason. The
module that sizes the build view's panels, `views.ts`, is on the path to a
solved rocket, so anything it imports lands in the bundle a user waits for
before seeing any answer at all; half a megabyte of renderer is lazy-loaded
behind it. The camera basis it computes is four multiplications and does not
need a `Vector3`, so the test requires that `views.ts` import nothing from
three.js, and the renderer imports `views.ts` rather than the other way
round.

## In this codebase

[`test/boundaries.test.ts`](../../../../test/boundaries.test.ts) is the
direction as three checks, and its header is the argument in full: "Three
rules were written down and enforced by nothing … They held on discipline,
which is what 'held' means right up until it doesn't." The first check:

```ts
for (const path of files("src/core"))
  for (const spec of importsOf(readFileSync(path, "utf8"))) {
    const banned =
      /(^|\/)ui\//.test(spec) ||
      spec === "react" ||
      spec.startsWith("react/") ||
      spec === "three" ||
      spec.startsWith("three/");
    if (banned) bad.push(`${path} imports ${spec}`);
  }
expect(bad, `${bad.length} imports across the core boundary`).toEqual([]);
```

The second keeps three.js out of [`src/ui/views.ts`](../../../../src/ui/views.ts);
the third lists every bare import in the solver and requires the list to be
empty. [`test/seam-contract.test.ts`](../../../../test/seam-contract.test.ts)
covers the other half of the same split, what crosses the one permitted
arrow. The two worker files, `solver.worker.ts` and `unit.worker.ts`, live
under `src/ui` although they contain no interface code, because a worker is
a delivery mechanism that assumes a browser host and the solver is meant to
assume nothing; their comments say so. The export convention is in
`CLAUDE.md` under _Code style_: "Solver functions are module-private. Export
something by name when a caller genuinely needs it — that is how the
snapshot test reaches `solveGroup` — not as a blanket convention."

## What made it real

The counts are the measurement, and the test takes them on every build: 0
imports across the boundary, 0 bare packages in the solver, 0 three.js
imports in the panel sizer. The proof that the direction bought what it
promised is the same as L1's: the solver moved onto a worker, then onto a
pool of workers, and later into two more worker files for the plot, and no
file under `src/core` changed for any of it, because none of them knew
where they were running.

The `views.ts` line has a number too: the renderer it keeps out of the
critical path is about half a megabyte, lazy-loaded through `lazy(() =>
import("./three-view.jsx"))` in the two components that show it, so a user
sees a solved rocket before the code that draws it in three dimensions has
arrived.

## Where it breaks

- **Trusting the type checker for direction.** A solver that imports a
  component typechecks. Direction is not a type; it is a fact about
  specifiers, and only something that reads them can hold it.
- **A dynamic import as a loophole.** `await import("three")` is an import.
  The test's regex includes the call form for that reason.
- **A helpful package in the solver.** One `import { … } from "lodash"` is
  typed, bundled and linted without a word, and the solver is now harder to
  port. The tripwire lists the set and requires it empty, so adding one is a
  visible decision.
- **Exporting for convenience.** Every export is a contract with callers the
  file cannot see. The list at the foot of each module is short because each
  name on it was needed by a specific caller, and a test that wants a
  private function is asked to justify the export, as the snapshot did.
- **Delivery code in the solver.** The worker files assume a browser; they
  live in `src/ui`. A `self.postMessage` in `src/core` would pass the test's
  regex and break the layer just the same, which is why the layer is also a
  matter of what a file assumes.

## Try it

Run the snippet at the repository root and read the four zeros and the 23.
Then add `import { useState } from "react";` to the top of
`src/core/tally.ts` and run `npx vitest run test/boundaries.test.ts`: it
fails with the file and the specifier named, while `npm run typecheck`
passes, which is the whole reason the test exists. Remove the line.

## Check yourself

<details><summary>Why does the import direction need a test when there is a type checker, a bundler and a linter in the build?</summary>

Because none of the three has an opinion about direction. A solver module
importing a React component is well typed, bundles fine and passes the one
lint rule. Direction is a fact about which files name which, and only a
check that reads the specifiers can hold it; before the test it was held by
discipline, which held until it did not.

</details>

<details><summary>What does it buy that every solver module ends with one named export list?</summary>

A contract in one place. Everything not on the list is module-private, has
exactly the callers its file gives it, and can change freely; everything on
it was put there because a specific caller needed it, so the surface the
rest of the program depends on is short and deliberate. A default export
would claim one function is what the module is, which a solver module has
no basis for.

</details>

<details><summary>Why do the worker files live under `src/ui` when they contain no interface code?</summary>

Because they assume a browser host, `self`, `postMessage`, a `Worker`
constructor, and the solver layer is meant to assume nothing about where it
runs. A worker is how the solver is delivered, not what it computes, so it
sits with the application, and the solver's own code stays portable to a
place with no workers at all.

</details>

## Further reading

- Robert Martin, _Clean Architecture_, the chapters on the dependency rule,
  for why arrows point inward and what is bought by the ones that are absent.
- The MDN reference for JavaScript modules, for named and default exports and
  the dynamic `import()` form the test has to include.

## Key takeaway

Data imports nothing, the solver imports data and itself, the application
imports both: twenty-one modules with zero packages and zero upward imports,
each exporting by name only what a caller needed, and because no tool in the
chain checks direction, a test reads every specifier in the layer and fails
the build on the first that points at `ui/`, React or three.js.

_As of 530ae44._

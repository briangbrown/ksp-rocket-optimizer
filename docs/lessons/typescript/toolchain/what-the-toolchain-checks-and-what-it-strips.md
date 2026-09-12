# What the toolchain checks and what it strips

**Syllabus:** [L17](../../README.md#part-3--language-and-platform)

**Why it matters:** Knowing which tool sees what matters because a green build
here is five tools in a row, and only one of them reads the types: Vite and
vitest hand every TypeScript file to esbuild, which strips the annotations
and never checks them, eslint has no TypeScript parser and lints none of the
source, and Node itself now runs a `.ts` file by stripping it too, so a
string assigned to a `number` builds, bundles, passes the suite and runs,
and fails only in `tsc` or at the call that expected a number; where a bug
can hide is decided by which tool was given the chance to see it.

**Before this:** nothing in particular. The syllabus rows on
[L2](../types/discriminated-unions-and-narrowing.md), _Discriminated unions
and narrowing_, say what the types buy once they are checked.

## A worked case

Write one file with a type error and one with an undefined name, and hand
each to every tool the build runs:

| File                                       | esbuild (Vite, vitest)    | `tsc --noEmit`                                             | `node file.ts`                            | eslint `no-undef`              |
| ------------------------------------------ | ------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `const dv: number = "3400"; dv.toFixed(0)` | emits `const dv = "3400"` | `TS2322: Type 'string' is not assignable to type 'number'` | `TypeError: dv.toFixed is not a function` | not run on `.ts`               |
| `const ms = dv.toFixed(0)` with no `dv`    | emits it unchanged        | `TS2304: Cannot find name 'dv'`                            | `ReferenceError` when reached             | `'dv' is not defined` on `.js` |

Read the first row across. esbuild removes `: number` and emits the rest; a
vitest test containing that line passes, and asserting that `dv` is a
string passes too. `tsc` is the one tool that reads the annotation and
refuses. Node 24 strips the types the same way esbuild does and runs the
file until the string is asked for a method it does not have. eslint never
sees the file at all: its configuration lints `*.js` at the root and the
two benchmark scripts, and on a `.ts` file it reports "File ignored because
no matching configuration was supplied".

The second row is why eslint is still there. An undefined name is not a
type error to esbuild, which resolves no names across scopes and emits the
reference as written, so `vite build` succeeds; it is one to `tsc`, which
finds it in the source; and for the JavaScript that `tsc` does not read,
the configuration at the root and the benchmark scripts, `no-undef` is the
only tool that will.

```bash
# run at the repository root — one type error and one undefined name through every tool the build runs
mkdir -p l17-demo
printf 'const dv: number = "3400";\nexport const ms = dv.toFixed(0);\nconsole.log(ms);\n' > l17-demo/strip.ts
printf 'const ms = dv.toFixed(0);\nexport { ms };\n' > l17-demo/undef.js
echo "== esbuild strips, and emits:";        npx esbuild l17-demo/strip.ts | grep -m1 "const dv"
echo "== tsc checks:";                       npx tsc --noEmit --strict --ignoreConfig l17-demo/strip.ts | sed 's/.*error/error/'
echo "== node strips too, then runs:";       node l17-demo/strip.ts 2>&1 | grep -m1 Error
echo "== eslint on the .ts:";                npx eslint l17-demo/strip.ts 2>&1 | grep -m1 ignored
echo "== esbuild on the undefined name:";    npx esbuild l17-demo/undef.js | grep -m1 "const ms"
echo "== eslint no-undef on the .js:";       npx eslint --no-config-lookup --rule '{"no-undef":"error"}' --parser-options 'ecmaVersion:2024' --parser-options 'sourceType:module' l17-demo/undef.js | grep -m1 defined
echo "== vitest runs the type error and passes:"
printf 'import { test, expect } from "vitest";\nconst dv: number = "3400";\ntest("a type error, stripped", () => expect(typeof dv).toBe("string"));\n' > test/l17-demo.test.ts
npx vitest run test/l17-demo.test.ts 2>&1 | grep -E 'Tests '
rm -r l17-demo test/l17-demo.test.ts
```

## The idea

TypeScript's types are erased before anything runs; the question is who
reads them on the way out. A **type gate** is the one step that fails the
build on a type error, and in a toolchain built for speed it is the only
step that reads types at all. The rest **strip**: they remove the
annotations without checking them, because checking needs the whole
program's types resolved and stripping needs only the file's syntax, and
that is the difference between a bundler that starts in milliseconds and
one that starts in seconds.

esbuild is the stripper Vite and vitest both use. It parses each file,
drops what is TypeScript-only, and emits JavaScript; it does not resolve a
name to its declaration, does not know that `dv` was declared a number, and
does not know whether `dv` was declared anywhere. `vite build` succeeding
therefore says the syntax was valid and the imports resolved, and no more.
`vitest run` says the same plus whatever the tests asserted; a test cannot
see a type it never had. Node 24 does the same on a `.ts` file, so a script
run directly is no more checked than one bundled. The TypeScript compiler,
`tsc --noEmit`, is the gate: it builds the program, resolves every name and
every type, and reports what does not fit. Here it is one CI step, with the
strict options on and unused locals and parameters refused, and the
file-by-file conversion of the source to TypeScript was held to its
snapshot precisely because none of the other tools would have noticed a
converted file changing its meaning.

eslint is a different kind of check, and here a narrow one. It runs one
rule, `no-undef`, because that rule catches a class of bug esbuild
compiles happily: a constant referenced before its definition, a helper
renamed in one place and not the other, a variable used outside its scope.
But eslint parses with its own parser, which does not read TypeScript, so
it lints only the JavaScript that is left, the configuration at the root and
the two benchmark scripts; for the source, `tsc` stands in `no-undef`'s
place and finds a good deal more besides. Prettier is the fourth tool and
reads neither types nor names: it reformats, and the check is that
reformatting changes nothing.

```
   tool          reads types?   resolves names?   what a pass proves
   ─────────     ────────────   ───────────────   ────────────────────────────────────────────
   prettier      no             no                the file is formatted
   eslint        no (.js only)  yes               no undefined name in root *.js and perf/*.mjs
   tsc           YES            yes               the program type-checks — the one gate
   vitest        no (esbuild)   no                the tests' assertions hold on stripped code
   vite build    no (esbuild)   no                the syntax parsed and the imports resolved
   node file.ts  no (strips)    at run time       it ran as far as it got
```

The order of the CI steps follows from the table. Format first, because it
is the cheapest and a diff that argues with it is noise in every review
after. Lint before the tests, because `no-undef` finds in a second what the
suite finds only if its grid happens to reach the branch. Typecheck next,
for the same argument one step further. Then the suite, then the build,
because a moved design or a blank render is the failure worth seeing first
and the build passing says nothing about either.

## In this codebase

[`package.json`](../../../../package.json) names the tools: `test` is
`vitest run`, `typecheck` is `tsc --noEmit`, `lint` is `eslint .`, `build`
is `vite build`, and `format:check` is `prettier --check .`.
[`.github/workflows/build.yml`](../../../../.github/workflows/build.yml)
runs them in that order, with a comment on each step saying why it stands
where it does; the Typecheck step's is the rule in one sentence:

```yaml
# ... a file that has been converted to TypeScript is not linted at all —
# eslint here has no TS parser — so this is what stands in `no-undef`'s
# place for it, and finds a good deal more besides. Neither the build nor
# the suite can see any of it: vite and vitest both strip types with
# esbuild and never check them. #11
```

[`eslint.config.js`](../../../../eslint.config.js) is one rule over
`["*.js", "perf/**/*.mjs"]`, and its comment records what moved to
`tsconfig.json` when the source became TypeScript.
[`tsconfig.json`](../../../../tsconfig.json) is the gate's configuration:
`strict`, `noEmit`, `isolatedModules` and `verbatimModuleSyntax`, which keep
every file strippable one at a time, `noUnusedLocals` and
`noUnusedParameters`, and an `include` of `src`, `test`, `perf` and
`visual`, so the tests and the visual suite are checked as well as the
application. [`vite.config.js`](../../../../vite.config.js) has no type
step because Vite has none to offer. The two language traps the conversion
hit are at the end of
[`.claude/typescript-style-guide.md`](../../../../.claude/typescript-style-guide.md),
and `CLAUDE.md`'s _Code style_ section says the same in the words the
agent reads.

## What made it real

The table is the measurement, run on this machine with Node 24.14, esbuild
0.28, TypeScript 7.0 and vitest 4.1: the same two-line type error passes
esbuild, passes a vitest test, runs under Node until it throws, and is
refused by `tsc` alone. The `no-undef` row was #8, before the conversion,
when a constant referenced before its definition built and shipped because
esbuild resolves no names and the design snapshot's grid did not reach the
branch. And #11, the conversion itself, was done a chunk at a time against
the snapshot rather than in one sweep, because a converted file that
changed its meaning would have passed every tool but the one that pins
solver output.

The formatter's place in the order has its own number: `CLAUDE.md` said the
format check ran in CI before it did, and an export list went eight
characters over and reached a pull request unnoticed, #111.

## Where it breaks

- **Believing a green `vite build`.** It proves syntax and imports. A type
  error, an undefined name in TypeScript, an impossible narrowing all pass
  it.
- **Believing a green suite.** vitest strips with esbuild too. A test
  exercises values, not types, and a test that passes with a type error in
  it is the ordinary case.
- **Running a `.ts` script with Node and calling it checked.** Node strips.
  Run `tsc --noEmit` on it, or put it under the `include` the gate reads.
- **Adding a lint rule for a style preference.** The one rule is a
  correctness gate; prettier owns formatting and the conventions are this
  project's own. Add a rule only with a bug it would have caught.
- **A `.ts` file eslint quietly ignores.** "File ignored" is a warning, not
  an error, and `eslint .` exits clean over the whole source. `tsc` is the
  check for it.

## Try it

Run the script and read the six outputs. Then open
[`tsconfig.json`](../../../../tsconfig.json), turn `noUnusedLocals` off,
and run `npm run typecheck` to see how many findings were the gate's and not
the language's. Then read the `changes` job in the workflow and work out
why a lesson-only pull request runs only the formatter and still reports
the `build` check main requires.

## Check yourself

<details><summary>A vitest test file contains <code>const dv: number = "3400"</code> and every test in it passes. Which tool will refuse it, and why did vitest not?</summary>

`tsc --noEmit`, the typecheck step. vitest hands the file to esbuild, which
strips the annotation and emits `const dv = "3400"`; the tests then run on
a string and assert whatever they assert. Only the compiler builds the
program's types and can see that a string was assigned to a number.

</details>

<details><summary>eslint runs one rule here. What class of bug does it catch, and why does it catch it only in JavaScript?</summary>

An undefined name: a constant used before its definition, a helper renamed
in one place, a variable outside its scope, all of which esbuild emits
happily because it resolves no names across scopes. eslint here has no
TypeScript parser, so it sees only the `.js` and `.mjs` files its
configuration names; for the TypeScript source, `tsc` finds the same bugs
and more.

</details>

<details><summary>Why was the conversion of the source to TypeScript done a chunk at a time against the design snapshot?</summary>

Because none of the tools that run the code read the types, so a converted
file that changed its meaning would have passed the build and the type
gate alike. The snapshot pins solver output over 81 configurations; a chunk
that moved it was a chunk that had changed behaviour, and that was the
only tool able to say so.

</details>

## Further reading

- The esbuild documentation's "TypeScript caveats", for what a
  single-file transform can and cannot know about types.
- The TypeScript handbook on `isolatedModules` and `verbatimModuleSyntax`,
  the options that keep every file strippable without the program.
- The Node.js documentation on type stripping, for what `node file.ts`
  removes and what syntax it refuses.

## Key takeaway

Only `tsc` reads the types: Vite, vitest and Node strip them with no check,
eslint parses no TypeScript at all, and prettier reads neither types nor
names, so a green build proves what each of those five tools was able to
see and nothing more, and the typecheck step is the one place a type error
can fail.

_As of b34b81a._

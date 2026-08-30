import globals from "globals";

/* One rule.

   `no-undef` catches a class of bug the bundler compiles happily: a constant
   referenced before its definition, a variable used outside its scope, a helper
   renamed in one place and not the other. esbuild does no cross-scope name
   resolution, so `vite build` succeeds on all three, and the design snapshot
   only sees the ones on a branch its grid reaches. #8.

   Nothing else is switched on, deliberately. Prettier owns formatting and this
   project's conventions are its own — terse domain names, inline styles, a
   default-exported component — so a style preset would spend its time arguing
   with decisions already made. This is a correctness gate.

   The environment split this used to carry — core with no DOM, ui with it,
   tests with both — moved to `tsconfig.json` and the types themselves when the
   source became TypeScript. What is left here runs under node. */

const base = {
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: { "no-undef": "error" },
};

export default [
  { ignores: ["dist/**", "perf/.out/**", "perf/.prof/**", "perf/traces/**"] },

  /* What is left of it.

     `src/`, `test/` and `visual/` are TypeScript now, and eslint here has no
     TypeScript parser, so it sees none of them — `npm run typecheck` is what
     stands in its place for those, and finds a good deal more besides. What
     remains in JavaScript is this file, the build and test configuration
     beside it, and the two benchmark scripts that node runs directly rather
     than through vite. Those are the ones `no-undef` still has something to
     say about. */
  {
    ...base,
    files: ["*.js", "perf/**/*.mjs"],
    languageOptions: { ...base.languageOptions, globals: { ...globals.node } },
  },
];

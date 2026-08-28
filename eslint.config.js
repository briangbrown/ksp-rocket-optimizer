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

   The environments are split rather than merged into one permissive list. That
   is what makes the rule say something: `document` in `src/core/` is a real
   error, because core is not allowed to touch the DOM, and it would be
   invisible if browser globals were declared everywhere. */

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

  /* The solver and the physics. No DOM, no worker — that boundary is the point
     of the split, and here it is enforced rather than asked for. */
  {
    ...base,
    files: ["src/core/**/*.js", "src/data/**/*.js"],
    languageOptions: {
      ...base.languageOptions,
      globals: { ...globals.es2021 },
    },
  },

  /* The application. Browser, plus the worker globals the two worker entries
     need — `self`, `postMessage` — since they are ui/ files by design. */
  {
    ...base,
    files: ["src/**/*.jsx", "src/ui/**/*.js", "src/main.jsx"],
    languageOptions: {
      ...base.languageOptions,
      globals: { ...globals.browser, ...globals.worker },
    },
  },

  /* Tests run under node, some of them in jsdom, and reach for both. */
  {
    ...base,
    files: ["test/**/*.js", "test/**/*.jsx"],
    languageOptions: {
      ...base.languageOptions,
      globals: { ...globals.node, ...globals.browser },
    },
  },

  /* The benchmarks are node scripts. */
  {
    ...base,
    files: ["perf/**/*.js", "perf/**/*.mjs", "*.js"],
    languageOptions: { ...base.languageOptions, globals: { ...globals.node } },
  },
];

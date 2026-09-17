import globals from "globals";
import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";

/* Two rules.

   `no-undef` catches a class of bug the bundler compiles happily: a constant
   referenced before its definition, a variable used outside its scope, a helper
   renamed in one place and not the other. esbuild does no cross-scope name
   resolution, so `vite build` succeeds on all three, and the design snapshot
   only sees the ones on a branch its grid reaches. #8.

   `react-hooks/exhaustive-deps` catches the one that cost a wrong share link:
   `configText` serialised `asparagus` and left it out of its `useMemo`
   dependencies, so toggling asparagus never rewrote the configuration string,
   and two people opening the same link got different rockets. #430 fixed the
   memo; this is the rule that would have read it. #431

   Nothing else is switched on, deliberately. Prettier owns formatting and this
   project's conventions are its own — terse domain names, inline styles, a
   default-exported component — so a style preset would spend its time arguing
   with decisions already made. This is a correctness gate, and a rule joins it
   with a bug it would have caught. `rules-of-hooks` is not on: the only thing
   it had to say was that `useArt` in core/ is named like a hook. */

const base = {
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: { "no-undef": "error" },
};

/* How TypeScript is read.

   `typescript` here is 7, the native compiler, which ships no JavaScript
   compiler API — so `@typescript-eslint/parser`, which is built on that API,
   cannot load against it. Babel's parser reads TypeScript syntax on its own,
   without type information, and a hook's dependency list is syntax: the
   rule needs the names an effect reads and the names its array lists, and
   nothing about their types. `.ts` and `.tsx` are told apart because the
   `jsx` plugin turns a generic arrow's `<T>` into a tag.

   `no-undef` is not run on these files. Without types it would flag every
   type-only name, and `npm run typecheck` already stands in its place. */
const typescript = (plugins) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      parserOpts: { plugins },
    },
  },
});
const hooks = {
  plugins: { "react-hooks": reactHooks },
  rules: { "react-hooks/exhaustive-deps": "error" },
};

export default [
  { ignores: ["dist/**", "perf/.out/**", "perf/.prof/**", "perf/traces/**"] },

  /* `no-undef`, on what is still JavaScript: this file, the build and test
     configuration beside it, and the two benchmark scripts that node runs
     directly rather than through vite. */
  {
    ...base,
    files: ["*.js", "perf/**/*.mjs"],
    languageOptions: { ...base.languageOptions, globals: { ...globals.node } },
  },

  /* The hooks rule, on the application. core/ has no React in it — the
     boundary test sees to that — so there is nothing there for it to read. */
  {
    ...hooks,
    files: ["src/ui/**/*.ts"],
    languageOptions: typescript(["typescript"]),
  },
  {
    ...hooks,
    files: ["src/ui/**/*.tsx"],
    languageOptions: typescript(["typescript", "jsx"]),
  },
];

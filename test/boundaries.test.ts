import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* The boundaries, as checks rather than as prose.

   Three rules were written down and enforced by nothing. eslint runs one rule,
   `no-undef`, and lints none of the TypeScript; `tsc` is happy to typecheck a
   solver that imports React; the build would bundle it without complaint. They
   held on discipline, which is what "held" means right up until it doesn't.

   `test/seam-contract.test.ts` covers the other half of the same split — that
   what crosses `planMission` survives JSON. This is the half about who may
   import whom. */

const files = (dir: string): Array<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.tsx?$/.test(name)
        ? [path]
        : [];
  });

/* Every specifier in an import or export-from, plus the dynamic form, because
   lazy-loading three.js is the reason one of these rules exists and a dynamic
   import is how you would do it. */
const importsOf = (src: string): Array<string> => {
  const out: Array<string> = [];
  for (const m of src.matchAll(
    /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g,
  ))
    out.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g))
    out.push(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g))
    out.push(m[1]);
  return out;
};

const bare = (spec: string) => !spec.startsWith(".") && !spec.startsWith("/");

describe("the layer boundaries", () => {
  /* The whole reason src/core exists as its own directory. A solver that
     imports a component cannot become a worker or a WASM module, and nothing
     else in the suite would notice: the seam contract checks the shape of the
     data crossing the boundary, not the direction of the imports. */
  it("keeps the solver free of the application", () => {
    const bad: Array<string> = [];
    for (const path of files("src/core")) {
      const src = readFileSync(path, "utf8");
      for (const spec of importsOf(src)) {
        const banned =
          /(^|\/)ui\//.test(spec) ||
          spec === "react" ||
          spec.startsWith("react/") ||
          spec.startsWith("react-dom") ||
          spec === "three" ||
          spec.startsWith("three/");
        if (banned) bad.push(`${path} imports ${spec}`);
      }
    }
    expect(bad, `${bad.length} imports across the core boundary`).toEqual([]);
  });

  /* Half a megabyte of renderer, lazy-loaded, sits behind this. `views.ts` is
     on the path to a solved rocket because the build view sizes its panels from
     `framing`, so anything it imports lands in the bundle a user waits for
     before seeing any answer at all. The camera basis is four multiplications;
     it does not need `Vector3`. */
  it("keeps three.js out of the module that sizes the panels", () => {
    const src = readFileSync("src/ui/views.ts", "utf8");
    const three = importsOf(src).filter(
      (s) => s === "three" || s.startsWith("three/"),
    );
    expect(three, "src/ui/views.ts must not import three.js").toEqual([]);
  });

  /* Every dependency the solver has, listed. Not a ban — a tripwire. The point
     of the layer is that it could be ported, and a new bare import is the
     moment that gets harder, so it should be a decision rather than a drift. */
  it("adds no new runtime dependency to the solver unnoticed", () => {
    const seen = new Set<string>();
    for (const path of files("src/core"))
      for (const spec of importsOf(readFileSync(path, "utf8")))
        if (bare(spec)) seen.add(spec.split("/")[0]);
    expect([...seen].sort()).toEqual([]);
  });
});

describe("the design tokens", () => {
  /* Thirteen font sizes and five jobs for one class is how the UI refresh
     started (#130). A component names a role or a token; the literal lives in
     `tokens.ts` and the class in `styles.ts`, and nowhere else. Matched on the
     source text rather than the rendered page because the CSSOM discards what
     it cannot parse and jsdom cannot see a size at all — see CLAUDE.md,
     "Verification". `FONT` and `RADIUS.x` are tokens and pass; a bare number or
     a quoted family is what this is for. */
  it("keeps sizes, families and colours in tokens.ts and styles.ts", () => {
    const literal: Array<[string, RegExp]> = [
      ["a hex colour", /#[0-9a-fA-F]{6}(?![0-9a-zA-Z])/],
      ["an rgb() colour", /\brgba?\(/],
      ["a fontSize", /fontSize:\s*[\d"']/],
      ["a quoted fontFamily", /fontFamily:\s*["'`]/],
      ["a letterSpacing", /letterSpacing:\s*["']/],
      ["a numeric borderRadius", /borderRadius:\s*\d/],
      ["a numeric zIndex", /zIndex:\s*\d/],
    ];
    const bad: Array<string> = [];
    for (const path of files("src/ui")) {
      if (/[\/]tokens\.ts$|[\/]styles\.ts$/.test(path)) continue;
      const src = readFileSync(path, "utf8");
      for (const [what, re] of literal) {
        const m = re.exec(src);
        if (m)
          bad.push(
            `${path}:${src.slice(0, m.index).split("\n").length} sets ${what}`,
          );
      }
    }
    expect(bad, `${bad.length} literals outside the tokens`).toEqual([]);
  });
});

describe("the alerts", () => {
  /* Six alert styles, none with an icon, was the state before #139. Every
     one is a `Callout` now, and what made them alerts was a border in a
     severity colour — so that is what is banned: an inline border in `rust`,
     `amber` or `mint`, whichever side and however it is chosen. The stylesheet
     is allowed to, since that is where `.callout` takes its edge from. */
  it("draws every alert as a Callout", () => {
    const re =
      /border(?:Top|Bottom|Left|Right)?:\s*[`"'][^`"'\n]*\bC\.(?:rust|amber|mint)\b/;
    const bad: Array<string> = [];
    for (const path of files("src/ui")) {
      if (/[\/]styles\.ts$/.test(path)) continue;
      const src = readFileSync(path, "utf8");
      const m = re.exec(src);
      if (m)
        bad.push(
          `${path}:${src.slice(0, m.index).split("\n").length} borders in a severity colour`,
        );
    }
    expect(bad, `${bad.length} hand-drawn alerts`).toEqual([]);
  });
});

describe("what does not belong in committed code", () => {
  /* Written down under "What not to do" and enforced by nothing. A stray log in
     the solver runs 81 times a suite and once per frame in the application. */
  it("leaves no console.log in src", () => {
    const bad = files("src").filter((p) =>
      /(^|[^.\w])console\s*\.\s*log\s*\(/.test(readFileSync(p, "utf8")),
    );
    expect(bad, "console.log in committed source").toEqual([]);
  });
});

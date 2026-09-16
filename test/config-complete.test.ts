import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Two people opening the same saved configuration, or the same link, have to
   get the same rocket. That holds only while the configuration string says
   everything the solve reads — and while the string is rebuilt whenever any of
   it changes.

   The second half is the one nothing was watching. `configText` is a `useMemo`,
   so a field serialised into it but missing from its dependency list is simply
   not rewritten when it changes: the address and the copyable configuration go
   on describing the previous answer while the page solves the new one. Share
   that and the recipient gets a different rocket from the one on your screen.

   eslint cannot see this. It runs one rule here and has no TypeScript parser,
   so it reads none of `src/` — `react-hooks/exhaustive-deps` is exactly the
   rule that would have caught it and exactly the rule that is not running.
   See docs/lessons L17. So the check is here, on the source, and it is worth
   keeping when #416 adds the next field. */

const SRC = "src/ui/app.tsx";
/* A serialised name that reads a differently named piece of state. */
const BACKED_BY: Record<string, string> = {
  tech: "unlocked",
  splits: "splitBy",
};

function configMemo() {
  const s = readFileSync(SRC, "utf8");
  const at = s.indexOf("const configText = useMemo(");
  expect(at, `no configText memo in ${SRC}`).toBeGreaterThan(-1);
  const body = s.slice(at, s.indexOf("\n  );", at));
  const obj = body.slice(body.indexOf("JSON.stringify({"), body.indexOf("}),"));
  const deps = body.slice(body.indexOf("}),"));
  const fields = [...obj.matchAll(/^\s{8}(\w+)[,:]/gm)].map((m) => m[1]);
  const listed = [
    ...deps
      .slice(deps.indexOf("["), deps.indexOf("]"))
      .matchAll(/^\s+(\w+),/gm),
  ].map((m) => m[1]);
  /* If the file is laid out differently one day these come back empty, and an
     empty set satisfies any subset test — which is a check that passes by
     finding nothing. Fail loudly instead. */
  expect(fields.length, "read no serialised fields").toBeGreaterThan(15);
  expect(listed.length, "read no dependencies").toBeGreaterThan(15);
  return { fields, listed };
}

describe("the configuration string", () => {
  it("is rebuilt whenever anything it carries changes", () => {
    const { fields, listed } = configMemo();
    const needed = fields.map((f) => BACKED_BY[f] ?? f);
    const missing = needed.filter((n) => !listed.includes(n));
    expect(
      missing,
      `serialised into the configuration but not in the memo's dependencies, so a change to it never reaches the link: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("carries nothing it does not need to", () => {
    /* The other direction is cheap and keeps the list honest as fields come
       and go. A dependency that is not serialised is not a correctness fault,
       only noise, so this names it rather than failing. */
    const { fields, listed } = configMemo();
    const needed = new Set(fields.map((f) => BACKED_BY[f] ?? f));
    const spare = listed.filter((d) => !needed.has(d));
    if (spare.length)
      console.log(`dependencies serialising nothing: ${spare.join(", ")}`);
    expect(spare.length).toBeLessThan(5);
  });
});

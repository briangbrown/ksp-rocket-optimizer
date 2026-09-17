import { describe, it, expect } from "vitest";
import { checkCraft } from "../../src/craft/index.js";
import type { Craft, CraftPart } from "../../src/craft/index.js";
import { sample } from "./sample.js";

/* Each invariant, broken one at a time on the sample craft, is named. */

const edit = (c: Craft, id: string, over: Partial<CraftPart>): Craft => ({
  ...c,
  parts: c.parts.map((p) => (p.id === id ? { ...p, ...over } : p)),
});
const problems = (c: Craft) => checkCraft(c).map((p) => p.what);

describe("checkCraft", () => {
  const ok = sample();

  it("passes the sample", () => {
    expect(checkCraft(ok)).toEqual([]);
  });

  it("wants one root, first", () => {
    expect(problems(edit(ok, "2", { parent: null }))).toContainEqual(
      expect.stringMatching(/2 root parts/),
    );
    const parts = [...ok.parts];
    [parts[0], parts[1]] = [parts[1], parts[0]];
    expect(problems({ ...ok, parts })).toContainEqual(
      expect.stringMatching(/first part is not the root/),
    );
  });

  it("wants ids numeric and unique, names config-shaped", () => {
    expect(problems(edit(ok, "2", { id: "two" }))).toContainEqual(
      expect.stringMatching(/not a number/),
    );
    expect(problems(edit(ok, "2", { id: "1" }))).toContainEqual(
      expect.stringMatching(/share this id/),
    );
    expect(problems(edit(ok, "2", { name: "fuel tank" }))).toContainEqual(
      expect.stringMatching(/not a config name/),
    );
  });

  it("wants parents that exist and nodes that point both ways", () => {
    expect(
      problems(edit(ok, "2", { parent: { id: "99", via: "stack" } })),
    ).toContainEqual(expect.stringMatching(/is no part/));
    const oneWay = edit(ok, "2", {
      nodes: ok.parts[1].nodes.map((n) =>
        n.id === "top" ? { ...n, to: null } : n,
      ),
    });
    expect(problems(oneWay)).toContainEqual(
      expect.stringMatching(/no node of its own/),
    );
    expect(problems(oneWay)).toContainEqual(
      expect.stringMatching(/has no node back/),
    );
    const dup = edit(ok, "2", {
      nodes: [...ok.parts[1].nodes, ok.parts[1].nodes[0]],
    });
    expect(problems(dup)).toContainEqual(
      expect.stringMatching(/appears twice/),
    );
  });

  it("wants finite positions and a unit quaternion", () => {
    expect(problems(edit(ok, "2", { pos: [0, NaN, 0] }))).toContainEqual(
      expect.stringMatching(/pos is not finite/),
    );
    expect(problems(edit(ok, "2", { rot: [0, 0, 0, 2] }))).toContainEqual(
      expect.stringMatching(/unit quaternion/),
    );
  });

  it("wants stages contiguous from 0, and drops where something fires", () => {
    /* Move the launch to 3: stage 2 fires nothing. */
    let c = ok;
    for (const id of ["6", "7", "8"])
      c = edit(c, id, {
        stage: {
          ignite: 3,
          drop: c.parts.find((p) => p.id === id)!.stage.drop,
        },
      });
    expect(problems(c)).toContainEqual(
      expect.stringMatching(/nothing fires in stage 2/),
    );
    expect(
      problems(edit(ok, "2", { stage: { ignite: null, drop: 4 } })),
    ).toContainEqual(
      expect.stringMatching(/leaves in stage 4, where nothing fires/),
    );
    expect(
      problems(edit(ok, "2", { stage: { ignite: -1, drop: 0 } })),
    ).toContainEqual(expect.stringMatching(/not a stage/));
  });

  it("wants symmetry with other parts, and resources within their tanks", () => {
    expect(problems(edit(ok, "7", { symmetry: ["7"] }))).toContainEqual(
      expect.stringMatching(/symmetry with itself/),
    );
    expect(problems(edit(ok, "7", { symmetry: ["77"] }))).toContainEqual(
      expect.stringMatching(/is no part/),
    );
    expect(
      problems(
        edit(ok, "7", {
          resources: [{ name: "SolidFuel", amount: 400, max: 375 }],
        }),
      ),
    ).toContainEqual(expect.stringMatching(/more than it can/));
  });

  it("wants a one-line description with no // in it", () => {
    expect(
      problems({ ...ok, description: "see https://example.com" }),
    ).toContainEqual(expect.stringMatching(/contains \/\//));
    expect(problems({ ...ok, description: "two\nlines" })).toContainEqual(
      expect.stringMatching(/spans lines/),
    );
    expect(problems({ ...ok, name: " " })).toContainEqual(
      expect.stringMatching(/no name/),
    );
    expect(problems({ ...ok, parts: [] })).toEqual(["no parts"]);
  });

  it("finds a loop of parents", () => {
    /* 1 → 2 → 1: the root becomes 2's child while staying 2's parent. */
    const c = edit(
      edit(ok, "1", { parent: { id: "2", via: "surface" } }),
      "2",
      { parent: { id: "1", via: "surface" } },
    );
    expect(problems(c)).toContainEqual(expect.stringMatching(/root parts/));
  });
});

import { describe, it, expect } from "vitest";
import { checkCraft, readCraft, writeCraft } from "../../src/craft/index.js";
import type { Craft, CraftPart } from "../../src/craft/index.js";

/* A strut connector is a compound part: bolted to one part, reaching for a
   second. The file carries `partName = CompoundPart` and a PARTDATA block
   with the target and the far end in the part's frame, as the game wrote
   them for a two-tank sample (#483). */
const part = (
  over: Partial<CraftPart> & Pick<CraftPart, "id" | "name" | "pos">,
): CraftPart => ({
  rot: [0, 0, 0, 1],
  parent: null,
  nodes: [],
  stage: { ignite: null, drop: 0 },
  symmetry: [],
  modules: [],
  variant: null,
  attach: null,
  rigid: false,
  resources: [],
  ...over,
});

const craft: Craft = {
  name: "two tanks and a strut",
  description: "a test",
  hangar: "VAB",
  vesselType: "Probe",
  parts: [
    part({ id: "1", name: "fuelTank", pos: [0, 15, 0] }),
    part({
      id: "2",
      name: "fuelTankSmallFlat",
      pos: [-1.19, 15.578, -0.319],
      parent: { id: "1", via: "surface" },
      attach: { p: [0.625, 0, 0], d: [1, 0, 0] },
    }),
    part({
      id: "3",
      name: "strutConnector",
      pos: [-0.156, 15.701, -0.583],
      rot: [0, 0.6087619, 0, -0.793353],
      parent: { id: "1", via: "surface" },
      modules: ["CModuleStrut"],
      compound: {
        target: "2",
        pos: [-0.481, -0.004, 0.682],
        dir: [-0.576, -0.005, 0.817],
        rot: [0, 0.923878, 0, 0.382686],
        col: "",
      },
    }),
  ],
};

describe("a compound part", () => {
  it("is written as the game writes one and reads back the same", () => {
    const text = writeCraft(craft);
    expect(text).toContain("partName = CompoundPart");
    expect(text).toMatch(/PARTDATA\s*\{\s*tgt = 2\s*\n\s*tpersID = \d+/);
    expect(text).toContain("dir = -0.576,-0.005,0.817");
    const back = readCraft(text);
    const strut = back.parts.find((p) => p.name === "strutConnector")!;
    expect(strut.compound).toEqual(craft.parts[2].compound);
    expect(
      back.parts.find((p) => p.name === "fuelTank")!.compound,
    ).toBeUndefined();
    expect(checkCraft(back)).toEqual([]);
  });
  it("is refused where it reaches for no part", () => {
    const bad: Craft = {
      ...craft,
      parts: craft.parts.map((p) =>
        p.compound ? { ...p, compound: { ...p.compound, target: "9" } } : p,
      ),
    };
    expect(checkCraft(bad).map((x) => x.what)).toContain(
      'reaches for "9", which is no part',
    );
  });
});

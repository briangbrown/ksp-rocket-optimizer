import { describe, it, expect } from "vitest";
import { checkCraft, readCraft, writeCraft } from "../../src/craft/index.js";
import { gen } from "./sample.js";

/* Over random valid crafts — one to sixty parts, random trees, stages,
   symmetry, resources — the writer and reader are inverse, the checks pass,
   the text is deterministic, and one changed field moves only its own
   lines. Seeded, so a failure names the seed and comes back. */

const SEEDS = 200;

describe("write then read", () => {
  it("returns the craft it was given, for every seed", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const c = gen(seed);
      expect(checkCraft(c), `seed ${seed} generates a valid craft`).toEqual([]);
      const text = writeCraft(c);
      expect(readCraft(text), `seed ${seed}`).toEqual(c);
      expect(writeCraft(c), `seed ${seed} writes the same bytes twice`).toBe(
        text,
      );
    }
  });

  it("holds on the biggest crafts it will meet", () => {
    for (const seed of [7, 11]) {
      const c = gen(seed, 400);
      expect(readCraft(writeCraft(c))).toEqual(c);
    }
  });

  it("changes only the lines a changed field owns", () => {
    const c = gen(3);
    const a = writeCraft(c).split("\n");
    const b = writeCraft({ ...c, description: "something else" }).split("\n");
    expect(a.length).toBe(b.length);
    const diff = a.filter((l, i) => l !== b[i]);
    expect(diff).toEqual([
      "description = seed 3, " + c.parts.length + " parts",
    ]);

    const p = c.parts[c.parts.length - 1];
    const moved = writeCraft({
      ...c,
      parts: c.parts.map((q) =>
        q === p ? { ...q, pos: [q.pos[0], q.pos[1] + 1, q.pos[2]] } : q,
      ),
    }).split("\n");
    const changed = a.filter((l, i) => l !== moved[i]);
    /* pos, attPos0, and the header's size where the part was on the edge. */
    expect(changed.length).toBeGreaterThanOrEqual(2);
    expect(changed.length).toBeLessThanOrEqual(3);
    expect(changed.some((l) => l.startsWith("\tpos = "))).toBe(true);
  });
});

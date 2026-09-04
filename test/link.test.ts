// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fromLink, toLink } from "../src/ui/link.js";
import { parseConfig } from "../src/ui/config.js";
import { DATA } from "../src/core/catalogue.js";
import { withDeps } from "../src/core/tech.js";

/* The design as a link, #140: the configuration string goes into the hash
   and comes back out the same, small enough to send, and a hash that is not
   one says so rather than parsing as something. The app's own writing of it
   is held by test/seam-input.test.tsx. */

const tier = (n: number) =>
  Object.keys(DATA.nodes).filter((k) => DATA.nodes[k].lvl <= n);

const config = (over: Record<string, unknown> = {}) =>
  "KSP-PLANNER " +
  JSON.stringify({
    origin: "Kerbin",
    dest: "Mun",
    profile: "land",
    returning: true,
    payload: 2.5,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    objective: "cost",
    boosters: true,
    chutes: true,
    needGimbal: false,
    planeNow: false,
    asparagus: false,
    maxAspect: 14,
    expansions: { mh: false, rs: true },
    tech: [...withDeps(DATA.nodes, tier(5))].sort(),
    excluded: [],
    cuts: null,
    splits: [],
    ...over,
  });

describe("a design as a link", () => {
  it("comes back as the string that went in", async () => {
    for (const text of [
      config(),
      config({ tech: [...withDeps(DATA.nodes, tier(9))].sort() }),
      config({
        tech: [...withDeps(DATA.nodes, ["Start", "Heavy Rocketry"])].sort(),
        excluded: ["Mainsail", "Vector"],
        cuts: [1, 4],
        splits: [[0, 2]],
      }),
    ]) {
      const hash = await toLink(text);
      expect(hash.startsWith("#c=")).toBe(true);
      const back = await fromLink(hash);
      expect(back).toEqual({ text });
    }
  });

  it("is short enough to send", async () => {
    expect((await toLink(config())).length).toBeLessThan(400);
    expect(
      (
        await toLink(
          config({ tech: [...withDeps(DATA.nodes, tier(9))].sort() }),
        )
      ).length,
    ).toBeLessThan(1200);
  });

  it("parses the same as the paste does", async () => {
    const back = await fromLink(await toLink(config()));
    if (!back || back.error !== undefined) throw new Error("no design");
    const a = parseConfig(config());
    const b = parseConfig(back.text);
    expect(b).toEqual(a);
  });

  it("carries nothing on a plain visit, and says so on a broken one", async () => {
    expect(await fromLink("")).toBeNull();
    expect(await fromLink("#rocket")).toBeNull();
    const cut = (await toLink(config())).slice(0, 40);
    const r = await fromLink(cut);
    expect(r?.error).toMatch(/did not carry a design/);
    expect((await fromLink("#c=!!!"))?.error).toMatch(/did not carry/);
  });
});

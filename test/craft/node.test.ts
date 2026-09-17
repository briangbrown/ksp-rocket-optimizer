import { describe, it, expect } from "vitest";
import { CraftError, parseNode, printNode } from "../../src/craft/index.js";
import { MAX_CHARS } from "../../src/craft/node.js";

/* The ConfigNode layer, lossless: what the game's reader accepts this
   accepts, and what it read it writes back with nothing dropped. */

const P = (t: string) => parseNode(t);

describe("parseNode", () => {
  it("reads values and nested blocks, keeping order and repeats", () => {
    const n = P("a = 1\nB\n{\n\tk = v\n\tk = w\n\tC\n\t{\n\t}\n}\na = 2\n");
    expect(n.values).toEqual([
      ["a", "1"],
      ["a", "2"],
    ]);
    expect(n.nodes).toHaveLength(1);
    expect(n.nodes[0].name).toBe("B");
    expect(n.nodes[0].values).toEqual([
      ["k", "v"],
      ["k", "w"],
    ]);
    expect(n.nodes[0].nodes[0].name).toBe("C");
  });

  it("reads CRLF, CR, a byte-order mark and an empty value", () => {
    const n = P("﻿ship = x\r\ndescription = \r\nPART\r{\r}\r\n");
    expect(n.values).toEqual([
      ["ship", "x"],
      ["description", ""],
    ]);
    expect(n.nodes[0].name).toBe("PART");
  });

  it("drops everything after // on a line, as the game does", () => {
    const n = P("a = http://x // note\n// whole line\nb = 2\n");
    expect(n.values).toEqual([
      ["a", "http:"],
      ["b", "2"],
    ]);
  });

  it("takes a brace on the name's line, and a whole block on one", () => {
    const n = P("A {\n k = v\n}\nB { x = 1 }\n");
    expect(n.nodes.map((c) => c.name)).toEqual(["A", "B"]);
    expect(n.nodes[1].values).toEqual([["x", "1"]]);
  });

  it("keeps = inside a value", () => {
    expect(P("k = a = b\n").values).toEqual([["k", "a = b"]]);
  });

  it("names the line of an unmatched brace", () => {
    expect(() => P("A\n{\n")).toThrow(CraftError);
    expect(() => P("A\n{\n")).toThrow(/left open/);
    try {
      P("a = 1\n}\n");
    } catch (e) {
      expect(e).toBeInstanceOf(CraftError);
      expect((e as CraftError).line).toBe(2);
      expect((e as CraftError).message).toMatch(/^line 2: unmatched/);
    }
  });

  it("refuses a name with no block after it", () => {
    expect(() => P("A\nb = 1\n")).toThrow(/expected \{ after A/);
    expect(() => P("A\n")).toThrow(/expected \{ after A/);
  });

  it("refuses more than it could ever be asked to read", () => {
    expect(() => P("x".repeat(MAX_CHARS + 1))).toThrow(CraftError);
    let deep = "";
    for (let i = 0; i < 70; i++) deep += "N\n{\n";
    expect(() => P(deep)).toThrow(/deeper/);
  });
});

describe("printNode", () => {
  it("is the inverse of parseNode on the canonical text", () => {
    const t =
      "ship = x\ndescription = \nPART\n{\n\tpart = a_1\n\tRESOURCE\n\t{\n\t\tname = LiquidFuel\n\t}\n}\n";
    expect(printNode(P(t))).toBe(t);
  });

  it("canonicalises what it read once, and then holds", () => {
    const messy = "﻿ ship=x \r\n PART{ part = a_1\r\n }\r\n";
    const once = printNode(P(messy));
    expect(once).toBe("ship = x\nPART\n{\n\tpart = a_1\n}\n");
    expect(printNode(P(once))).toBe(once);
    expect(P(once)).toEqual(P(messy));
  });
});

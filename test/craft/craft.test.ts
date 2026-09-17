import { describe, it, expect } from "vitest";
import {
  CraftError,
  VERSION,
  parseNode,
  printNode,
  readCraft,
  writeCraft,
} from "../../src/craft/index.js";
import { sample } from "./sample.js";

/* The semantic layer: a Craft becomes the text the game loads, and any text
   the game wrote becomes a Craft. The format facts here are read off files
   KSP 1.12.5 wrote, not off a write-up. */

const lines = (t: string) => t.split("\n");
const block = (t: string, token: string) => {
  const ls = lines(t);
  const i = ls.findIndex((l) => l === `\tpart = ${token}`);
  expect(i, `no PART for ${token}`).toBeGreaterThan(0);
  let j = i;
  while (ls[j] !== "}") j++;
  return ls.slice(i, j);
};

describe("writeCraft", () => {
  const text = writeCraft(sample());

  it("writes the header the game writes", () => {
    const head = lines(text).slice(0, 14);
    expect(head[0]).toBe("ship = Sample");
    expect(head[1]).toBe(`version = ${VERSION}`);
    expect(head).toContain("type = VAB");
    expect(head).toContain("vesselType = Probe");
    expect(head.find((l) => l.startsWith("size = "))).toMatch(
      /^size = [\d.]+,[\d.]+,[\d.]+$/,
    );
    expect(lines(text).filter((l) => l === "PART")).toHaveLength(10);
  });

  it("names a part by config name and id, and links its children", () => {
    const tank = block(text, "fuelTank_5");
    expect(tank).toContain("\tlink = liquidEngine2_6");
    expect(tank).toContain("\tlink = radialDecoupler_9");
    expect(tank).toContain("\tlink = radialDecoupler_10");
    expect(tank.filter((l) => l.startsWith("\tlink"))).toHaveLength(3);
  });

  it("writes every stack node in the long form, occupied or open", () => {
    const tank = block(text, "fuelTank_5");
    expect(tank).toContain(
      "\tattN = top,stackDecoupler_4_0|0.98|0_0|1|0_0|0.98|0_0|1|0",
    );
    expect(tank).toContain(
      "\tattN = bottom,liquidEngine2_6_0|-0.91|0_0|-1|0_0|-0.91|0_0|-1|0",
    );
    const eng = block(text, "liquidEngine2_6");
    expect(eng).toContain(
      "\tattN = bottom,Null_0_0|-1.5|0_0|-1|0_0|-1.5|0_0|-1|0",
    );
  });

  it("marks a surface-attached part and names what it is bolted to", () => {
    const dec = block(text, "radialDecoupler_9");
    expect(dec).toContain("\tattm = 1");
    expect(dec).toContain("\tsrfN = srfAttach,fuelTank_5");
    expect(dec).toContain("\tsym = radialDecoupler_10");
    expect(dec.filter((l) => l.startsWith("\tattN"))).toHaveLength(0);
    expect(block(text, "fuelTank_5")).toContain("\tattm = 0");
  });

  it("numbers the stages the game's way: launch highest, −1 unstaged", () => {
    const lower = block(text, "liquidEngine2_6");
    expect(lower).toContain("\tistg = 2");
    expect(lower).toContain("\tsqor = 2");
    expect(lower).toContain("\tdstg = 0");
    const booster = block(text, "solidBooster.v2_7");
    expect(booster).toContain("\tistg = 2");
    expect(booster).toContain("\tdstg = 1");
    expect(booster).toContain("\tsidx = 1"); // the second thing firing in stage 2
    const tank = block(text, "fuelTank_2");
    expect(tank).toContain("\tistg = -1");
    expect(tank).toContain("\tsidx = -1");
    expect(tank).toContain("\tsqor = -1");
  });

  it("writes resources full, and module stubs in order", () => {
    const tank = block(text, "fuelTank_2");
    const k = tank.indexOf("\tRESOURCE");
    expect(tank.slice(k, k + 6)).toEqual([
      "\tRESOURCE",
      "\t{",
      "\t\tname = LiquidFuel",
      "\t\tamount = 180",
      "\t\tmaxAmount = 180",
      "\t\tflowState = True",
    ]);
    const eng = block(text, "liquidEngine3.v2_3");
    expect(eng.filter((l) => l === "\tMODULE")).toHaveLength(3);
    expect(eng).toContain("\t\tname = ModuleGimbal");
    for (const n of ["EVENTS", "ACTIONS", "PARTDATA"])
      expect(eng).toContain(`\t${n}`);
  });

  it("is deterministic and canonical ConfigNode text", () => {
    expect(writeCraft(sample())).toBe(text);
    expect(printNode(parseNode(text))).toBe(text);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\r");
  });

  it("refuses a craft the game would not load, naming the first problem", () => {
    const c = sample();
    const parts = [...c.parts];
    parts[1] = { ...parts[1], parent: null };
    expect(() => writeCraft({ ...c, parts })).toThrow(CraftError);
    expect(() => writeCraft({ ...c, parts })).toThrow(/2 root parts/);
  });
});

describe("readCraft", () => {
  it("reads back what writeCraft wrote, exactly", () => {
    const c = sample();
    expect(readCraft(writeCraft(c))).toEqual(c);
  });

  /* A file as the game writes one: CRLF, a byte-order mark, header fields we
     do not carry, MODULE state, an open node, a surface node with the
     collider named, float noise on the quaternion. Written by hand from the
     shape of 1.12.5's own output; the fields it keeps are what matter. */
  const GAME = [
    "﻿ship = From the game",
    "version = 1.12.5",
    "description = Saved by the VAB",
    "type = VAB",
    "size = 1.25,4.5,1.25",
    "steamPublishedFileId = 0",
    "persistentId = 2706839558",
    "rot = 0,0,0,0",
    "missionFlag = Squad/Flags/default",
    "vesselType = Ship",
    "OverrideDefault = False,False,False,False",
    "OverrideActionControl = 0,0,0,0",
    "OverrideAxisControl = 0,0,0,0",
    "OverrideGroupNames = ,,,",
    "PART",
    "{",
    "\tpart = probeStackSmall_4294515788",
    "\tpartName = Part",
    "\tpersistentId = 3756379023",
    "\tpos = 0,15.5,0",
    "\tattPos = 0,0,0",
    "\tattPos0 = 0,15.5,0",
    "\trot = 0,0,0,1.00000012",
    "\tmir = 1,1,1",
    "\tsymMethod = Radial",
    "\tistg = -1",
    "\tdstg = 0",
    "\tsidx = -1",
    "\tsqor = -1",
    "\tsepI = -1",
    "\tattm = 0",
    "\tlink = fuelTank_4294405452",
    "\tlink = ksp.r.largeBatteryPack_4294395360",
    "\tattN = top,Null_0_0|0.199026704|0_0|1|0_0|0.199026704|0_0|1|0",
    "\tattN = bottom,fuelTank_4294405452_0|-0.199026704|0_0|-1|0_0|-0.199026704|0_0|-1|0",
    "\tEVENTS",
    "\t{",
    "\t}",
    "\tMODULE",
    "\t{",
    "\t\tname = ModuleCommand",
    "\t\tisEnabled = True",
    "\t\tEVENTS",
    "\t\t{",
    "\t\t}",
    "\t}",
    "\tRESOURCE",
    "\t{",
    "\t\tname = ElectricCharge",
    "\t\tamount = 50",
    "\t\tmaxAmount = 50",
    "\t\tflowState = True",
    "\t}",
    "}",
    "PART",
    "{",
    "\tpart = fuelTank_4294405452",
    "\tpos = 0,14.32,0",
    "\trot = 0,0,0,1",
    "\tistg = -1",
    "\tdstg = 0",
    "\tattm = 0",
    "\tattN = top,probeStackSmall_4294515788_0|0.98|0_0|1|0_0|0.98|0_0|1|0",
    "\tattN = bottom,Null_0_0|-0.91|0_0|-1|0_0|-0.91|0_0|-1|0",
    "}",
    "PART",
    "{",
    "\tpart = ksp.r.largeBatteryPack_4294395360",
    "\tpos = 0.7,15.5,0",
    "\trot = 0,0.7071068,0,0.7071068",
    "\tistg = -1",
    "\tdstg = 0",
    "\tattm = 1",
    "\tsrfN = srfAttach,probeStackSmall_4294515788,collider_outer,0|-0.1|0,0|-1|0,0|-0.1|0",
    "}",
    "",
  ].join("\r\n");

  it("reads a file the game wrote, keeping what a Craft carries", () => {
    const c = readCraft(GAME);
    expect(c.name).toBe("From the game");
    expect(c.description).toBe("Saved by the VAB");
    expect(c.hangar).toBe("VAB");
    expect(c.parts.map((p) => p.name)).toEqual([
      "probeStackSmall",
      "fuelTank",
      "ksp.r.largeBatteryPack",
    ]);
    const [core, tank, batt] = c.parts;
    expect(core.id).toBe("4294515788");
    expect(core.parent).toBeNull();
    expect(core.rot).toEqual([0, 0, 0, 1.00000012]);
    expect(core.nodes).toEqual([
      { id: "top", p: [0, 0.199026704, 0], d: [0, 1, 0], to: null },
      {
        id: "bottom",
        p: [0, -0.199026704, 0],
        d: [0, -1, 0],
        to: "4294405452",
      },
    ]);
    expect(core.modules).toEqual(["ModuleCommand"]);
    expect(core.resources).toEqual([
      { name: "ElectricCharge", amount: 50, max: 50 },
    ]);
    expect(tank.parent).toEqual({ id: "4294515788", via: "stack" });
    expect(batt.parent).toEqual({ id: "4294515788", via: "surface" });
    expect(batt.stage).toEqual({ ignite: null, drop: 0 });
  });

  it("survives a round trip through the writer as data", () => {
    const c = readCraft(GAME);
    /* The game's float noise is kept as read and written back as read. */
    expect(
      readCraft(
        writeCraft({
          ...c,
          parts: c.parts.map((p) =>
            p.id === "4294515788" ? { ...p, rot: [0, 0, 0, 1] } : p,
          ),
        }),
      ),
    ).toEqual({
      ...c,
      parts: c.parts.map((p) =>
        p.id === "4294515788" ? { ...p, rot: [0, 0, 0, 1] } : p,
      ),
    });
  });

  it("reads the short node form the first versions wrote, and bare part blocks", () => {
    const old = [
      "ship = It works!",
      "version = 0.13.3",
      "{",
      "\tpart = mk1pod_4293331606",
      "\tpos = 0.45,16.21,-0.05",
      "\trot = 0,0,0,1",
      "\tistg = 0",
      "\tdstg = 0",
      "\tattm = 0",
      "\tlink = parachuteSingle_4293331574",
      "\tattN = top, parachuteSingle_4293331574",
      "}",
      "{",
      "\tpart = parachuteSingle_4293331574",
      "\tpos = 0.45,16.62,-0.05",
      "\trot = 0,0,0,1",
      "\tistg = 0",
      "\tattm = 0",
      "\tattN = bottom, mk1pod_4293331606",
      "}",
      "",
    ].join("\n");
    const c = readCraft(old);
    expect(c.parts).toHaveLength(2);
    expect(c.parts[0].nodes).toEqual([
      { id: "top", p: [0, 0, 0], d: [0, 0, 0], to: "4293331574" },
    ]);
    expect(c.parts[1].parent).toEqual({ id: "4293331606", via: "stack" });
    expect(c.parts[1].stage).toEqual({ ignite: 0, drop: 0 });
  });

  it("says what is wrong with a file that is not a craft", () => {
    expect(() => readCraft("a = 1\n")).toThrow(/no `ship =` line/);
    expect(() =>
      readCraft("ship = x\nPART\n{\n\tpart = fuelTank_1\n}\n"),
    ).toThrow(/has no pos/);
    expect(() =>
      readCraft("ship = x\nPART\n{\n\tpart = fuelTank\n\tpos = 0,0,0\n}\n"),
    ).toThrow(/not <name>_<number>/);
    expect(() =>
      readCraft("ship = x\nPART\n{\n\tpart = fuelTank_1\n\tpos = 0,0\n}\n"),
    ).toThrow(/3 numbers/);
    expect(() =>
      readCraft(
        "ship = x\nPART\n{\n\tpart = fuelTank_1\n\tpos = 0,0,0\n\tattN = top\n}\n",
      ),
    ).toThrow(/no comma/);
    for (const bad of ["ship = x\nPART\n{\n", "ship = x\n}\n"])
      expect(() => readCraft(bad)).toThrow(CraftError);
  });
});

import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/ui/config.js";
import { missionConfig } from "../perf/cases.js";
import { missionInput } from "../perf/cases.js";

/* The benchmark mission is measured two ways: through planMission in the
   harness, and by pasting a configuration into the running app to measure on a
   device (#30). Those only compare if they describe the same mission.

   parseConfig silently drops any field it does not recognise — it counts them
   rather than failing — so a rename would leave the device quietly measuring
   the app's defaults instead. */

describe("benchmark configuration", () => {
  it("is accepted whole by the app's own parser", () => {
    const { values, took, left, error } = parseConfig(missionConfig(9));
    expect(error).toBeUndefined();
    expect(left, "parseConfig rejected fields the harness emits").toBe(0);
    expect(took).toBeGreaterThan(15);
    expect(values.tech.size).toBeGreaterThan(0);
  });

  it("describes the same mission the harness solves", () => {
    const { values } = parseConfig(missionConfig(9, "Duna"));
    const input = missionInput("Duna", 9);
    expect(values.dest).toBe("Duna");
    expect(values.objective).toBe(input.objective);
    expect(values.payload).toBe(input.payload);
    expect(values.maxAspect).toBe(input.maxAspect);
    expect(values.returning).toBe(true);
    expect([...values.tech].sort()).toEqual([...input.unlocked].sort());
  });
});

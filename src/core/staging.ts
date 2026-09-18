import type { Solution } from "./solution.js";

/* The order the rocket comes apart in, once, for everyone who needs it: the
   build view's stepper and scrubber, and the craft file's stage numbers
   (#460). Two copies of this — one in the drawing, one in the writer — is the
   two-descriptions failure `model.ts` exists to prevent; the drawing used to
   own it (`stagingSteps` in build.tsx) and now projects it. #463

   The events are in flight order, and each carries the stage number KSP
   gives it: the launch stage is the highest and 0 fires last, which is how a
   .craft's `istg` and `dstg` count. What fires and what lets go is named by
   the stage it belongs to and its role, so the adapter can find the parts
   and the drawing can find the shapes.

   The rules are the game's, as the tool prices them. The launch stage lights
   the first stage's engines and every booster on it. A ring of boosters — an
   SRB pair, liquid columns, drop tanks, an asparagus ring alike, since the
   solver flies all of them as one pool to one burnout — leaves in a stage of
   its own, its radial decouplers firing and nothing lighting. Separating a
   spent stage and lighting the next is one stage, the way the game does it
   and the way the Δv accounting assumes: no coast between. A stage that
   lands on a body with air and climbs off it can carry a ring too (the
   solver mounts boosters on any stage that starts an ascent), and its ring
   goes the same way. Parachutes are the reader's. */

type Role = "engine" | "booster" | "boosterHold" | "decoupler";

/* A part or set of parts by the stage that carries it (an index into the
   plan's stages) and what it is. */
type PartRef = { stage: number; role: Role };

type StagingEvent = {
  /* KSP's number for it: the launch is the highest, 0 fires last. */
  stage: number;
  /* What the rocket is once it has happened, as the stepper says it. */
  label: string;
  ignite: ReadonlyArray<PartRef>;
  decouple: ReadonlyArray<PartRef>;
  /* The state after: how many stages have left, from the bottom, and
     whether the bottom live stage still has its boosters on. */
  drop: number;
  boost: boolean;
};

type Staging = {
  /* The launch stage's number, which is also how many events follow it. */
  launch: number;
  events: ReadonlyArray<StagingEvent>;
};

function stagingOf(stages: ReadonlyArray<{ sol: Solution | null }>): Staging {
  /* Unsolved stages are not flown; the indices kept are the caller's. */
  const live = stages
    .map((s, i) => ({ i, sol: s.sol }))
    .filter((s): s is { i: number; sol: Solution } => s.sol !== null);
  type Ev = Omit<StagingEvent, "stage">;
  const events: Array<Ev> = [];
  const hasRing = (k: number) => k < live.length && !!live[k].sol.boosters;
  const lights = (k: number): Array<PartRef> =>
    k < live.length
      ? [
          { stage: live[k].i, role: "engine" },
          ...(hasRing(k)
            ? [{ stage: live[k].i, role: "booster" as const }]
            : []),
        ]
      : [];
  if (live.length)
    events.push({
      label: "On the pad",
      ignite: lights(0),
      decouple: [],
      drop: 0,
      boost: hasRing(0),
    });
  for (let k = 0; k < live.length; k++) {
    if (hasRing(k))
      events.push({
        label: "Boosters away · core burns on",
        ignite: [],
        decouple: [{ stage: live[k].i, role: "boosterHold" }],
        drop: k,
        boost: false,
      });
    events.push({
      label: k === live.length - 1 ? "Payload alone" : `Stage ${k + 1} spent`,
      ignite: lights(k + 1),
      decouple: [{ stage: live[k].i, role: "decoupler" }],
      drop: k + 1,
      boost: hasRing(k + 1),
    });
  }
  const launch = events.length - 1;
  return {
    launch,
    events: events.map((e, k) => ({ ...e, stage: launch - k })),
  };
}

export { stagingOf };
export type { PartRef, Role, Staging, StagingEvent };

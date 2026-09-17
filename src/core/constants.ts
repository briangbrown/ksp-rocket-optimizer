const G0 = 9.81;

/* Which expansions the roster is allowed to draw on. Both flags are always
   present — the UI holds them as a pair — but the caches below are handed
   whatever the caller has, which can be nothing at all. */
type Expansions = { mh: boolean; rs: boolean };

/* What the player has researched, and what they have asked the solver to leave
   alone, both by part or node name. Rosters are rebuilt per solve by
   planMission, which is what keeps a cache entry from outliving the roster that
   produced it — the failure #18 was. `excluded` is optional at most call sites
   and arrives absent as often as empty. */
type Roster = ReadonlySet<string>;
type Excluded = ReadonlySet<string> | null | undefined;

/* Cache-key helpers, shared so the two solver caches cannot drift apart. They
   both key on the roster, and a rule about what counts as the same roster that
   exists in two copies is a rule that will eventually exist in two versions —
   see "Where the bodies are buried" in CLAUDE.md. */

/* A stand-in key for a missing object. WeakMap needs an object, and `unlocked`
   or `excluded` can legitimately arrive null. */
const NONE = Object.freeze({});

/* Expansions by value, not identity. Toggling ReStock+ in the UI replaces the
   `expansions` object while leaving `unlocked` and `excluded` alone, so a cache
   keyed on those identities alone answers with the wrong part roster. Only the
   flags matter, so a fresh object with the same flags is the same key. */
const expBits = (x: Expansions | null | undefined) =>
  x ? 1 | (x.rs ? 2 : 0) | (x.mh ? 4 : 0) : 0;

/* Whether an install offers a part. `mh` and `rs` say which expansion ships
   it — either one present is enough, which is how the engine plates, shipped
   by both, are one row. `mhr` is ReStock+'s `MHReplacement = True`: a
   stand-in for a Making History part, which ReStock+ itself hides
   (`TechHidden`, `category = none`) the moment the expansion is installed —
   the Caravel is a Skiff for players without it, and a player with both
   never sees one. So a stand-in is offered only while Making History is
   absent. No expansions at all — a core caller with nothing to say — offers
   everything, which is what the coupler gate always did. */
const offered = (
  p: { mh?: number; rs?: number; mhr?: number },
  x: Expansions | null | undefined,
) => {
  if (!x) return true;
  if (p.mhr && x.mh) return false;
  if (!p.mh && !p.rs) return true;
  return !!(p.mh && x.mh) || !!(p.rs && x.rs);
};

/* How a mission is willing to be flown: which regime of burn a design may
   use, as a ladder. It is part of the mission, carried in the configuration
   and the link, and it is a filter on what is offered — a design's physics is
   the same under every rung; a rung only says which designs a reader will
   sit through. Seconds would be the wrong unit: the same 523 s is 14% of
   extra Δv from low Kerbin orbit and free out in solar orbit, so the ladder
   is in what the burn is, not how long it takes. #416

     impulsive  one burn a leg, under IMPULSIVE_ARC — predictions at their
                most accurate, conventional engines
     standard   one burn a leg, under ARC_MAX — as far as the finite-burn
                form was flown; the default
     long       periapsis kicks: several passes with an orbit of waiting
                between each, up to a revolution in all
     low        spirals over many revolutions, and the electric engines that
                make them, with the power plant and the spiral Δv paid */
type Regime = "impulsive" | "standard" | "long" | "low";
const REGIMES: ReadonlyArray<Regime> = ["impulsive", "standard", "long", "low"];
const REGIME_DEFAULT: Regime = "standard";

export { G0, NONE, REGIMES, REGIME_DEFAULT, expBits, offered };
export type { Excluded, Expansions, Regime, Roster };

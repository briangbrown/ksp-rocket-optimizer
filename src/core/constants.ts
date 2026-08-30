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

export { G0, NONE, expBits };
export type { Excluded, Expansions, Roster };

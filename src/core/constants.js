const G0 = 9.81;

/* Cache-key helpers, shared so the two solver caches cannot drift apart. They
   both key on the roster, and a rule about what counts as the same roster that
   exists in two copies is a rule that will eventually exist in two versions —
   see "Where the bodies are buried" in docs/DEVELOPMENT.md. */

/* A stand-in key for a missing object. WeakMap needs an object, and `unlocked`
   or `excluded` can legitimately arrive null. */
const NONE = Object.freeze({});

/* Expansions by value, not identity. Toggling ReStock+ in the UI replaces the
   `expansions` object while leaving `unlocked` and `excluded` alone, so a cache
   keyed on those identities alone answers with the wrong part roster. Only the
   flags matter, so a fresh object with the same flags is the same key. */
const expBits = (x) => (x ? 1 | (x.rs ? 2 : 0) | (x.mh ? 4 : 0) : 0);

export { G0, NONE, expBits };

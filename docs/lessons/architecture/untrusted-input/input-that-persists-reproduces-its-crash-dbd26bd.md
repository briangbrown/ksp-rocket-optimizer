# Input That Persists Reproduces Its Crash

**Why it matters:** whenever application state is restored from somewhere
outside the process — a URL fragment, `localStorage`, a saved file — and the
restore runs before the page is usable.

## The concept

An unhandled exception in ordinary code costs one interaction. The same
exception while reading input the page will read again on every load — the
address bar, storage, a file it reopens — costs the page for good: reload
reproduces it, and the user has no control that runs before the crash. Three
things follow. The reader may not throw, which means it validates every element
against what the program knows rather than trusting shape alone. Whatever is
written back to persistent state is also checked, or one bad load poisons every
later one. And the last-resort handler's first act is to remove the input, so
the recovery it offers does not lead straight back.

## In this codebase

`parseConfig` in `src/ui/config.ts` wrapped only `JSON.parse` in its try.
`take("splits", Array.isArray(cfg.splits), () => new Map(cfg.splits))` then
threw a `TypeError` on `{"splits":[1]}` — `new Map([1])` — and the throw climbed
out of the mount effect in `app.tsx` before `setHydrated(true)`. Every effect
gated on `hydrated`, including the one that rewrites the hash, so the page sat
under the solving veil and reload sat there too (#174). An `excluded` list was
taken unchecked and saved with the roster, so a link naming every engine made
the next visit unsolvable with no hash at all. Now `readConfig` runs inside a
try, checks each list element by element — parts the catalogue has, nodes via
`Object.hasOwn`, stage counts up to `MAX_K` — and refuses an `excluded` that
names every engine. `MAX_K` is exported from `src/core/plan.ts` and clamped
there too: the seam takes plain data from anyone and holds the floor itself.
`Boundary` in `src/ui/components/boundary.tsx` wraps the app in `main.tsx`; its
`componentDidCatch` calls `history.replaceState` to clear the hash before
offering Reload.

## What made it real

A stage count of 10⁸ in the same field reached `Array(k).fill(...)` in the
solver and killed the worker on every solve. `test/link.test.ts` feeds eleven
malformed fields and asserts each is left at its default and counted as `left`,
never an error; `test/share.test.tsx` mounts and solves on
`{"splits":[1],"cuts":["x"]}`; `test/boundary.test.tsx` asserts the fallback
clears the hash.

## Key takeaway

When input outlives the page, a throw on reading it is permanent — validate
every element, check what you write back, and make the error boundary's first
act removing the input.

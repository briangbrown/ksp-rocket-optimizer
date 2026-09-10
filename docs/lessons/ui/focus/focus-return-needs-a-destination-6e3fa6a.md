# Focus Return Needs a Destination, Not a Memory

**Why it matters:** any focus trap — dialog, sheet, full-screen overlay —
opened by a control that disappears while the trap is up.

## The concept

The usual trap records `document.activeElement` when it opens and focuses it
again on close. That assumes the opener is still there to be recorded. React
runs effects after the commit, and if opening the trap also unmounts the button
that opened it, the browser has already dropped focus to `<body>` before the
effect runs — there is nothing to remember. On close the button that comes back
is a new element, so a stored node would be stale even if there were one. A trap
therefore needs two paths: return to the remembered opener when it is still
connected and is not the body, and otherwise ask the caller for a lookup — a
function that finds the destination by name at close time, not a node captured
at open time.

## In this codebase

`useTrap` in `src/ui/components/primitives.tsx` holds both the sheet and the
build view's full-screen overlay: focus in, Tab wrapped, Escape out, body scroll
held, focus returned. Its fourth argument, `back?: () => HTMLElement | null`,
is the lookup; on close it focuses `was` only if `was.isConnected` and
`was !== document.body`, else `back()`. The build view's _Full screen_ button
unmounts while the overlay is up — its card shows a line where its header was —
so `build.tsx` hands the hook `fullScreenButton`, a `querySelector` for the
button by `aria-label`. #141

## What made it real

`visual/render.test.ts` presses _Full screen_ from the keyboard, asserts
`activeElement` is inside the `role="dialog"`, presses Escape, and asserts
`activeElement`'s `aria-label` is "Full screen" again. Without `back` the last
read is `null`: focus went to the body on open and stayed there on close. jsdom
never mounts the build view, so the real-browser suite is the one place this is
held.

## Key takeaway

Return focus by looking the destination up at close time — the element that
opened a trap may not survive it, and its replacement is a stranger.

# The Reply Queues Behind the Thread It Left

**Why it matters:** whenever work is moved onto a Web Worker to make a page feel
faster, and the result has to come back to the main thread to be painted.

## The concept

A worker takes the computation off the page's thread. It does not take the
delivery off it. A `postMessage` reply is an event on the main thread's queue,
and it waits there behind whatever task is running, however long ago the worker
finished. So off-thread work that completes early is invisible while the main
thread is busy: every reply lands at the instant the long task ends, all at
once, and the page sharpens no sooner than it would have if the computation had
been the thing blocking it. The measurement that tells you this is not how long
the worker took, but when its reply ran — and the gap between the two names the
real bottleneck, which may belong to a different feature entirely.

## In this codebase

The Δv plot's finer pass prices thirty-five thousand Lambert cells for the
picture alone. `priceGrid` in `src/ui/plot-client.ts` (#213) cuts the grid into
one run of columns per thread on a pool of up to four `plot.worker.ts` workers,
each running `priceColumns` from `src/core/transfer.ts`, and lays the replies
back in column order; `useFiner` in `src/ui/components/porkchop.tsx` paints the
coarse grid at once and the fine one when the promise resolves. The pool is
built on first use and kept, and a request no longer wanted is dropped by
ignoring its reply rather than by terminating the threads another plot is
waiting on.

## What made it real

Traced in headless Chrome on a Kerbin → Duna return trip opened from a link:
both grids were posted to the pool 355 ms after navigation, and all eight runs
replied at 1.81 s — every one at the same instant. That instant was the end of
a 1.2 s main-thread long task that began at 613 ms, when the build view's WebGL
canvases mounted and software GL compiled its shaders. The pricing, a couple of
hundred milliseconds of worker time, had finished well inside it; the replies
queued behind it. The page's thread does none of the pricing now, and the
shader compile is the next thing to look at, not the plot.

## Key takeaway

Moving work off the main thread moves the computation, not the delivery — a
reply waits for the thread to be free, so profile when it ran, not when it was
ready.

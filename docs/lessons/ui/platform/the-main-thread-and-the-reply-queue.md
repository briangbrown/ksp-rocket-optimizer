# The main thread and the reply queue

**Syllabus:** [L6](../../README.md#part-3--language-and-platform)

**Why it matters:** The reply queue matters because moving work to a worker
moves the computation and not the delivery: the worker's answer is a
message, a message is a task on the page's one thread, and that task runs
only when the thread is free, so a reply to a plot priced in a few
milliseconds can sit unhandled behind whatever the page is doing; the first
version of the plot's finer pass sliced 34,000 Lambert cells onto the page
thread in twelve-millisecond runs with a paint between each and took a
second and a half for the two plots of a return trip, and understanding why
is what made the second version a pool of workers whose replies the page
handles in one go.

**Before this:** [L5](web-workers-messages-cancellation-and-structured-clone.md),
_Web Workers: messages, cancellation, and structured clone_.

## A worked case

The Δv plot of [P22](../../physics/orbits/transfer-windows-and-the-porkchop-plot.md)
is first drawn from the search's own grid and then repainted three times
finer each way, for the picture alone. Measured in process:

| Grid                         | Cells  | Time   | Per cell |
| ---------------------------- | ------ | ------ | -------- |
| The search's, 94 × 41        | 3,854  | 14 ms  | 3.6 µs   |
| Three times finer, 280 × 121 | 33,880 | 112 ms | 3.3 µs   |
| Both plots of a return trip  | 67,760 | 224 ms |          |

A quarter of a second of arithmetic, and a page whose thread is busy for a
quarter of a second drops fifteen frames and ignores every tap. The first
design therefore did what a page does with long work: it cut the columns
into runs of about twelve milliseconds, priced one run, yielded so the
browser could paint, and continued. That is nineteen slices for the two
plots, and it took a second and a half, six times the arithmetic, because
every slice waited its turn behind a paint, an input event and whatever
else the thread had queued, and each wait was tens of milliseconds.

The second design prices the runs on a small pool of workers and paints
twice: the coarse picture, then the fine one when the replies are back.
The arithmetic is the same 224 ms, spread over a few threads, and the page
thread's part is to lay 34,000 numbers into an array and repaint once. But
even that has a subtlety, which the row is named for. Here is a worker
whose work takes twelve milliseconds, replying to a page thread that is
busy for four hundred:

```js
// node's worker_threads have the same shape as the browser's Web Workers
const { Worker } = require("worker_threads");
const t0 = performance.now();
const w = new Worker(
  `const { parentPort } = require("worker_threads");
  parentPort.on("message", () => { const s = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x += i;
    parentPort.postMessage({ took: (performance.now() - s).toFixed(0) }); });`,
  { eval: true },
);
w.on("message", (m) => {
  console.log(
    `reply handled at ${(performance.now() - t0).toFixed(0)} ms; the worker's work took ${m.took} ms`,
  );
  w.terminate();
});
w.postMessage("go");
const busyUntil = performance.now() + 400;
while (performance.now() < busyUntil) {} // the main thread is busy for 400 ms
console.log(`main thread free at ${(performance.now() - t0).toFixed(0)} ms`);
// main thread free at 401 ms
// reply handled at 402 ms; the worker's work took 12 ms
```

The worker finished at about twelve milliseconds. Its reply was handled at
four hundred and two, one millisecond after the main thread stopped being
busy, because a message handler is a task on the receiving thread's queue
and a queue is served only between tasks. Nothing about the worker was slow.
The delivery waited.

## The idea

The **main thread** is the one thread that lays out and paints the page and
runs its scripts. Everything the user sees is produced there, so anything
that occupies it for longer than a frame, about sixteen milliseconds, is
visible as a frozen page, a dropped animation frame or a tap that lands
late. A worker takes computation off it. Nothing takes delivery off it: a
worker's result becomes visible only when the main thread runs the handler
that reads it and the render that paints it.

The **event loop** is the queue the main thread takes its work from, one
task at a time: an input event, a timer firing, a message arriving from a
worker, a promise resolving. A task runs to completion before the next
begins, and the browser fits its rendering between tasks. Three
consequences shape how work is arranged.

A long task blocks everything behind it. A quarter-second of pricing on the
main thread delays every input event, every timer and every worker reply
that arrives during it, and delays the paint that would have shown the
coarse picture. That is why the arithmetic goes to workers.

A reply is a task too, and it waits its turn. In the snippet, the reply
queued at twelve milliseconds and ran at four hundred and two. The worker
does not deliver; it enqueues. So when the page is busy, results arrive in
the order the queue is served, not the order they were produced, and a
design that expects a reply "as soon as it is ready" is expecting something
the platform does not offer.

Slicing work onto the main thread pays the queue's price on every slice. A
twelve-millisecond run followed by a yield does not resume in twelve
milliseconds; it resumes when its continuation reaches the front of the
queue, behind a paint and anything else that arrived, which is tens of
milliseconds. Nineteen slices at tens of milliseconds each is the second and
a half. The same arithmetic on workers arrives as a few replies, each a
cheap task that lays numbers into an array, and the queue is paid a few
times instead of nineteen.

```
   main thread (the queue, served one task at a time, paints between tasks)

   sliced onto it:   [price 12 ms][paint][input][price 12 ms][paint][…] ×19  ≈ 1.5 s until the fine picture

   on a pool:        [post 4 runs]─────── free: paints the coarse plot, takes input ───────[reply][reply][reply][reply][repaint]
                          │                                                                  ▲
   workers:              w0 ─ price columns 0–69 ──────────────── postMessage ───────────────┘
                         w1 ─ price columns 70–139 ────────────── postMessage ─┘
                         w2 …   w3 …                                            each reply waits only for the thread to be free
```

Two design choices in the plot client follow from the queue rather than
from the workers. The pool is built once and kept, because a plot is asked
for on every change of the brief and constructing threads is a cost paid on
the main thread each time. And a request no longer wanted is dropped by
ignoring its reply, not by terminating the threads, because the other plot
may be waiting on the same pool and a terminate would cost its request too;
the abandoned run finishes in the background and its reply, when it reaches
the front of the queue, finds no request with its id and is discarded. The
solver client of L5 makes the opposite choice, terminate and rebuild,
because a solve is seconds and its worker serves one request at a time.

## In this codebase

[`src/ui/plot-client.ts`](../../../../src/ui/plot-client.ts) is the pool
and the queue discipline. `priceGrid` cuts the grid's columns into even
runs, one per thread, posts each with the request's id, and lays the
replies back at their columns:

```ts
const runs = Math.min(workers.length, grid.nt);
for (let r = 0; r < runs; r++) {
  const from = Math.floor((grid.nt * r) / runs),
    to = Math.floor((grid.nt * (r + 1)) / runs);
  workers[r].postMessage({ id, grid, from, to }); // even runs of columns, one to a thread
}
// in every worker's onmessage:
for (let k = 0; k < m.totals.length; k++)
  req.totals[m.from * req.nf + k] = m.totals[k]; // laid at its column
if (--req.left === 0) req.resolve(req.totals); // the last reply settles the request
```

A request that is aborted is removed from `live` and resolved null, and a
reply arriving for it finds no entry and is dropped. `THREADS` is at most
four and never more than half the cores less one, so the pool does not
starve the solver's own pool, which runs at the same time. [`src/ui/plot.worker.ts`](../../../../src/ui/plot.worker.ts)
is one thread: `priceColumns` over its run, posted back, with the comment
that on the page's thread this "was sliced into twelve-millisecond runs with
a paint between each and took a second and a half." `useFiner` in
[`src/ui/components/porkchop.tsx`](../../../../src/ui/components/porkchop.tsx)
is the page's side: the coarse grid first, `priceGrid` with an
`AbortController` whose abort is the effect's cleanup, and one state update
when the totals arrive, cached by key so folding and reopening the section
costs nothing. `priceColumns` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts)
prices any run of a grid's columns at that grid's spacing, and at the
search's own spacing returns the search's totals to the bit.

## What made it real

The second and a half is the measurement, recorded in the plot worker's
header and in the rule under _The plot's finer pass is a worker pool_ in
[`.claude/rules/ui.md`](../../../../.claude/rules/ui.md): thirty-five
thousand Lambert cells, sliced twelve milliseconds at a time onto the
page's thread, took 1.5 s for a return trip's two plots. The same cells
priced here in one go take 224 ms, so the slicing cost six times the work
it was scheduling, all of it waiting in the queue.

[`test/plot-client.test.ts`](../../../../test/plot-client.test.ts) holds
the pool's discipline with a fake worker: the columns are cut into a run per
thread and the replies laid back in order; two requests on the same pool are
kept apart; an error or a failed start resolves null; a request the card
stops wanting resolves null and its late reply is dropped; and without
workers the client prices in process to the same numbers. The identity of
the numbers is held in the transfer tests: `priceColumns` at the search's
spacing reproduces the search's totals exactly, so the fine picture is the
search, not a different one.

## Where it breaks

- **Slicing long work onto the main thread.** Each slice waits in the queue
  behind a paint and whatever else arrived; nineteen slices took six times
  their arithmetic. Work of that size goes to a worker and comes back as a
  few replies.
- **Expecting a reply when it is ready.** A message handler runs when the
  main thread is free, not when the worker finishes. A page busy for 400 ms
  handles a 12 ms reply at 402.
- **Terminating a shared pool to cancel one request.** The other plot's
  request dies with it and the threads are rebuilt on the main thread. Drop
  the reply by id instead.
- **Rebuilding the pool per request.** Thread construction is main-thread
  work, paid on every change of the brief. Build once, keep.
- **Starving the solver.** The plot's pool runs while the solver's does;
  capped at four and at half the cores, so the solve that matters more is
  not slowed by the picture.

## Try it

Run the snippet and change the busy loop from 400 to 40 ms: the reply is
now handled at about forty, still after the main thread is free, and the
worker's twelve milliseconds are hidden inside it. Then set it to 0: the
reply arrives at about twelve, when the work is done, because the queue was
empty. Then open the application, change the destination to Eeloo and
watch the plot: the coarse picture appears with the window, and the fine one
replaces it a fraction of a second later, in one repaint.

## Check yourself

<details><summary>The worker finished in twelve milliseconds and the main thread handled its reply at four hundred. Was the worker slow?</summary>

No. Its reply became a task on the main thread's queue at twelve
milliseconds, and a queue is served only between tasks; the main thread was
inside a four-hundred-millisecond task, so the reply's handler ran when
that task ended. A worker takes computation off the main thread; delivery
stays on it.

</details>

<details><summary>Why did slicing the finer pass into twelve-millisecond runs take a second and a half for 224 ms of arithmetic?</summary>

Because each slice yielded to the queue and resumed only when its
continuation reached the front, behind a paint and whatever input had
arrived, tens of milliseconds each time. Nineteen slices paid that wait
nineteen times. On workers the same arithmetic returns as a few replies,
each a cheap task, and the queue is paid a few times.

</details>

<details><summary>Why does the plot client drop an unwanted request by ignoring its reply, when the solver client terminates its worker?</summary>

Because the plot's pool is shared and kept: the other plot may be waiting on
it, and rebuilding threads is main-thread work paid on every change of the
brief. A dropped reply costs nothing. The solver's worker serves one request
at a time and a solve is seconds, so terminating it and paying a
construction of milliseconds is the right trade there.

</details>

## Further reading

- The WHATWG HTML Standard, section "Event loops", for the task queue,
  microtasks and where rendering fits between tasks.
- Jake Archibald, "Tasks, microtasks, queues and schedules", for the order in
  which the main thread serves what it is given.
- Google's web.dev guidance on long tasks and the 50 ms threshold, for why a
  quarter-second of arithmetic on the main thread is felt.

## Key takeaway

A worker moves the arithmetic off the page's thread but its reply is still
a task that waits for that thread to be free, so work sliced onto the main
thread pays the queue on every slice, 1.5 s for 224 ms of pricing, while the
same work on a kept pool of threads returns as a few cheap replies laid into
one array and one repaint; drop an unwanted request by ignoring its reply
rather than killing the pool the other plot is waiting on.

_As of 676961e._

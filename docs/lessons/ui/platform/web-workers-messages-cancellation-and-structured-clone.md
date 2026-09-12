# Web Workers: messages, cancellation, and structured clone

**Syllabus:** [L5](../../README.md#part-3--language-and-platform)

**Why it matters:** The worker matters because a full-tech solve takes
about thirteen seconds on a phone, and run on the page's own thread that is
thirteen seconds of frozen page; moving the solve to a worker does not make
it faster, it makes the page usable while it happens, and the whole of what
has to be understood to do it is three things, the agreed shapes of the
messages the two threads exchange, how a solve nobody wants any more is
stopped, and what the browser's copy of a message will and will not carry
across, because a promise held open across that boundary that never
settles is a veil over the page that never lifts.

**Before this:** [L1](../../architecture/the-seam/plain-data-across-a-seam.md),
_Plain data across a seam_.

## A worked case

A reader changes the payload, then changes it again a second later. What
crosses the boundary:

| Step                          | Page thread                                                                                         | Worker                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| First change                  | `new Worker(…)`, post `{ id: 1, input, threads }`                                                   | starts, receives the copy, begins the solve           |
| Second change, a second later | `terminate()` the worker, resolve the first promise with null, `new Worker(…)`, post `{ id: 2, … }` | the first thread is gone mid-search; a new one begins |
| Two seconds later             | receives `{ id: 2, result }`, resolves the promise                                                  | posts the plan, a copy of it                          |
| A stray reply                 | `{ id: 1, … }` can never arrive, but if it did, its id is not the live one and it is ignored        |                                                       |

Two properties of the copy decide what the messages may hold. Structured
clone, the browser's deep copy, carries what JSON carries and a little more,
and refuses what it cannot:

| Value in a message                      | Structured clone                                                          | JSON             |
| --------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| numbers, strings, arrays, plain objects | copied                                                                    | copied           |
| a `Set` of names                        | copied as a `Set`                                                         | becomes `{}`     |
| a `Date`                                | copied as a `Date`                                                        | becomes a string |
| an object that appears twice            | copied once, shared in the copy, but a different object from the original | duplicated       |
| a function                              | `DataCloneError: could not be cloned`                                     | dropped          |
| a class instance                        | a plain object: the methods are gone                                      | a plain object   |
| an `Error`                              | an `Error` with its message                                               | `{}`             |

The solver's seam is stricter than the worker needs, JSON-shaped, so that
the same input can also cross to a WASM module one day; but the two
failures that matter to the worker are on this table. A function in a
message is not dropped but thrown on, at `postMessage`, and a class instance
arrives without its methods, so a solver that returned a class would hand
the page an object that could not do anything. Errors are the one thing
the worker makes a point of not sending as themselves: it posts the message
text, because the text is the part worth keeping and a stack from another
thread's script is not.

```js
// what structured clone keeps and drops, in node, which has the same algorithm as the browser
const plan = {
  stages: [{ sol: { engine: { n: "Terrier" }, total: 7.28 } }],
  unlocked: new Set(["start"]),
  when: new Date(0),
};
const c = structuredClone(plan);
console.log(
  c.unlocked instanceof Set,
  c.when instanceof Date,
  c.stages[0].sol.engine === plan.stages[0].sol.engine,
); // true true false
try {
  structuredClone({ score: () => 1 });
} catch (e) {
  console.log(e.name, "-", e.message);
} // DataCloneError - ()=>1 could not be cloned.
class Roster {
  has() {
    return true;
  }
}
console.log(typeof structuredClone(new Roster()).has); // undefined: the prototype did not cross
console.log(structuredClone(new Error("unit worker failed")).message); // the message crosses; the worker sends it as text anyway
console.log(JSON.stringify(JSON.parse(JSON.stringify(plan)).unlocked)); // {}: JSON is the stricter copy the seam is held to
```

## The idea

A Web Worker is a second thread with its own script and no shared memory.
The page cannot call a function in it and it cannot touch the page; the two
communicate by `postMessage`, and every message is copied across by
structured clone. Three consequences follow, and they are the whole story.

The **message protocol** is the agreed shapes of the messages two threads
exchange, and it has to be designed because nothing enforces it: a worker
that receives `{ id, input, threads }` and posts back `{ id, result }` or
`{ id, error }` is a contract written down in two type declarations and
held by a test with a fake worker. The `id` is the part that is easy to
omit and impossible to do without. Messages are asynchronous and a worker
may outlive the request that started it, so a reply must say which request
it answers, and the client must ignore any reply whose id is not the one it
is waiting for. Without that, a slow first solve answers the second
question.

Cancellation is where a worker differs most from a function. In-process,
`planMission` takes an **`AbortSignal`**, the browser's standard way to tell
running work to stop: a caller creates an `AbortController`, hands the
signal in, and calls `abort()` when the answer is no longer wanted; the
solver checks `signal.aborted` at its yields and returns null. That works
because the in-process solve yields three times to let the page paint. On a
worker there is nothing to paint and nothing to yield to, so the worker
version never yields and a cooperative stop has no point at which to take
effect. The client therefore does not ask the worker to stop; it
terminates the thread. Terminating costs a worker construction on the next
solve, milliseconds against a solve measured in seconds, and it guarantees
the new solve starts at once rather than queueing behind work nobody wants.
The promise for the terminated solve is resolved with null, the same value
the in-process path returns on abort, so the two paths look alike from
outside.

```
   page thread                               worker thread
   ───────────                               ─────────────
   solve(input, {signal})
     cancelSolve(): terminate the old one ─X  (gone mid-search; no reply will come)
     worker = new Worker(solver.worker.js)
     live = { id, resolve }
     postMessage({ id, input, threads }) ──►  structured clone ──► planMission(input, { fanOut })
                                                                       │  seconds, no yields
     onmessage({ id, result }) ◄─────────────  structured clone ◄─── postMessage({ id, result })
       id === live.id ? resolve : ignore
     onerror → resolve(null)                  a blocked import or an OOM kill: the veil must still lift
     signal aborted → resolve(null)
```

**Structured clone** is the browser's deep copy used for messages, and it
drops functions and class identity: it carries the primitives, arrays,
plain objects, `Set`, `Map`, `Date`, `ArrayBuffer` and a few more; it
preserves sharing within one message but not identity with the original;
it turns a class instance into a plain object; and it throws on a function.
The seam of [L1](../../architecture/the-seam/plain-data-across-a-seam.md) is
held to JSON, which is stricter, so everything that crosses to the worker
was already safe to clone; what the worker adds is the rule about errors,
that an exception in the worker crosses as its message text, and the
observation that a clone of 5 kB either way costs a fraction of a
millisecond.

The last piece is what happens when the worker cannot run at all. A browser
that blocks workers, or a test runner with no `Worker`, gets the in-process
path: the same `planMission`, imported lazily so the solver is not in the
main bundle at all, with its yields kept because it is sharing a thread with
the page again. And a worker that fails to start, a blocked module import or
an out-of-memory kill, fires `onerror`; the client resolves null on it,
because a promise that never settles is a veil over the page that never
lifts.

## In this codebase

[`src/ui/solver-client.ts`](../../../../src/ui/solver-client.ts) is the
page's side. `solve` is the protocol in one promise:

```ts
cancelSolve(); // terminate whatever is running; its promise resolves null
const id = ++seq;
worker = new Worker(new URL("./solver.worker.js", import.meta.url), {
  type: "module",
});
return new Promise((resolve) => {
  live = { id, resolve };
  w.onmessage = (e) => {
    const m = e.data;
    if (m.id !== id) return;
    /* stale */ m.error ? finish(null) : finish(m.result ?? null);
  };
  w.onerror = () => finish(null); // a worker that fails to start must not leave the veil up
  signal?.addEventListener("abort", () => finish(null), { once: true });
  w.postMessage({ id, input, threads: wantedThreads() });
});
```

and its header says why terminate rather than abort. [`src/ui/solver.worker.ts`](../../../../src/ui/solver.worker.ts)
is the other side: `onmessage` reads `{ id, input, threads }`, builds the
pool of [A12](../../solver/performance/sharding-a-search-across-workers.md),
calls `planMission` with a no-op `onYield` and the pool's `fanOut`, and posts
`{ id, result }` or `{ id, error: errText(err) }`, with the comment that an
`Error` does not survive the copy with its stack intact and the message is
the part worth keeping. `planMission` in [`src/core/plan.ts`](../../../../src/core/plan.ts)
checks `signal.aborted` at each of its yields, which is the in-process
cancellation. The rule under _`first` in `app.tsx`_ in
[`.claude/rules/ui.md`](../../../../.claude/rules/ui.md) is the veil: a run
that completes, delivered or not, ends the solving state, so a worker that
fails to start ends in "nothing solved" rather than a page of skeletons.

## What made it real

[`test/solver-client.test.ts`](../../../../test/solver-client.test.ts)
drives the client with a fake `Worker` that implements the four members the
client touches, and its header says what it is for: jsdom has no `Worker`,
so every suite that drives the app takes the fallback and the client "is
the piece holding a promise open across a boundary. A hang here is a veil
that never lifts." Six tests: the input is posted and the result resolves;
a reply from a superseded run is ignored; a worker error resolves null; a
worker that fails to start resolves null; `cancelSolve` terminates and
settles; and without `Worker` the client solves in process.
[`test/solve-failure.test.tsx`](../../../../test/solve-failure.test.tsx)
holds the page's side of the same promise: a failed solve clears the veil
rather than leaving it up.

The numbers are the client's header: a full-tech solve of about thirteen
seconds on a Pixel 8, which on the page thread is thirteen seconds of frozen
page interrupted by three yields; a worker construction of milliseconds,
paid on every supersede and worth it. What the fake worker cannot test, the
header also says: whether a real worker starts, imports its module and
clones the result needs a browser, and the Cloudflare preview on each PR is
where that is checked.

## Where it breaks

- **A reply without an id.** A slow first solve answers a second question.
  Every message carries the request's id and the client drops any other.
- **Asking a worker to stop.** It never yields, so a signal is never
  checked. Terminate the thread; the next construction is milliseconds.
- **A promise that can never settle.** A worker killed for memory, or one
  whose module import is blocked, sends no reply; without `onerror`
  resolving null the page waits forever under its veil.
- **A function or a class in a message.** The one throws at `postMessage`,
  the other arrives without its methods. The seam's JSON discipline is what
  keeps both out.
- **Sending an `Error` as itself.** It clones, but its stack is another
  thread's and its identity is lost; the worker sends the message text and
  the client logs it.

## Try it

Run the snippet and read the six lines. Then run
`npx vitest run test/solver-client.test.ts` and read the test that ignores a
reply from a superseded run: it resolves the first request with a fake reply
carrying the wrong id and checks that nothing happens. Then open the
application and change the payload twice within a second while watching
the network panel: two worker scripts are loaded, the first terminated.

## Check yourself

<details><summary>Why does the client terminate the worker on a new request rather than aborting the running solve?</summary>

Because the worker never yields: in-process the solver yields to let the
page paint and checks its signal there, but a worker has nothing to paint
and so nothing to yield to, and a cooperative stop has no point at which to
act. Terminating is immediate, costs a construction of milliseconds against
a solve of seconds, and guarantees the new solve starts at once.

</details>

<details><summary>What does the `id` in every message protect against?</summary>

A reply answering the wrong question. Messages are asynchronous and a
worker can outlive the request that started it, so a reply must name its
request and the client must ignore any id but the live one. The test for
it feeds the client a reply with a stale id and checks that the promise is
untouched.

</details>

<details><summary>Structured clone carries a `Set`; JSON does not. Why is the seam held to JSON when the worker could carry more?</summary>

Because the worker is not the only boundary the solver may ever cross. A
WASM module receives bytes, not objects, so the stricter discipline keeps
that move possible, and anything JSON-shaped is safe to clone. The worker
adds only its own rule, that an error crosses as text.

</details>

## Further reading

- The MDN guide "Using Web Workers" and the reference for the structured
  clone algorithm, for what a message may carry.
- The MDN reference for `AbortController` and `AbortSignal`, for the standard
  cancellation pattern the in-process path uses.
- The WHATWG HTML Standard, section on the `postMessage` and the
  "Web workers" infrastructure, for the exact semantics of `terminate()`.

## Key takeaway

A worker is a second thread reached only by copied messages, so the
protocol needs an id on every message and the client must drop any other,
a superseded solve is stopped by terminating the thread because a worker
has no yield at which to check a signal, and every path that could leave
the promise open, an error reply, a failed start, an abort, resolves it
with null so the page's veil always lifts.

_As of ca10c4b._

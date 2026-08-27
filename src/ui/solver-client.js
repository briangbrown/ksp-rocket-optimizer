/* Runs a solve, on a worker where there is one.

   A full-tech solve takes seconds — around thirteen on a Pixel 8. Run on the
   main thread that is thirteen seconds of frozen page, interrupted only by the
   three yields planMission makes. Moving it off does not make it faster; it
   makes the application usable while it happens.

   Superseding terminates the worker rather than asking it to stop. planMission
   checks its AbortSignal at yields, but the worker version does not yield at
   all — there is nothing to yield to — so there is no point at which a
   cooperative stop could take effect. Terminating costs a worker construction
   on the next solve, which is milliseconds against a solve measured in seconds,
   and it guarantees the new one starts immediately rather than queueing behind
   work nobody wants.

   Falls back to solving in-process when Worker is missing. That is not only for
   jsdom, where the suites that drive the app run: it is also what happens if a
   browser blocks workers. The fallback keeps its yields, because there it is
   sharing a thread with the UI again. */

let worker = null;
let seq = 0;
let live = null;

const supported = () => typeof Worker !== "undefined";

/* ?threads=N, for measuring on a device.

   The pool caps itself at eight, which is right on a container and a guess
   everywhere else — a phone with four little cores may well do better with
   fewer. The cap cannot be found by reasoning about it, and rebuilding to try
   another number is a poor way to spend a device session, so the page can say.
   A worker cannot read the page's query string itself: self.location there is
   the worker script. */
function wantedThreads() {
  try {
    const n = Number(new URLSearchParams(location.search).get("threads"));
    return Number.isInteger(n) && n >= 1 && n <= 32 ? n : 0;
  } catch {
    return 0; // no location to read, which is fine — the worker picks
  }
}

export const usingWorker = () => supported();

/* Abandon whatever is running. The caller gets null, matching what planMission
   returns when its signal aborts, so both paths look the same from outside. */
export function cancelSolve() {
  if (live) {
    live.resolve(null);
    live = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export async function solve(input, { signal, onYield } = {}) {
  if (!supported()) {
    /* Imported lazily so the solver is not in the main bundle at all. With a
       static import it shipped twice — once in the worker chunk and once
       inline for a fallback that almost never runs. */
    const { planMission } = await import("../core/plan.js");
    return planMission(input, { signal, onYield });
  }

  cancelSolve();
  const id = ++seq;
  worker = new Worker(new URL("./solver.worker.js", import.meta.url), {
    type: "module",
  });
  const w = worker;

  return new Promise((resolve) => {
    live = { id, resolve };
    const finish = (value) => {
      if (!live || live.id !== id) return;
      live = null;
      resolve(value);
    };
    w.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.error) {
        console.error("solver worker:", e.data.error);
        finish(null);
      } else finish(e.data.result);
    };
    /* A worker that fails to start — a blocked module import, an OOM kill —
       must not leave the veil up forever. */
    w.onerror = (err) => {
      console.error("solver worker failed:", err.message || err);
      finish(null);
    };
    signal?.addEventListener("abort", () => finish(null), { once: true });
    w.postMessage({ id, input, threads: wantedThreads() });
  });
}

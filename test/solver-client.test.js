import { describe, it, expect, afterEach, vi } from "vitest";

/* The worker client's message protocol.

   jsdom has no Worker, so every suite that drives the app takes the in-process
   fallback and the worker path is never executed. That is fine for those suites
   — they are about the app, not about where it runs — but it leaves the client
   itself with no coverage at all, and it is the piece holding a promise open
   across a boundary. A hang here is a veil that never lifts.

   A fake Worker exercises the protocol without a real thread: message routing,
   stale replies, failures, and cancellation. What it cannot test is whether a
   real worker starts, imports its module, and structured-clones the result —
   that needs a browser, and the Cloudflare preview on each PR is where it gets
   checked. */

class FakeWorker {
  static last = null;
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.posted = [];
    this.terminated = false;
    FakeWorker.last = this;
  }
  postMessage(m) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

async function withWorker(fn) {
  globalThis.Worker = FakeWorker;
  vi.resetModules();
  const mod = await import("../src/ui/solver-client.js");
  try {
    return await fn(mod);
  } finally {
    mod.cancelSolve();
    delete globalThis.Worker;
  }
}

afterEach(() => {
  delete globalThis.Worker;
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("solver client, with a worker", () => {
  it("posts the input and resolves with the result", async () => {
    await withWorker(async ({ solve }) => {
      const p = solve({ marker: 1 });
      await tick();
      const w = FakeWorker.last;
      expect(w.opts.type, "a module worker is required for the imports").toBe(
        "module",
      );
      expect(w.posted).toHaveLength(1);
      expect(w.posted[0].input).toEqual({ marker: 1 });

      w.onmessage({ data: { id: w.posted[0].id, result: { stages: ["x"] } } });
      expect(await p).toEqual({ stages: ["x"] });
    });
  });

  it("ignores a reply from a superseded run", async () => {
    await withWorker(async ({ solve }) => {
      const first = solve({ n: 1 });
      await tick();
      const staleId = FakeWorker.last.posted[0].id;
      const staleWorker = FakeWorker.last;

      /* Starting a second solve terminates the first and settles it as null,
         the same value planMission gives when its signal aborts. */
      const second = solve({ n: 2 });
      await tick();
      expect(staleWorker.terminated).toBe(true);
      expect(await first).toBeNull();

      /* A late message from the dead run must not resolve the live one. */
      const w = FakeWorker.last;
      w.onmessage({ data: { id: staleId, result: { stages: ["stale"] } } });
      w.onmessage({ data: { id: w.posted[0].id, result: { stages: ["live"] } } });
      expect(await second).toEqual({ stages: ["live"] });
    });
  });

  it("resolves null when the worker reports an error", async () => {
    await withWorker(async ({ solve }) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const p = solve({});
      await tick();
      const w = FakeWorker.last;
      w.onmessage({ data: { id: w.posted[0].id, error: "boom" } });
      expect(await p).toBeNull();
      spy.mockRestore();
    });
  });

  it("resolves null when the worker fails to start", async () => {
    /* The case that would otherwise leave the veil up forever: a blocked module
       import or an out-of-memory kill fires onerror and never onmessage. */
    await withWorker(async ({ solve }) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const p = solve({});
      await tick();
      FakeWorker.last.onerror({ message: "failed to import" });
      expect(await p).toBeNull();
      spy.mockRestore();
    });
  });

  it("cancelSolve terminates and settles", async () => {
    await withWorker(async ({ solve, cancelSolve }) => {
      const p = solve({});
      await tick();
      const w = FakeWorker.last;
      cancelSolve();
      expect(w.terminated).toBe(true);
      expect(await p).toBeNull();
    });
  });
});

describe("solver client, without a worker", () => {
  it("falls back to solving in process", async () => {
    vi.resetModules();
    const { solve, usingWorker } = await import("../src/ui/solver-client.js");
    expect(usingWorker()).toBe(false);

    const { DATA } = await import("../src/core/catalogue.js");
    const { withDeps } = await import("../src/core/tech.js");
    const { buildRoute } = await import("../src/core/orbits.js");
    const unlocked = withDeps(
      DATA.nodes,
      new Set(
        Object.entries(DATA.nodes)
          .filter(([, v]) => v.lvl <= 3)
          .map(([k]) => k),
      ),
    );
    const result = await solve({
      route: buildRoute("Mun", "orbit", true, "Kerbin", false, false),
      cuts: [],
      payload: 1,
      payloadDia: 1.25,
      margin: 10,
      extraDv: 0,
      engines: DATA.engines.filter((e) => unlocked.has(e.t) && !e.mh && !e.rs),
      tanks: DATA.tanks.filter(
        (t) => (!t.t || unlocked.has(t.t)) && !t.mh && !t.rs,
      ),
      unlocked: [...unlocked],
      excluded: [],
      needGimbal: false,
      maxAspect: 14,
      expansions: { mh: false, rs: false },
      asparagus: false,
      objective: "mass",
      origin: "Kerbin",
      splitBy: [],
      boosters: true,
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result.stages)).toBe(true);
  }, 300_000);
});

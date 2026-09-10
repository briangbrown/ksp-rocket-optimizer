import { describe, it, expect, afterEach, vi } from "vitest";
import { findWindow, priceColumns } from "../src/core/transfer.js";
import { must } from "./must.js";
import type { Grid } from "../src/core/transfer.js";

/* The plot client's protocol (#213), the way `solver-client.test.ts` holds
   the solver's: jsdom has no Worker, so a fake one exercises what is
   posted, how the runs come back together, and what happens when a thread
   fails or the card stops wanting the answer. */

type Posted = { id: number; grid: Grid; from: number; to: number };
type Reply = {
  data: { id: number; from: number; totals?: Array<number>; error?: string };
};

class FakeWorker {
  static all: Array<FakeWorker> = [];
  posted: Array<Posted> = [];
  terminated = false;
  onmessage: ((e: Reply) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Posted) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

async function withWorkers(
  fn: (mod: typeof import("../src/ui/plot-client.js")) => Promise<unknown>,
) {
  FakeWorker.all = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  vi.resetModules();
  const mod = await import("../src/ui/plot-client.js");
  try {
    return await fn(mod);
  } finally {
    mod.resetPlotPool();
    delete (globalThis as { Worker?: unknown }).Worker;
  }
}

afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
});

const tick = () => new Promise((r) => setTimeout(r, 0));

/* A small grid: Kerbin to Duna's, cut to nine columns. */
const small = (): Grid => {
  const w = must(
    findWindow("Kerbin", "Duna", 680_000, 380_000, 0, true),
    "a window",
  );
  return { ...w.plot, nt: 9, totals: [] };
};

/* What every thread was handed, in column order. */
const runs = () =>
  FakeWorker.all.flatMap((w) => w.posted).sort((a, b) => a.from - b.from);

describe("plot client, with workers", () => {
  it("cuts the columns into a run per thread and lays the replies back in order", async () => {
    await withWorkers(async ({ priceGrid }) => {
      const g = small();
      const p = priceGrid(g);
      await tick();
      const posted = runs();
      expect(posted.length).toBeGreaterThan(0);
      expect(posted[0].from).toBe(0);
      expect(posted[posted.length - 1].to).toBe(g.nt);
      for (let k = 1; k < posted.length; k++)
        expect(posted[k].from).toBe(posted[k - 1].to);
      /* Every run replies with its column index and its cells, out of
         order. */
      for (const w of [...FakeWorker.all].reverse())
        for (const m of w.posted)
          w.onmessage?.({
            data: {
              id: m.id,
              from: m.from,
              totals: Array.from(
                { length: (m.to - m.from) * g.nf },
                (_, i) => m.from * 1000 + i,
              ),
            },
          });
      const totals = must(await p, "totals");
      expect(totals.length).toBe(g.nt * g.nf);
      for (const m of posted) expect(totals[m.from * g.nf]).toBe(m.from * 1000);
      expect(totals[g.nt * g.nf - 1]).toBe(
        posted[posted.length - 1].from * 1000 +
          (g.nt - posted[posted.length - 1].from) * g.nf -
          1,
      );
    });
  });

  it("keeps two requests apart on the same pool", async () => {
    await withWorkers(async ({ priceGrid }) => {
      const a = priceGrid(small()),
        b = priceGrid(small());
      await tick();
      const all = FakeWorker.all.flatMap((w) => w.posted);
      const ids = new Set(all.map((m) => m.id));
      expect(ids.size).toBe(2);
      const w = FakeWorker.all[0];
      /* Answer only the second request's runs; the first stays open. */
      const [idA, idB] = [...ids];
      for (const fw of FakeWorker.all)
        for (const m of fw.posted)
          if (m.id === idB)
            fw.onmessage?.({
              data: {
                id: m.id,
                from: m.from,
                totals: new Array((m.to - m.from) * m.grid.nf).fill(7),
              },
            });
      expect(await b).toEqual(new Array(small().nt * small().nf).fill(7));
      let settled = false;
      void a.then(() => (settled = true));
      await tick();
      expect(settled).toBe(false);
      expect(w.terminated).toBe(false);
      expect(idA).not.toBe(idB);
    });
  });

  it("resolves null when a thread reports an error or fails to start", async () => {
    await withWorkers(async ({ priceGrid }) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const p = priceGrid(small());
      await tick();
      const w = FakeWorker.all[0];
      w.onmessage?.({ data: { id: w.posted[0].id, from: 0, error: "boom" } });
      expect(await p).toBeNull();
      const q = priceGrid(small());
      await tick();
      w.onerror?.({ message: "failed to import" });
      expect(await q).toBeNull();
      spy.mockRestore();
    });
  });

  it("resolves null when the card stops wanting it, and drops the late reply", async () => {
    await withWorkers(async ({ priceGrid }) => {
      const ctl = new AbortController();
      const p = priceGrid(small(), ctl.signal);
      await tick();
      ctl.abort();
      expect(await p).toBeNull();
      const w = FakeWorker.all[0];
      expect(() =>
        w.onmessage?.({ data: { id: w.posted[0].id, from: 0, totals: [1] } }),
      ).not.toThrow();
    });
  });
});

describe("plot client, without workers", () => {
  it("prices in-process, the same numbers", async () => {
    vi.resetModules();
    const { priceGrid, usingWorkers } =
      await import("../src/ui/plot-client.js");
    expect(usingWorkers()).toBe(false);
    const g = small();
    expect(await priceGrid(g)).toEqual(priceColumns(g, 0, g.nt));
    const ctl = new AbortController();
    ctl.abort();
    expect(await priceGrid(g, ctl.signal)).toBeNull();
  });
});

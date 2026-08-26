import { DATA } from "./catalogue.js";
import { COUPLERS, STRUCT } from "./parts.js";

const NODE_PARTS = (() => {
  const m = {};
  const add = (n, name, kind) => {
    if (!n) return;
    (m[n] = m[n] || []).push({ name, kind });
  };
  DATA.engines.forEach((e) =>
    add(e.t, e.n, e.fuelM > 0 ? "booster" : "engine"),
  );
  DATA.tanks.forEach((t) => add(t.t, t.n, "tank"));
  Object.entries(STRUCT).forEach(([kind, list]) =>
    list.forEach((x) => add(x.t, x.n, kind)),
  );
  /* Couplers were missing entirely, so nodes that unlock an engine plate or a
     bi-coupler looked emptier than they are — Specialized Construction showed
     only the stack separator. They are listed once each, since the same part
     appears in the table for every outlet count it offers. */
  const seenCoup = new Set();
  COUPLERS.forEach((c) => {
    if (seenCoup.has(c.n)) return;
    seenCoup.add(c.n);
    add(c.t, c.n, "coupler");
  });

  Object.values(m).forEach((v) =>
    v.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    ),
  );
  return m;
})();

/* ------------------------------ tech tree gating ------------------------------ */
const TIERS = (() => {
  const t = {};
  Object.entries(DATA.nodes).forEach(([name, v]) => {
    (t[v.lvl] ||= []).push(name);
  });
  Object.values(t).forEach((a) => a.sort());
  return t;
})();

function withDeps(nodes, set) {
  const out = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    out.forEach((n) =>
      (nodes[n]?.deps || []).forEach((d) => {
        if (!out.has(d)) {
          out.add(d);
          changed = true;
        }
      }),
    );
  }
  out.add("Start");
  return out;
}

/* Stock atmospheres exported from Kopernicus kittopia-dumps (KittopiaTech dump of
   the stock system). Keys are [altitude_m, value, inTangent, outTangent] Hermite
   splines, exactly as the game stores them. */

export { NODE_PARTS, TIERS, withDeps };

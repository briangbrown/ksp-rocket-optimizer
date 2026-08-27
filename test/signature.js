/* Reducing a solved design to a stable text signature.

   The point is to notice any change at all, so this serialises whatever the
   solver returns rather than reading named fields. A hand-written field list
   would silently stop covering anything added later, which is the one failure
   mode a characterisation test cannot afford. */

/* Every number is rounded to four decimals.

   CLAUDE.md specifies mass to four and delta-v to three; a single
   uniform rule is applied instead, because per-field precision needs a field
   map and a field map is exactly what goes stale. Four is the tighter of the
   two, so nothing is loosened.

   Rounding is also what makes the snapshot portable. Transcendental results
   (Math.exp, Math.pow) may differ in the last ulp across V8 builds, which is
   around 1e-13 on a delta-v of 3600 — far below the fourth decimal, so a
   different Node build cannot move a signature on its own. */
const round = (x) => {
  if (!Number.isFinite(x)) return String(x); // NaN and Infinity are signal, not noise
  const r = Math.round(x * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : r.toFixed(4);
};

/* A part is anything carrying a name. Collapsing it to that name keeps the
   signature about which parts were chosen and in what quantity, rather than
   restating the part database on every line. A change to a part's mass still
   shows up, through the stage masses it feeds. */
const canon = (v) => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "number") return round(v);
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Set) return [...v].map(canon).sort();
  if (v instanceof Map)
    return [...v.entries()].map(([k, x]) => [k, canon(x)]).sort();
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "object") {
    if (typeof v.n === "string") return v.n;
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return String(v);
};

/* byK is the per-stage-count candidate list. It is summarised rather than
   expanded: the app reads it when walking candidates for one the simulator can
   fly, so its ordering and scores matter, but expanding every candidate in full
   would triple the file for little added coverage. */
const candidateSummary = (byK) =>
  (byK ?? []).map(
    (c) =>
      `k=${c.k} score=${round(c.chainScore)} ar=${round(c.ar)} slim=${c.slim}`,
  );

export function signature(name, res) {
  if (!res) return `## ${name}\n  NO SOLUTION\n`;

  const lines = [`## ${name}`];
  lines.push(
    `  total=${round(res.total)} k=${res.k} score=${round(res.chainScore)}`,
  );
  lines.push(`  ar=${round(res.ar)} slim=${res.slim}`);

  res.chain.forEach((link, i) => {
    lines.push(
      `  stage ${i}: want=${round(link.want)} payloadIn=${round(link.payloadIn)}`,
    );
    lines.push(`    ${JSON.stringify(canon(link.sol))}`);
  });

  for (const c of candidateSummary(res.byK)) lines.push(`  candidate ${c}`);
  return lines.join("\n") + "\n";
}

import type { PlanStage } from "./plan.js";
import type { ChainCandidate, GroupResult } from "./solver.js";

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
/* What a canonicalised value can be. Numbers survive as themselves only where
   they were never rounded — a Map's key — since `round` returns a string. */
type Canon =
  string | number | boolean | null | Array<Canon> | { [k: string]: Canon };

const round = (x: number) => {
  if (!Number.isFinite(x)) return String(x); // NaN and Infinity are signal, not noise
  const r = Math.round(x * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : r.toFixed(4);
};

/* A part is anything carrying a name. Collapsing it to that name keeps the
   signature about which parts were chosen and in what quantity, rather than
   restating the part database on every line. A change to a part's mass still
   shows up, through the stage masses it feeds. */
const canon = (v: unknown): Canon => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "number") return round(v);
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Set) return [...v].map(canon).sort();
  if (v instanceof Map)
    return [...v.entries()].map(([k, x]) => [k, canon(x)]).sort();
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "object") {
    /* Read back as a plain record rather than asserted into one: `unknown`
       narrowed by `typeof` is an object with no properties as far as the
       compiler is concerned, and this is a walker over anything the solver
       returns. */
    const rec: Record<string, unknown> = Object.fromEntries(Object.entries(v));
    if (typeof rec.n === "string") return rec.n;
    const out: Record<string, Canon> = {};
    for (const k of Object.keys(rec).sort()) out[k] = canon(rec[k]);
    return out;
  }
  return String(v);
};

/* byK is the per-stage-count candidate list. It is summarised rather than
   expanded: the app reads it when walking candidates for one the simulator can
   fly, so its ordering and scores matter, but expanding every candidate in full
   would triple the file for little added coverage. */
const candidateSummary = (
  byK: ReadonlyArray<ChainCandidate> | null | undefined,
) =>
  (byK ?? []).map(
    (c) =>
      `k=${c.k} score=${round(c.chainScore)} ar=${round(c.ar)} slim=${c.slim}`,
  );

/* The same reduction, for what planMission delivers rather than what solveGroup
   found. Its output is stages, not a chain, and the stage count is itself a
   result — the walk chooses it — so it leads. */
export function missionSignature(
  name: string,
  stages: ReadonlyArray<PlanStage> | null | undefined,
) {
  if (!stages || !stages.length) return `## ${name}\n  NO DESIGN\n`;
  const lines: Array<string> = [`## ${name}`, `  stages=${stages.length}`];
  stages.forEach((s, i) => {
    lines.push(
      `  stage ${i}: launch=${!!s.isLaunch} payloadIn=${round(s.payloadIn)}`,
    );
    lines.push(`    ${JSON.stringify(canon(s.sol))}`);
  });
  return lines.join("\n") + "\n";
}

export function signature(name: string, res: GroupResult | null) {
  if (!res) return `## ${name}\n  NO SOLUTION\n`;

  const lines: Array<string> = [`## ${name}`];
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

import { useState } from "react";
import { Check, ClipboardPaste, Copy, X } from "lucide-react";
import { fmt } from "../format.js";
import { C, RADIUS, SPACE } from "../tokens.js";
import { IconButton, SeverityMark } from "./primitives.jsx";
import type { Tally } from "../../core/tally.js";

/* What the last solve cost, as the setup sheet reports it: the search
   counters the solver kept, how many threads it had, and how long it took. */
type SearchStats = Tally & { threads: number; ms: number };

type ConfigProps = {
  search: SearchStats | null;
  text: string;
  onLoad: (text: string) => { bad: boolean; msg: string };
};

/* Everything a run depends on, in one string. Pasting it back means we are
   looking at the same rocket rather than describing it to each other. */
function Config({ search, text, onLoad }: ConfigProps) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [note, setNote] = useState<{ bad: boolean; msg: string } | null>(null);

  const copy = async () => {
    /* Clipboard access is not guaranteed here, so fall back to showing the
       text for manual selection rather than failing silently. */
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setShown(true);
    }
  };

  const load = () => {
    const r = onLoad(pasteText);
    setNote(r);
    if (r.bad) return;
    setPasteOpen(false);
    setPasteText("");
  };

  const area = {
    width: "100%",
    background: C.ink,
    color: C.muted,
    border: `1px solid ${C.rule}`,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    resize: "vertical" as const,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {search && (
          <span className="note" style={{ color: C.dim, marginRight: 4 }}>
            searched {fmt(search.stages + search.boosted)} stage designs across{" "}
            {fmt(search.chains)} stacks,{" "}
            {/* The counter records trajectories actually integrated. Ascents
                are cached across solves, so a re-solve that reuses one
                legitimately flies nothing new — which read as though the
                design had never been flown at all. */}
            {search.flights > 0 ? (
              <>flew {fmt(search.flights)} ascents, </>
            ) : (
              <>ascent reused from cache, </>
            )}
            {(search.ms / 1000).toFixed(1)} s
            {/* Which says whether the search was actually shared out. The pool
                falls back to solving in one thread wherever nested workers are
                refused, and without this the difference between "no threads
                here" and "threads bought nothing" is invisible from the
                outside. */}
            {search.threads > 1 && <> on {search.threads} threads</>}
          </span>
        )}
        {/* The icons say copy and paste; the word says of what. One group,
            so the label and its buttons wrap as one. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: SPACE.xs,
          }}
        >
          <span className="label" style={{ marginRight: SPACE.sm }}>
            Configuration
          </span>
          <IconButton
            icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy configuration"}
            on={copied}
            onClick={copy}
          />
          <IconButton
            icon={ClipboardPaste}
            label="Load configuration"
            on={pasteOpen}
            onClick={() => {
              setPasteOpen(!pasteOpen);
              setNote(null);
            }}
          />
        </span>
        {note && (
          <span className="note" style={{ color: note.bad ? C.rust : C.mint }}>
            <SeverityMark severity={note.bad ? "bad" : "good"} /> {note.msg}
          </span>
        )}
        <span className="note" style={{ color: C.dim }}>
          Paste this into the chat and I can load the same build — every
          setting, the researched nodes and any parts you have ruled out.
        </span>
      </div>
      {pasteOpen && (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="figure"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste a KSP-PLANNER configuration here"
            style={{ ...area, height: 70 }}
          />
          <div style={{ display: "flex", gap: SPACE.md, marginTop: 6 }}>
            <button className="chip" data-on={1} onClick={load}>
              Load it
            </button>
            <IconButton
              icon={X}
              label="Cancel"
              onClick={() => {
                setPasteOpen(false);
                setPasteText("");
              }}
            />
          </div>
        </div>
      )}
      {shown && (
        <textarea
          className="figure"
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          style={{ ...area, height: 84, marginTop: 10 }}
        />
      )}
    </div>
  );
}

export { Config };
export type { SearchStats };

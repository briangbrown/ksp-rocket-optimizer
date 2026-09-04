import { useState } from "react";
import { Check, ClipboardPaste, Copy, Link, X } from "lucide-react";
import { fmt } from "../format.js";
import { C, RADIUS, SPACE } from "../tokens.js";
import { Callout, Disclosure, IconButton, useNote } from "./primitives.jsx";
import type { Tally } from "../../core/tally.js";

/* What the last solve cost, as the setup sheet reports it: the search
   counters the solver kept, how many threads it had, and how long it took. */
type SearchStats = Tally & { threads: number; ms: number };

type ConfigProps = {
  search: SearchStats | null;
  text: string;
  /* The design as a link, where the browser can make one. With it the copy
     button copies the link and the text is a step further in; without it
     the text is what there is. #140 */
  linkFor?: () => Promise<string>;
  onLoad: (text: string) => { bad: boolean; msg: string };
};

/* What the copy button last put on the clipboard, for the tick beside it. */
type Copied = "link" | "text";

/* Everything a run depends on, in one string. Pasting it back means we are
   looking at the same rocket rather than describing it to each other. */
function Config({ search, text, linkFor, onLoad }: ConfigProps) {
  const [copied, setCopied] = useState<Copied | null>(null);
  /* What to select by hand when the clipboard refuses. */
  const [shown, setShown] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  /* A loaded configuration is confirmed and then left alone; a bad paste
     stays until the next attempt. #139 */
  const [note, setNote, fade] = useNote();

  const copy = async (what: Copied) => {
    const value = what === "link" && linkFor ? await linkFor() : text;
    /* Clipboard access is not guaranteed here, so fall back to showing the
       text for manual selection rather than failing silently. */
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setShown(value);
    }
  };

  const load = () => {
    const r = onLoad(pasteText);
    setNote({ severity: r.bad ? "bad" : "good", title: r.msg });
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
            icon={copied === "link" ? Check : linkFor ? Link : Copy}
            label={
              copied === "link"
                ? "Copied"
                : linkFor
                  ? "Copy link"
                  : "Copy configuration"
            }
            on={copied === "link"}
            onClick={() => copy("link")}
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
          {/* The text is the fallback transport, and a step further in: for
              the chat that mangles an address, or a planner without one. */}
          {linkFor && (
            <Disclosure label="Sharing as text" caption="As text">
              A design travels as a link — the one the copy button gives you,
              and the one in the address bar. Where a link will not do, the same
              configuration goes as text, and comes back through the load
              button.
              <div style={{ marginTop: SPACE.md }}>
                <button className="chip" onClick={() => copy("text")}>
                  {copied === "text" ? "Copied" : "Copy as text"}
                </button>
              </div>
            </Disclosure>
          )}
        </span>
      </div>
      {note && (
        <Callout
          severity={note.severity}
          title={note.title}
          style={{ marginTop: SPACE.md, ...fade }}
        />
      )}
      {pasteOpen && (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="figure"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste a KSP-PLANNER configuration — every setting, the researched nodes and any parts ruled out — to load the same build"
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
      {shown !== null && (
        <textarea
          className="figure"
          readOnly
          value={shown}
          onFocus={(e) => e.target.select()}
          style={{ ...area, height: 84, marginTop: 10 }}
        />
      )}
    </div>
  );
}

export { Config };
export type { SearchStats };

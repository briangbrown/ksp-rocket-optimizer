import { DATA } from "../../core/catalogue.js";
import { NODE_PARTS, TIERS, withDeps } from "../../core/tech.js";
import { C, SPACE } from "../tokens.js";
import { Check, Choice, Section } from "./primitives.jsx";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ThemePref } from "../tokens.js";

/* Where the parts come from, and what to call each. Stock is always on — it is
   the game — which is what `locked` reads below. */
type Source = "stock" | "mh" | "rs";
const PART_SOURCES: ReadonlyArray<[Source, string]> = [
  ["stock", "Stock"],
  ["mh", "Making History"],
  ["rs", "ReStock+"],
];

type Expansions = { mh: boolean; rs: boolean };

type SetupProps = {
  expansions: Expansions;
  setExpansions: Dispatch<SetStateAction<Expansions>>;
  /* How many engines and tanks each source carries, for the line beside it. */
  partsBy: Readonly<Record<Source, number>>;
  unlocked: Set<string>;
  setUnlocked: Dispatch<SetStateAction<Set<string>>>;
  excluded: Set<string>;
  setExcluded: Dispatch<SetStateAction<Set<string>>>;
  /* What the roster leaves available, for the header line. */
  engines: number;
  tanks: number;
  open: boolean;
  onToggle: () => void;
  accent: string;
  /* The theme the reader asked for; the OS's unless they chose one. */
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
};

/* The install and the research: which expansions are present, which nodes are
   researched, and which parts under them have been ruled out. Setup rather
   than a per-mission choice, which is why it is saved and why it folds. */
function Setup({
  expansions,
  setExpansions,
  partsBy,
  unlocked,
  setUnlocked,
  excluded,
  setExcluded,
  engines,
  tanks,
  open,
  onToggle,
  accent,
  theme,
  onTheme,
}: SetupProps) {
  /* Which node shows its parts. One at a time: the tree is long enough
     already. */
  const [openNode, setOpenNode] = useState<string | null>(null);
  const toggleExcluded = (n: string) =>
    setExcluded((p) => {
      const s2 = new Set(p);
      s2.has(n) ? s2.delete(n) : s2.add(n);
      return s2;
    });

  const setTier = (lvl: number) =>
    setUnlocked(
      withDeps(
        DATA.nodes,
        new Set(
          Object.entries(DATA.nodes)
            .filter(([, v]) => v.lvl <= lvl)
            .map(([k]) => k),
        ),
      ),
    );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACE.md,
          marginBottom: SPACE.md,
        }}
      >
        <span className="label">Installed</span>
        <span style={{ flex: 1 }} />
        {/* Dark is the design and light is the same design on white; the
            reader's OS decides unless they say otherwise here. */}
        <Choice
          label="Theme"
          value={theme}
          onChange={onTheme}
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          chip={{ padding: "1px 7px" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: SPACE.xl,
          flexWrap: "wrap",
          marginBottom: SPACE.xl,
        }}
      >
        {PART_SOURCES.map(([k, lab]) => {
          const locked = k === "stock";
          return (
            <Check
              key={k}
              checked={k === "stock" ? true : expansions[k]}
              disabled={locked}
              accent={accent}
              onChange={(on) => setExpansions((x) => ({ ...x, [k]: on }))}
              style={{ alignItems: "center" }}
            >
              <span
                className="body"
                style={{ color: locked ? C.muted : C.paper }}
              >
                {lab}
              </span>
              <span className="note" style={{ color: C.dim }}>
                {partsBy[k]} parts
              </span>
            </Check>
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${C.rule}`, margin: "0 0 14px" }} />
      <Section
        bare
        open={open}
        onToggle={onToggle}
        gap={SPACE.xl}
        heading={
          <>
            Tech tree · {unlocked.size} of {Object.keys(DATA.nodes).length}{" "}
            nodes · {engines} engines, {tanks} tanks available
            {excluded.size > 0 &&
              ` · ${excluded.size} part${excluded.size === 1 ? "" : "s"} excluded`}
          </>
        }
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span
            className="note"
            style={{ color: C.dim, alignSelf: "center", marginRight: 4 }}
          >
            Unlock through tier:
          </span>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
            <button key={l} className="chip" onClick={() => setTier(l)}>
              {l}
            </button>
          ))}
          {excluded.size > 0 && (
            <button
              className="chip"
              style={{ marginLeft: SPACE.md }}
              onClick={() => setExcluded(new Set())}
            >
              clear {excluded.size} exclusion
              {excluded.size === 1 ? "" : "s"}
            </button>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
          }}
        >
          {Object.keys(TIERS).map((lvl) => (
            <div key={lvl}>
              {TIERS[lvl].some((n) => (NODE_PARTS[n] || []).length) && (
                <div className="label" style={{ marginBottom: 6 }}>
                  Tier {lvl}
                </div>
              )}
              {TIERS[lvl]
                .filter((n) => (NODE_PARTS[n] || []).length)
                .map((n) => (
                  <Node
                    key={n}
                    name={n}
                    on={unlocked.has(n)}
                    open={openNode === n}
                    onOpen={() => setOpenNode(openNode === n ? null : n)}
                    excluded={excluded}
                    accent={accent}
                    onNode={(turningOn) => {
                      /* Turning a node off rules out everything under it;
                         turning it back on restores the lot, including parts
                         ruled out individually beforehand. So the node box is
                         always a clean sweep either way. */
                      setUnlocked((p2) => {
                        const s2 = new Set(p2);
                        if (turningOn) s2.add(n);
                        else s2.delete(n);
                        return withDeps(DATA.nodes, s2);
                      });
                      setExcluded((p2) => {
                        const s2 = new Set(p2);
                        (NODE_PARTS[n] || []).forEach((y) =>
                          turningOn ? s2.delete(y.name) : s2.add(y.name),
                        );
                        return s2;
                      });
                    }}
                    onPart={(name) => {
                      if (!unlocked.has(n)) {
                        /* Cherry-pick: research the node but take only this
                           part, holding the rest back. */
                        setUnlocked((p2) =>
                          withDeps(DATA.nodes, new Set(p2).add(n)),
                        );
                        setExcluded((p2) => {
                          const s2 = new Set(p2);
                          (NODE_PARTS[n] || []).forEach((y) => s2.add(y.name));
                          s2.delete(name);
                          return s2;
                        });
                      } else toggleExcluded(name);
                    }}
                  />
                ))}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

type NodeProps = {
  name: string;
  on: boolean;
  open: boolean;
  onOpen: () => void;
  excluded: Set<string>;
  accent: string;
  onNode: (on: boolean) => void;
  onPart: (name: string) => void;
};

/* One node of the tree: its box, its part count, and — opened by its name —
   the parts under it with a box each. */
function Node({
  name: n,
  on,
  open,
  onOpen,
  excluded,
  accent,
  onNode,
  onPart,
}: NodeProps) {
  const parts = NODE_PARTS[n] || [];
  const off = parts.filter((x) => excluded.has(x.name)).length;
  return (
    <div style={{ padding: "2px 0" }}>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={on}
          aria-label={n}
          style={{ marginTop: 2, accentColor: accent }}
          onChange={() => onNode(!on)}
        />
        <button
          className="body"
          aria-expanded={open}
          style={{
            color: on ? C.paper : C.dim,
            flex: 1,
            lineHeight: 1.3,
            textAlign: "left",
          }}
          onClick={onOpen}
        >
          {n}
          <span className="note" style={{ color: C.dim, marginLeft: 5 }}>
            {on ? `${parts.length - off}/${parts.length}` : parts.length}
          </span>
        </button>
      </div>
      {open && (
        <div
          style={{
            margin: "3px 0 6px 20px",
            paddingLeft: SPACE.md,
            borderLeft: `1px solid ${C.rule}`,
          }}
        >
          {parts.map((x) => {
            /* A tick here means the solver can use the part, which needs the
               node researched AND the part not ruled out. Showing these ticked
               under a locked node claimed parts were in play that were not.
               Ticking one now researches the node as well, so the box does
               what it says. */
            const live = on && !excluded.has(x.name);
            return (
              <Check
                key={x.name}
                checked={live}
                accent={accent}
                onChange={() => onPart(x.name)}
                style={{ padding: "1.5px 0" }}
              >
                <span
                  className="note"
                  style={{
                    flex: 1,
                    lineHeight: 1.25,
                    color: live ? C.muted : C.dim,
                    textDecoration:
                      on && excluded.has(x.name) ? "line-through" : "none",
                    opacity: on ? 1 : 0.6,
                  }}
                >
                  {x.name}
                </span>
              </Check>
            );
          })}
          {!on && (
            <div className="note" style={{ color: C.dim, marginTop: 4 }}>
              not researched — ticking one part takes just that part
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { PART_SOURCES, Setup };
export type { Expansions, Source };

import { useState } from "react";
import { C } from "../tokens.js";
import type { ReactNode } from "react";

/* ------------------------------- small pieces ------------------------------- */
/* `value` is already formatted — `fmt` has turned every non-finite number into
   an em-dash by the time it arrives here. */
type StatProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  color?: string;
  small?: boolean;
};

function Stat({ label, value, unit, color, small }: StatProps) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={small ? "disp" : "mono"}
        style={{
          fontSize: small ? 19 : 24,
          fontWeight: 600,
          color: color || C.paper,
          marginTop: 3,
          lineHeight: 1.1,
        }}
      >
        {value}
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 3 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/* Slider for feel, typed entry for precision — 2.72 t for a Mk1-3 pod is not
   something you find by dragging. The field keeps a draft string while focused so
   half-typed values like "1." are not fought, and commits on blur or Enter.
   Typing above the slider's range is allowed up to a hard cap rather than being
   silently clamped; the slider just pins at its maximum. */
type SliderProps = {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: ReactNode;
  onChange: (v: number) => void;
  hint?: ReactNode;
  /* How far a typed value may go past the slider's own maximum. */
  hardMax?: number;
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  hint,
  hardMax,
}: SliderProps) {
  /* Null while the field is not being edited, which is what makes the input
     render the committed value rather than a draft of it. */
  const [draft, setDraft] = useState<string | null>(null);
  const cap = hardMax ?? max;
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (isFinite(v)) onChange(Math.min(cap, Math.max(min, v)));
    setDraft(null);
  };
  const over = value > max;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span className="eyebrow">{label}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <input
            className="mono"
            value={draft ?? value}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setDraft(String(value));
              e.target.select();
            }}
            /* Form history has nothing useful to offer about a payload mass. */
            autoComplete="off"
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              /* Commit here rather than leaving it to the blur below, so the
                 value reaching state does not depend on a focusout raised from
                 inside an in-flight keydown. Not preventDefault: where the
                 platform treats this key as "move to the next field" that is a
                 reasonable thing for it to do, and there is no form to submit. */
              if (e.key === "Enter") {
                commit(e.currentTarget.value);
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            style={{
              width: 62,
              textAlign: "right",
              fontSize: 14,
              padding: "2px 5px",
              background: C.panel2,
              color: C.paper,
              borderRadius: 3,
              border: `1px solid ${over ? C.amber : C.rule}`,
            }}
          />
          <span className="mono" style={{ fontSize: 12, color: C.muted }}>
            {unit}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, value)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ marginTop: 8 }}
      />
      {hint && (
        <div
          style={{ fontSize: 11, color: C.dim, marginTop: 4, lineHeight: 1.45 }}
        >
          {hint}
        </div>
      )}
      {over && (
        <div style={{ fontSize: 10.5, color: C.amber, marginTop: 3 }}>
          above the slider range — typed value in use
        </div>
      )}
    </div>
  );
}

/* The signature element: the mission as a transit line you cut into stages. */
type PickerHeadProps = {
  label: ReactNode;
  value: ReactNode;
  open: boolean;
  onToggle: () => void;
};

const PickerHead = ({ label, value, open, onToggle }: PickerHeadProps) => (
  <div
    onClick={onToggle}
    title={open ? "Fold this away" : "Open the picker"}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      marginBottom: open ? 10 : 0,
      userSelect: "none",
    }}
  >
    <span
      className="mono"
      style={{
        color: C.dim,
        fontSize: 10,
        width: 9,
        display: "inline-block",
        transition: "transform .12s",
        transform: open ? "rotate(90deg)" : "none",
      }}
    >
      ▶
    </span>
    <span className="eyebrow">{label}</span>
    {!open && (
      <>
        <span className="chip" data-on={1}>
          {value}
        </span>
        <span className="chip">elsewhere…</span>
      </>
    )}
  </div>
);

/* `good` is three-valued on purpose: false is a figure out of bounds, and
   undefined is one with no opinion attached. */
type MiniProps = {
  label: ReactNode;
  v: ReactNode;
  good?: boolean;
  note?: string | null;
};

const Mini = ({ label, v, good, note }: MiniProps) => (
  <span style={{ fontSize: 11.5 }} title={note || undefined}>
    <span className="eyebrow" style={{ marginRight: 5 }}>
      {label}
    </span>
    <span className="mono" style={{ color: good === false ? C.rust : C.paper }}>
      {v}
    </span>
    {note && good !== false && (
      <span style={{ color: C.dim, marginLeft: 4 }}>·</span>
    )}
  </span>
);

type SolvingProps = { busy: boolean; children: ReactNode; label: ReactNode };

function Solving({ busy, children, label }: SolvingProps) {
  /* Both layers stay mounted and animate opacity, so the veil can fade out slowly
     instead of blinking away. Dimming is quick — you want to see it react — while
     coming back is gentle, which stops a fast recalculation from flashing. */
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "sticky",
          top: 12,
          height: 0,
          zIndex: 40,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: busy ? 1 : 0,
          transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: C.panel2,
            border: `1px solid ${C.amber}`,
            borderRadius: 3,
            padding: "8px 14px",
            boxShadow: "0 4px 18px rgba(0,0,0,.6)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: C.amber,
              animation: busy ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>
            {label}
          </span>
        </div>
      </div>
      <div
        style={{
          opacity: busy ? 0.22 : 1,
          filter: busy ? "grayscale(1)" : "none",
          transition: busy
            ? "opacity .08s ease-out, filter .08s ease-out"
            : "opacity .7s ease-in, filter .7s ease-in",
          pointerEvents: busy ? "none" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { Mini, PickerHead, Slider, Solving, Stat };

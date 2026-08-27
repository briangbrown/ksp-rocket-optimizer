import { useEffect, useRef, useState } from "react";
import { C } from "../tokens.js";

/* ------------------------------- small pieces ------------------------------- */
function Stat({ label, value, unit, color, small }) {
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
}) {
  const [draft, setDraft] = useState(null);
  const idle = useRef(null);
  const cap = hardMax ?? max;
  const push = (raw) => {
    const v = parseFloat(raw);
    if (isFinite(v)) onChange(Math.min(cap, Math.max(min, v)));
  };
  const commit = (raw) => {
    clearTimeout(idle.current);
    push(raw);
    setDraft(null);
  };
  /* Send a typed value up once typing stops, without waiting for the field to
     report that it lost focus.

     Everything else here is a commit triggered by an event — blur, or Enter.
     On an Android keyboard the action key is "Next": it moves focus to the
     following field and, on the device this was reported from, delivers neither
     a keydown this can read as Enter nor a focusout React acts on. Nothing
     committed, so no state changed and nothing re-solved — while the box went
     on showing the typed number, because the draft is what is rendered, which
     is what made it look accepted (#46).

     An interval long enough not to fire between two digits, and the draft is
     left alone: the field is still focused and still being typed into, and only
     the value behind it moves. A later blur commits the same string again,
     which React drops as an identical state update. */
  const commitLater = (raw) => {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => push(raw), 600);
  };
  useEffect(() => () => clearTimeout(idle.current), []);
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
            onChange={(e) => {
              setDraft(e.target.value);
              commitLater(e.target.value);
            }}
            onFocus={(e) => {
              setDraft(String(value));
              e.target.select();
            }}
            /* Never wanted on a payload mass, and a suggestion popup that eats
               the Enter keydown is one of the ways #46 could happen. */
            autoComplete="off"
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              /* Commit here rather than leaving it to the blur below, which made
                 the value reaching state depend on a focusout raised from inside
                 an in-flight keydown. Not preventDefault: where the platform
                 treats this key as "move to the next field", that is a
                 reasonable thing for it to do and there is no form to submit. */
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
const PickerHead = ({ label, value, open, onToggle }) => (
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

const Mini = ({ label, v, good, note }) => (
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

function Solving({ busy, children, label }) {
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

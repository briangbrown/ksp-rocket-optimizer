import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  CircleCheck,
  Info,
  Minus,
  OctagonAlert,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { BREAK, C, FONT, MOTION, RADIUS, SCRIM, SPACE, Z } from "../tokens.js";
import type { Severity } from "../tokens.js";
import type {
  CSSProperties,
  RefObject,
  KeyboardEvent,
  ReactNode,
  ComponentType,
} from "react";
import type { LucideProps } from "lucide-react";

/* The idioms, one component each — `docs/design.md` §6 says what each is for
   and what it is not for. Nothing here sets a size or a family: a piece of
   text names its role and the stylesheet does the rest. */

/* Inside a chip an icon is 16; standing alone it is 20. */
const ICON = { chip: 16, alone: 20 };
const STROKE = 1.75;

/* Whether the page is a phone at the moment of asking. jsdom has matchMedia
   only if a test installs one, so the answer there is "not a phone". */
const isPhone = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.(`(max-width: ${BREAK - 1}px)`).matches;

/* The same question as state, for the one thing a stylesheet cannot do:
   put an element somewhere else in the tree. The desktop shell stands the
   route beside the brief and the phone stands it last, and reading order is
   DOM order, so the section has to move rather than be repositioned. Asked
   of the same query the stylesheet uses, so the two never disagree; jsdom
   answers "wide", as `isPhone` answers "not a phone". #137 */
function useWide() {
  const [wide, setWide] = useState(() => !isPhone());
  useEffect(() => {
    const mq = window.matchMedia?.(`(min-width: ${BREAK}px)`);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return wide;
}

/* ------------------------------- Section ------------------------------- */
/* A card with a heading, an optional one-line summary, and an optional fold.
   Folded, it shows the heading and the summary; open, the children. The whole
   header is the fold's target and the chevron its only control. `bare` drops
   the card, for a fold inside a card — nothing nests a card in a card. */
type SectionProps = {
  heading: ReactNode;
  summary?: ReactNode;
  /* Present when the section folds. */
  open?: boolean;
  onToggle?: () => void;
  bare?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  /* An anchor, for the jump bar to scroll to. */
  id?: string;
  /* Space under the header before the children. */
  gap?: number;
  /* At the right end of the header, folded or not — beside the fold's button
     rather than inside it, so it may itself be a control: the brief's Δv
     budget, or the build section's tabs. */
  aside?: ReactNode;
  /* How far the header may hang into the card's right padding, for an
     aside that ends in an icon button: the button's box is 44 on the phone
     and the line it sits in is not, so without this the set brief's summary
     lost that width and wrapped a line. On the header row, because the
     padding is the one box around here with room in it — a negative margin
     lower down overflows its parent, which the layout suite reads as the
     page scrolling sideways. #140 */
  asideReach?: number;
  /* The heading's level: 2 for a section of the page, 3 for one inside
     another — the brief's folds, the setup sheet's. A heading element rather
     than a styled span, so the section is a landmark a reader can jump to
     and the outline never skips a level. #141 */
  level?: 2 | 3;
  /* Before the first solve has returned: the heading over a line where the
     summary will be, no fold and no children. Not blank and not a spinner —
     the page has its shape before it has its numbers. #139 */
  busy?: boolean;
};

function Section({
  heading,
  summary,
  open,
  onToggle,
  bare,
  children,
  style,
  gap = SPACE.lg,
  aside,
  asideReach = 0,
  level = 2,
  busy,
  id: anchor,
}: SectionProps) {
  const id = useId();
  const H = level === 3 ? "h3" : "h2";
  const folds = onToggle !== undefined && !busy;
  const shown = !busy && (!folds || open);
  const head = (
    <>
      {folds && (
        <ChevronRight
          className="chev"
          size={ICON.chip}
          strokeWidth={STROKE}
          aria-hidden
        />
      )}
      {/* Beside a summary or an aside the heading holds its line and the
          rest wraps; alone it may run as long as the tech tree's. */}
      <H
        className="label"
        id={id}
        style={
          (summary !== undefined && !shown) || aside !== undefined
            ? { whiteSpace: "nowrap" }
            : undefined
        }
      >
        {heading}
      </H>
      {/* The summary takes what the heading and the aside leave, and asks
          for nothing: `contain` is what keeps its words out of the row's
          intrinsic width, so the brief's aside stays beside a summary of
          any length and the build's tabs wrap under a heading they cannot
          share a line with. */}
      {busy ? (
        <span className="skel body" aria-hidden />
      ) : (
        summary !== undefined &&
        !shown && (
          <span
            className="body"
            style={{
              color: C.paper,
              fontWeight: 600,
              flex: "1 1 0",
              minWidth: 0,
              contain: "inline-size",
            }}
          >
            {summary}
          </span>
        )
      )}
    </>
  );
  /* `1 1 auto`, not `1`: a basis of zero is what the shorthand gives, and
     a zero-wide item never asks the row to wrap. */
  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    flex: "1 1 auto",
    minWidth: 0,
    textAlign: "left",
  };
  return (
    <section
      id={anchor}
      className={bare ? undefined : "card"}
      aria-labelledby={id}
      aria-busy={busy || undefined}
      /* Four longhands, not the shorthand: the brief's stuck style sets
         `paddingTop`, and React clears a longhand it stops seeing without
         re-applying a shorthand it still sees — the brief opened with no
         padding above its heading. */
      style={
        bare
          ? style
          : {
              paddingTop: SPACE.xl,
              paddingRight: SPACE.xl,
              paddingBottom: SPACE.xl,
              paddingLeft: SPACE.xl,
              ...style,
            }
      }
    >
      {/* The aside wraps under the heading where the two will not share a
          line — the build section's three tabs beside its heading, at 390. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: SPACE.md,
          marginBottom: shown && children ? gap : 0,
          marginRight: -asideReach,
        }}
      >
        {folds ? (
          <button
            className="fold"
            onClick={onToggle}
            aria-expanded={!!open}
            style={row}
          >
            {head}
          </button>
        ) : (
          <div style={row}>{head}</div>
        )}
        {aside !== undefined && <span style={{ flexShrink: 0 }}>{aside}</span>}
      </div>
      {shown && children}
    </section>
  );
}

/* ------------------------------- Toggle ------------------------------- */
/* A boolean. A chip whose label never changes: it is on or it is off. */
type ToggleProps = {
  label: ReactNode;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
};

const Toggle = ({ label, on, onChange, disabled, style }: ToggleProps) => (
  <button
    className="chip"
    aria-pressed={on}
    data-on={on ? 1 : 0}
    disabled={disabled}
    onClick={() => onChange(!on)}
    style={style}
  >
    {label}
  </button>
);

/* ------------------------------- Choice ------------------------------- */
/* One of several. A radio group of chips: arrow keys move between the ones
   that can be chosen, the chosen one is inverted, and only it is in the tab
   order — the group is one stop. */
/* `hint` is the one sentence a pointer sees on hover; the group's
   `Disclosure` is where a finger reads the same sentences. */
type Option<V> = {
  value: V;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
};
type ChoiceProps<V> = {
  label: string;
  options: ReadonlyArray<Option<V>>;
  value: V;
  onChange: (v: V) => void;
  /* Applied to every chip — the stage-count chips are smaller than most. */
  chip?: CSSProperties;
  style?: CSSProperties;
};

function Choice<V extends string | number>({
  label,
  options,
  value,
  onChange,
  chip,
  style,
}: ChoiceProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const live = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step || !live.length) return;
    e.preventDefault();
    const at = live.indexOf(i);
    const next = live[(at + step + live.length) % live.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  /* Which chip takes the tab stop: the chosen one, or the first live one if
     the chosen one cannot be reached. */
  const chosen = options.findIndex((o) => o.value === value);
  const stop = chosen >= 0 && !options[chosen].disabled ? chosen : live[0];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "flex", flexWrap: "wrap", gap: 5, ...style }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="chip"
            role="radio"
            aria-checked={on}
            data-on={on ? 1 : 0}
            data-hint={o.hint}
            disabled={o.disabled}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            style={chip}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- IconButton ----------------------------- */
/* An icon, a label the reader hears and the pointer sees as a tooltip, and a
   square target. `on` inverts it, for an icon that is also a toggle. */
type IconButtonProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
};

const IconButton = ({
  icon: Icon,
  label,
  onClick,
  on,
  disabled,
  style,
}: IconButtonProps) => (
  <button
    className="iconbtn"
    aria-label={label}
    aria-pressed={on}
    data-on={on ? 1 : 0}
    disabled={disabled}
    onClick={onClick}
    style={style}
  >
    <Icon size={ICON.alone} strokeWidth={STROKE} aria-hidden />
  </button>
);

/* ------------------------------- Stepper ------------------------------- */
/* A small integer: the figure between a minus and a plus, each an icon
   button with the unit in its name — "Fewer stages", "More stages". The ends
   go quiet at the bounds. A row of numbered chips did this job until #136,
   at a size no finger could pick from. */
type StepperProps = {
  label: string;
  /* The noun the two buttons name: "stages". */
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
};

const Stepper = ({ label, unit, value, min, max, onChange }: StepperProps) => (
  <span
    role="group"
    aria-label={label}
    style={{ display: "inline-flex", alignItems: "center", gap: SPACE.xs }}
  >
    <IconButton
      icon={Minus}
      label={`Fewer ${unit}`}
      disabled={value <= min}
      onClick={() => onChange(Math.max(min, value - 1))}
    />
    <span
      className="figure"
      aria-live="polite"
      style={{ minWidth: "2ch", textAlign: "center", color: C.paper }}
    >
      {value}
    </span>
    <IconButton
      icon={Plus}
      label={`More ${unit}`}
      disabled={value >= max}
      onClick={() => onChange(Math.min(max, value + 1))}
    />
  </span>
);

/* ------------------------------- Sheet ------------------------------- */
/* A panel over the page: up from the bottom on the phone, in from the right
   on desktop, with a scrim behind it. Focus goes in on open and back where it
   came from on close; Escape and the scrim both close it. Through a portal so
   the solving veil cannot become its containing block —
   `.claude/rules/ui.md`. */
type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
};

/* Focus held inside a box while it is up: in on open, Tab wrapping from the
   last stop to the first, Escape closing, the page behind not scrolling, and
   back where it came from on close. The sheet and the build view's
   full-screen overlay are both this; `onClose` is a dependency, so it has to
   be stable — `.claude/rules/ui.md`. #141

   `back` is where focus goes on close when the control it left is no longer
   there to take it: a button that unmounts as the trap opens loses focus to
   the body before this effect can see it, so the hook cannot work out on its
   own where "back" was. Stable too. */
function useTrap(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  back?: () => HTMLElement | null,
) {
  useEffect(() => {
    if (!open) return;
    const was = document.activeElement;
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      /* Tab stays inside: wrap from the last focusable to the first. */
      if (e.key === "Tab" && panel.current) {
        const stops = [
          ...panel.current.querySelectorAll<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
          ),
        ].filter((el) => !el.hasAttribute("disabled"));
        if (!stops.length) {
          e.preventDefault();
          return;
        }
        const first = stops[0],
          last = stops[stops.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
      const to =
        was instanceof HTMLElement && was !== document.body && was.isConnected
          ? was
          : (back?.() ?? null);
      to?.focus();
    };
  }, [panel, open, onClose, back]);
}

function Sheet({ open, onClose, title, children }: SheetProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  useTrap(panel, open, onClose);
  if (!open) return null;
  const phone = isPhone();
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.sheet,
        background: SCRIM,
        display: "flex",
        alignItems: phone ? "flex-end" : "stretch",
        justifyContent: "flex-end",
        /* A second root: the type stack has to be set again here. */
        fontFamily: FONT,
        color: C.paper,
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-labelledby={id}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel,
          border: `1px solid ${C.rule}`,
          borderRadius: phone
            ? `${RADIUS.lg}px ${RADIUS.lg}px 0 0`
            : `${RADIUS.lg}px 0 0 ${RADIUS.lg}px`,
          padding: SPACE.xl,
          /* The home indicator's strip, on a phone that has one. */
          paddingBottom: phone
            ? `calc(${SPACE.xl}px + env(safe-area-inset-bottom))`
            : SPACE.xl,
          width: phone ? "100%" : "min(480px, 100%)",
          /* dvh: the address bar's height comes and goes, and a sheet sized
             to the tallest viewport hides its foot under the bar. */
          maxHeight: phone ? "85dvh" : "100%",
          overflowY: "auto",
          animation: `${phone ? "rise" : "slide"} .4s ease-out`,
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACE.md,
            marginBottom: SPACE.lg,
          }}
        >
          <h2 className="label" id={id}>
            {title}
          </h2>
          <span style={{ flex: 1 }} />
          <button className="chip" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------- Disclosure ----------------------------- */
/* The i. A glyph beside a label; a popover under it on desktop and a sheet on
   the phone, closed by tapping away or Escape. What it holds is in the DOM
   either way, hidden, so a text scan still reaches it. With a `caption` the
   glyph carries words — "How this was computed" — and the words are part of
   the target.

   Without one the target is the `.iconbtn` square, and the wrapper — not the
   button — carries the negative margin that lets a 44 px target sit in a
   28 px row. On the button it would overflow the wrapper, and the layout
   suite reads any box wider than its parent as the page scrolling sideways;
   on the wrapper it overflows into whatever is beside it, which has to be
   room: a flex row with slack, or a callout's padding. */
type DisclosureProps = {
  label: string;
  caption?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
};

function Disclosure({ label, caption, children, style }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  const phone = open && isPhone();
  return (
    <span
      ref={box}
      className={caption === undefined ? "disc" : undefined}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      <button
        className={caption === undefined ? "iconbtn" : "disc-cap note"}
        aria-label={caption === undefined ? label : undefined}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Info size={ICON.chip} strokeWidth={STROKE} aria-hidden />
        {caption}
      </button>
      {phone ? (
        <Sheet open onClose={() => setOpen(false)} title={label}>
          <div className="body" id={id}>
            {children}
          </div>
        </Sheet>
      ) : (
        <div
          id={id}
          role="region"
          aria-label={label}
          hidden={!open}
          className="note"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: Z.popover,
            width: "min(360px, 90vw)",
            marginTop: SPACE.sm,
            padding: `${SPACE.md}px ${SPACE.lg}px`,
            background: C.panel2,
            color: C.paper,
            border: `1px solid ${C.rule}`,
            borderRadius: RADIUS.lg,
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

/* ------------------------------- Callout ------------------------------- */
/* A severity, its icon, a headline, the one sentence a reader acts on, and —
   behind an i — the rest. Sits at the top of the section it is about. */
const GLYPH: Record<Severity, ComponentType<LucideProps>> = {
  info: Info,
  good: CircleCheck,
  warn: TriangleAlert,
  bad: OctagonAlert,
};

type CalloutProps = {
  severity: Severity;
  title?: ReactNode;
  children?: ReactNode;
  /* The explanation, disclosed: why it happened and what else would fix it. */
  more?: ReactNode;
  /* What to do about it, as buttons that do it — chips, a verb each, under
     the sentence. The unsolvable callout's three. #139 */
  actions?: ReactNode;
  style?: CSSProperties;
};

function Callout({
  severity,
  title,
  children,
  more,
  actions,
  style,
}: CalloutProps) {
  const Glyph = GLYPH[severity];
  return (
    <div
      className="callout body"
      data-severity={severity}
      role={severity === "bad" ? "alert" : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: more === undefined ? "auto 1fr" : "auto 1fr auto",
        gap: `0 ${SPACE.md}px`,
        alignItems: "start",
        border: "1px solid",
        borderRadius: RADIUS.sm,
        padding: SPACE.lg,
        ...style,
      }}
    >
      <Glyph
        className="callout-head"
        size={ICON.alone}
        strokeWidth={STROKE}
        aria-label={severity}
        style={{ marginTop: 1 }}
      />
      <div>
        {title !== undefined && (
          <strong className="callout-head">{title}</strong>
        )}
        {title !== undefined && children !== undefined && " "}
        {children}
        {actions !== undefined && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: SPACE.md,
              marginTop: SPACE.md,
            }}
          >
            {actions}
          </div>
        )}
      </div>
      {more !== undefined && (
        <Disclosure label="More about this">{more}</Disclosure>
      )}
    </div>
  );
}

/* -------------------------------- Check -------------------------------- */
/* A native checkbox with its text, for a list of them — the tech tree. One
   boolean on its own is a Toggle. */
type CheckProps = {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  accent?: string;
  children: ReactNode;
  style?: CSSProperties;
};

const Check = ({
  checked,
  onChange,
  disabled,
  accent,
  children,
  style,
}: CheckProps) => (
  <label
    className="check tap"
    style={{ cursor: disabled ? "default" : "pointer", ...style }}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      style={{ accentColor: accent }}
      onChange={(e) => onChange(e.target.checked)}
    />
    {children}
  </label>
);

/* -------------------------------- Stat -------------------------------- */
/* A label over a figure and its unit. `small` is the figure role rather than
   the large one; `inline` puts the label beside the figure for a run of them.
   `value` is already formatted — `fmt` has turned every non-finite number into
   an em-dash by the time it arrives here. `good` is three-valued on purpose:
   false is a figure out of bounds, and undefined is one with no opinion
   attached. */
type StatProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  color?: string;
  small?: boolean;
  inline?: boolean;
  good?: boolean;
  note?: ReactNode;
};

function Stat({
  label,
  value,
  unit,
  color,
  small,
  inline,
  good,
  note,
}: StatProps) {
  const ink = good === false ? C.rust : color || C.paper;
  if (inline)
    return (
      <span className="note">
        <span className="label" style={{ marginRight: 5 }}>
          {label}
        </span>
        <span className="figure" style={{ color: ink }}>
          {value}
        </span>
        {note !== undefined && (
          <span style={{ color: C.dim, marginLeft: SPACE.sm }}>{note}</span>
        )}
      </span>
    );
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={small ? "figure" : "figure-lg"}
        style={{
          fontWeight: 600,
          color: ink,
          marginTop: 3,
          lineHeight: 1.1,
        }}
      >
        {value}
        <span className="note" style={{ marginLeft: 3 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- Field -------------------------------- */
/* Slider for feel, typed entry for precision — 2.72 t for a Mk1-3 pod is not
   something you find by dragging. The field keeps a draft string while focused
   so half-typed values like "1." are not fought, and commits on blur or Enter.
   Typing above the slider's range is allowed up to a hard cap rather than
   being silently clamped; the slider just pins at its maximum. */
type FieldProps = {
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

function Field({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  hint,
  hardMax,
}: FieldProps) {
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
          alignItems: "center",
          gap: SPACE.md,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <span className="label">{label}</span>
          {hint && (
            <Disclosure
              label={`About ${typeof label === "string" ? label : "this"}`}
              style={{ marginLeft: SPACE.xs }}
            >
              {hint}
            </Disclosure>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <input
            className="figure field-in"
            aria-label={typeof label === "string" ? label : undefined}
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
              padding: "2px 5px",
              background: C.panel2,
              color: C.paper,
              borderRadius: RADIUS.sm,
              border: `1px solid ${C.rule}`,
            }}
          />
          <span className="note">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={typeof label === "string" ? label : undefined}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, value)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ marginTop: SPACE.md }}
      />
      {/* The callout says it; the field's edge used to go amber as well,
          which was the colour on its own. #139 */}
      {over && (
        <Callout
          severity="info"
          title="Above the slider's range."
          style={{ marginTop: SPACE.md }}
        >
          The typed value is in use.
        </Callout>
      )}
    </div>
  );
}

/* A message that stands until read. A confirmation — good, or info — holds
   for a beat, fades over `MOTION.settle` and goes; a bad one stays until the
   next attempt, because it is asking for something. The config sheet's
   "Loaded 21 settings" and the brief's "Link copied" are both this. The
   third value is the style the Callout showing it takes, so the fade is the
   same wherever it is drawn. #139, #140 */
type Note = { severity: Severity; title: string };

/* How long a confirmation stands before it starts to fade. */
const LINGER_MS = 2400;

function useNote(): [Note | null, (n: Note | null) => void, CSSProperties] {
  const [note, setNote] = useState<Note | null>(null);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!note || note.severity === "bad" || note.severity === "warn") return;
    const fade = setTimeout(() => setFading(true), LINGER_MS);
    const gone = setTimeout(() => {
      setNote(null);
      setFading(false);
    }, LINGER_MS + MOTION.settle);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [note]);
  const set = (n: Note | null) => {
    setFading(false);
    setNote(n);
  };
  return [
    note,
    set,
    {
      opacity: fading ? 0 : 1,
      transition: `opacity ${MOTION.settle}ms ease-in`,
    },
  ];
}

export {
  Callout,
  Check,
  Choice,
  Disclosure,
  Field,
  ICON,
  IconButton,
  Stepper,
  STROKE,
  Section,
  Sheet,
  Stat,
  Toggle,
  useNote,
  useTrap,
  useWide,
};
export type { Note };

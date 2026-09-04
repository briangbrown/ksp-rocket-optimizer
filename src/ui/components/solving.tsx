import { C, RADIUS, SHADOW, SPACE, Z } from "../tokens.js";
import type { ReactNode } from "react";

/* Everything downstream of the solve gets veiled while it runs, and one pill
   says so. The pill is fixed to the top of the visual viewport — `top` is
   how far that has been pushed down the layout one, `.claude/rules/ui.md` —
   and sits above the full-screen overlay, so a rocket about to be replaced
   still says so. It was a bar across the page and a sticky pill inside the
   veil, two indicators saying one thing, until #136. */
type SolvingProps = {
  busy: boolean;
  children: ReactNode;
  label: ReactNode;
  /* The same state for a screen reader: the label while it runs, then what
     came of it. A live region, off screen — the pill itself is a picture of
     the state, fading in and out, and a reader is told nothing by opacity.
     #141 */
  status: string;
  top: number;
};

function Solving({ busy, children, label, status, top }: SolvingProps) {
  /* Both layers stay mounted and animate opacity, so the veil can fade out slowly
     instead of blinking away. Dimming is quick — you want to see it react — while
     coming back is gentle, which stops a fast recalculation from flashing. */
  return (
    <div style={{ position: "relative" }}>
      <span className="sr-only" role="status">
        {status}
      </span>
      <div
        style={{
          position: "fixed",
          top: SPACE.lg,
          left: 0,
          right: 0,
          zIndex: Z.solving,
          transform: `translateY(${top}px)`,
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
            /* The dot is what says "live"; an amber edge said it a second
               time, and a severity-coloured edge is a callout's. #139 */
            border: `1px solid ${C.edge}`,
            borderRadius: RADIUS.sm,
            padding: "8px 14px",
            boxShadow: SHADOW.pill,
            /* Never wider than a phone with room to breathe either side. */
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: RADIUS.round,
              background: C.amber,
              animation: busy ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span
            className="body"
            style={{ color: C.paper, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {label}
          </span>
        </div>
      </div>
      <Veil busy={busy}>{children}</Veil>
    </div>
  );
}

/* The veil alone, for a result that stands away from the others: the desktop
   shell puts the route in the column with the brief, and it greys out with
   the rocket it is part of, under the one pill. #137 */
function Veil({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
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
  );
}

export { Solving, Veil };

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
  top: number;
};

function Solving({ busy, children, label, top }: SolvingProps) {
  /* Both layers stay mounted and animate opacity, so the veil can fade out slowly
     instead of blinking away. Dimming is quick — you want to see it react — while
     coming back is gentle, which stops a fast recalculation from flashing. */
  return (
    <div style={{ position: "relative" }}>
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
            border: `1px solid ${C.amber}`,
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

export { Solving };

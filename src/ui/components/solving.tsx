import { C, RADIUS, SHADOW, SPACE, Z } from "../tokens.js";
import type { ReactNode } from "react";

/* Everything downstream of the solve gets veiled while it runs. A bar pinned
   to the top of the page was the obvious idea and the wrong one: an artifact
   is an iframe sized to its content, so the parent page scrolls and nothing
   inside can stay in view. Marking the panels themselves works wherever you
   happen to be looking. */
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
          top: SPACE.lg,
          height: 0,
          zIndex: Z.pill,
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
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: RADIUS.round,
              background: C.amber,
              animation: busy ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span className="body" style={{ color: C.paper, fontWeight: 600 }}>
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

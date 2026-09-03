import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { C, MOTION, Z } from "../tokens.js";
import { IconButton } from "./primitives.jsx";
import type { RefObject } from "react";

/* The phone's jump bar: the four results sections by name and the way back
   up, fixed to the foot of the screen once the page has scrolled past the
   header — before that everything it reaches is a thumb's flick away. The
   stylesheet hides it from the desktop, which has the page in view at once.
   #136 */
const STOPS: ReadonlyArray<[string, string]> = [
  ["rocket", "Rocket"],
  ["build", "Build"],
  ["fly", "Fly"],
  ["route", "Route"],
];

type JumpBarProps = {
  /* The element the page has to scroll past before the bar shows. */
  past: RefObject<HTMLElement | null>;
};

/* Under the set brief rather than under the top edge: the brief is stuck
   there, and a section scrolled to the edge would start beneath it. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const brief = document.getElementById("brief");
  const stuck =
    brief !== null && getComputedStyle(brief).position === "sticky"
      ? brief.offsetHeight
      : 0;
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - stuck,
    behavior: "smooth",
  });
}

function JumpBar({ past }: JumpBarProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () =>
      setShown(window.scrollY > (past.current?.offsetHeight ?? 0));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [past]);
  return (
    /* Hidden by visibility rather than opacity while it is off the screen,
       so its buttons are out of the tab order and the accessibility tree as
       well as out of view; the transition holds visibility until the slide
       out has finished. The stylesheet is what shows it — `.jump` — since
       an inline display would outrank the desktop's `none`. */
    <nav
      className="jump"
      aria-label="Sections"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: Z.jump,
        alignItems: "center",
        background: C.panel,
        borderTop: `1px solid ${C.rule}`,
        paddingBottom: "env(safe-area-inset-bottom)",
        transform: shown ? "none" : "translateY(100%)",
        visibility: shown ? "visible" : "hidden",
        transition: `transform ${MOTION.settle}ms ease-out, visibility ${MOTION.settle}ms`,
      }}
    >
      {STOPS.map(([id, name]) => (
        <button
          key={id}
          className="label tap"
          onClick={() => jumpTo(id)}
          style={{ flex: 1, color: C.muted }}
        >
          {name}
        </button>
      ))}
      <IconButton
        icon={ArrowUp}
        label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />
    </nav>
  );
}

export { JumpBar };

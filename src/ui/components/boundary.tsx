import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { STYLES } from "../styles.js";
import { FONT, SPACE } from "../tokens.js";

/* The last line: whatever throws in a render, the page says so and offers a
   way back, instead of going blank or staying under the solving veil. The
   address is cleared first, because the likeliest cause of a throw on mount
   is a link — a design nobody could build by hand — and a reload with it
   still there would throw again. #174 */
type State = { failed: boolean; said: string };

class Boundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false, said: "" };

  /* The message and the first frames, for the reader to pass on. The console
     has them too, but nobody reads a phone's console, and the first report of
     this page came as its two sentences and no more. */
  static getDerivedStateFromError(error: unknown): State {
    const e = error instanceof Error ? error : new Error(String(error));
    const frames = (e.stack ?? "")
      .split("\n")
      .filter((l) => /^\s*at /.test(l))
      .slice(0, 3)
      .map((l) => l.trim());
    return { failed: true, said: [e.message, ...frames].join("\n") };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    /* Off the address before anything else, so Reload starts clean. */
    if (location.hash)
      history.replaceState(null, "", location.pathname + location.search);
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    /* The stylesheet is rendered here too, as the gallery does for its own
       root: the application's copy is inside the tree that just failed. */
    return (
      <div
        role="alert"
        style={{
          fontFamily: FONT,
          maxWidth: 560,
          margin: `${SPACE.xl}px auto`,
          padding: `0 ${SPACE.lg}px`,
        }}
      >
        <style>{STYLES}</style>
        <p className="heading" style={{ margin: `0 0 ${SPACE.sm}px` }}>
          Something in this design could not be shown.
        </p>
        <p className="body" style={{ margin: `0 0 ${SPACE.lg}px` }}>
          If it came from a link, the address has been cleared. Reload to start
          from the default mission; your roster is kept.
        </p>
        <button
          type="button"
          className="chip"
          onClick={() => location.reload()}
        >
          Reload
        </button>
        {this.state.said && (
          <pre
            className="note"
            style={{
              margin: `${SPACE.lg}px 0 0`,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {this.state.said}
          </pre>
        )}
      </div>
    );
  }
}

export default Boundary;

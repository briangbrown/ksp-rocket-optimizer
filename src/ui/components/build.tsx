import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Box, Maximize, Minimize, Pause, Play } from "lucide-react";

import { payloadDiaOf, stackGeometry } from "../../core/geometry.js";
import { extentOf, modelOf } from "../../core/model.js";
import { stageCost, stageParts } from "../../core/performance.js";
import { missionSignature } from "../../core/signature.js";
import { fmt } from "../format.js";
import { framing, panelSizes } from "../views.js";
import { arrive, assembly, pose, separation } from "../separation.js";
import { C, FONT, RADIUS, SPACE, Z } from "../tokens.js";
import type { Theme } from "../tokens.js";
import {
  Callout,
  Choice,
  IconButton,
  Stat,
  useTrap,
  useWide,
} from "./primitives.jsx";
import type { ReactNode } from "react";
import type { PlanStage } from "../../core/plan.js";
import type { Solution } from "../../core/solution.js";

/* A stage the solver actually built. `stages` arrives with the unsolved ones
   still in it — a segment with no design is a row that says so — and every
   panel here works on what is left. */
type SolvedStage = PlanStage & { sol: Solution };
const isSolved = (s: PlanStage): s is SolvedStage => s.sol !== null;

/* One step of the stepper: what has been staged away, and whether what is left
   still has its boosters on. */
type Step = { label: string; drop: number; boost: boolean };

/* Loaded when the build view first draws, not with the application. three.js
   is about the size of everything else here put together, and nothing above
   this panel needs it — see #63. */
const ThreeView = lazy(() => import("./three-view.jsx"));
let webgl: boolean | null = null;
const canRender3D = () => {
  if (webgl === null)
    try {
      /* Ask whether the constructors exist before asking for a context.
         jsdom implements neither and logs a "not implemented" error for the
         call itself, which turns every suite that mounts the app into a wall
         of noise — and the answer is the same either way. */
      webgl =
        (typeof WebGL2RenderingContext !== "undefined" ||
          typeof WebGLRenderingContext !== "undefined") &&
        !!document
          .createElement("canvas")
          .getContext(
            typeof WebGL2RenderingContext !== "undefined" ? "webgl2" : "webgl",
          );
    } catch {
      webgl = false;
    }
  return webgl;
};

/* Holds the panel's space while the 3D chunk arrives, so the layout does not
   jump when it does. */
const Loading = ({ w, h }: { w: number; h: number }) => (
  <div
    style={{
      width: w,
      height: h,
      border: `1px solid ${C.rule}`,
      borderRadius: RADIUS.sm,
    }}
  />
);

/* Where there is no context to draw into. The stage stepper, the figures below
   the panels and the parts table are all still there and all still say what the
   rocket is, so this is a missing picture rather than a missing answer — which
   is why it is a line rather than a second drawing kept alive for it. #63. */
/* Where nothing can be drawn, say so where the drawing would be, and leave
   the figures under it standing: they are the same rocket. #139 */
const NoWebGL = () => (
  <Callout
    severity="info"
    title="This browser has no WebGL, so the rocket cannot be drawn."
    style={{ maxWidth: 520 }}
  >
    Every part of it is in the stage table below.
  </Callout>
);

/* The steps the stepper offers. Boosters leave on a step of their own, before
   the stage that carries them, so `drop` and `boost` are separate: what has
   been staged away, and whether what is left still has its boosters on.

   Exported with `stepModels` because the model checks have to ask the build
   view what it draws rather than deriving it a second time. The walk is not a
   property of the solver — `planMission` knows nothing about a boosters-away
   step — so a test that slices the stages itself is checking a rocket the
   application never shows. #63 step 4. */
export function stagingSteps(solved: ReadonlyArray<SolvedStage>) {
  const steps: Array<Step> = [{ label: "On the pad", drop: 0, boost: true }];
  if (solved.length && solved[0].sol.boosters)
    steps.push({
      label: "Boosters away · core burns on",
      drop: 0,
      boost: false,
    });
  solved.forEach((_, i) =>
    steps.push({
      label: i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
      drop: i + 1,
      boost: false,
    }),
  );
  return steps;
}

/* What a step draws: the whole vehicle for the elevation, and the bottom live
   stage for the plan. Boosters are filtered out once they have gone, so the
   panel is sized for the rocket on screen rather than for parts that left. */
export function stepModels(
  solved: ReadonlyArray<SolvedStage>,
  cur: Step,
  payload: number,
  payloadDia: number,
) {
  const live = solved.slice(cur.drop);
  const payD = payloadDiaOf(payload, payloadDia);
  const attached = (p: { ring?: number }) => cur.boost || p.ring === undefined;
  return {
    live,
    model: modelOf(live, payload, payD).filter(attached),
    planModel: modelOf(live.slice(0, 1), payload, payD).filter(attached),
  };
}

/* ------------------------------- the build view -------------------------------

   Layout constants, all in CSS pixels. */
/* Wide enough for the longest step label — "Boosters away · core burns on" —
   to stand on one line, so the rail reads as a list rather than a ragged
   column of one- and two-line chips. */
const RAIL = 200;
const GAP = 22;
/* The header line above each of the three columns, which is what makes their
   labels share one. As tall as the icon button the elevation's carries, which
   is the target size and not negotiable: the row it sits in scrolls sideways,
   and a sideways scroll clips vertically too, so a button taller than this
   line loses the top and bottom of its inverted ground when selected. */
const HEAD = 44;
/* How tall the drawings stand when this is not full screen, on a screen too
   narrow for a second column: about as tall as a phone is wide, so the
   elevation's panel is square-ish. Wide, the row takes six tenths of the
   window instead — `INLINE_WIDE` — and the panels are sized from what it
   measures, the way full screen is. Seven tenths was the ask (#138) and is
   55 px over the desktop page's height budget; six holds it with the rocket
   a third taller than before. The rest of the space is full screen's.
   #137, #138 */
const INLINE_H = 300;
const INLINE_WIDE = "clamp(360px, 60dvh, 900px)";
/* The scrubber's target, which the stylesheet sets: 24 px on the desktop and
   44 on the phone, where `input[type=range]` is a taller box drawn round the
   same track. It sits inside the row under the drawings, so where the row has
   a height of its own this much of it is not theirs. */
const SCRUB_TARGET = { wide: 24, phone: 44 };
/* How long one stage separation takes.

   Two paces, because the two ways of asking for one are different questions.
   Clicking a step is a way of getting to it, and the motion is there to say
   what changed — long enough to read, short enough not to be in the way.
   Pressing play is asking to watch the thing, and at twice the length the
   boosters have time to tumble clear before the camera has finished closing
   in. #105 */
const STEP_MS = 800;
const PLAY_MS = 1600;
/* And how long a new design takes to arrive: the parts settle onto the pad
   from a little above their places and the figures count up alongside. Short,
   because it plays every time the solver delivers something new, which is
   every change to the brief. #138 */
const ARRIVE_MS = 400;

/* Where focus goes on leaving full screen. The card shows a line in place of
   its header while the overlay is up, so the button that opened it unmounts
   as it opens and focus is on the body by the time the trap looks; the one
   there on the way back is a new element with the same name. #141 */
const fullScreenButton = () =>
  document.querySelector<HTMLElement>('[aria-label="Full screen"]');

/* Motion is a preference. The stylesheet already honours it for every
   transition in the application; a separation is the same question asked of a
   render loop. Read once, because it is a property of the person and not of
   the frame. */
let still: boolean | null = null;
const reducedMotion = () => {
  if (still === null)
    still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return still;
};

/* The container width at which the staging chips move to a rail down the left.
   Width rather than aspect ratio, because what a rail needs is horizontal room
   for itself and a phone held either way has none. #99 */
const WIDE = 640;

/* The observed size of an element.

   Width is always safe to read: the row is as wide as the card, and the
   drawings never affect that. Height is read only where the row has a height
   of its own — full screen, where it is a flex child of a column of known
   height, and the wide screen's half-window — inline on a phone it would be
   the drawings' own height coming back round to size them again.

   jsdom implements no ResizeObserver, and nothing there can see this anyway:
   `canRender3D()` is false, so the panels this sizes are never built. */
function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const watching = useRef<ResizeObserver | null>(null);
  /* A callback ref, not a `useRef` and an effect. The row it measures is
     unmounted and rebuilt somewhere else every time full screen is toggled —
     the portal is a different place in the tree — and an effect with no
     dependencies would go on watching the element that left, which reports
     nothing and sizes both panels to a pixel. React calls this with the new
     element, and with null on the way out. */
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      /* The same object back where nothing moved, or every scroll of the page
         would be a re-render and a repaint of two WebGL panels. */
      setBox((was) =>
        was.w === r.width && was.h === r.height
          ? was
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    watching.current = ro;
  }, []);
  return { ref, w: box.w, h: box.h };
}

type BuildViewProps = {
  stages: ReadonlyArray<PlanStage>;
  payload: number;
  payloadDia: number;
  /* What the rocket is called and which class it falls in: the name stands
     over the drawing and the class among the figures under it. #138 */
  craft: { name: string; sub: string };
  vehicleClass: string;
  color: string;
  theme: Theme;
  maxAspect?: number;
};

function BuildView({
  stages,
  payload,
  payloadDia,
  craft,
  vehicleClass,
  color,
  theme,
  maxAspect = 14,
}: BuildViewProps) {
  const solved = useMemo(() => stages.filter(isSolved), [stages]);
  const steps = useMemo(() => stagingSteps(solved), [solved]);
  /* Where the stepper has settled, and where it is going. They differ only
     while a separation is running. */
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(0);
  const [playing, setPlaying] = useState(false);
  /* The transition in flight: which pair of steps, and how far through. Null
     between them, which is every frame that is not animating. */
  const [anim, setAnim] = useState<{ a: number; t: number } | null>(null);
  /* Where the scrub handle is being held, in steps — `2.4` is forty percent of
     the way from step 2 to step 3 — and null when nobody is holding it. #138 */
  const [scrub, setScrub] = useState<number | null>(null);
  /* A new design on its way in: how far through the arrival. Null once it has
     landed, which is every frame that is not arriving. #138 */
  const [arrival, setArrival] = useState<{ t: number } | null>(null);
  /* Locked cameras, not an orbit: a schematic that moves stops being a
     drawing. The three-quarter is the one angle that shows a ring of columns
     as a ring while still reading as an elevation. #63 step 5. */
  const [angle, setAngle] = useState("side");
  const [full, setFull] = useState(false);
  const box = useBox();
  const wide = useWide();

  const drawn = canRender3D();
  /* Nothing to animate where nothing is drawn — jsdom takes this path, and so
     does a browser with no WebGL and anyone who has asked for less motion.
     Steps are then instant, which is what they have always been. */
  const animates = drawn && !reducedMotion();

  /* Before the observer has reported, and in jsdom where it never will. */
  const outerW = box.w || 320;
  const railed = drawn && outerW >= WIDE;

  const last = Math.max(0, steps.length - 1);
  const from = Math.min(step, last);
  const want = Math.min(goal, last);
  const moving = from !== want;
  const back = want < from;
  /* A transition is always between neighbours; `lo` is the lower of the pair,
     and a backward step is the same one played from the far end. */
  const lo = back ? from - 1 : from;

  /* Which design this is, so a re-solve that comes back with the same rocket
     is not a new one. The brief is re-solved on every change to it, and most
     of those — a payload a kilogram heavier — return the design already on
     screen; a drawing that flinched at each would be a nervous drawing. The
     fingerprint is the mission sweep's, plus the payload's diameter, which the
     sweep does not draw and this does. #138 */
  const sig = useMemo(
    () => missionSignature("", solved) + payloadDia,
    [solved, payloadDia],
  );
  const lastSig = useRef<string | null>(null);
  /* Whether the staging has been played through for the reader unasked. Once
     a session, on the phone, where there is no rail to say what the steps are:
     the first design arrives and then flies, and rests on the pad after. Never
     again for the same design, and never again for the next either — once is a
     demonstration and twice is a habit. #138 */
  const demoed = useRef(false);
  /* Whether the play in flight is that demonstration, which ends on the pad
     rather than at the last step. Cleared by anything the reader does. */
  const demo = useRef(false);
  const railedNow = useRef(railed);
  railedNow.current = railed;

  useEffect(() => {
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    /* Back to the pad: the new rocket is drawn whole first, whatever step the
       old one was at. */
    setPlaying(false);
    setGoal(0);
    setStep(0);
    setAnim(null);
    setScrub(null);
    demo.current = false;
    if (!animates || !solved.length) return;
    setArrival({ t: 0 });
    const t0 = performance.now();
    let id = requestAnimationFrame(function tick(now: number) {
      const u = Math.min(1, (now - t0) / ARRIVE_MS);
      setArrival({ t: u });
      if (u < 1) id = requestAnimationFrame(tick);
      else {
        setArrival(null);
        if (!demoed.current && !railedNow.current && steps.length > 1) {
          demoed.current = true;
          demo.current = true;
          setPlaying(true);
          setGoal(steps.length - 1);
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [sig, animates, steps.length, solved.length]);

  /* One at a time, and the next begins where the last committed — so a jump of
     several steps plays each separation in turn, which is what a launch does.
     #105 */
  useEffect(() => {
    if (!moving) {
      setPlaying(false);
      /* The demonstration ends where it began, so what the reader is left
         looking at is the rocket, not the payload alone. */
      if (demo.current) {
        demo.current = false;
        setStep(0);
        setGoal(0);
      }
      return;
    }
    if (!animates) {
      setStep(back ? from - 1 : from + 1);
      return;
    }
    setAnim({ a: lo, t: back ? 1 : 0 });
    /* Read here and deliberately not a dependency: the pace belongs to the
       transition that is running, not to the state of the button. Stopping
       mid-play changes `playing` and `goal` without changing which pair of
       steps is in flight, so this effect is not rebuilt and the separation
       finishes at the speed it began. */
    const ms = playing ? PLAY_MS : STEP_MS;
    const t0 = performance.now();
    let id = requestAnimationFrame(function tick(now: number) {
      const u = Math.min(1, (now - t0) / ms);
      setAnim({ a: lo, t: back ? 1 - u : u });
      if (u < 1) id = requestAnimationFrame(tick);
      else {
        setAnim(null);
        setStep(back ? from - 1 : from + 1);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [moving, back, lo, from, animates]);

  /* Full screen holds focus the way the setup sheet does: in on entry, Tab
     kept inside, Escape out, the page behind not scrolling, and focus back
     on the button that opened it. One hook for both, #141. */
  const overlay = useRef<HTMLDivElement | null>(null);
  const leave = useCallback(() => setFull(false), []);
  useTrap(overlay, full, leave, fullScreenButton);

  /* The two models a transition runs between, and the choreography joining
     them — built once for the transition, not once a frame. `stepModels`
     returns fresh arrays every call, and handing ThreeView a new one every
     frame would have it throw away every buffer on the card to move a part a
     metre. */
  /* What is between two steps, and how far: the separation in flight, or the
     one the scrub handle is being held in. Held, the handle wins — a scrub is
     the reader taking the film out of the projector's hands. #138 */
  const motion =
    scrub !== null
      ? { a: Math.min(Math.floor(scrub), last), t: scrub - Math.floor(scrub) }
      : anim;
  const base = motion ? motion.a : from;
  const shot = useMemo(() => {
    const A = stepModels(solved, steps[base], payload, payloadDia);
    if (!motion || base + 1 > last) return { A, B: null, sep: null };
    const B = stepModels(solved, steps[base + 1], payload, payloadDia);
    return {
      A,
      B,
      sep: separation(A.model, B.model, steps[base], steps[base + 1]),
    };
  }, [solved, steps, base, motion !== null, last, payload, payloadDia]);
  /* The arrival's choreography, built once for the design and not once a
     frame, for the same reason as `shot`. */
  const asm = useMemo(() => assembly(shot.A.model), [shot.A.model]);

  /* Every stage solved. Short of that the whole-vehicle figures are dashes:
     the liftoff mass of a rocket missing a stage is not a number. With none
     solved there is no drawing at all, and the name and the dashes stand
     over the callout that says so. */
  const complete = solved.length > 0 && solved.length === stages.length;
  const dash = (v: string | number) => (complete ? v : "—");

  const frame = motion && shot.sep ? pose(shot.sep, motion.t) : null;
  /* A new design settling onto the pad. Only ever at the pad — a separation
     cannot be in flight during an arrival, since the arrival put the stepper
     there — so the two never contend for the offsets. */
  const landing = arrival && !frame ? arrive(asm, arrival.t) : null;
  /* How far in the figures are: they count up with the parts. */
  const settled = landing ? landing.settled : 1;
  /* The step being entered: what the figures report and which chip is lit. The
     drawing is between two of them, and the numbers may as well lead. Held by
     the handle, the nearer of the two. */
  const at =
    scrub !== null
      ? Math.min(Math.round(scrub), last)
      : moving
        ? back
          ? lo
          : lo + 1
        : from;
  const model = shot.A.model;
  const live =
    frame && shot.B ? (at === base ? shot.A.live : shot.B.live) : shot.A.live;
  /* The plan shows the bottom live stage alone, so between two steps it is a
     different shape with nothing in common. It fades through rather than
     moving: out over the first half, swapped where nothing is on screen, back
     in over the second. */
  const planModel =
    frame && shot.B && motion
      ? motion.t < 0.5
        ? shot.A.planModel
        : shot.B.planModel
      : shot.A.planModel;
  const planFade = motion ? Math.abs(2 * motion.t - 1) : 1;

  /* Twice, over two chains. `pad` is the vehicle that leaves the pad and `now`
     is what is left at this step — the same function and the same authority,
     asked about a shorter stack. `test/model.test.ts` already asks it the
     second way and holds the drawing to the answer, so the figures under the
     panels were the only place still reporting the whole vehicle at every
     step: a 1.1 m pod read as 23.2 m tall. #101 */
  const pad = stackGeometry(stages, payload, payloadDia);
  const now = stackGeometry(live, payload, payloadDia);
  const mass = live.length ? live[0].sol.total : payload;
  /* Nothing has staged away yet, so the two are the same chain and the same
     numbers. Boosters do not enter it either way: `stackGeometry` reports the
     core width, because boosters are gone by about 18 km and the limit judges
     what is left. */
  const whole = live.length === solved.length;
  /* Slenderness is a constraint on the stack that leaves the pad, not on a
     step of it — at "Payload alone" a per-step aspect is about 0.8:1, and a
     warning keyed to that would come off a design that breaks the limit. So
     the colour belongs to the pad's figure, and where that is not the figure
     on the line, the pad's is named beside it and takes the colour. */
  const limit = pad.ar > maxAspect ? C.amber : C.muted;
  /* Both numbers come from the model, not from a second pass over shapes this
     file pushed. They used to be reasoned back from a parts array that carried
     at most two of a stage's side columns — a side elevation cannot show a ring
     — and that is where #9 lived, and #58, and every geometry bug in this
     repository: two descriptions of one rocket.

     Sized for the view actually on screen: turned three-quarters on, a stack is
     shorter and wider than its elevation, and a panel cut for the elevation
     would leave it drawn small in the middle of it. `framing` carries no
     three.js, so asking it costs the bundle nothing. */
  const need = framing(angle, frame ? frame.extent : extentOf(model));
  const H = Math.max(0.1, need.h * 2);
  /* A floor so a very small rocket still gets a panel with room in it. */
  const wMax = Math.max(1, need.w * 2);

  const aw = railed ? outerW - RAIL - GAP : outerW;
  /* The row's height is read where the row has one of its own — full screen,
     and the wide screen's half-window — and never where it is the drawings'
     own height coming back round. */
  const sized = full || wide;
  const scrubbed = animates && steps.length > 1;
  const scrubH = scrubbed
    ? (wide ? SCRUB_TARGET.wide : SCRUB_TARGET.phone) + SPACE.md
    : 0;
  const ah = sized && box.h ? Math.max(1, box.h - HEAD - scrubH) : INLINE_H;
  const { elev, plan } = panelSizes({ aw, ah }, wMax / H, GAP);

  /* One header line per column, so all three labels sit on it. */
  const head = (label: string, extra?: ReactNode) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, height: HEAD }}
    >
      <span className="label">{label}</span>
      {extra}
    </div>
  );

  /* One group whichever way it is laid out: a rail is the same choice stood
     on end, and the arrow keys walk it either way. */
  const chips = (
    <Choice
      label="Staging step"
      options={steps.map((st, i) => ({ value: i, label: st.label }))}
      value={at}
      onChange={(i) => {
        demo.current = false;
        setPlaying(false);
        setScrub(null);
        setGoal(i);
      }}
      chip={railed ? { textAlign: "left", width: "100%" } : undefined}
      style={
        railed
          ? {
              flexDirection: "column",
              flexWrap: "nowrap",
              marginTop: 6,
              overflowY: "auto",
            }
          : undefined
      }
    />
  );

  /* The stepper as a scrubber: the same steps laid along a line, with a
     handle that can be held anywhere between two of them. Dragging it plays
     the separation by hand; letting go snaps to the nearer step and the
     stepper takes it from there. The arrow keys walk whole steps, as they do
     on the chips, so the keyboard never lands between two. Only where the
     separations animate — with nothing to scrub through, the chips are the
     whole control. #138 */
  const release = () => {
    if (scrub === null) return;
    const n = Math.min(Math.round(scrub), last);
    setScrub(null);
    setAnim(null);
    setStep(n);
    setGoal(n);
  };
  const scrubber = scrubbed && (
    <input
      type="range"
      aria-label="Scrub the staging"
      min={0}
      max={last}
      step={0.01}
      value={scrub ?? (anim ? anim.a + anim.t : from)}
      onPointerDown={() => {
        demo.current = false;
        setPlaying(false);
      }}
      onChange={(e) => setScrub(parseFloat(e.target.value))}
      onPointerUp={release}
      onPointerCancel={release}
      onBlur={release}
      onKeyDown={(e) => {
        const by =
          e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp"
            ? 1
            : e.key === "ArrowLeft" ||
                e.key === "ArrowDown" ||
                e.key === "PageDown"
              ? -1
              : e.key === "Home"
                ? -last
                : e.key === "End"
                  ? last
                  : 0;
        if (!by) return;
        e.preventDefault();
        demo.current = false;
        setPlaying(false);
        setScrub(null);
        setGoal(Math.max(0, Math.min(last, at + by)));
      }}
      style={{ display: "block", marginTop: SPACE.md, flexShrink: 0 }}
    />
  );

  /* The name on the rocket. What the section used to carry as a row of
     figures beside a name is now the drawing's own title and its own
     caption: the name over it in the display role, the figures under it. */
  const heading = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="label" style={{ marginBottom: 3 }}>
        Save it as
      </div>
      <div className="display" style={{ color: C.paper, lineHeight: 1.1 }}>
        {craft.name}
      </div>
      <div className="note" style={{ marginTop: 2 }}>
        {craft.sub}
      </div>
    </div>
  );

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {heading}
      {animates && steps.length > 1 && (
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? "Stop" : "Play the staging"}
          onClick={() => {
            demo.current = false;
            setScrub(null);
            if (playing) {
              /* Let the separation in flight finish rather than snapping out
                 of it halfway. */
              setPlaying(false);
              setGoal(at);
            } else {
              /* From the top again if it is already at the end. */
              if (from === last) setStep(0);
              setGoal(last);
              setPlaying(true);
            }
          }}
        />
      )}
      {drawn && (
        /* The label is the only text on it, so it has to be a real one: the
           browser reads it out, and the browser suite finds the button by
           it. */
        <IconButton
          icon={full ? Minimize : Maximize}
          label={full ? "Leave full screen" : "Full screen"}
          onClick={() => setFull(!full)}
        />
      )}
    </div>
  );

  /* The largest box the transition passes through. The buffer is allocated
     once for it and the visible box is clipped out of the corner, so the panel
     can change size every frame without reallocating two render targets and a
     depth texture sixty times a second. Sampled rather than solved for:
     `panelSizes` is not monotone in the extent, and nine points cost nothing
     once a transition. #105 */
  const buffers = useMemo(() => {
    if (!shot.sep) return null;
    let ew = 0,
      eh = 0,
      pw = 0;
    for (let i = 0; i <= 8; i++) {
      const f = pose(shot.sep, i / 8);
      const n = framing(angle, f.extent);
      const sz = panelSizes(
        { aw, ah },
        Math.max(1, n.w * 2) / Math.max(0.1, n.h * 2),
        GAP,
      );
      ew = Math.max(ew, sz.elev.w);
      eh = Math.max(eh, sz.elev.h);
      pw = Math.max(pw, sz.plan.w);
    }
    return { elev: { w: ew, h: eh }, plan: { w: pw, h: pw } };
  }, [shot.sep, angle, aw, ah]);

  /* What each drawing is a picture of, for a reader who cannot see it: the
     view, the craft, the step and the figures under it — the same ones, so
     the alternative is the caption and not a second account of it. #141 */
  const alt = (view: string) =>
    `${view} of ${craft.name}, ${steps[at]?.label ?? "on the pad"}: ` +
    `${fmt(mass, 1)} t, ${live.length} stage${live.length === 1 ? "" : "s"}, ` +
    `${now.h.toFixed(1)} m tall`;

  const panel = (
    label: string,
    parts: typeof model,
    view: string,
    size: { w: number; h: number },
    buffer: { w: number; h: number } | undefined,
    extra?: ReactNode,
    fade?: number,
    moves?: ReturnType<typeof pose> | null,
  ) => (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {head(label, extra)}
      {/* At the foot of its column, so the base of the plan and the base of
          the elevation are the same line — which is the bottom of the section.
          The elevation is the taller of the two and never moves. */}
      <div style={{ marginTop: "auto", opacity: fade ?? 1 }}>
        <Suspense fallback={<Loading w={size.w} h={size.h} />}>
          <ThreeView
            parts={parts}
            view={view}
            width={size.w}
            height={size.h}
            color={color}
            theme={theme}
            alt={alt(label)}
            buffer={buffer}
            extent={moves ? moves.extent : undefined}
            sweep={moves ? moves.sweep : undefined}
            midY={moves ? moves.midY : undefined}
            offsets={moves ? moves.offsets : undefined}
          />
        </Suspense>
      </div>
    </div>
  );

  const row = (
    <div
      ref={box.ref}
      style={{
        display: "flex",
        gap: GAP,
        /* Every column the height of the row, so the one that pushes its
           drawing to the bottom has something to push against. */
        alignItems: "stretch",
        /* Full screen: everything the two lines of text do not need. Wide:
           half the window, which `useBox` reads back to size the panels. */
        flex: full ? 1 : undefined,
        height: !full && wide ? INLINE_WIDE : undefined,
        minHeight: 0,
        overflowX: railed ? undefined : "auto",
      }}
    >
      {railed && (
        <div
          style={{
            width: RAIL,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {head("Step")}
          {chips}
        </div>
      )}
      {/* The two drawings in the middle of what is left of the row. A pencil
          is a few pixels wide at any height, and `panelSizes` keeps the plan
          no wider than the elevation, so on a wide screen most of the row is
          air: better either side of the rocket than all to its right. Where
          the drawings fill the row this does nothing. #137 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            gap: GAP,
            alignItems: "stretch",
            justifyContent: railed ? "center" : undefined,
          }}
        >
          {panel(
            "Elevation",
            model,
            angle,
            elev,
            buffers?.elev,
            <IconButton
              icon={Box}
              label="Isometric"
              on={angle === "iso"}
              onClick={() => setAngle(angle === "iso" ? "side" : "iso")}
            />,
            1,
            frame ?? landing,
          )}
          {panel(
            "Plan",
            planModel,
            "plan",
            plan,
            buffers?.plan,
            undefined,
            planFade,
          )}
        </div>
        {/* The stepper as a scrubber, along the foot of the drawings. */}
        {scrubber}
      </div>
    </div>
  );

  /* The headline figures, for the step on screen. On the pad they are the
     whole vehicle's — the liftoff mass, every stage, what it all costs — and
     at each step after they are what is still attached, the way the drawing
     is. Height and slenderness are `stackGeometry`'s, not the drawing's own
     bounds: the two agree — `test/model.test.ts` holds them to a millimetre —
     and there is one of them, which is the point. #101, #138 */
  /* A stage's `total` is everything above it, payload included, so the bottom
     live stage's is the mass of what is still attached; with nothing left it
     is the payload. */
  const cost = live.reduce((a, x) => a + stageCost(x.sol), 0);
  const parts = live.reduce((a, x) => a + stageParts(x.sol), 0);
  const figures = (
    <div
      className="hero"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        marginTop: SPACE.lg,
      }}
    >
      <Stat
        label={whole ? "Liftoff mass" : "Mass"}
        value={dash(fmt(mass * settled, 1))}
        unit="t"
      />
      <Stat
        label="Stages"
        value={dash(Math.round(live.length * settled))}
        unit=""
      />
      <Stat
        label="Height"
        value={dash((now.h * settled).toFixed(1))}
        unit="m"
        small
      />
      <Stat
        label="Aspect"
        value={dash((now.ar * settled).toFixed(1))}
        unit=":1"
        color={complete && whole && limit === C.amber ? C.amber : undefined}
        small
      />
      {!whole && (
        <Stat
          label="On the pad"
          value={pad.ar.toFixed(1)}
          unit=":1"
          color={limit === C.amber ? C.amber : undefined}
          small
        />
      )}
      <Stat label="Cost" value={dash(fmt(cost * settled))} unit="funds" small />
      <Stat
        label="Parts"
        value={dash(Math.round(parts * settled))}
        unit=""
        small
      />
      <Stat label="Class" value={vehicleClass} unit="" small />
    </div>
  );

  /* On the phone the chips follow the drawing they name, under the scrubber;
     on the desktop they are the rail. */
  const body = (
    <>
      {header}
      {solved.length > 0 && (drawn ? row : <NoWebGL />)}
      {solved.length > 0 && !railed && (
        <div style={{ marginTop: SPACE.lg }}>{chips}</div>
      )}
      {figures}
    </>
  );

  /* What is left in the card while the overlay is up. A line rather than the
     same button again: two controls with one label is two things for a screen
     reader to read out and one of them to pick from, and the way back is on
     the overlay where the eye already is. */
  const placeholder = (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
      {heading}
      <span className="note" style={{ color: C.dim }}>
        shown full screen · Escape to come back
      </span>
    </div>
  );

  /* Through a portal, and this is not a detail. The overlay has to escape the
     `Solving` veil: that wrapper drops to `opacity: .22` and `filter:
     grayscale(1)` while a solve runs, and either of those makes it the
     containing block for a `position: fixed` descendant — so the overlay would
     re-anchor itself to the results column halfway through a solve.

     Under the app's own solving pill, which is `Z.solving` and lives outside
     the veil, so a full-screen rocket about to be replaced still says so.

     Not the Fullscreen API. This is meant to run inside a Claude artifact's
     iframe, where `requestFullscreen` needs an `allow` attribute nobody here
     controls. Filling the window is the promise it can keep. */
  /* Named while anything is in motion, so the browser suite's `settle` can
     wait for it to stop — the arrival as much as a separation. Computed rather
     than read from state for the arrival's first frame: a design has changed
     when its fingerprint has, and the effect that starts the arrival has not
     run yet on the render that shows the new rocket. #138 */
  const arriving = arrival !== null || (animates && lastSig.current !== sig);
  /* `moving` as well as `anim`: between one separation landing and the next
     starting there is a render with nothing in flight, and a sample taken in
     that gap reads a step on the way to the one asked for. The demonstration
     is named to its last frame too, which is the reset to the pad. */
  const motionName = arriving
    ? "arriving"
    : anim || moving || demo.current
      ? "staging"
      : undefined;

  return (
    <>
      <div data-motion={motionName}>{full ? placeholder : body}</div>
      {full &&
        createPortal(
          <div
            ref={overlay}
            role="dialog"
            aria-modal
            aria-label="Full screen"
            tabIndex={-1}
            style={{
              position: "fixed",
              inset: 0,
              outline: "none",
              /* The window as it is now, address bar and all: `100vh` on a
                 phone is the window with the bar gone, and the rail's foot
                 sat under it. */
              height: "100dvh",
              zIndex: Z.overlay,
              background: C.ink,
              /* A second root. Outside the one the application sets these on,
                 `button { font-family: inherit }` reaches the browser default
                 and every chip in here comes out in Times. */
              fontFamily: FONT,
              color: C.paper,
              /* Inside the notch and the home indicator on a phone. */
              padding:
                "calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}

export { BuildView, isSolved };
export type { SolvedStage, Step };

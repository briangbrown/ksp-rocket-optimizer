/* ---------------------------- reading the drawing ----------------------------

   Everything here runs inside the page and comes back as numbers. Sending the
   image out instead would mean a golden-file baseline, and a baseline over a
   software rasteriser churns on its own: SwiftShader is not promised to be
   stable to the pixel across versions, and a diff nobody can explain is the
   failure this repository already knows the cost of.

   So the assertions are about properties. Is anything drawn. Did it change when
   the rocket changed. Is the outline colour present where a seam is. Each maps
   to a bug that shipped or to a claim nothing else checks. #73

   Note what reading a WebGL canvas at all depends on: `drawImage` from one only
   returns the last frame if the context kept its drawing buffer. Without
   `preserveDrawingBuffer` the buffer is cleared once composited, so these
   helpers would come back empty — which is why `survivesRepaint` below is a
   real test and not a formality. */

/* Injected into the page as a string: it has to be defined in that realm, and
   several assertions call it more than once. */
export const READ = `
(canvas) => {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const box = canvas.getBoundingClientRect();
  const seen = new Map();
  let hash = 2166136261;
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    seen.set(key, (seen.get(key) || 0) + 1);
    hash = Math.imul(hash ^ key, 16777619) >>> 0;
  }
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    buffer: [canvas.width, canvas.height],
    css: [Math.round(box.width), Math.round(box.height)],
    distinct: seen.size,
    pixels: d.length / 4,
    top: top.map(([k, n]) => [
      "#" + k.toString(16).padStart(6, "0"),
      n / (d.length / 4),
    ]),
    hash,
  };
}`;

/* How much of the drawing is within a small distance of a colour. Used for the
   outline, which is drawn in exactly one colour but antialiased against
   whatever it crosses, so an exact match undercounts badly. */
export const NEAR = `
(canvas, hex, tol) => {
  const want = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (
      Math.abs(d[i] - want[0]) <= tol &&
      Math.abs(d[i + 1] - want[1]) <= tol &&
      Math.abs(d[i + 2] - want[2]) <= tol
    )
      n++;
  return n / (d.length / 4);
}`;

/* Which side of its own axis the drawing carries its weight, ignoring whatever
   colour the background is. Two views of one rocket must answer the same way,
   or one of them is mirrored against the other — which is what #69 was. */
export const LEAN = `
(canvas, bg) => {
  const want = [
    parseInt(bg.slice(1, 3), 16),
    parseInt(bg.slice(3, 5), 16),
    parseInt(bg.slice(5, 7), 16),
  ];
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let left = 0, right = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const flat =
        Math.abs(d[i] - want[0]) <= 6 &&
        Math.abs(d[i + 1] - want[1]) <= 6 &&
        Math.abs(d[i + 2] - want[2]) <= 6;
      if (flat) continue;
      if (x < c.width / 2) left++;
      else if (x > c.width / 2) right++;
    }
  return { left, right, ink: left + right };
}`;

/* The helpers above are strings because they have to be compiled in the page's
   own realm. Parenthesised, not prefixed with a bare `return`: each source
   begins on its own line, and `return` followed by a newline is `return
   undefined` — the arrow function is then dead code and the call fails with
   "not a function", a long way from the cause. */
export const forCanvas = (page, fn, index, ...rest) =>
  page.evaluate(
    (src, i, args) =>
      new Function(`return (${src})`)()(
        document.querySelectorAll("canvas")[i],
        ...args,
      ),
    fn,
    index,
    rest,
  );

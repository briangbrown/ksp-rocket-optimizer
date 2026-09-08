import { DATA } from "../core/catalogue.js";

/* ------------------------------ the design as a link ------------------------------

   The configuration string — `configText` in app.tsx, the same one the setup
   sheet copies and `parseConfig` reads back — carried in the URL's hash, so
   a design is something to send rather than something to paste. `#c=` and
   then the string, deflated and written in base64url; the letter is the
   format, and a second one is how the next format would be told apart.

   The transport is the whole job here. What goes in is the string the app
   writes and what comes out is that string, so `parseConfig` sees the paste
   and the link as the same thing and its field-by-field tolerance covers
   both. Nothing here validates a setting. #140 */

const PREFIX = "#c=";

/* Whether this browser can. `CompressionStream` is what does the work and
   Safari had none before 16.4; where it is missing there is no link to
   offer and a hash cannot be read, and both say so rather than fail. */
const canLink = () => typeof CompressionStream !== "undefined";

/* The tech list is the bulk of the string — sixty-odd node names, half of
   them in any roster — and it deflates poorly, because the names are
   distinct. Almost every roster is a tier with a few exceptions, so that is
   how it travels: the tier that needs the fewest, and the nodes that differ
   from it, which are researched if above the tier and not if within it. The
   default mission's hash came down from 515 characters to 307 this way.

   A configuration written by hand with `tech` in it still parses: the
   packing is applied only to what it recognises, and the unpacking likewise,
   so what is not packed passes through to `parseConfig` unchanged. */
type Packed = Record<string, unknown>;

const lvl = (n: string) => DATA.nodes[n]?.lvl ?? Infinity;
const nodes = () => Object.keys(DATA.nodes);

/* Both directions keep the field where it was, so the string that comes out
   is the one that went in and not a re-ordering of it. */
function packTech(cfg: Packed): Packed {
  const tech = cfg.tech;
  if (!Array.isArray(tech)) return cfg;
  const has = new Set(tech as Array<string>);
  let tier = 1;
  let diff = nodes();
  for (let t = 1; t <= 9; t++) {
    const d = nodes().filter((n) => lvl(n) <= t !== has.has(n));
    if (d.length < diff.length) {
      tier = t;
      diff = d;
    }
  }
  return Object.fromEntries(
    Object.entries(cfg).flatMap(([k, v]) =>
      k === "tech"
        ? [
            ["tier", tier],
            ["techDiff", diff.sort()],
          ]
        : [[k, v]],
    ),
  );
}

function unpackTech(cfg: Packed): Packed {
  const { tier, techDiff } = cfg;
  if (typeof tier !== "number" || !Array.isArray(techDiff)) return cfg;
  const diff = new Set(techDiff as Array<string>);
  const tech = nodes()
    .filter((n) => lvl(n) <= tier !== diff.has(n))
    .sort();
  return Object.fromEntries(
    Object.entries(cfg).flatMap(([k, v]) =>
      k === "tier" ? [["tech", tech]] : k === "techDiff" ? [] : [[k, v]],
    ),
  );
}

/* The configuration string's two halves: the tag and the JSON after it. */
const TAG = "KSP-PLANNER ";

/* How long a hash may be and how much it may inflate to. A real design is
   under two kilobytes of hash and a few of text; 200 MB of one letter
   deflates to 200 KB, which is a shareable address and a dead tab. Both
   bounds are generous and both are read before the whole result is held. #175 */
const MAX_HASH = 8192;
const MAX_INFLATED = 256 * 1024;

/* One chunk through a compression stream and back out as bytes. A
   `ReadableStream` built by hand rather than `Blob.stream()`, which jsdom's
   Blob does not have. Read piece by piece rather than buffered whole, so a
   result past `cap` is refused as it arrives. */
async function pipe(
  bytes: Uint8Array,
  stream: GenericTransformStream,
  cap = Infinity,
) {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = source.pipeThrough(stream).getReader();
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new RangeError("inflates past the cap");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/* In pieces: spreading a large array into `fromCharCode` throws past about
   a hundred thousand bytes. */
const toBase64url = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000)
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );

/* The hash for a configuration string: `#c=` and the packed, deflated,
   base64url text. Rejects where the browser cannot compress. */
async function toLink(text: string): Promise<string> {
  const packed = JSON.stringify(packTech(JSON.parse(text.slice(TAG.length))));
  const bytes = await pipe(
    new TextEncoder().encode(packed),
    new CompressionStream("deflate-raw"),
  );
  return PREFIX + toBase64url(bytes);
}

/* What a hash carries. `null` where it carries no design at all — no hash,
   or someone else's — so a plain visit is nothing to remark on; a message
   where it tried to and could not, which is worth a callout; the
   configuration string otherwise, for `parseConfig`. */
type Found = { text: string; error?: undefined } | { error: string };

async function fromLink(hash: string): Promise<Found | null> {
  if (!hash.startsWith(PREFIX)) return null;
  if (!canLink())
    return {
      error:
        "This browser cannot read the link; the design shown is the default.",
    };
  try {
    if (hash.length > MAX_HASH) throw new RangeError("too long to be one");
    const bytes = await pipe(
      fromBase64url(hash.slice(PREFIX.length)),
      new DecompressionStream("deflate-raw"),
      MAX_INFLATED,
    );
    const cfg = JSON.parse(new TextDecoder().decode(bytes));
    return { text: TAG + JSON.stringify(unpackTech(cfg)) };
  } catch {
    return {
      error:
        "The link did not carry a design — its address was cut short or altered. The mission shown is the default.",
    };
  }
}

export { canLink, fromLink, toLink };

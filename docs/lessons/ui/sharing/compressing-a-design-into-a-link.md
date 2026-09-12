# Compressing a design into a link

**Syllabus:** [L20](../../README.md#part-3--language-and-platform)

**Why it matters:** How a design travels as a link matters because the
configuration string is seven hundred characters, half of them a list of
tech-node names, and an address that long is not something to send; the
browser's own deflate halves it, describing the tech list as a tier plus its
exceptions halves it again, and the result rides in the URL fragment, which
never reaches a server; and because anything anyone can put in an address
is untrusted, the reverse path caps the hash's length, reads the inflating
stream piece by piece so a bomb is refused before it is held, and hands the
text to a parser that may not throw.

**Before this:** [L1](../../architecture/the-seam/plain-data-across-a-seam.md),
_Plain data across a seam_.

## A worked case

Take the default mission, 2.5 t to land on the Mun and return at tier five,
as the configuration string the setup sheet copies, and measure each step
of the trip into a link and back:

| Step                                                          | Size                       |
| ------------------------------------------------------------- | -------------------------- |
| The configuration string                                      | 690 characters             |
| Of which the tech list, 21 node names                         | 356 characters             |
| Deflated as it stands, in base64url                           | 386 bytes → 515 characters |
| Tech list packed as a tier and its differences, then deflated | 293 characters             |
| Read back from the link                                       | the same 690 characters    |

Deflate finds the repetition in the JSON, the quoted keys and the
punctuation, and cuts the string by about a third; it does little for the
node names, which are distinct words. Almost every roster is a tier with a
few exceptions, so the list travels as `tier: 5` and an empty difference,
and the link comes down to 293 characters. Read back, the packing is
undone against the same tech tree and the string is the one that went in,
character for character, so the paste path and the link path see the same
text.

Then the two things an address can do that a paste cannot:

| Hostile hash                                                  | Result                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| 20 MB of one letter, deflated: a 25,954-character hash, 771:1 | refused for length, before any inflation                      |
| 300 kB of one letter: a 433-character hash, 693:1             | inflates past the 256 kB cap and is refused mid-stream        |
| The real link cut to forty characters                         | "The link did not carry a design…"; the default mission shows |
| No `#c=` at all                                               | null; a plain visit is not remarked on                        |

```ts
// save as test/l20.test.ts and run: npx vitest run test/l20.test.ts --reporter=verbose
import { test } from "vitest";
import { fromLink, toLink } from "../src/ui/link";
import { parseConfig } from "../src/ui/config";
import { DATA } from "../src/core/catalogue";
import { withDeps } from "../src/core/tech";

const tier = (n: number) =>
  Object.keys(DATA.nodes).filter((k) => DATA.nodes[k].lvl <= n);
const text =
  "KSP-PLANNER " +
  JSON.stringify({
    origin: "Kerbin",
    dest: "Mun",
    profile: "land",
    returning: true,
    payload: 2.5,
    payloadDia: 1.25,
    margin: 10,
    extraDv: 0,
    objective: "cost",
    boosters: true,
    chutes: true,
    needGimbal: false,
    planeNow: false,
    asparagus: false,
    maxAspect: 14,
    expansions: { mh: false, rs: true },
    tech: [...withDeps(DATA.nodes, tier(5))].sort(),
    excluded: [],
    cuts: null,
    splits: [],
  });

async function deflated(s: string) {
  // the browser's own deflate, no packing
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });
  const r = src.pipeThrough(new CompressionStream("deflate-raw")).getReader();
  let n = 0;
  for (;;) {
    const { value, done } = await r.read();
    if (done) break;
    n += value.byteLength;
  }
  return n;
}

test("a design as a link", async () => {
  const tech = JSON.parse(text.slice(12)).tech as string[];
  const raw = await deflated(text);
  const hash = await toLink(text);
  const back = await fromLink(hash);
  console.log(
    `config ${text.length} chars, tech list ${tech.length} names in ${JSON.stringify(tech).length} chars; deflated as is ${raw} bytes → ${Math.ceil((raw * 4) / 3)} base64url chars; link with the tech packed ${hash.length} chars: ${hash.slice(0, 40)}…`,
  );
  console.log(
    `round trip identical: ${back && "text" in back && back.text === text}; parses like the paste: ${JSON.stringify(parseConfig(text).values) === JSON.stringify(parseConfig(back!.text!).values)}`,
  );
  for (const mb of [20, 0.3]) {
    const bomb = await toLink(
      "KSP-PLANNER " + JSON.stringify({ note: "a".repeat(mb * 1e6) }),
    );
    const r = await fromLink(bomb);
    console.log(
      `${mb} MB of one letter → a ${hash.length && bomb.length.toLocaleString("en-US")}-char hash (${Math.round((mb * 1e6) / bomb.length)}:1); fromLink → ${r && "error" in r ? "refused: " + r.error!.slice(0, 40) + "…" : "accepted"}`,
    );
  }
  console.log(
    `cut to 40 chars → ${JSON.stringify(await fromLink(hash.slice(0, 40)))!.slice(0, 70)}…;  no hash → ${await fromLink("")}`,
  );
});
```

## The idea

**Deflate and inflate** are the compression and decompression the browser
provides, through `CompressionStream` and `DecompressionStream`: the same
algorithm as zip and gzip, which finds repeated byte sequences and replaces
each repeat with a short back-reference, then codes the result with shorter
codes for commoner symbols. It is good at what repeats and poor at what
does not; a JSON object's keys, quotes, colons and braces repeat, a list of
distinct names does not. So the first gain is the format's and the second
has to be the application's: knowing that a tech roster is almost always a
tier plus a few exceptions, describe it that way, and let deflate handle
the rest. That is the general shape of compressing structured data, a
domain-specific transform that turns what the data usually is into a few
numbers, followed by a general compressor for the residue. The transform
must be exactly reversible against the same reference, here the tech tree,
or the string that comes out is not the one that went in.

The **URL fragment** is the part of an address after `#`, and it is never
sent to the server: the browser keeps it for the page, and a page can read
it on load and write it with `history.replaceState` without a navigation.
That makes it the right place for a design. Nothing is stored anywhere but
in the address itself, a static host needs no endpoint, and the reader's
design does not pass through anyone's logs. The bytes have to be written in
characters an address allows, which is base64url, the base64 alphabet with
`+` and `/` swapped for `-` and `_` and the padding dropped; four
characters carry three bytes, so 386 bytes are 515 characters. `#c=` is the
prefix, and the letter is the format: a second letter is how the next
format would be told apart from this one. `replaceState` rather than
`pushState`, because a change to a slider is not a page and the back button
should leave the site.

**Untrusted input** is anything a user or a link can hand the program, to
be validated before use, and a fragment is the purest case: anyone can
write one and send it to anyone. Two attacks are specific to compression.
A hash can be enormous, so its length is checked first, against a bound a
real design never approaches; and a small hash can inflate to something
enormous, a decompression bomb, since 300 kB of one letter deflates to a
few hundred bytes and 20 MB to twenty-six thousand. The defence is to inflate as a stream and count as the
pieces arrive, refusing the moment the count passes the cap, so the bomb is
never held in memory. What survives both is still just text, and the
parser that reads it is written never to throw: every list field is checked
element by element against what the application knows, every number is
bounded, the whole reader runs inside a try, and a throw is the "does not
parse" error. The last line is a React error boundary that clears the hash
and offers a reload, because a page that sits under its solving veil until
the address is edited by hand is the failure that was actually seen.

```
   design ──► configText (690) ──► packTech: tech → {tier, techDiff} ──► deflate-raw ──► base64url ──► "#c=" + 290
                                                                                                          │
   location.hash ◄── history.replaceState, after `hydrated` ──────────────────────────────────────────────┘
        │
        ▼ on load
   length ≤ 8192? ──► base64url ──► inflate, piece by piece, ≤ 256 kB ──► JSON.parse ──► unpackTech ──► parseConfig (never throws)
        ✗ too long        ✗ not base64          ✗ past the cap              ✗ not JSON       │                   │
        └──────────────────────── { error: "The link did not carry a design…" } ─────────────┘          Boundary: clear the hash
```

## In this codebase

[`src/ui/link.ts`](../../../../src/ui/link.ts) is the transport and nothing
else; it validates no setting. `PREFIX` is `#c=`, `TAG` the
`KSP-PLANNER ` the configuration string begins with, `canLink` checks for
`CompressionStream`, which Safari lacked before 16.4, and where it is
missing there is no link to offer and a hash cannot be read, and both say
so. `packTech` picks the tier whose difference from the roster is smallest
and writes `tier` and a sorted `techDiff` in the field's place; `unpackTech`
rebuilds the list from the same tree. `pipe` runs one chunk through a
stream and reads the result piece by piece:

```ts
size += value.byteLength;
if (size > cap) {
  await reader.cancel();
  throw new RangeError("inflates past the cap");
}
```

`MAX_HASH` is 8,192 and `MAX_INFLATED` 256 kB, both generous against a real
design's two kilobytes of hash and a few of text. `toLink` packs,
deflates with `deflate-raw` and encodes in 32 kB pieces, because spreading
a large array into `fromCharCode` throws past about a hundred thousand
bytes; `fromLink` returns null with no `#c=`, an error where the hash tried
to be a design and could not, and the text otherwise. In
[`src/ui/app.tsx`](../../../../src/ui/app.tsx) the mount effect reads
`location.hash` after the roster so that the link wins and applies it
through `applyConfig` as a paste, and a later effect writes `toLink(
configText)` with `replaceState` after every change, once `hydrated`, or
the default mission would overwrite the link being read.
[`src/ui/config.ts`](../../../../src/ui/config.ts) is `parseConfig`, and
`Boundary` in [`src/main.tsx`](../../../../src/main.tsx) is the last
line. The rules are in
[`.claude/rules/ui.md`](../../../../.claude/rules/ui.md): _The address is
the design_ and _A link is untrusted input, and `parseConfig` may not
throw_.

## What made it real

The sizes are the measurement: 690 characters to 293, and the comment in
`link.ts` records the same step as it stood when written, the default
mission's hash from 515 characters to 307; the unpacked deflate is still
515 today, and the packed link has since shortened further. The bomb rows are
the tests in [`test/link.test.ts`](../../../../test/link.test.ts) made
visible: a hash that would inflate past the cap is refused without being
held, a hash too long to be a design is refused for its length, a hash cut
short says what happened and the default shows, and a large configuration
encodes rather than throwing.

The parser's rule has a failure behind it, #174: a `TypeError` out of `new
Map` on `{"splits":[1]}` escaped to the mount effect, `hydrated` never
became true, and the page sat under the solving veil until the hash was
edited by hand. `test/boundary.test.tsx` and `test/share.test.tsx` hold the
last line and the share path, and `test/setup.ts` clears the hash before
every test, because jsdom shares `location` across a file and the hash one
mount wrote was the link the next arrived by.

## Where it breaks

- **Compressing the names.** Deflate cannot shorten what does not repeat.
  Describe the roster as what it usually is, a tier and its exceptions, and
  compress the residue.
- **A transform that is not exactly reversible.** The packing is undone
  against the same tech tree; a tree that changed between writing and
  reading would give a different roster. The field stays where it was so
  the string that comes out is the one that went in.
- **Trusting the length of a hash, or the size of what it inflates to.**
  Check the length first, and count the inflated bytes as they arrive.
  Buffering the whole result before checking is holding the bomb.
- **A parser that throws.** A link is anyone's input. Every field checked,
  every list bounded, the whole reader in a try, and a boundary that clears
  the hash behind it.
- **`pushState` for a slider.** A change is not a page; Back should leave
  the site.
- **Writing the hash before the roster loads.** The default mission
  overwrites the link the reader arrived by. The write waits for
  `hydrated`.

## Try it

Run the snippet, then change `tier(5)` to `tier(9)` and watch the tech list
grow past sixty names while the link barely moves, because a full tier is
`tier: 9` and nothing else. Then remove three nodes from the list and watch
`techDiff` carry exactly three. Then open the application, change a slider,
and read the address bar: it changes without a navigation, and Back leaves
the site.

## Check yourself

<details><summary>Deflate cut the configuration string by a third but the tech list barely at all. Why, and what was done about it?</summary>

Because deflate replaces repeated byte sequences with back-references, and
the JSON's keys and punctuation repeat while sixty distinct node names do
not. The list is transformed first into what it usually is, a tier and the
few nodes that differ from it, and that transform is undone against the
same tech tree on the way back so the string is unchanged.

</details>

<details><summary>Why is the design carried in the URL fragment rather than a query string or a stored record?</summary>

Because the fragment is never sent to the server: the design stays in the
address, a static host needs no endpoint, and it passes through no logs.
The page reads it on load and rewrites it with `replaceState` on every
change, so the address is the design and nothing else has to be.

</details>

<details><summary>A four-hundred-character hash inflates to 300 kB. How is it refused without the page holding it?</summary>

The inflating stream is read piece by piece and the bytes counted as they
arrive; the moment the count passes the 256 kB cap the reader is cancelled
and the link reported as not carrying a design. The whole result is never
assembled, which is the difference between a cap and a crash.

</details>

## Further reading

- RFC 1951, the DEFLATE specification, for back-references and Huffman
  coding, and RFC 4648 section 5 for base64url.
- The WHATWG Compression Standard, for `CompressionStream` and
  `DecompressionStream` and what `deflate-raw` means.
- The URL Standard's definition of the fragment, and the HTML specification
  on `history.replaceState`, for what the address keeps to itself.

## Key takeaway

A design travels as a link by describing what it usually is in a few
numbers, deflating the rest with the browser's own compressor, and writing
the bytes into the URL fragment where no server sees them; and it is read
back as untrusted input, length-checked, inflated under a cap counted as
the pieces arrive, and parsed by a reader that may not throw, with a
boundary behind it that clears the hash.

_As of 74dff6f._

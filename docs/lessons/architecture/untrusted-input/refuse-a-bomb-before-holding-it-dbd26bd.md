# Refuse a Bomb Before Holding It

**Why it matters:** any time a program inflates, decodes or parses something a
stranger can hand it, and the guard is a try/catch around the result.

## The concept

Compression ratios are unbounded in the direction an attacker wants: a long run
of one byte deflates to almost nothing, so a payload that fits in a URL can
expand into more memory than a tab has. A `catch` around the inflate is no
defence, because the allocation happens _inside_ the try — the process dies
before control reaches the handler. The bound has to be enforced on the output
as it is produced: read the decompressed stream in pieces, count, and cancel the
moment the count passes what a legitimate result could be. A cheap check on the
input's size in front of it refuses the obvious cases without decoding anything.

## In this codebase

The share link is `#c=` followed by base64url of a deflated JSON configuration.
`fromLink` in `src/ui/link.ts` used to do
`new Response(source.pipeThrough(stream)).arrayBuffer()` and hand the whole
buffer to `TextDecoder`, which doubled it (#175). Now it throws on a hash over
`MAX_HASH` (8 KB) before decoding, and `pipe` takes a `cap`: it reads the
`DecompressionStream` through `getReader()`, adds each chunk's `byteLength`, and
calls `reader.cancel()` past `MAX_INFLATED` (256 KB). Both numbers are generous —
a real design is under 2 KB of hash and a few of text. The same pass found
`toLink`'s `btoa(String.fromCharCode(...b))` throwing past about 100 KB, so it
encodes in 32 KB slices.

## What made it real

200 MB of the letter A deflates to 203,843 bytes — about 272 KB of base64url, a
shareable address and a dead tab. `test/link.test.ts` builds a 5 MB bomb with
`toLink` itself, checks it fits in under 8 KB of hash, and asserts `fromLink`
returns the ordinary "did not carry a design" error rather than holding it; a
20 KB hash is refused before any decode.

## Key takeaway

A guard that runs after the allocation guards nothing; bound untrusted expansion
on the output stream, as it arrives, with a size check on the input in front.

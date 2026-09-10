# Encode Against a Default the Reader Knows

**Why it matters:** putting a configuration into a URL, a QR code or any
channel with a length budget, when a general-purpose compressor is not getting
it small enough.

## The concept

Deflate finds repetition inside the bytes it is given. A list of distinct
identifiers has almost none — every name is new to the window — so it barely
shrinks however it is compressed. What the compressor cannot know is that the
list is nearly determined by something small: most rosters are "everything up
to tier N" with a few exceptions. If the reader has the same tables, the writer
can send the tier and the exceptions and the reader rebuilds the list. That is
delta encoding against a shared default, and it belongs before the compressor,
as a transformation of the structure rather than a replacement for the
compressor. Two disciplines keep it safe: choose the base that minimises the
delta instead of a fixed one, and unpack to exactly the original so the parser
downstream never learns the packed form exists.

## In this codebase

`packTech` in `src/ui/link.ts` tries every tier from 1 to 9 and keeps the one
with the fewest differing nodes, replacing `tech` with `tier` and `techDiff`;
`unpackTech` inverts it before `parseConfig` sees the text, so the URL is a
transport for the same string the paste field accepts and `parseConfig` was
untouched. The packed JSON goes through `deflate-raw` and base64url into
`#c=`. #140

## What made it real

The default mission's hash fell from 515 characters to 307. Deflate alone had
left it at 515 because the sixty-odd node names it carried were all different;
the tier-plus-exceptions form is what the compressor could not find on its own.
`test/link.test.ts` holds the default under 400 and a tier-9 roster under
1,200, and the round trip returns the identical string.

## Key takeaway

When a compressor cannot find the structure, hand it the structure — send the
difference from a base the reader can rebuild, and pick the base that makes the
difference smallest.

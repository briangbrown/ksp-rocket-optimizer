# CSP Polices Markup, Not the CSSOM

**Why it matters:** whenever a Content-Security-Policy is written for a page
whose styling is applied by script, and `'unsafe-inline'` looks like a
concession the design forces.

## The concept

`style-src` governs where style _text_ may come from: `<style>` elements,
`style=""` attributes in the markup, and `setAttribute("style", …)`. It does not
govern the CSSOM. `element.style.width = "4px"` is a property write, not a parse
of untrusted text, and the browser lets it through under any policy. React's
`style={{}}` is exactly that — property writes — so an application styled
entirely by inline objects needs `'unsafe-inline'` only for the `<style>`
elements it renders, and could drop it the day those moved to a file. The
concession is smaller than it looks, and it is precisely locatable.

## In this codebase

`public/_headers` (#176) is served by Cloudflare Pages from the build output.
Its `style-src 'self' 'unsafe-inline'` exists for things that are `<style>`
elements: the `@font-face` block each of `index.html` and `gallery.html`
carries, and the `<style>{STYLES}</style>` that `app.tsx`, `gallery.tsx` and
`boundary.tsx` render to mount `src/ui/styles.ts`. Every other style on the page
is a React `style={{}}` and passes through the CSSOM. `script-src` stays at
`'self'` alone — nothing inline runs — and `test/headers.test.ts` holds that
shape.

## What made it real

A policy is checked by watching it fail, not by reading it: `dist/` served
locally with exactly these headers in headless Chrome, listening for
`securitypolicyviolation`. Both pages — the app solving with its workers and
drawing two canvases, the gallery drawing five — produced no violation; the only
console errors were two `favicon.ico` 404s the site already had. The suite's
test reads the file and asserts directives; it cannot see whether a directive is
_sufficient_, which is why the browser run was the evidence.

## Key takeaway

Before writing `'unsafe-inline'`, list the inline styles by mechanism — markup
and `<style>` need it, CSSOM writes never do — and the header becomes a
description of the page rather than a surrender.

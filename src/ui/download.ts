/* Handing the reader a file. A blob, an anchor with `download`, a click —
   the one way a page saves a file without a server. Where the browser has no
   `URL.createObjectURL` (jsdom; some embedded views that block downloads
   outright) it says so and the caller falls back to the clipboard. #466 */

/* A file name Windows will take: the craft's name with the characters a
   path cannot carry replaced, trimmed, and `.craft` on the end. */
const craftFileName = (name: string) =>
  `${
    name
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "rocket"
  }.craft`;

function saveText(filename: string, text: string): boolean {
  if (typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } finally {
    /* After the click has taken the URL; revoking in the same tick is fine
       in every current browser, but a tick later costs nothing. */
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export { craftFileName, saveText };

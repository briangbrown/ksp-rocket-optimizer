/* Narrowing an expectation.

   `expect(x).toBeTruthy()` tells the reader and the runner that a value is
   there; it tells the compiler nothing, so the lines after it still have to ask
   again. This says it once, in a way both understand — and a failure names what
   was missing rather than reading as a property access on null. */
export function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`expected ${what}`);
  return v;
}

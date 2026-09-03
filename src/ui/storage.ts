/* Where the roster is kept.

   The planner was written as a Claude artifact, and there the only store is
   `window.storage` — an async, record-returning API, with localStorage blocked.
   On the deployed site it is the other way round: no `window.storage`, and
   localStorage works. Both call sites used to be guarded by `window.storage &&`,
   so on Cloudflare Pages they were not failing, they were quietly doing nothing,
   and every load started from the tier 5 default.

   So: prefer the artifact API where it exists, fall back to localStorage, and
   swallow failures rather than propagate them. Persistence is a convenience
   here — a roster that cannot be saved is worth less than an app that will not
   render — and it fails in ordinary browsers, not just exotic ones: Safari in
   private browsing throws on `setItem`, and a browser set to block site data
   throws on the `localStorage` getter itself, before any method is called. */

/* The Claude artifact host's store, which is not a browser API and is
   therefore not in anyone's lib. Declared as optional because on the deployed
   site it genuinely is not there — see above. */
type ArtifactStorage = {
  get: (key: string) => Promise<{ value?: string | null } | null | undefined>;
  set: (key: string, value: string) => unknown;
};

import type { ThemePref } from "./tokens.js";

declare global {
  interface Window {
    storage?: ArtifactStorage;
  }
}

/* What is kept between sessions: the tech tree, the parts held back, the
   expansions, whether a stage has to be able to steer, and the theme. Not the
   mission — that is what the pasted configuration is for. */
type Roster = {
  unlocked: Array<string>;
  excluded: Array<string>;
  expansions: { mh: boolean; rs: boolean };
  needGimbal: boolean;
  theme: ThemePref;
};

const KEY = "ksp-planner:roster";

export async function loadRoster(): Promise<Partial<Roster> | null> {
  try {
    const api = window.storage;
    const raw = api ? (await api.get(KEY))?.value : localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    /* nothing saved yet, or storage unavailable — the caller keeps its defaults */
    return null;
  }
}

export function saveRoster(roster: Roster) {
  try {
    const raw = JSON.stringify(roster);
    const api = window.storage;
    /* The artifact API is async, and a rejection there is an unhandled one
       unless it is caught — the try block cannot see it. */
    if (api) Promise.resolve(api.set(KEY, raw)).catch(() => {});
    else localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable — the session still works, it just will not persist */
  }
}

export type { Roster };

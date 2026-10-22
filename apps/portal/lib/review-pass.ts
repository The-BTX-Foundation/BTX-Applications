// The board's Rayken Review pass on the live Portal (app/RaykenReview.tsx). The loader keeps a pass from a board member's
// start link in three places: localStorage, the rr_<project> cookie and the "rayken-review" IndexedDB database.
// Analytics reads it to leave review visits unmeasured. components/review-context.tsx forgets it when a real student
// is signed in, because then the pass reached them through a forwarded link.
import { isStaffOrTester } from './analytics';
import { REVIEW_PROJECT, TEST_EMAILS } from './config';
import { isAllowListed } from './terpmail';

const STORAGE_KEY = `rayken-review:${REVIEW_PROJECT}`;
const COOKIE = `rr_${REVIEW_PROJECT}`;

/** True when this browser holds a review pass: in storage, or in the cookie when storage is empty or blocked. */
export function holdsReviewPass(storage: Pick<Storage, 'getItem'> | null, cookie: string): boolean {
  try {
    if (storage?.getItem(STORAGE_KEY)) return true;
  } catch {
    // storage blocked: the cookie still says
  }
  return cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=rr`));
}

type Account = { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined;

/** True when the signed-in account is a real student: signed in, not staff, not a non-Terpmail test address and not on
 *  the test allow-list (which can hold "+tag" Terpmail entries). Nobody signed in is never a student here. */
export function isRealStudent(account: Account, allow: string[] = TEST_EMAILS): boolean {
  if (!account) return false;
  if (isStaffOrTester(account)) return false;
  return !isAllowListed(account.email, allow);
}

/** True when the review widget is running on this page with a pass (the loader may find a pass in IndexedDB after the
 *  page's own scripts start, so storage alone can miss it). */
export function widgetHasPass(): boolean {
  const r = (window as Window & { __raykenReview?: { token?: unknown } }).__raykenReview;
  return typeof r?.token === 'string' && r.token.startsWith('rr');
}

/** localStorage, or null when the browser blocks it. */
export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Removes the pass from all three places, plus everything else the widget keeps for this project (the reviewer and
 *  round it last saw). Resolves when done, or after three seconds at most. */
export function forgetReviewPass(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k === STORAGE_KEY || k.startsWith(`${STORAGE_KEY}:`))) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // storage blocked
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  const idb = new Promise<void>((resolve) => {
    try {
      // only open the database if it exists, so this never creates one
      indexedDB.databases().then(
        (list) => {
          if (!list.some((d) => d.name === 'rayken-review')) return resolve();
          const req = indexedDB.open('rayken-review', 1);
          req.onsuccess = () => {
            try {
              const tx = req.result.transaction('kv', 'readwrite');
              tx.objectStore('kv').delete(`pass:${REVIEW_PROJECT}`);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          };
          req.onerror = () => resolve();
        },
        () => resolve(),
      );
    } catch {
      resolve();
    }
  });
  return Promise.race([idb, new Promise<void>((r) => setTimeout(r, 3000))]);
}

// The board's Rayken Review pass on the live Portal (app/RaykenReview.tsx). The loader keeps a pass from a board member's
// start link in three places: localStorage, the rr_<project> cookie and the "rayken-review" IndexedDB database.
// Analytics reads it to leave review visits unmeasured. components/review-context.tsx forgets it when a real student
// is signed in, because then the pass reached them through a forwarded link.
import { REVIEW_PROJECT } from './config';

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

/** localStorage, or null when the browser blocks it. */
export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Removes the pass from all three places. Resolves when done, or after a second at most. */
export function forgetReviewPass(): Promise<void> {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
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
  return Promise.race([idb, new Promise<void>((r) => setTimeout(r, 1000))]);
}

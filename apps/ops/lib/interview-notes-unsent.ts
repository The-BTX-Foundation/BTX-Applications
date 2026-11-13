// The interview page's "not saved" memory: words typed in a notes box that the server does not have yet, kept outside React
// so they outlive the page (a visit to another page and back draws a new one), owned by ONE signed-in person at a time like
// the Scoring page's (lib/scoring-unsent.ts). Only that person's own words are ever kept; reads for anyone else return
// nothing, and a page drawn for a different person clears it first. In memory only: nothing goes to the URL or browser
// storage, so closing the tab drops it (the page warns before that). No database.

let owner: string | null = null;
let words = new Map<string, string>();

const key = (slotId: string, box: string) => `${slotId}|${box}`;

/** Makes `userId` the owner; someone else's words are dropped first. */
export function claimNotes(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  words = new Map();
}

/** The owner's unsaved words for one interview, by box key; nothing for anyone else. */
export function unsentFor(userId: string, slotId: string): Record<string, string> {
  if (owner !== userId) return {};
  const out: Record<string, string> = {};
  const pre = `${slotId}|`;
  for (const [k, v] of words) if (k.startsWith(pre)) out[k.slice(pre.length)] = v;
  return out;
}

/** Keeps unsaved words for one box; `null` drops them (saved, or back to the saved words). */
export function keepWords(userId: string, slotId: string, box: string, text: string | null): void {
  if (owner !== userId) return;
  if (text === null) words.delete(key(slotId, box));
  else words.set(key(slotId, box), text);
}

/** Empties the memory and forgets its owner (tests). */
export function resetNotesMemory(): void {
  owner = null;
  words = new Map();
}

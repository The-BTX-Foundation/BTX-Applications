// Pure logic for the Instagram page (demo p-instagram): where a post stands, its step names and state words, the news
// card, the month groups, and the live mapping from `posts` rows. No database here (unit tested in tests/instagram-map.test.ts).
import { postDone, targetCount } from './outreach-map';
import { daysFrom } from './refresh-time';
import { postRel } from './instagram-time';
import type { IgCaps, IgPerson, IgPost } from './instagram-view';

export type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));

// ---------- Where a post stands ----------

/** How many of the five steps are done. */
export const nDone = (p: IgPost): number => p.steps.filter(Boolean).length;
/** The first step not done (0 to 4), or -1 when all five are. */
export const nowStep = (p: IgPost): number => p.steps.findIndex((x) => !x);
/** True once all five steps are done. */
export const isPosted = (p: IgPost): boolean => nDone(p) === 5;
/** "Keith Dawson" -> "Keith". */
export const first = (name: string): string => name.split(' ')[0];

/** The five steps' names; step 3 names the approver when one is known ("Board approval: Keith Dawson"). */
export function stepName(p: IgPost, i: number): string {
  return ['Draft the caption', 'Pick the photo', p.approver ? `Board approval: ${p.approver.name}` : 'Board approval', 'Schedule it', 'Mark it posted'][i] ?? '';
}

/** A step's short name ("board approval"), as "Next: ..." uses it. */
export const stepShort = (p: IgPost, i: number): string => stepName(p, i).split(':')[0].toLowerCase();

/** Waiting on the caption writer: the caption is the step now, someone else writes it, and it has not come in. */
export const waitsOnCaption = (p: IgPost): boolean => nowStep(p) === 0 && !!p.captionBy && !p.caption;
/** Waiting on the approver: approval is the step now and it has been sent. */
export const waitsOnApproval = (p: IgPost): boolean => nowStep(p) === 2 && (p.sent || !!p.sentAt);

/** The words a row shows under its title: `pre`, then `name` kept on one line, then `post`; `wait` draws the clock line. */
export type StateWords = { wait: boolean; pre: string; name?: string; post?: string } | null;

/** Where a post stands in words, for its row: "Waiting on Keith's caption", "Not started", "Next: pick the photo". */
export function stateWords(p: IgPost): StateWords {
  if (isPosted(p)) return null;
  const i = nowStep(p);
  if (waitsOnCaption(p) && p.captionBy) return { wait: true, pre: 'Waiting on ', name: `${first(p.captionBy.name)}'s`, post: ' caption' };
  if (waitsOnApproval(p)) return p.approver ? { wait: true, pre: 'Waiting on ', name: first(p.approver.name) } : { wait: true, pre: 'Waiting for approval' };
  if (nDone(p) === 0) return { wait: false, pre: p.note ?? 'Not started' };
  return { wait: false, pre: `Next: ${stepShort(p, i)}` };
}

/** Sorts by date, undated last; posts on the same day keep their order. */
export function byDate(a: IgPost, b: IgPost): number {
  if (a.date === b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date < b.date ? -1 : 1;
}

// ---------- The news card ----------

/** The post the news is about: the earliest one not posted yet, dated today or later. */
export function focusPost(posts: IgPost[], today: string): IgPost | undefined {
  return posts.filter((p) => !isPosted(p) && p.date && daysFrom(today, p.date) >= 0).sort(byDate)[0];
}

export type IgNews = { id: string; title: string; kicker: string; go: string; gold: boolean };

/** The news card: what the next post waits on and when it goes out. Gold when it is the signed-in person's (or nobody's) move. */
export function newsOf(posts: IgPost[], today: string, me: string | null, nudged: (id: string) => boolean = () => false): IgNews | null {
  const p = focusPost(posts, today);
  if (!p) return null;
  const i = nowStep(p);
  let k: string;
  if (waitsOnCaption(p) && p.captionBy) k = nudged(p.id) ?`Nudged ${first(p.captionBy.name)}` : `Waiting on ${first(p.captionBy.name)}`;
  else if (i === 2) k = p.sent || p.sentAt ? (p.approver ? `Waiting on ${first(p.approver.name)}` : 'Waiting for approval') : 'Ready for approval';
  else if (i === 3) k = 'Approved, schedule it';
  else if (i === 4) k = 'Scheduled';
  else k = `Next · ${stepShort(p, i)}`;
  const waiting = k.startsWith('Waiting') || k.startsWith('Nudged') || k === 'Scheduled';
  const gold = !waiting && (!p.owner || p.owner.id === me);
  return { id: p.id, title: p.title, kicker: `${k} · ${postRel(today, p.date)}`, go: i === 3 ? 'Schedule' : 'Open', gold };
}

// ---------- Month groups ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type IgGroup = {
  key: string;
  label: string;
  /** Undated posts ("No date yet"). */
  undated: boolean;
  /** This month: drawn against the target ("2 of 3 posted" and squares). */
  current: boolean;
  posts: IgPost[];
  posted: number;
  /** How many squares to draw: the target or the post count, whichever is more. */
  boxes: number;
};

/** The list's groups: one per month in date order ("December 2027" names the year when it is not this year), then "No date yet". */
export function groupPosts(posts: IgPost[], today: string, target: number | null): IgGroup[] {
  const byMonth = new Map<string, IgPost[]>();
  const undated: IgPost[] = [];
  for (const p of [...posts].sort(byDate)) {
    if (!p.date) undated.push(p);
    else {
      const k = p.date.slice(0, 7);
      byMonth.set(k, [...(byMonth.get(k) ?? []), p]);
    }
  }
  const thisMonth = today.slice(0, 7);
  const out: IgGroup[] = [...byMonth.keys()].sort().map((k) => {
    const list = byMonth.get(k) ?? [];
    const name = MONTHS[Number(k.slice(5, 7)) - 1];
    const posted = list.filter(isPosted).length;
    return { key: k, label: k.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${k.slice(0, 4)}`, undated: false, current: k === thisMonth, posts: list, posted, boxes: Math.max(target ?? 0, list.length) };
  });
  if (undated.length) out.push({ key: 'none', label: 'No date yet', undated: true, current: false, posts: undated, posted: 0, boxes: 0 });
  return out;
}

/** The month a new post lands in, for "Added to November". */
export const monthOf = (day: string | null): string => (day ? MONTHS[Number(day.slice(5, 7)) - 1] : 'No date yet');

// ---------- Live mapping ----------

/** Board members by user id, from staff_profiles rows. */
export function igStaff(rows: Row[]): IgPerson[] {
  return rows
    .map((r) => ({ id: s(r.user_id), name: s(r.display_name), initials: s(r.initials) }))
    .filter((p) => p.id && p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One `posts` row as the page draws it. Steps come from its status and what it holds (lib/outreach-map.ts postDone). */
export function mapIgPost(r: Row, staff: Map<string, IgPerson>): IgPost {
  const done = postDone(r);
  return {
    id: s(r.id),
    title: s(r.title),
    date: r.post_on ? s(r.post_on).slice(0, 10) : null,
    owner: r.owner_id ? (staff.get(s(r.owner_id)) ?? null) : null,
    steps: [0, 1, 2, 3, 4].map((i) => i < done),
    caption: r.caption ? s(r.caption) : null,
    photo: r.image_path ? 'Photo added' : 'No photo yet',
    sent: s(r.status) === 'awaiting_approval',
    sentAt: null,
    approver: null,
    captionBy: null,
    slug: null,
    note: r.status_note ? s(r.status_note) : null,
  };
}

/** Maps rows (deduplicated by id: the three reads never overlap, but a row is never drawn twice). */
export function mapIgPosts(rows: Row[], staff: IgPerson[]): IgPost[] {
  const byId = new Map(staff.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: IgPost[] = [];
  for (const r of rows) {
    const id = s(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(mapIgPost(r, byId));
  }
  return out.sort(byDate);
}

/** "4 posts a month" -> 4. */
export const igTarget = (target: unknown): number | null => targetCount(target == null ? null : s(target));

/**
 * Live mode's controls: adding a post (when the Instagram channel exists) and sending a post for board approval are real
 * writes; nothing else on the page has a backing write yet, so it is not drawn.
 */
export function liveCaps(hasChannel: boolean): IgCaps {
  return { add: hasChannel, send: true, tick: false, caption: false, owner: false, nudge: false, undo: false, next: false };
}

// ---------- Paged reads ----------

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 50;

/**
 * Every row of a read, a page at a time: the next page starts after the rows already read, an empty page ends it, and a
 * read longer than the ceiling throws (the page shows its load error, never a partial list).
 */
export async function readPaged<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = PAGE_SIZE, max = MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`instagram: more than ${max} pages; refusing a partial list.`);
}

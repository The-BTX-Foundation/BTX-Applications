// Pure rules of the Outreach Plan page (unit tested in tests/oplan-map.test.ts; no database here): which item needs the
// person (a caption we wait on, then an item with no owner), the news card's "Next up", a row's progress, the Instagram
// squares, the nudge message, and the mapping from the real tables' rows to the view (lib/oplan-view.ts).
import { postDone } from './outreach-map';
import { daysFrom, shortDate } from './refresh-time';
import { monthKey, monthLong, nextMonthKey, pnRel } from './oplan-time';
import type { PnCaps, PnChan, PnItem, PnPerson } from './oplan-view';

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));

/** True when the item is dated in the month `key` ("2026-11"). */
export const inMonth = (it: PnItem, key: string): boolean => !!it.date && monthKey(it.date) === key;

/** Date order, undated last (a stable sort keeps the list order for ties). */
export const byDate = (a: PnItem, b: PnItem): number => (a.date ?? '9999').localeCompare(b.date ?? '9999');

/** True when the item is dated today or later. */
const ahead = (today: string, it: PnItem) => !!it.date && daysFrom(today, it.date) >= 0;

/** The post whose caption we are waiting on (today or later, not posted), or null. */
export function waitingItem(items: PnItem[], today: string): PnItem | null {
  return items.find((it) => !!it.waitOn && !it.posted && ahead(today, it)) ?? null;
}

/** The soonest dated item (today or later, not posted) that nobody owns, or null. */
export function ownerlessItem(items: PnItem[], today: string): PnItem | null {
  return items.filter((it) => !it.owner && !it.posted && ahead(today, it)).sort(byDate)[0] ?? null;
}

/**
 * The news card's item: the next dated item not posted. None when nothing is planned, while the Needs card shows a caption
 * to nudge (`waitingShown`), or while it shows an item with no owner (`ownerlessShown`): that card is the action then.
 */
export function nextUpItem(items: PnItem[], today: string, waitingShown: boolean, ownerlessShown: boolean): PnItem | null {
  if (items.length === 0 || waitingShown || ownerlessShown) return null;
  return items.filter((it) => !it.posted && ahead(today, it)).sort(byDate)[0] ?? null;
}

/** How far a row is, as the right-hand column draws it. */
export type PnStatus = { kind: 'posted'; word: 'Posted' | 'Sent' } | { kind: 'sections'; done: number; of: number } | { kind: 'steps'; n: number } | { kind: 'none' };

/** A row's progress: posted (or sent), an issue's sections, a post's steps, or "Not started". */
export function statusOf(it: PnItem): PnStatus {
  if (it.posted) return { kind: 'posted', word: it.postedWord };
  if (it.ch === 'Newsletter' && it.sections && it.sections.of > 0) return { kind: 'sections', ...it.sections };
  if (!it.steps) return { kind: 'none' };
  return { kind: 'steps', n: it.steps };
}

/** The most squares drawn (one a day). */
export const MAX_BOXES = 31;

/**
 * The Instagram target as posts a month: a number followed by "post" or "posts" ("4 posts a month", "4 posts"), or a bare
 * number. Anything else ("500 followers") is not a post count: null, and the target text is not drawn as boxes.
 */
export function postTarget(target: string | null): number | null {
  const m = /^\s*(\d+)\s*(?:posts?\b.*)?$/i.exec(target ?? '');
  return m ? Number(m[1]) : null;
}

/** An add reported as failed: its id and the words given back to the box. */
export type PnFailedAdd = { id: string; words: string };

/**
 * After fresh server data: adds reported as failed that the server now lists did save after all (a timed-out answer).
 * Returns the adds still unaccounted for, whether the save error should go, and the box with those words cleared (a box
 * holding other words is left alone), so Enter cannot make a second post.
 */
export function settleFailedAdds(failed: PnFailedAdd[], listed: Set<string>, box: string): { left: PnFailedAdd[]; clearErr: boolean; box: string } {
  const saved = failed.filter((f) => listed.has(f.id));
  let out = box;
  for (const f of saved) if (out.trim() === f.words) out = '';
  return { left: failed.filter((f) => !listed.has(f.id)), clearErr: saved.length > 0, box: out };
}

/** The Instagram channel's squares for the month `key`: one per box, posted ones gold, the ones past the target dashed. */
export function squares(items: PnItem[], key: string, target: number | null): { posted: number; count: number; boxes: { on: boolean; over: boolean }[] } {
  const ig = items.filter((it) => it.ch === 'Instagram' && inMonth(it, key));
  const posted = ig.filter((it) => it.posted).length;
  // At most one box a day: a large count never draws hundreds of boxes.
  const n = Math.min(MAX_BOXES, Math.max(target ?? 0, ig.length));
  const boxes = Array.from({ length: n }, (_, i) => ({ on: i < posted, over: target != null && i >= target }));
  return { posted, count: ig.length, boxes };
}

/** A person's first name. */
export const firstName = (name: string): string => name.split(' ')[0] ?? name;

/** The person with this id, or null. */
export const personOf = (people: PnPerson[], id: string | null): PnPerson | null => (id ? (people.find((p) => p.id === id) ?? null) : null);

/** The nudge message: "Hi Keith, the interview-week post goes out tomorrow. Could you send the caption?" */
export function nudgeText(it: PnItem, people: PnPerson[], today: string): string {
  const who = personOf(people, it.waitOn);
  return `Hi ${firstName(who?.name ?? '')}, the ${it.slug ?? it.title} post goes out ${pnRel(today, it.date).toLowerCase()}. Could you send the caption?`;
}

/** Where an added item lands, said to screen readers: "Added to November", "Added to December, no date yet". */
export function addedWhere(today: string, due: string | null): string {
  const now = monthKey(today);
  if (!due) return `Added to ${monthLong(nextMonthKey(now))}, no date yet`;
  return `Added to ${monthLong(monthKey(due) === now ? now : nextMonthKey(now))}`;
}

/** Live mode's controls: only adding a post has a real write (the date and owner are read from the line for it). */
export const liveCaps = (): PnCaps => ({ addPost: true, parse: true, addIssue: false, nudge: false, pickOwner: false, undo: false, nKey: false });

/** staff_profiles rows -> the people (initials from the name when the row has none). */
export function livePeople(rows: Row[]): PnPerson[] {
  return rows.map((r) => {
    const name = s(r.display_name) || 'Board member';
    const initials = s(r.initials) || name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
    return { id: s(r.user_id), name, initials };
  });
}

/** posts rows, newsletter_issues rows and their newsletter_sections rows -> the plan items. */
export function liveItems(posts: Row[], issues: Row[], sections: Row[]): PnItem[] {
  const out: PnItem[] = posts.map((p) => ({
    id: s(p.id),
    ch: 'Instagram',
    title: s(p.title),
    date: p.post_on ? s(p.post_on).slice(0, 10) : null,
    owner: p.owner_id ? s(p.owner_id) : null,
    posted: s(p.status) === 'posted',
    postedWord: 'Posted',
    steps: postDone(p),
    sections: null,
    waitOn: null,
    slug: null,
    note: p.status_note ? s(p.status_note) : null,
  }));
  // Sections done and in all, per issue.
  const per = new Map<string, { done: number; of: number }>();
  for (const sec of sections) {
    const k = s(sec.issue_id);
    const c = per.get(k) ?? { done: 0, of: 0 };
    c.of += 1;
    if (s(sec.status) === 'done') c.done += 1;
    per.set(k, c);
  }
  for (const i of issues) {
    out.push({
      id: s(i.id),
      ch: 'Newsletter',
      title: s(i.title),
      date: i.send_on ? s(i.send_on).slice(0, 10) : null,
      owner: i.owner_id ? s(i.owner_id) : null,
      posted: s(i.status) === 'sent',
      postedWord: 'Sent',
      steps: 0,
      sections: per.get(s(i.id)) ?? null,
      waitOn: null,
      slug: null,
      note: null,
    });
  }
  return out;
}

const STATUS_WORD: Record<string, string> = { not_started: 'Not started', active: 'Active', paused: 'Paused' };

/**
 * outreach_channels rows (in position order) -> the channel rows. Instagram counts against its target's number; the
 * Newsletter's line is the next unsent issue; any other channel shows its target and status.
 */
export function liveChannels(rows: Row[], items: PnItem[], today: string): PnChan[] {
  return rows.map((c) => {
    const kind = s(c.kind);
    const target = c.target ? s(c.target) : '';
    const note = c.status_note ? s(c.status_note) : '';
    const owner = c.owner_id ? s(c.owner_id) : null;
    if (kind === 'instagram') return { id: s(c.id), kind: 'instagram', name: s(c.name), target: postTarget(target), k: '', line: '', owner };
    if (kind === 'newsletter') {
      const next = items.filter((it) => it.ch === 'Newsletter' && !it.posted && !!it.date && daysFrom(today, it.date) >= 0).sort(byDate)[0];
      return { id: s(c.id), kind: 'newsletter', name: s(c.name), target: null, k: target || 'Target not set', line: note || (next?.date ? `Next issue ${shortDate(next.date)}` : `No issue planned through ${monthLong(nextMonthKey(monthKey(today)))}`), owner };
    }
    return { id: s(c.id), kind: 'other', name: s(c.name), target: null, k: target || 'Target not set', line: note || STATUS_WORD[s(c.status)] || s(c.status), owner };
  });
}

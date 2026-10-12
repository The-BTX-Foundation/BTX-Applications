// Pure mapping from Outreach rows to what the pages draw (unit tested; no database here).
import type { ChannelCard, PlanRow, Post, Section } from '@/mock/outreach';
import type { Owner } from '@/mock/area';
import { dateOnlyLabel } from './format';
import { monthName, personOrNull, s, type Row, type StaffMap } from './area-map';

const owner = (id: unknown, staff: StaffMap): Owner => personOrNull(id, staff) ?? 'unassigned';

export const CHANNEL_STATUS: Record<string, string> = { not_started: 'Not started', active: 'Active', paused: 'Paused' };

/** A post's status as words: label and how the Plan page draws it. */
export function postState(status: string): { label: string; kind: 'text' | 'muted' | 'pill' } {
  switch (status) {
    case 'drafting':
      return { label: 'Drafting', kind: 'pill' };
    case 'awaiting_approval':
      return { label: 'Waiting on the board', kind: 'text' };
    case 'approved':
      return { label: 'Approved', kind: 'text' };
    case 'scheduled':
      return { label: 'Scheduled', kind: 'text' };
    case 'posted':
      return { label: 'Posted', kind: 'text' };
    default:
      return { label: 'Not started', kind: 'muted' };
  }
}

/** How many of a post's five steps are done (caption, photo, board approval, schedule, posted), from its status and what it holds. */
export function postDone(p: Row): number {
  const base = ({ not_started: 0, drafting: 0, awaiting_approval: 2, approved: 3, scheduled: 4, posted: 5 } as Record<string, number>)[s(p.status)] ?? 0;
  const held = p.caption && p.image_path ? 2 : p.caption ? 1 : 0;
  return s(p.status) === 'not_started' || s(p.status) === 'drafting' ? held : Math.max(base, held);
}

/** The Instagram page's posts, split into upcoming (not posted yet) and posted. */
export function mapPosts(rows: Row[], staff: StaffMap): Post[] {
  return rows.map((r) => {
    const done = postDone(r);
    const status = s(r.status);
    const posted = status === 'posted';
    const waiting = status === 'awaiting_approval';
    const state = posted ? 'Posted' : waiting ? 'Waiting on the board' : done >= 2 ? 'Ready to send to the board' : status === 'drafting' ? 'Drafting' : done === 1 ? 'Caption drafted' : 'Not started';
    return {
      id: s(r.id),
      title: s(r.title),
      date: r.post_on ? dateOnlyLabel(s(r.post_on)) : 'Date not set',
      owner: owner(r.owner_id, staff),
      done,
      state,
      phoneState: posted ? 'Posted' : waiting || done >= 2 ? 'Waiting on the board' : state === 'Not started' ? 'Not started' : state,
      group: posted ? ('posted' as const) : ('upcoming' as const),
      approver: '',
      caption: r.caption ? s(r.caption) : null,
      photo: r.image_path ? '[Photo added]' : '[Photo]',
      sent: waiting,
    };
  });
}

/** "4 posts a month" -> 4 (the number a ring counts to), or null when the target has no number. */
export function targetCount(target: string | null): number | null {
  const m = /^\s*(\d+)/.exec(target ?? '');
  return m ? Number(m[1]) : null;
}

/** The channel cards. `today` is "2026-10-12"; the Instagram ring counts this month's posts. */
export function mapChannels(channels: Row[], posts: Row[], issues: Row[], staff: StaffMap, today: string): ChannelCard[] {
  const month = today.slice(0, 7);
  return channels.map((c) => {
    const kind = s(c.kind) as ChannelCard['kind'];
    const target = c.target ? s(c.target) : null;
    const note = c.status_note ? s(c.status_note) : '';
    const statusWord = CHANNEL_STATUS[s(c.status)] ?? s(c.status);
    const own = personOrNull(c.owner_id, staff);
    if (kind === 'instagram') {
      const mine = posts.filter((p) => p.channel_id === c.id && s(p.post_on).startsWith(month));
      const posted = mine.filter((p) => p.status === 'posted').length;
      const total = targetCount(target) ?? mine.length;
      return {
        id: s(c.id),
        kind,
        name: s(c.name),
        target,
        status: note || statusWord,
        ring: { done: posted, total, line: `${monthName(today)}: ${mine.length} planned, ${posted} posted` },
        owner: own,
        phoneBig: `${posted}/${total}`,
        phoneLines: [target ? `${target} · ${mine.length} planned in ${monthName(today)}` : 'Target [not set]'],
      };
    }
    const upcoming = kind === 'newsletter' ? issues.filter((i) => i.status !== 'sent' && i.send_on).sort((a, b) => s(a.send_on).localeCompare(s(b.send_on)))[0] : undefined;
    const status = note || (upcoming ? `Sends ${dateOnlyLabel(s(upcoming.send_on))}` : statusWord);
    return {
      id: s(c.id),
      kind,
      name: s(c.name),
      target,
      status,
      owner: own,
      phoneBig: target ?? statusWord,
      phoneLines: [target ? status : 'Target [not set]'],
    };
  });
}

/** The month's dated items: posts and newsletter issues, in date order. */
export function mapPlanRows(posts: Row[], issues: Row[], staff: StaffMap, today: string): PlanRow[] {
  const month = today.slice(0, 7);
  const items: (PlanRow & { sort: string })[] = [];
  for (const p of posts) {
    if (!s(p.post_on).startsWith(month)) continue;
    const own = owner(p.owner_id, staff);
    const date = dateOnlyLabel(s(p.post_on));
    items.push({
      sort: s(p.post_on),
      id: s(p.id),
      date,
      channel: 'instagram',
      what: s(p.title),
      next: p.status_note ? s(p.status_note) : postNext(s(p.status), own),
      owner: own,
      state: postState(s(p.status)),
      phoneMeta: `${date} · Instagram`,
      phoneOwner: own === 'unassigned' ? 'Unassigned · pick an owner' : own ? own.name : '',
    });
  }
  for (const i of issues) {
    if (!s(i.send_on).startsWith(month)) continue;
    const own = owner(i.owner_id, staff);
    const date = dateOnlyLabel(s(i.send_on));
    const status = s(i.status);
    items.push({
      sort: s(i.send_on),
      id: `issue-${s(i.id)}`,
      date,
      channel: 'newsletter',
      what: s(i.title),
      next: status === 'sent' ? 'Sent' : status === 'scheduled' ? 'Scheduled to send' : 'Next: finish the sections',
      owner: own,
      state: { label: status === 'sent' ? 'Sent' : status === 'scheduled' ? 'Scheduled' : 'Drafting', kind: status === 'drafting' ? 'pill' : 'text' },
      phoneMeta: `${date} · Newsletter`,
      phoneOwner: own === 'unassigned' ? 'Unassigned' : own ? own.name : '',
    });
  }
  return items.sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort, ...row }) => (void sort, row));
}

function postNext(status: string, own: Owner): string {
  if (own === 'unassigned' && status === 'not_started') return 'Next: pick an owner';
  return (
    ({ not_started: 'Next: draft the caption', drafting: 'Next: finish the caption', awaiting_approval: 'Next: the board approves the caption', approved: 'Next: schedule it', scheduled: 'Next: mark it posted', posted: 'Posted' } as Record<string, string>)[status] ?? ''
  );
}

/** The newsletter issue's sections: the first section not done and not waiting is "next". */
export function mapSections(rows: Row[], staff: StaffMap, today: string): Section[] {
  const waiting = (r: Row) => !!r.waits_until && s(r.waits_until) > today;
  const nextIdx = rows.findIndex((r) => r.status !== 'done' && !waiting(r));
  return rows.map((r, i) => {
    const done = r.status === 'done';
    const own = owner(r.owner_id, staff);
    const isNext = i === nextIdx;
    const wait = waiting(r) ? `Waits for ${dateOnlyLabel(s(r.waits_until))}` : undefined;
    const name = own === 'unassigned' ? 'Unassigned' : own ? own.name : '';
    return {
      id: s(r.id),
      title: s(r.title),
      blurb: s(r.blurb),
      state: done ? ('done' as const) : isNext ? ('next' as const) : ('todo' as const),
      sub: done ? 'Done' : isNext ? 'Next section to write' : r.waits_note ? s(r.waits_note) : r.status === 'writing' ? 'Writing' : 'Not started',
      owner: own,
      tag: isNext && !done && own !== 'unassigned' && own ? `Next · ${own.name}` : wait,
      phoneSub: wait ? `${name} · waits for ${dateOnlyLabel(s(r.waits_until))}` : name,
      phoneLabel: done ? 'Done' : isNext ? `Next${own !== 'unassigned' && own ? ` · ${own.name.split(' ')[0]}` : ''}` : wait ? 'Waiting' : 'Not started',
      phoneText: isNext && !done ? true : undefined,
    };
  });
}

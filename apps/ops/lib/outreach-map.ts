// The Outreach pages' pure mapping (no database, no Next.js imports; unit tested in tests/outreach-map.test.ts): the
// channels (`outreach_channels`), posts (`posts`), newsletter issues and sections, turned into the shapes the page
// components draw (PlanData, InstagramData, NewsletterData). Post images, subscriber numbers and the email tool are not
// stored, so those keep the design's [placeholders] unless the channel has an audience_count.
import { dateOnlyLabel } from './format';
import type { Person } from '@/mock/area';
import type { ChannelCard, ChannelKind, InstagramData, NewsletterData, PlanData, PlanRow, Post, Section } from '@/mock/outreach';

export type ChannelIn = { id: string; name: string; kind: string; target: string | null; status: string; statusNote: string | null; owner: Person | null; audienceCount: number | null };
export type PostIn = { id: string; channelId: string; title: string; postOn: string | null; owner: Person | null; caption: string | null; status: string; statusNote: string | null };
export type IssueIn = { id: string; title: string; sendOn: string | null; intro: string | null; owner: Person | null; status: string; sentAt: string | null };
export type SectionIn = { id: string; issueId: string; position: number; title: string; blurb: string | null; owner: Person | null; status: string; waitsUntil: string | null; waitsNote: string | null };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10-12" -> "October". */
export const monthOf = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
/** "2026-10-12" -> "November" (the month after). */
export const nextMonthOf = (iso: string) => MONTHS[Number(iso.slice(5, 7)) % 12];
const sameMonth = (iso: string | null, today: string) => !!iso && iso.slice(0, 7) === today.slice(0, 7);
const day = (iso: string | null) => (iso ? dateOnlyLabel(iso) : 'Date not set');
const byDate = <T,>(get: (x: T) => string | null) => (a: T, b: T) => (get(a) ?? '9999').localeCompare(get(b) ?? '9999');
const APPROVER = 'the board';

/** How many of a post's five steps (caption, photo, approval, schedule, posted) are done, from its status. Photos are
 * not stored, so a drafted caption counts as ready for approval. */
export function postProgress(status: string, caption: string | null): number {
  switch (status) {
    case 'drafting':
      return caption && caption.trim() ? 2 : 0;
    case 'awaiting_approval':
      return 2;
    case 'approved':
      return 3;
    case 'scheduled':
      return 4;
    case 'posted':
      return 5;
    default:
      return 0;
  }
}

/** A post's state words (laptop) by status. */
export function postState(status: string, done: number): string {
  if (status === 'drafting') return done >= 2 ? 'Ready to send for approval' : 'Drafting';
  return ({ awaiting_approval: 'Waiting on the board', approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted' } as Record<string, string>)[status] ?? 'Not started';
}

/** One `posts` row as the Instagram page's post. */
export function postView(p: PostIn): Post {
  const done = postProgress(p.status, p.caption);
  const state = postState(p.status, done);
  return {
    id: p.id,
    title: p.title,
    date: day(p.postOn),
    owner: p.owner ?? 'unassigned',
    done,
    state,
    phoneState: state,
    group: p.status === 'posted' ? 'posted' : 'upcoming',
    approver: APPROVER,
    caption: p.caption,
    photo: '[Photo]',
    sent: p.status === 'awaiting_approval',
  };
}

// The "Next: ..." line of a post on the plan.
function postNext(p: PostIn): string {
  if (p.statusNote) return p.statusNote;
  const done = postProgress(p.status, p.caption);
  switch (p.status) {
    case 'not_started':
      return p.owner ? 'Next: draft the caption' : 'Next: pick an owner';
    case 'drafting':
      return done >= 2 ? 'Next: send it for approval' : 'Next: draft the caption';
    case 'awaiting_approval':
      return 'Next: the board approves the caption';
    case 'approved':
      return 'Next: schedule it';
    case 'scheduled':
      return 'Next: mark it posted';
    default:
      return 'Posted';
  }
}

const PLAN_STATE: Record<string, PlanRow['state']> = {
  not_started: { label: 'Not started', kind: 'muted' },
  drafting: { label: 'Drafting', kind: 'pill' },
  awaiting_approval: { label: 'Waiting on the board', kind: 'text' },
  approved: { label: 'Approved', kind: 'text' },
  scheduled: { label: 'Scheduled', kind: 'text' },
  posted: { label: 'Posted', kind: 'text' },
  sent: { label: 'Sent', kind: 'text' },
};

/** The next section to write of an issue: the first one not done that isn't waiting for a later date. */
export function nextSection(sections: SectionIn[], today: string): SectionIn | undefined {
  const open = [...sections].sort((a, b) => a.position - b.position).filter((s) => s.status !== 'done');
  return open.find((s) => !(s.waitsUntil && s.waitsUntil > today)) ?? open[0];
}

/** The issue that is being worked on: the first one not sent, by send date. */
export const currentIssue = (issues: IssueIn[]) => [...issues].filter((i) => i.status !== 'sent').sort(byDate((i) => i.sendOn))[0];

const issueName = (i: IssueIn) => (i.sendOn ? `${monthOf(i.sendOn)} issue` : i.title);

/** Outreach > Plan: one card per channel, then this month's posts and newsletter issues in date order. */
export function buildPlan(channels: ChannelIn[], posts: PostIn[], issues: IssueIn[], sections: SectionIn[], today: string, staff: Person[]): PlanData {
  const month = monthOf(today);
  const issue = currentIssue(issues);
  const cards: ChannelCard[] = channels.map((c) => {
    const kind = (['instagram', 'newsletter', 'linkedin', 'campus_events'].includes(c.kind) ? c.kind : 'other') as ChannelKind;
    const base = { id: c.id, kind, name: c.name, target: c.target, owner: c.owner };
    if (kind === 'instagram') {
      const mine = posts.filter((p) => p.channelId === c.id && sameMonth(p.postOn, today));
      const posted = mine.filter((p) => p.status === 'posted').length;
      const planned = mine.length - posted;
      const total = Number.parseInt(c.target ?? '', 10) || mine.length;
      return {
        ...base,
        status: '',
        ring: { done: posted, total, line: `${month}: ${planned} planned, ${posted} posted` },
        phoneBig: `${posted}/${total}`,
        phoneLines: [`${c.target ?? 'Target [not set]'} · ${planned} planned in ${month}`],
      };
    }
    let status = 'Not started';
    if (c.status === 'paused') status = c.statusNote ?? 'Paused';
    else if (c.status === 'active') status = c.statusNote ?? (kind === 'newsletter' && issue?.sendOn ? `Back on ${day(issue.sendOn)}` : 'Active');
    return {
      ...base,
      status,
      phoneBig: c.status === 'not_started' ? 'Not started' : c.target ?? 'Active',
      phoneLines: [c.status === 'not_started' ? c.target ?? 'Target [not set]' : status],
    };
  });

  const postRows: (PlanRow & { iso: string | null })[] = posts
    .filter((p) => sameMonth(p.postOn, today))
    .map((p) => ({
      id: p.id,
      iso: p.postOn,
      date: day(p.postOn),
      channel: 'instagram',
      what: p.title,
      next: postNext(p),
      owner: p.owner ?? 'unassigned',
      state: PLAN_STATE[p.status] ?? PLAN_STATE.not_started,
      phoneMeta: `${day(p.postOn)} · Instagram`,
      phoneOwner: p.owner ? p.owner.name : 'Unassigned · pick an owner',
    }));
  const issueRows: (PlanRow & { iso: string | null })[] = issues
    .filter((i) => sameMonth(i.sendOn, today))
    .map((i) => {
      const next = nextSection(sections.filter((s) => s.issueId === i.id), today);
      return {
        id: i.id,
        iso: i.sendOn,
        date: day(i.sendOn),
        channel: 'newsletter',
        what: issueName(i),
        next: i.status === 'sent' ? 'Sent' : next ? `Next: write ${next.title}` : 'All sections done',
        owner: i.owner ?? 'unassigned',
        state: PLAN_STATE[i.status] ?? PLAN_STATE.drafting,
        phoneMeta: `${day(i.sendOn)} · Newsletter`,
        phoneOwner: i.owner ? i.owner.name : 'Unassigned · pick an owner',
      };
    });
  const rows = [...postRows, ...issueRows].sort(byDate((r) => r.iso)).map(({ iso, ...r }) => (void iso, r));
  return { cards, month, nextMonth: nextMonthOf(today), rows, staff };
}

/** Outreach > Instagram: the channel's posts not yet posted (in date order), then the posted ones (latest first). */
export function buildInstagram(channel: ChannelIn | undefined, posts: PostIn[], today: string, staff: Person[]): InstagramData {
  const month = monthOf(today);
  const mine = posts.filter((p) => !channel || p.channelId === channel.id);
  const upcoming = mine.filter((p) => p.status !== 'posted').sort(byDate((p) => p.postOn));
  const posted = mine.filter((p) => p.status === 'posted').sort((a, b) => (b.postOn ?? '').localeCompare(a.postOn ?? ''));
  const thisMonth = mine.filter((p) => sameMonth(p.postOn, today));
  const postedThisMonth = thisMonth.filter((p) => p.status === 'posted').length;
  // The upcoming group is "October" while every upcoming post falls in this month or earlier, else "Coming up".
  const allThisMonth = upcoming.every((p) => !p.postOn || p.postOn.slice(0, 7) <= today.slice(0, 7));
  const first = upcoming[0] ? postView(upcoming[0]) : undefined;
  return {
    channelId: channel?.id,
    subtitle: first ? `Next post ${first.date} · ${first.state.toLowerCase()}` : 'No posts planned yet',
    phoneSub: `Outreach · ${month} · ${thisMonth.length - postedThisMonth} planned, ${postedThisMonth} posted`,
    monthLabel: allThisMonth ? month : 'Coming up',
    monthCount: upcoming.length,
    target: channel?.target ? channel.target.replace(/ posts?\b/, '') : 'not set',
    posts: [...upcoming, ...posted.slice(0, 6)].map(postView),
    pastLabel: 'Posted',
    pastCount: posted.length,
    staff,
  };
}

/** One section of the issue as the page's checklist row. */
export function sectionView(s: SectionIn, isNext: boolean, today: string): Section {
  const done = s.status === 'done';
  const waiting = !done && !!s.waitsUntil && s.waitsUntil > today;
  const who = s.owner?.name ?? 'Unassigned';
  const state: Section['state'] = done ? 'done' : isNext ? 'next' : 'todo';
  return {
    id: s.id,
    title: s.title,
    blurb: s.blurb ?? '',
    state,
    sub: done ? 'Done' : waiting ? s.waitsNote ?? `Waits for ${day(s.waitsUntil)}` : isNext ? 'Next section to write' : s.status === 'writing' ? 'Writing' : 'Not started',
    owner: s.owner ?? 'unassigned',
    tag: waiting ? `Waits for ${day(s.waitsUntil)}` : isNext ? `Next · ${who}` : undefined,
    phoneSub: waiting ? `${who} · waits for ${day(s.waitsUntil)}` : who,
    phoneLabel: done ? 'Done' : waiting ? 'Waiting' : isNext ? `Next · ${who.split(' ')[0]}` : s.status === 'writing' ? 'Writing' : 'Not started',
    phoneText: isNext && !done ? true : undefined,
  };
}

/** Outreach > Newsletter: the issue being worked on and its sections; the last sent issue for the facts strip. */
export function buildNewsletter(channel: ChannelIn | undefined, issues: IssueIn[], sections: SectionIn[], today: string, staff: Person[]): NewsletterData {
  const issue = currentIssue(issues);
  const last = [...issues].filter((i) => i.status === 'sent').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0];
  const lastIso = last ? (last.sentAt ?? last.sendOn ?? '').slice(0, 10) : '';
  const facts = {
    subscribers: channel?.audienceCount != null ? channel.audienceCount.toLocaleString('en-US') : '[number]',
    lastIssue: lastIso ? `${monthOf(lastIso)} ${lastIso.slice(0, 4)}` : '[month year]',
    tool: '[email tool]',
  };
  const often = (channel?.target ?? 'newsletter').toLowerCase();
  if (!issue) {
    return {
      channelId: channel?.id,
      subtitle: 'No issue planned yet',
      phoneSub: `Outreach · ${often}`,
      issueTitle: 'No issue planned yet',
      previewTitle: '',
      intro: '',
      sendOn: 'Not set',
      owner: null,
      sections: [],
      ...facts,
      staff,
    };
  }
  const mine = sections.filter((s) => s.issueId === issue.id).sort((a, b) => a.position - b.position);
  const next = nextSection(mine, today);
  const sendOn = issue.sendOn ? dateOnlyLabel(issue.sendOn) : 'Not set';
  return {
    channelId: channel?.id,
    issueId: issue.id,
    subtitle: next ? `Next: ${next.title} · sends ${sendOn}` : `All sections done · sends ${sendOn}`,
    phoneSub: `Outreach · ${often} · back ${sendOn}`,
    issueTitle: issueName(issue),
    previewTitle: issue.title,
    intro: issue.intro ?? '',
    sendOn,
    owner: issue.owner,
    sections: mine.map((s) => sectionView(s, s.id === next?.id, today)),
    ...facts,
    staff,
  };
}

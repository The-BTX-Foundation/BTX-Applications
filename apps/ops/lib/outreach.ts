// The Outreach pages' loaders. Mock mode (no Supabase env) returns the Figma frames' sample data (mock/outreach.ts,
// normal and stress). Live mode reads outreach_channels, posts, newsletter_issues and newsletter_sections as the
// signed-in person. Post photos are not stored yet (no bucket), so the photo box stays a placeholder; the newsletter's
// email tool is not stored either and reads "Not set". Past issues stay out (O14). The pages and components only see
// PlanData, InstagramData and NewsletterData.
import { hasSupabaseEnv } from '@btx/data';
import { read } from './money-db';
import { loadStaff } from './area-db';
import { dateOnlyLabel, shortDate } from './format';
import { easternDay, monthName, personOrNull, s } from './area-map';
import { mapChannels, mapPlanRows, mapPosts, mapSections } from './outreach-map';
import {
  MOCK_INSTAGRAM,
  MOCK_INSTAGRAM_STRESS,
  MOCK_NEWSLETTER,
  MOCK_NEWSLETTER_STRESS,
  MOCK_PLAN,
  MOCK_PLAN_STRESS,
  type InstagramData,
  type NewsletterData,
  type PlanData,
} from '@/mock/outreach';

export type Loaded<T> = (T & { failed: false }) | { failed: true };

const today = () => easternDay(new Date());
const POST_COLS = 'id, channel_id, title, post_on, owner_id, caption, image_path, status, status_note, posted_at';

/** Outreach > Plan: the channels (outreach_channels) and the month's dated items (posts + newsletter_issues). */
export async function loadPlan(opts: { demo?: string } = {}): Promise<Loaded<PlanData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_PLAN_STRESS : MOCK_PLAN), failed: false };
  try {
    const [channels, posts, issues, staff] = await Promise.all([
      read('outreach_channels', 'id, name, kind, target, status, status_note, owner_id', { order: ['position', true] }),
      read('posts', POST_COLS, { order: ['post_on', true] }),
      read('newsletter_issues', 'id, title, send_on, owner_id, status', { order: ['send_on', true] }),
      loadStaff(),
    ]);
    const day = today();
    const insta = channels.find((c) => c.kind === 'instagram');
    return {
      staff: [...staff.values()],
      instagramChannelId: insta ? s(insta.id) : undefined,
      cards: mapChannels(channels, posts, issues, staff, day),
      month: monthName(day),
      rows: mapPlanRows(posts, issues, staff, day),
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Instagram: the Instagram channel's posts. A post's steps follow its status (caption, photo, approval, schedule, posted). */
export async function loadInstagram(opts: { demo?: string } = {}): Promise<Loaded<InstagramData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_INSTAGRAM_STRESS : MOCK_INSTAGRAM), failed: false };
  try {
    const [channels, staff] = await Promise.all([read('outreach_channels', 'id, target', { eq: { kind: 'instagram' }, limit: 1 }), loadStaff()]);
    const channel = channels[0];
    const rows = channel ? await read('posts', POST_COLS, { eq: { channel_id: channel.id }, order: ['post_on', true] }) : [];
    const posts = mapPosts(rows, staff);
    const day = today();
    const month = monthName(day);
    const upcoming = posts.filter((p) => p.group === 'upcoming');
    const posted = posts.filter((p) => p.group === 'posted');
    const monthPosted = rows.filter((r) => r.status === 'posted' && s(r.post_on).startsWith(day.slice(0, 7))).length;
    const lastPosted = [...rows].filter((r) => r.status === 'posted' && r.post_on).sort((a, b) => s(b.post_on).localeCompare(s(a.post_on)))[0];
    const next = upcoming[0];
    return {
      channelId: channel ? s(channel.id) : undefined,
      subtitle: next ? `Next post ${next.date} · ${next.state.toLowerCase()}` : 'No posts planned yet',
      phoneSub: `Outreach · ${month} · ${upcoming.length} planned, ${monthPosted} posted`,
      monthLabel: month,
      monthCount: upcoming.length,
      target: channel?.target ? s(channel.target).replace(/\s+posts?\b/i, '') : 'not set',
      posts: [...upcoming, ...posted],
      pastLabel: lastPosted ? `${monthName(s(lastPosted.post_on))}, posted` : 'Posted',
      pastCount: posted.length,
      staff: [...staff.values()],
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Newsletter: the next unsent issue (newsletter_issues) and its sections (newsletter_sections). */
export async function loadNewsletter(opts: { demo?: string } = {}): Promise<Loaded<NewsletterData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_NEWSLETTER_STRESS : MOCK_NEWSLETTER), failed: false };
  try {
    const [issues, channels, staff] = await Promise.all([
      read('newsletter_issues', 'id, title, send_on, intro, owner_id, status, sent_at', { order: ['send_on', true] }),
      read('outreach_channels', 'id, owner_id, audience_count', { eq: { kind: 'newsletter' }, limit: 1 }),
      loadStaff(),
    ]);
    const channel = channels[0];
    const issue = issues.find((i) => i.status !== 'sent');
    const lastSent = [...issues].filter((i) => i.status === 'sent').sort((a, b) => s(b.sent_at).localeCompare(s(a.sent_at)))[0];
    const sectionRows = issue ? await read('newsletter_sections', 'id, position, title, blurb, owner_id, status, waits_until, waits_note', { eq: { issue_id: issue.id }, order: ['position', true] }) : [];
    const sections = mapSections(sectionRows, staff, today());
    const sendOn = issue?.send_on ? dateOnlyLabel(s(issue.send_on)) : 'Not set';
    const next = sections.find((x) => x.state === 'next');
    const own = personOrNull(issue?.owner_id ?? channel?.owner_id, staff);
    const title = issue ? s(issue.title) : 'No issue planned';
    return {
      channelId: channel ? s(channel.id) : undefined,
      issueId: issue ? s(issue.id) : undefined,
      subtitle: issue ? `${next ? `Next: ${next.short ?? next.title}` : 'All sections done'} · sends ${sendOn}` : 'No issue planned yet',
      phoneSub: issue ? `Outreach · monthly email · back ${issue.send_on ? shortDate(s(issue.send_on)) : 'date not set'}` : 'Outreach · monthly email',
      issueTitle: title,
      previewTitle: title,
      intro: issue?.intro ? s(issue.intro) : '',
      sendOn,
      owner: own ?? { name: '', initials: '' },
      sections,
      subscribers: channel?.audience_count != null ? String(channel.audience_count) : 'Not set',
      lastIssue: lastSent?.sent_at ? new Date(s(lastSent.sent_at)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' }) : 'None yet',
      tool: 'Not set',
      staff: [...staff.values()],
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}

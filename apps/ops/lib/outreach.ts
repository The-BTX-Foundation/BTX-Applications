// The Outreach pages' loaders. MOCK in mock mode (mock/outreach.ts, the Figma frames' data, normal and stress). Live mode
// reads the draft Ops Hub tables (NOT TESTED: the tables are not applied yet); the derived parts (post steps from
// checklists + tasks, row text, the chat) still return the mock shape until the tables exist. Post images, newsletter
// subscriber numbers and newsletter sending are not stored in the draft, so those stay mock. Going live is a swap inside
// each loader; the pages and components only see PlanData, InstagramData and NewsletterData.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import type { Person } from '@/mock/area';
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

// The draft tables are not in the generated database types yet, so the query builder is used untyped.
type Q = PromiseLike<{ data: unknown; error: unknown }> & { select: (c: string) => Q; eq: (c: string, v: unknown) => Q; order: (c: string) => Q };
type Untyped = { from: (t: string) => Q };
const live = async () => (await sessionClient()) as unknown as Untyped;
type Row = Record<string, unknown>;

// The people the owner pickers offer: staff_profiles (user_id, display_name, initials).
async function staffList(c: Untyped): Promise<Person[]> {
  const r = await c.from('staff_profiles').select('user_id, display_name, initials').order('display_name');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({ id: String(x.user_id), name: String(x.display_name), initials: String(x.initials) }));
}

// The channel row of a kind, if there is one.
async function channelOf(c: Untyped, kind: string): Promise<Row | undefined> {
  const r = await c.from('outreach_channels').select('id, name, kind, target, status, status_note, owner_id, audience_count').eq('kind', kind);
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[])[0];
}

/** Outreach > Plan: the channels (outreach_channels) and the month's dated items (posts + newsletter_issues). */
export async function loadPlan(opts: { demo?: string } = {}): Promise<Loaded<PlanData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_PLAN_STRESS : MOCK_PLAN), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const ch = await c.from('outreach_channels').select('id, name, kind, target, status, status_note, owner_id').order('position');
    if (ch.error) throw ch.error;
    const posts = await c.from('posts').select('id, channel_id, title, post_on, owner_id, status').order('post_on');
    if (posts.error) throw posts.error;
    const staff = await staffList(c);
    const insta = ((ch.data ?? []) as Row[]).find((x) => x.kind === 'instagram');
    // TODO: build the cards and rows from these rows (owner names from `staff`, "Next: ..." from each post's checklist).
    return { ...MOCK_PLAN, staff, instagramChannelId: insta ? String(insta.id) : undefined, failed: false };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Instagram: the Instagram channel's posts (posts) with each post's checklist. */
export async function loadInstagram(opts: { demo?: string } = {}): Promise<Loaded<InstagramData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_INSTAGRAM_STRESS : MOCK_INSTAGRAM), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const channel = await channelOf(c, 'instagram');
    const posts = await c.from('posts').select('id, title, post_on, owner_id, caption, image_path, status, posted_at').order('post_on');
    if (posts.error) throw posts.error;
    const staff = await staffList(c);
    // TODO: map posts to the Post shape (steps from checklists.post_id + tasks); images are not stored yet, so the
    // photo box stays a placeholder.
    return { ...MOCK_INSTAGRAM, staff, channelId: channel ? String(channel.id) : undefined, failed: false };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Newsletter: the next issue (newsletter_issues) and its sections (newsletter_sections). */
export async function loadNewsletter(opts: { demo?: string } = {}): Promise<Loaded<NewsletterData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_NEWSLETTER_STRESS : MOCK_NEWSLETTER), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const c = await live();
    const issues = await c.from('newsletter_issues').select('id, title, send_on, intro, owner_id, status').order('send_on');
    if (issues.error) throw issues.error;
    const secs = await c.from('newsletter_sections').select('id, issue_id, position, title, blurb, owner_id, status, waits_until, waits_note').order('position');
    if (secs.error) throw secs.error;
    const channel = await channelOf(c, 'newsletter');
    const staff = await staffList(c);
    const first = ((issues.data ?? []) as Row[]).find((x) => x.status !== 'sent');
    // Subscribers: outreach_channels.audience_count when it is filled in; sending and the email tool are not stored yet.
    const subs = channel && channel.audience_count != null ? String(channel.audience_count) : MOCK_NEWSLETTER.subscribers;
    // TODO: map the issue and sections to NewsletterData; until then the sections return the mock shape.
    return { ...MOCK_NEWSLETTER, staff, channelId: channel ? String(channel.id) : undefined, issueId: first ? String(first.id) : undefined, subscribers: subs, failed: false };
  } catch {
    return { failed: true };
  }
}

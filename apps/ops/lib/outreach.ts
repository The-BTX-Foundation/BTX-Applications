// The Outreach pages' loaders. MOCK in mock mode (mock/outreach.ts, the Figma frames' data, normal and stress). Live mode
// reads the Ops Hub tables as the signed-in person: `outreach_channels`, `posts`, `newsletter_issues` and
// `newsletter_sections`, with owner names from `staff_profiles`. The mapping to the page shapes is pure
// (lib/outreach-map.ts). Post images, newsletter subscriber numbers (unless the channel has an audience_count) and the
// email tool are not stored, so those keep the design's [placeholders]. Past issues stay out of the page (O14).
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import type { Person } from '@/mock/area';
import { buildInstagram, buildNewsletter, buildPlan, type ChannelIn, type IssueIn, type PostIn, type SectionIn } from './outreach-map';
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

// The Ops Hub tables are not in the generated database types yet, so the query builder is used untyped.
type Q = PromiseLike<{ data: unknown; error: unknown }> & { select: (c: string) => Q; eq: (c: string, v: unknown) => Q; order: (c: string) => Q };
type Untyped = { from: (t: string) => Q };
const live = async () => (await sessionClient()) as unknown as Untyped;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));

// Today in Eastern time ("2026-10-12").
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// The people the owner pickers offer: staff_profiles (user_id, display_name, initials).
async function staffList(c: Untyped): Promise<Person[]> {
  const r = await c.from('staff_profiles').select('user_id, display_name, initials').order('display_name');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({ id: String(x.user_id), name: String(x.display_name), initials: String(x.initials) }));
}

const who = (staff: Person[], id: unknown) => (id ? staff.find((s) => s.id === String(id)) ?? null : null);

async function channels(c: Untyped, staff: Person[]): Promise<ChannelIn[]> {
  const r = await c.from('outreach_channels').select('id, name, kind, target, status, status_note, owner_id, audience_count').order('position');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({
    id: String(x.id),
    name: String(x.name),
    kind: String(x.kind),
    target: str(x.target),
    status: String(x.status),
    statusNote: str(x.status_note),
    owner: who(staff, x.owner_id),
    audienceCount: x.audience_count == null ? null : Number(x.audience_count),
  }));
}

async function posts(c: Untyped, staff: Person[]): Promise<PostIn[]> {
  const r = await c.from('posts').select('id, channel_id, title, post_on, owner_id, caption, status, status_note').order('post_on');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({
    id: String(x.id),
    channelId: String(x.channel_id),
    title: String(x.title),
    postOn: str(x.post_on),
    owner: who(staff, x.owner_id),
    caption: str(x.caption),
    status: String(x.status),
    statusNote: str(x.status_note),
  }));
}

async function issues(c: Untyped, staff: Person[]): Promise<IssueIn[]> {
  const r = await c.from('newsletter_issues').select('id, title, send_on, intro, owner_id, status, sent_at').order('send_on');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({
    id: String(x.id),
    title: String(x.title),
    sendOn: str(x.send_on),
    intro: str(x.intro),
    owner: who(staff, x.owner_id),
    status: String(x.status),
    sentAt: str(x.sent_at),
  }));
}

async function sections(c: Untyped, staff: Person[]): Promise<SectionIn[]> {
  const r = await c.from('newsletter_sections').select('id, issue_id, position, title, blurb, owner_id, status, waits_until, waits_note').order('position');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Row[]).map((x) => ({
    id: String(x.id),
    issueId: String(x.issue_id),
    position: Number(x.position ?? 0),
    title: String(x.title),
    blurb: str(x.blurb),
    owner: who(staff, x.owner_id),
    status: String(x.status),
    waitsUntil: str(x.waits_until),
    waitsNote: str(x.waits_note),
  }));
}

/** Outreach > Plan: the channels (outreach_channels) and the month's dated items (posts + newsletter_issues). */
export async function loadPlan(opts: { demo?: string } = {}): Promise<Loaded<PlanData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_PLAN_STRESS : MOCK_PLAN), failed: false };
  try {
    const c = await live();
    const staff = await staffList(c);
    const [ch, ps, is, ss] = await Promise.all([channels(c, staff), posts(c, staff), issues(c, staff), sections(c, staff)]);
    const insta = ch.find((x) => x.kind === 'instagram');
    return { ...buildPlan(ch, ps, is, ss, today(), staff), instagramChannelId: insta?.id, failed: false };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Instagram: the Instagram channel's posts (posts). */
export async function loadInstagram(opts: { demo?: string } = {}): Promise<Loaded<InstagramData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_INSTAGRAM_STRESS : MOCK_INSTAGRAM), failed: false };
  try {
    const c = await live();
    const staff = await staffList(c);
    const [ch, ps] = await Promise.all([channels(c, staff), posts(c, staff)]);
    return { ...buildInstagram(ch.find((x) => x.kind === 'instagram'), ps, today(), staff), failed: false };
  } catch {
    return { failed: true };
  }
}

/** Outreach > Newsletter: the issue being worked on (newsletter_issues) and its sections (newsletter_sections). */
export async function loadNewsletter(opts: { demo?: string } = {}): Promise<Loaded<NewsletterData>> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_NEWSLETTER_STRESS : MOCK_NEWSLETTER), failed: false };
  try {
    const c = await live();
    const staff = await staffList(c);
    const [ch, is, ss] = await Promise.all([channels(c, staff), issues(c, staff), sections(c, staff)]);
    return { ...buildNewsletter(ch.find((x) => x.kind === 'newsletter'), is, ss, today(), staff), failed: false };
  } catch {
    return { failed: true };
  }
}

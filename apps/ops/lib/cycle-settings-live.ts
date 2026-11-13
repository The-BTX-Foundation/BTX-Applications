// Live mode: builds the Cycle settings view (lib/cycle-settings-view.ts) from the real tables as the signed-in person. The
// reads go through a reader (the session client by default, so row-level security applies), passed in so tests can stand
// in for the database (tests/cycle-settings-loader.test.ts). Every read asks for one row or a count, in a unique order.
//
// What a failed read does, so a failure never reads as a true number:
// - the cycle itself, the application count or the other published cycle: the page shows its "didn't load" line with
//   Try again (Unpublish and the publish rule depend on them);
// - the booked count (only one sentence of a confirm uses it): null, and that sentence is left out.
// Each failure logs one server line with the table and the error code only (never the message, which can quote rows).
import type { CycleRow } from './cycle-settings';
import { capsFor, hasOpened } from './cycle-settings-rows';
import type { CycleSettingsView } from './cycle-settings-view';
import { easternDay } from './refresh-time';
import { sessionClient } from './supabase-server';

/** How live mode reads. Each throws `{ code }` when the database says no. */
export type CycleSettingsReader = {
  /** The signed-in person's role from the auth server (null when signed out). */
  role: () => Promise<string | null>;
  /** The cycle with this id, else the published one, else the newest draft (null when there is none). */
  cycle: (id: string | null) => Promise<CycleRow | null>;
  /** Submitted applications in the cycle: the applications_select_staff rule shows staff only submitted rows. */
  applications: (cycleId: string) => Promise<number>;
  /** Active interview bookings in the cycle. */
  booked: (cycleId: string) => Promise<number>;
  /** The term of another published cycle, or null. */
  otherPublished: (cycleId: string) => Promise<string | null>;
};

const COLUMNS =
  'id, term, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end, decision_date, next_cycle_month, requirements, photo_due, payment_note, event_enabled, event_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A loose view of the session client: only the calls these reads make.
type Res = { data: unknown; error: unknown; count?: number | null };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  neq: (c: string, v: unknown) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Loose = {
  from: (t: string) => { select: (cols: string, o?: { count: 'exact'; head: boolean }) => Q };
  auth: { getUser: () => Promise<{ data: { user: { app_metadata?: { role?: unknown } } | null } }> };
};

const client = async () => (await sessionClient()) as unknown as Loose;

// Runs a read and throws its error (the loader turns that into the load error).
async function run(q: Q): Promise<Res> {
  const r = await q;
  if (r.error) throw r.error;
  return r;
}

/** The reader live mode uses: the session client. */
export const sessionCycleReader: CycleSettingsReader = {
  role: async () => {
    const { data } = await (await client()).auth.getUser();
    const role = data.user?.app_metadata?.role;
    return typeof role === 'string' ? role : null;
  },
  cycle: async (id) => {
    const c = await client();
    let q = c.from('cycles').select(COLUMNS);
    q = id ? q.eq('id', id) : q.neq('status', 'archived').order('status', { ascending: false }).order('created_at', { ascending: false });
    const r = await run(q.order('id', { ascending: false }).limit(1));
    const rows = Array.isArray(r.data) ? (r.data as CycleRow[]) : [];
    return rows[0] ?? null;
  },
  applications: async (cycleId) => {
    const r = await run((await client()).from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId));
    return r.count ?? 0;
  },
  booked: async (cycleId) => {
    const r = await run((await client()).from('bookings').select('id, interview_slots!inner(cycle_id)', { count: 'exact', head: true }).eq('status', 'active').eq('interview_slots.cycle_id', cycleId));
    return r.count ?? 0;
  },
  otherPublished: async (cycleId) => {
    const r = await run((await client()).from('cycles').select('term').eq('status', 'published').neq('id', cycleId).order('id', { ascending: true }).limit(1));
    const rows = Array.isArray(r.data) ? (r.data as { term: unknown }[]) : [];
    return rows[0] ? String(rows[0].term) : null;
  },
};

// The database's error code ("42501"), or "unknown"; never the message.
function codeOf(e: unknown): string {
  const c = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof c === 'string' && /^[\w.-]{1,40}$/.test(c) ? c : 'unknown';
}

// Runs one read; on failure logs its table and code and rethrows a marker.
async function logged<T>(table: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    console.error('[cycle-settings] read failed', { table, code: codeOf(e) });
    throw new Error('read failed');
  }
}

/** The view shown when a core read failed: the header and the "didn't load" line, every cap off. */
export function failedCycleView(today: string, now: string = new Date().toISOString()): CycleSettingsView {
  return { failed: false, loadFailed: true, today, now, cycle: null, applications: 0, booked: null, otherPublishedTerm: null, canEdit: false, caps: capsFor(false, '', 0, false) };
}

/** Builds the live view. `cycleId` (from ?cycle=) is used only when it is a UUID. */
export async function loadLiveCycleSettings(read: CycleSettingsReader = sessionCycleReader, cycleId?: string, now: Date = new Date()): Promise<CycleSettingsView> {
  const today = easternDay(now.toISOString());
  const at = now.toISOString();
  try {
    const [role, cycle] = await Promise.all([logged('auth', read.role), logged('cycles', () => read.cycle(cycleId && UUID.test(cycleId) ? cycleId : null))]);
    const admin = role === 'admin';
    if (!cycle) return { failed: false, loadFailed: false, today, now: at, cycle: null, applications: 0, booked: null, otherPublishedTerm: null, canEdit: admin, caps: capsFor(false, '', 0, false) };
    const [applications, otherPublishedTerm] = await Promise.all([
      logged('applications', () => read.applications(cycle.id)),
      cycle.status === 'published' ? Promise.resolve(null) : logged('cycles', () => read.otherPublished(cycle.id)),
    ]);
    let booked: number | null = null;
    try {
      booked = await logged('bookings', () => read.booked(cycle.id));
    } catch {
      booked = null;
    }
    const opened = hasOpened(cycle.opens_at, now.getTime());
    return { failed: false, loadFailed: false, today, now: at, cycle, applications, booked, otherPublishedTerm, canEdit: admin, caps: capsFor(admin, cycle.status, applications, opened) };
  } catch {
    return failedCycleView(today, at);
  }
}

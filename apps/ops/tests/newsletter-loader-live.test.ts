// The Newsletter loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no flag can switch on a send, a nudge or
// a fake load error live. A failed read logs one server line with the table and error code only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/newsletter-map';
import type { NlReader } from '@/lib/newsletter-live';

const db = vi.hoisted(() => ({ fail: null as null | { table: string; code: string } }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/newsletter-db', () => {
  const tables: Record<string, Row[]> = {
    newsletter_issues: [{ id: 'i1', title: 'BTX news, November 2026', send_on: '2026-11-30', intro: '', owner_id: 'u-me', status: 'drafting' }],
    newsletter_sections: [{ id: 's1', position: 1, title: 'Spotlight', blurb: '', owner_id: 'u-me', status: 'writing', waits_until: null, waits_note: null }],
    staff_profiles: [{ user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' }],
    outreach_channels: [{ id: 'c1', owner_id: 'u-me', audience_count: 12 }],
  };
  const answer = async (table: string) => {
    if (db.fail?.table === table) throw { code: db.fail.code, message: 'Dana Mercer row 42 was refused' };
    return tables[table] ?? [];
  };
  const nlSessionReader: NlReader = { rows: answer, all: answer };
  return { nlSessionReader };
});

afterEach(() => {
  db.fail = null;
  vi.restoreAllMocks();
});

const user = { id: 'u-me', role: 'admin' };

describe('loadNewsletterView in live mode', () => {
  it.each(['failed', 'error', 'failsave', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s: real data, no load error, nothing that sends', async (demo) => {
    const { loadNewsletterView } = await import('@/lib/newsletter-view-loader');
    const r = await loadNewsletterView({ demo, user });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.failFirst).toBeFalsy();
    expect(r.sections.map((s) => s.title)).toEqual(['Spotlight']);
    expect(r.facts.subscribers).toBe('12');
    expect(r.caps).toEqual({ tick: true, undo: true, nudge: false, send: false, pastIssues: false });
  });

  it('logs a failed core read with the table and code only, and shows the load error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'newsletter_sections', code: '42501' };
    const { loadNewsletterView } = await import('@/lib/newsletter-view-loader');
    const r = await loadNewsletterView({ demo: 'stress', user });
    expect(r.failed === false && r.loadFailed).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[newsletter] read failed', { table: 'newsletter_sections', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Dana');
  });

  it('logs a failed channel read and marks only the subscriber fact', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'outreach_channels', code: 'PGRST301' };
    const { loadNewsletterView } = await import('@/lib/newsletter-view-loader');
    const r = await loadNewsletterView({ user });
    expect(r.failed === false && !r.loadFailed && r.facts.subscribers === null).toBe(true);
    expect(log).toHaveBeenCalledWith('[newsletter] channel read failed', { table: 'outreach_channels', code: 'PGRST301' });
  });
});

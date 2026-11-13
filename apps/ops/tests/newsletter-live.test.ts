// The Newsletter page's live loader (lib/newsletter-live.ts) with a stand-in reader: what it reads, the optional channel
// read, a failed core read, and the capabilities by role (nothing that sends is ever allowed live).
import { describe, expect, it } from 'vitest';
import { liveCaps, loadLiveNewsletter, type NlReadOpts, type NlReader } from '@/lib/newsletter-live';
import type { Row } from '@/lib/newsletter-map';

type Call = { kind: 'rows' | 'all'; table: string; o?: NlReadOpts };

// A reader answering per table (an Error answer rejects), recording every call.
function reader(answers: Record<string, Row[] | Error | ((o?: NlReadOpts) => Row[])>) {
  const calls: Call[] = [];
  const answer = async (table: string, o?: NlReadOpts) => {
    const a = answers[table];
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a(o) : (a ?? []);
  };
  const r: NlReader = {
    rows: (table, _s, o) => {
      calls.push({ kind: 'rows', table, o });
      return answer(table, o);
    },
    all: (table, _s, o) => {
      calls.push({ kind: 'all', table, o });
      return answer(table, o);
    },
  };
  return { r, calls };
}

const NOW = new Date('2026-11-10T15:00:00Z');
const issues = (o?: NlReadOpts): Row[] =>
  o?.neq?.status === 'sent' ? [{ id: 'i1', title: 'BTX news, November 2026', send_on: '2026-11-30', intro: 'Hello', owner_id: 'u1', status: 'drafting' }] : [{ id: 'i0', sent_at: '2026-10-20T14:00:00Z' }];
const base = {
  staff_profiles: [
    { user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: 'u2', display_name: 'Toby Faraday', initials: 'TF' },
  ],
  newsletter_issues: issues,
  newsletter_sections: [
    { id: 's1', position: 1, title: 'Spotlight', blurb: 'b', owner_id: 'u1', status: 'done', waits_until: null, waits_note: null },
    { id: 's2', position: 2, title: 'Winner', blurb: 'b', owner_id: 'u2', status: 'writing', waits_until: '2026-11-24', waits_note: 'Can be written once the board picks' },
  ],
  outreach_channels: [{ id: 'c1', owner_id: 'u2', audience_count: 312 }],
};

describe('loadLiveNewsletter', () => {
  it('reads the next unsent issue, its sections, the last sent issue and the channel', async () => {
    const { r, calls } = reader(base);
    const v = await loadLiveNewsletter(r, { id: 'u1', role: 'board' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.today).toBe('2026-11-10');
    expect(v.loadFailed).toBe(false);
    expect(v.issue).toMatchObject({ heading: 'November issue', previewTitle: 'BTX news, November 2026', owner: { name: 'Dana Mercer', mine: true } });
    expect(v.sections.map((s) => [s.id, s.status])).toEqual([
      ['s1', 'done'],
      ['s2', 'writing'],
    ]);
    expect(v.facts).toEqual({ subscribers: '312', lastIssue: 'October 2026', tool: 'Not set' });
    expect(v.caps).toEqual({ tick: true, undo: true, nudge: false, send: false, pastIssues: false });
    const sec = calls.find((c) => c.table === 'newsletter_sections');
    expect(sec).toMatchObject({ kind: 'all', o: { eq: { issue_id: 'i1' }, order: [['position', true], ['id', true]] } });
    const next = calls.find((c) => c.table === 'newsletter_issues' && c.o?.neq);
    expect(next?.o).toMatchObject({ neq: { status: 'sent' }, limit: 1 });
    // No read is all-time: the issue reads take one row each.
    expect(calls.filter((c) => c.table === 'newsletter_issues').every((c) => c.o?.limit === 1)).toBe(true);
  });

  it('marks only the subscriber fact when the channel read fails', async () => {
    const { r } = reader({ ...base, outreach_channels: new Error('denied') });
    const v = await loadLiveNewsletter(r, { id: 'u1', role: 'admin' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.facts.subscribers).toBeNull();
    expect(v.issue?.owner?.name).toBe('Dana Mercer');
  });

  it('shows the load error when a core read fails', async () => {
    const { r } = reader({ ...base, newsletter_sections: new Error('boom') });
    const v = await loadLiveNewsletter(r, { id: 'u1', role: 'admin' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(true);
    expect(v.issue).toBeNull();
    expect(v.sections).toEqual([]);
    expect(v.caps.tick).toBe(false);
  });

  it('has no issue and no section read when nothing is planned', async () => {
    const { r, calls } = reader({ ...base, newsletter_issues: [] });
    const v = await loadLiveNewsletter(r, { id: 'u1', role: 'admin' }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.issue).toBeNull();
    expect(v.facts.lastIssue).toBe('None yet');
    expect(v.caps.tick).toBe(false);
    expect(calls.some((c) => c.table === 'newsletter_sections')).toBe(false);
  });
});

describe('liveCaps', () => {
  it('lets admins and board members tick, never send, nudge or open past issues', () => {
    for (const role of ['admin', 'board']) expect(liveCaps(true, role)).toEqual({ tick: true, undo: true, nudge: false, send: false, pastIssues: false });
    expect(liveCaps(true, 'staff')).toMatchObject({ tick: false, undo: false, send: false });
    expect(liveCaps(false, 'admin')).toMatchObject({ tick: false, undo: false, send: false });
  });
});

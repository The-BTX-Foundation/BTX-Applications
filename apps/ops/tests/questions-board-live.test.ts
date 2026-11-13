// The Interview questions board drawn as static markup: live mode draws no mock-only control (no Draft chip), a board member
// without admin rights reads only, and the empty and error states say the right thing.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/interviews/questions' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}), hasSupabaseEnv: () => true }));
vi.mock('@/lib/actions/interview-questions', () => ({ saveInterviewQuestion: vi.fn(), removeInterviewQuestion: vi.fn(), moveInterviewQuestion: vi.fn(), addStarterQuestions: vi.fn() }));

import { QuestionsBoard } from '@/components/questions/questions-board';
import { liveCaps, mockCaps } from '@/lib/questions-map';
import type { QnView } from '@/lib/questions-view';
import { QN_VIEW, QN_VIEW_EMPTY } from '@/mock/questions-view';

const html = (view: QnView, live = true) => renderToStaticMarkup(createElement(QuestionsBoard, { view, live }));
const live = (v: QnView, admin = true, cycle = true): QnView => ({ ...v, isAdmin: admin, cycleId: cycle ? v.cycleId : null, caps: liveCaps(admin, cycle), mockWrite: null });

describe('questions board', () => {
  it('live admin: edit controls, no Draft chip', () => {
    const h = html(live(QN_VIEW));
    expect(h).not.toContain('Draft');
    expect(h).toContain('Add a question');
    expect(h).toContain('Reorder question 1. Drag, or use the up and down arrow keys.');
    expect(h).toContain('Remove question 1');
  });
  it('mock admin: the Draft chip the demo draws', () => {
    expect(html({ ...QN_VIEW, caps: mockCaps(true) }, false)).toContain('>Draft<');
  });
  it('without admin rights: read only, with the lock line', () => {
    const h = html(live(QN_VIEW, false));
    expect(h).toContain('Editable with admin rights');
    expect(h).not.toMatch(/Add a question|qn-grip|data-x="rm"|<textarea/);
  });
  it('empty: the starter questions for an admin; who adds them for everyone else; no cycle said plainly', () => {
    expect(html(live(QN_VIEW_EMPTY))).toContain('Use the starter questions');
    expect(html(live(QN_VIEW_EMPTY, false))).toContain('A board member with admin rights will add them.');
    const none = html(live(QN_VIEW_EMPTY, true, false));
    expect(none).not.toContain('Use the starter questions');
    expect(none).toContain('No cycle is published yet');
  });
  it('load error: the card under the title, no board', () => {
    const h = html({ ...live(QN_VIEW), loadFailed: true });
    expect(h).toContain('The interview questions didn&#x27;t load.');
    expect(h).not.toContain('qn-board');
  });
  it('next interview failed: only that panel says so', () => {
    const h = html({ ...live(QN_VIEW), next: null, nextFailed: true });
    expect(h).toContain('Your next interview didn&#x27;t load.');
    expect(h).toContain('Add a question');
  });
  it('one polite live region, and no aria-live or role=status elsewhere', () => {
    const h = html(live(QN_VIEW));
    expect(h.match(/aria-live/g)).toHaveLength(1);
    expect(h).not.toContain('role="status"');
  });
  it('a just-added question (tmp- id): its edit, move and remove controls rest until the server gives its id', () => {
    const v = live(QN_VIEW);
    const groups = v.groups.map((g, i) => (i === 0 ? { ...g, questions: [...g.questions, { id: 'tmp-7', text: 'Just added' }] } : g));
    const h = html({ ...v, groups });
    const row = h.slice(h.indexOf('data-id="tmp-7"'), h.indexOf('</li>', h.indexOf('data-id="tmp-7"')));
    expect(row).toMatch(/class="qn-grip" data-id="tmp-7" disabled=""/);
    expect(row).toMatch(/class="qn-qt" data-id="tmp-7" disabled=""/);
    expect(row).toMatch(/data-x="up" data-id="tmp-7"[^>]*disabled=""/);
    expect(row).toMatch(/data-x="rm" data-id="tmp-7" disabled=""/);
    // Other rows are untouched.
    expect(h).not.toMatch(/class="qn-qt" data-id="(?!tmp-)[^"]+" disabled/);
  });
  it('no cycle, without admin rights: only "No cycle is published yet."', () => {
    const h = html(live(QN_VIEW_EMPTY, false, false));
    expect(h).toContain('<p>No cycle is published yet.</p>');
    expect(h).not.toContain('A board member with admin rights will add them.');
  });
  it('every list item is a question (notes never sit in the list)', () => {
    const h = html(live(QN_VIEW));
    const items = h.match(/<li /g)?.length ?? 0;
    expect(items).toBe(QN_VIEW.groups.reduce((n, g) => n + g.questions.length, 0));
  });
});


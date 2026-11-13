// The live Newsletter board sends nothing (owner rule 3b): with live caps there is no "Send to N subscribers", no confirm,
// no Nudge and no Past issues, only the section ticks; a person without tick rights gets no buttons on the sections; and
// the page has exactly one live region in every state.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/outreach/newsletter' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}) }));

import { NewsletterBoard } from '@/components/newsletter/newsletter-board';
import { liveCaps } from '@/lib/newsletter-live';
import type { NlView } from '@/lib/newsletter-view';
import { NL_VIEW } from '@/mock/newsletter-view';

const allDone: NlView = { ...NL_VIEW, sections: NL_VIEW.sections.map((s) => ({ ...s, status: 'done' as const, pinned: false })) };
const html = (view: NlView, role = 'admin') => renderToStaticMarkup(createElement(NewsletterBoard, { view: { ...view, caps: liveCaps(!view.loadFailed, role) }, live: true }));
const liveRegions = (h: string) => (h.match(/aria-live=|role="status"|role="alert"/g) ?? []).length;

describe('live Newsletter board', () => {
  it('draws no send control once every section is done, only the not-connected line', () => {
    const h = html(allDone);
    expect(h).not.toContain('Send to');
    expect(h).not.toMatch(/data-x="(send|sendgo)"/);
    expect(h).toContain('Sending from here is not connected yet.');
  });
  it('draws no Nudge and no Past issues, but does draw the section ticks', () => {
    const h = html(NL_VIEW);
    expect(h).not.toContain('Nudge');
    expect(h).not.toContain('Past issues');
    expect(h).toContain('aria-label="Done, section 3: Certification program is coming"');
    expect(h).toContain('data-x="done"');
  });
  it('gives a person without tick rights no buttons on the sections', () => {
    const h = html(NL_VIEW, 'staff');
    expect(h).not.toContain('nl-check"');
    expect(h).not.toContain('data-x="done"');
  });
  it('words the open issue as sent outside the Hub, and a passed send day late', () => {
    expect(html(NL_VIEW)).toContain('Goes out Mon Nov 30, sent outside the Ops Hub');
    expect(html(NL_VIEW)).not.toContain('once the last');
    const late = html({ ...NL_VIEW, issue: { ...NL_VIEW.issue!, sendOn: '2026-10-30' } });
    expect(late).toMatch(/class="rf-late nl-late"[^>]*>Planned for Oct 30, passed</);
    expect(late).not.toContain('Goes out');
  });
  it('has exactly one live region, also on the load error', () => {
    expect(liveRegions(html(NL_VIEW))).toBe(1);
    expect(liveRegions(html(allDone))).toBe(1);
    expect(liveRegions(html({ ...NL_VIEW, loadFailed: true }))).toBe(1);
  });
});

// The refreshed Interviews board draws no write control for a board member (no admin rights), live or mock: no Make Teams
// links, Send times, Remove, Paste one, Rebalance, Re-run pairing, Build times or Add a time. Join shows only on the
// viewer's own interviews. A page with no published cycle says so with no controls.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/interviews', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@/lib/actions/interviews', () => ({}));
vi.mock('@/lib/mock-store', () => ({ useMockState: <T,>(_k: string, init: T) => [init, () => {}] }));

import { InterviewsBoard } from '@/components/interviews/interviews-board';
import { capsFor, NO_CAPS } from '@/lib/interviews-map';
import type { InterviewsView } from '@/lib/interviews-view';
import { INTERVIEWS_VIEW, INTERVIEWS_VIEW_EMPTY } from '@/mock/interviews-view';

// The board's HTML for a view.
const html = (view: InterviewsView, live: boolean) => renderToStaticMarkup(createElement(InterviewsBoard, { view, live }));
// The visible text of every button in the HTML.
const buttonTexts = (h: string) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
const WRITES = ['Make Teams links', 'Send times', 'Remove', 'Paste one', 'Rebalance', 'Re-run pairing', 'Build times', 'Add a time', 'Remind', 'Change'];

// A board member's view: no admin rights, so no caps; every link but their own already stripped by mapLive.
const member = (v: InterviewsView, source: 'mock' | 'live'): InterviewsView => ({ ...v, source, isAdmin: false, caps: NO_CAPS });

describe('Interviews board, board member', () => {
  for (const live of [true, false]) {
    for (const [name, v] of [
      ['normal', INTERVIEWS_VIEW],
      ['empty', INTERVIEWS_VIEW_EMPTY],
    ] as const) {
      it(`${live ? 'live' : 'mock'} ${name}: no write buttons`, () => {
        const texts = buttonTexts(html(member(v, live ? 'live' : 'mock'), live));
        for (const w of WRITES) expect(texts.filter((t) => t.includes(w))).toEqual([]);
      });
    }
  }
  it('Join shows only on their own interviews', () => {
    const v = member(INTERVIEWS_VIEW, 'live');
    const h = html(v, true);
    const mine = v.bookings.filter((b) => b.link && b.pair.some((p) => p.id === v.me)).length;
    expect((h.match(/>Join</g) ?? []).length).toBeLessThanOrEqual(mine);
  });
});

describe('Interviews board, admin live (sanity: the real controls are drawn)', () => {
  it('draws the live write controls', () => {
    const texts = buttonTexts(html({ ...INTERVIEWS_VIEW, source: 'live', caps: capsFor(true, true, true) }, true)).join(' | ');
    expect(texts).toContain('Rebalance');
    expect(texts).toContain('Re-run pairing');
  });
});

describe('Interviews board, no cycle', () => {
  it('says no cycle is published and draws no controls', () => {
    const h = html({ ...INTERVIEWS_VIEW_EMPTY, source: 'live', cycleId: null, caps: capsFor(true, true, false) }, true);
    expect(h).toContain('No interview cycle is published yet.');
    const texts = buttonTexts(h);
    for (const w of WRITES) expect(texts.filter((t) => t.includes(w))).toEqual([]);
  });
});

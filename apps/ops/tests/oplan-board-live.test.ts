// The live Outreach Plan board draws only controls with a real write: no Nudge, no owner picks, no Undo, no N key hint and
// no newsletter wording on the add row; and the page has exactly one polite live region in every state.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/outreach/plan' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}) }));

import { OplanBoard } from '@/components/oplan/oplan-board';
import { liveCaps } from '@/lib/oplan-map';
import type { PnView } from '@/lib/oplan-view';
import { pnMockNormal } from '@/mock/oplan-view';

const html = (view: PnView, live = true) => renderToStaticMarkup(createElement(OplanBoard, { view, live }));
const liveView = (): PnView => ({ ...pnMockNormal(), caps: liveCaps() });
const politeRegions = (h: string) => (h.match(/aria-live="polite"/g) ?? []).length;

describe('live Outreach Plan board', () => {
  it('draws no Nudge, owner picks, Undo, N key hint or newsletter wording', () => {
    const h = html(liveView());
    expect(h).not.toContain('Nudge');
    expect(h).not.toContain('Pick an owner');
    expect(h).not.toContain('Undo');
    expect(h).not.toContain('pn-kbd');
    expect(h).not.toContain('or issue');
    expect(h).toContain('Plan a post');
  });
  it('draws the mock controls in mock mode', () => {
    const h = html(pnMockNormal(), false);
    expect(h).toContain('Nudge Keith');
    expect(h).toContain('pn-kbd');
    expect(h).toContain('Plan a post or issue');
  });
  it('has exactly one polite live region, also on the load error', () => {
    expect(politeRegions(html(liveView()))).toBe(1);
    expect(politeRegions(html(pnMockNormal(), false))).toBe(1);
    expect(politeRegions(html({ ...liveView(), loadFailed: true }))).toBe(1);
  });
});

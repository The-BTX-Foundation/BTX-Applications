// The live Awardees board draws no email: no "Send another reminder", no "Email <name>", no "Nudge" on the news card
// (it says "Open"), and Undo is switched off (mock only; live re-ticks or unticks with the step control). "Record a
// reminder" (date only) is the live control. The mock board still draws the demo's email reminder.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/awardees' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@/lib/actions/awardees', () => ({ setStepDone: vi.fn(), sendReminder: vi.fn() }));

import { AwardeesBoard } from '@/components/awardees/awardees-board';
import type { AwardeesView, AwCaps } from '@/lib/awardees-view';
import { AW_MOCK_CAPS, AW_VIEW_AFTER, AW_VIEW_BEFORE } from '@/mock/awardees-view';

// What a live admin gets (lib/awardees-live.ts).
const LIVE_CAPS: AwCaps = { tick: true, undo: false, funds: true, remindEmail: false, recordReminder: true };
const html = (view: AwardeesView, live: boolean) => renderToStaticMarkup(createElement(AwardeesBoard, { view, live }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ');

describe('the live Awardees board', () => {
  it.each([
    ['before', AW_VIEW_BEFORE],
    ['after', AW_VIEW_AFTER],
  ])('draws no email, Nudge or Undo (%s)', (_n, view) => {
    const t = text(html({ ...view, caps: LIVE_CAPS }, true));
    expect(t).not.toContain('Send another reminder');
    expect(t).not.toMatch(/Email [A-Z]/);
    expect(t).not.toContain('Nudge');
    expect(t).not.toContain('Undo');
  });

  it('offers "Record a reminder" where the mock offers the email', () => {
    const view = AW_VIEW_AFTER;
    const live = text(html({ ...view, caps: LIVE_CAPS }, true));
    const mock = text(html({ ...view, caps: AW_MOCK_CAPS }, false));
    expect(live).toContain('Record a reminder');
    expect(mock).toContain('Send another reminder');
    expect(mock).not.toContain('Record a reminder');
  });

  it('shows Nudge on the mock news card only', () => {
    const mock = text(html({ ...AW_VIEW_BEFORE, caps: AW_MOCK_CAPS }, false));
    const live = text(html({ ...AW_VIEW_BEFORE, caps: LIVE_CAPS }, true));
    if (mock.includes('Nudge')) expect(live).toContain('Open');
    expect(live).not.toContain('Nudge');
  });
});

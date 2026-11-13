// Every element on the refreshed Your availability page that carries a "Students I know" name is marked
// data-review-private (on itself or an ancestor): the names list, the change lines in the Send box, the Undo note and
// the live region.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/interviews/availability' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}), hasSupabaseEnv: () => true }));
vi.mock('@/lib/actions/availability', () => ({ saveAvailability: vi.fn(), readTypedAvailability: vi.fn() }));

import { AvailabilityBoard, ChangeList, Note } from '@/components/availability/availability-board';
import type { Change, Snap } from '@/lib/availability-draft';
import { AV_VIEW } from '@/mock/availability-view';

const S: Snap = { spans: {}, conflicts: [], limit: null, text: '' };

// True when every text occurrence of `name` sits inside an element marked data-review-private.
function allMarked(html: string, name: string): boolean {
  const marks = [...html.matchAll(/<(\w+)[^>]*data-review-private[^>]*>/g)];
  let i = html.indexOf(name);
  if (i < 0) return false;
  while (i >= 0) {
    const inside = marks.some((m) => {
      const start = m.index ?? 0;
      const close = html.indexOf(`</${m[1]}>`, start);
      return start < i && close > i;
    });
    if (!inside) return false;
    i = html.indexOf(name, i + 1);
  }
  return true;
}

describe('availability private marks', () => {
  it('the names list on the page', () => {
    const h = renderToStaticMarkup(createElement(AvailabilityBoard, { view: { ...AV_VIEW, caps: { send: true, reader: true, bookings: false, mock: false } }, live: true }));
    expect(allMarked(h, 'Jordan Pierce')).toBe(true);
    expect(allMarked(h, 'Amara Okafor')).toBe(true);
  });
  it('the change lines in the Send box, also after a rebase', () => {
    const stack: Change[] = [
      { before: S, text: 'Added Wed Nov 11, 5 to 9 PM', where: 'add' },
      { before: S, text: 'Added Folake Nwosu to students you know', where: 'names' },
    ];
    expect(allMarked(renderToStaticMarkup(createElement(ChangeList, { stack, differs: false })), 'Folake Nwosu')).toBe(true);
    const rebased: Change[] = [{ before: S, text: 'your unsent changes', where: 'add', texts: stack.map((c) => c.text) }];
    const h = renderToStaticMarkup(createElement(ChangeList, { stack: rebased, differs: false }));
    expect(allMarked(h, 'Folake Nwosu')).toBe(true);
    expect(h).toContain('Added Wed Nov 11');
  });
  it('the Undo note', () => {
    const h = renderToStaticMarkup(createElement(Note, { where: 'names', text: 'Removed Isaac Boateng from students you know', onUndo: () => {} }));
    expect(allMarked(h, 'Isaac Boateng')).toBe(true);
  });
  it('nothing listed and the screen differs: the plain DIFFER line', () => {
    expect(renderToStaticMarkup(createElement(ChangeList, { stack: [], differs: true }))).toContain('Your saved times differ from what&#x27;s shown.');
  });
});

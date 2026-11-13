// The live Cycle board draws none of the demo's writes (rule: nothing may email a student or send anything live): no
// Remind (and no confirm with "Email N students"), no Share, no Nudge and no checkbox button, even on the stress sample
// that has every one of those steps. The step checks are drawn as plain marks. The chat note shows when the read was capped.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/cycle' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));

import { CycleBoard } from '@/components/cycle/cycle-board';
import { liveCaps } from '@/lib/cycle-live';
import type { CycleView } from '@/lib/cycle-view';
import { CY_VIEW, CY_VIEW_STRESS } from '@/mock/cycle-view';

const ADMIN = { id: 'u1', name: 'Dana Mercer', initials: 'DM', role: 'admin' };

// The board's HTML for `view` with the live caps, drawn as live or mock.
function html(view: CycleView, live: boolean) {
  const caps = live ? liveCaps(ADMIN, view.chat) : view.caps;
  return renderToStaticMarkup(createElement(CycleBoard, { view: { ...view, caps }, live }));
}
// The text of every <button> in the HTML.
const buttons = (h: string) => [...h.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]+>/g, '') }));

describe('live Cycle board', () => {
  for (const [name, view] of [
    ['normal', CY_VIEW],
    ['stress', CY_VIEW_STRESS],
  ] as const) {
    it(`${name}: no Remind, Share, Nudge or checkbox button live`, () => {
      // (The news card is a button whose words can name a step, "Remind the 16 students…": it only jumps to the step.)
      const b = buttons(html(view, true)).map((x) => ({ ...x, text: x.text.trim() }));
      expect(b.some((x) => /^(Remind|Remind the \d+|Email \d+ students|Email the students)$/.test(x.text))).toBe(false);
      expect(b.some((x) => /^(Share|Share with the board)$/.test(x.text))).toBe(false);
      expect(b.some((x) => /^Nudge /.test(x.text))).toBe(false);
      expect(b.some((x) => /data-x="(remind|remindGo|share|nudge|undo)"/.test(x.attrs) || /class="cy-ck"/.test(x.attrs) || /aria-pressed/.test(x.attrs))).toBe(false);
      // The step marks are still drawn, as plain marks.
      expect(html(view, true)).toContain('cy-ck cy-static');
    });

    it(`${name}: the mock board does draw them (the test can see the buttons)`, () => {
      const b = buttons(html(view, false));
      expect(b.some((x) => /^Remind the \d+$/.test(x.text.trim()))).toBe(true);
      expect(b.some((x) => /aria-pressed/.test(x.attrs))).toBe(true);
    });
  }

  it('the stress sample shows "Waiting on" live without a Nudge button', () => {
    const h = html(CY_VIEW_STRESS, true);
    expect(h).toContain('Waiting on');
    expect(h).not.toContain('data-x="nudge"');
  });

  it('shows "Older messages aren\'t shown here." only when the chat read was capped', () => {
    const chat = CY_VIEW.chat.failed ? CY_VIEW.chat : CY_VIEW.chat;
    if (chat.failed) throw new Error('sample chat should load');
    expect(html({ ...CY_VIEW, chat: { ...chat, capped: true } }, true)).toContain('Older messages aren&#x27;t shown here.');
    expect(html({ ...CY_VIEW, chat: { ...chat, capped: false } }, true)).not.toContain('Older messages');
  });
});

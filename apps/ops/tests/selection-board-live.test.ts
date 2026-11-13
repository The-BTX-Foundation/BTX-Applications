// The live Selection board: only an admin gets the release control (a board member sees that an admin releases), no
// "Send agenda", "Who calls the winners" has no control, no Join without a video link, and the award wording follows the
// real Undo rule (never "can't be undone" for an award).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/selection' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@/lib/actions/selection', () => ({ recordAward: vi.fn(), undoAward: vi.fn(), releaseAndNotify: vi.fn() }));

import { SelectionBoard, SlGo } from '@/components/selection/selection-board';
import { UNDO_RULE, mainConfirmBody } from '@/lib/selection-map';
import type { SelectionView, SlAward } from '@/lib/selection-view';
import { SL_VIEW_MEETING, SL_VIEW_STRESS, SL_VIEW_TODAY } from '@/mock/selection-view';

const html = (view: SelectionView, live = true) => renderToStaticMarkup(createElement(SelectionBoard, { view, live }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

const row = SL_VIEW_MEETING.rows[0];
const main: SlAward = { id: 'm1', applicationId: row.applicationId, code: row.code, name: row.name, kind: 'main', awardName: 'Legacy', amountCents: 250000, decidedAt: '2026-11-25T00:10:00Z', letterDone: false };
const recorded = (release: boolean): SelectionView => ({ ...SL_VIEW_MEETING, awards: [main], caps: { record: true, undo: true, release } });

describe('the live Selection board', () => {
  it('gives the release control to an admin', () => {
    const t = text(html(recorded(true)));
    expect(t).toContain('Release decisions');
    expect(html(recorded(true))).toContain('data-k="release"');
  });

  it('never gives a board member the release control', () => {
    const h = html(recorded(false));
    expect(h).not.toContain('data-k="release"');
    expect(h).not.toContain('data-k="confirmRelease"');
    expect(text(h)).toContain('An admin releases decisions');
  });

  it('never draws the release before the main award is recorded', () => {
    expect(html({ ...SL_VIEW_MEETING, caps: { record: true, undo: true, release: true } })).not.toContain('data-k="release"');
  });

  it('draws no Send agenda and no control for who calls the winners', () => {
    for (const v of [SL_VIEW_TODAY, SL_VIEW_MEETING, SL_VIEW_STRESS, recorded(true)]) {
      const t = text(html(v));
      expect(t).not.toContain('Send agenda');
      expect(t).not.toMatch(/agenda/i);
    }
    expect(text(html(recorded(true)))).toContain('Who calls the winners');
  });

  it('draws Join only with a video link', () => {
    expect(html({ ...SL_VIEW_MEETING, meeting: { startsAt: SL_VIEW_MEETING.meeting!.startsAt, videoUrl: null } })).not.toContain('Join the call');
    expect(html(SL_VIEW_MEETING)).toContain('Join the call');
  });

  it('offers Undo on a recorded award and never calls an award permanent', () => {
    const t = text(html(recorded(true)));
    expect(t).toContain('Undo');
    expect(t).not.toMatch(/can.t be undone/);
    expect(mainConfirmBody({ name: 'A', code: 'C', mainName: 'Legacy', cents: 250000 })).not.toMatch(/can.t be undone/);
    expect(UNDO_RULE).toBe('You can undo until the award letter goes out or decisions are released.');
  });

  it('hides Undo once the letter has gone out', () => {
    const t = text(html({ ...recorded(true), awards: [{ ...main, letterDone: true }] }));
    expect(t).not.toContain('Undo');
  });

  it('gives no record or release control to someone who may not record', () => {
    const h = html({ ...SL_VIEW_MEETING, caps: { record: false, undo: false, release: false } });
    expect(h).not.toContain('data-k="recordMain"');
    expect(h).not.toContain('data-k="addX"');
    expect(h).not.toContain('Choose for the');
  });

  it('draws two main awards with a warning and no release control', () => {
    const second: SlAward = { ...main, id: 'm2', applicationId: SL_VIEW_MEETING.rows[1].applicationId, code: SL_VIEW_MEETING.rows[1].code, name: SL_VIEW_MEETING.rows[1].name };
    const h = html({ ...recorded(true), awards: [main, second] });
    const t = text(h);
    expect(t).toContain('Two main awards are recorded. Ask an admin to remove one before releasing.');
    expect(t).toContain(main.name);
    expect(t).toContain(second.name);
    expect(t).toContain('Unavailable while two main awards are recorded');
    expect(h).not.toContain('data-k="release"');
    expect(t).not.toMatch(/Release and email/);
    expect(h.match(/>Undo</g)?.length).toBe(2);
  });
});

describe('a confirm go button', () => {
  it('is unarmed (aria-disabled) when its confirm first renders', () => {
    const h = renderToStaticMarkup(createElement(SlGo, { k: 'confirmRelease', describedBy: 'sl-cfr-t', onGo: vi.fn() }, 'Release and email 21'));
    expect(h).toContain('aria-disabled="true"');
    expect(h).toContain('aria-describedby="sl-cfr-t"');
    expect(h).toContain('data-k="confirmRelease"');
  });
});

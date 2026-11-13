// The Scoring board's markup by mode: live (LIVE_CAPS) draws no Nudge and no Undo and asks before publishing; the mock
// (MOCK_CAPS) draws the demo's Nudge. The confirm's go button is unarmed when it first draws, and points at the confirm's
// words (where focus lands), not at itself.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/scoring' }));
vi.mock('@/lib/actions/scoring', () => ({ saveDraft: vi.fn(), publishScore: vi.fn(), savePrivateNote: vi.fn() }));

import { ScoringBoard } from '@/components/scoring/scoring-board';
import { PUB_WHY_ID, PublishGo } from '@/components/scoring/scoring-confirm';
import { createArm } from '@/lib/scoring-arm';
import { publishAsksFirst } from '@/lib/scoring-flow';
import { LIVE_CAPS, MOCK_CAPS } from '@/lib/scoring-map';
import { mockScoringView } from '@/mock/scoring-view';

const text = (h: string) => h.replace(/<[^>]+>/g, ' ');
const html = (live: boolean) => renderToStaticMarkup(createElement(ScoringBoard, { view: { ...mockScoringView(), sim: null, caps: live ? LIVE_CAPS : MOCK_CAPS }, live, userId: 'u-me' }));

describe('the Scoring board by mode', () => {
  it('draws Nudge in the mock only', () => {
    expect(text(html(false))).toContain('Nudge Miles');
    const live = text(html(true));
    expect(live).not.toContain('Nudge');
    expect(live).not.toContain('Undo');
  });

  it('asks before publishing live; the mock publishes at once with Undo', () => {
    expect(publishAsksFirst(LIVE_CAPS)).toBe(true);
    expect(publishAsksFirst(MOCK_CAPS)).toBe(false);
  });

  it('draws the confirm go button unarmed, described by the confirm words', () => {
    const a = createArm();
    a.open(0);
    const h = renderToStaticMarkup(createElement(PublishGo, { arm: a, onGo: () => {} }));
    expect(h).toContain('data-armed="false"');
    expect(h).toContain(`aria-describedby="${PUB_WHY_ID}"`);
  });
});

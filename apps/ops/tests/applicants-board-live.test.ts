// Live Applicants pages draw no send: the mock-only interviewer nudge, the student reminder and the detail's news card are
// not drawn with live caps (nothing may email a student or message anyone), and Export shows for admins only.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/scholarships/applicants' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));

import { ApplicantDetail } from '@/components/applicants/applicant-detail';
import { ApplicantsBoard } from '@/components/applicants/applicants-board';
import { InterviewBlock, type NudgeState } from '@/components/applicants/applicants-parts';
import { liveCaps, MOCK_CAPS, stageOf } from '@/lib/applicants-map';
import { APPLICANTS_VIEW, mockDetail } from '@/mock/applicants-view';

const codes = APPLICANTS_VIEW.applicants.map((a) => a.code);
const detail = (code: string, caps = liveCaps(true)) => renderToStaticMarkup(createElement(ApplicantDetail, { view: { ...mockDetail(code)!, caps } }));
const SEND = /data-ap-nudge|data-ap-send|>Nudge |>Remind |rf-nx-k/;

describe('live Applicants caps', () => {
  it('mock mode does draw nudges and reminders somewhere (so the check below means something)', () => {
    expect(codes.some((c) => SEND.test(detail(c, MOCK_CAPS)))).toBe(true);
  });
  it('live: no full application draws a nudge, reminder, draft or news card', () => {
    for (const c of codes) {
      expect(detail(c, liveCaps(true))).not.toMatch(SEND);
      expect(detail(c, liveCaps(false))).not.toMatch(SEND);
    }
  });
  it('the interview block (preview and detail) draws no nudge, reminder or draft without the nudge cap, in any state', () => {
    const block = (code: string, canNudge: boolean, nudge: NudgeState) => {
      const a = APPLICANTS_VIEW.applicants.find((x) => x.code === code)!;
      const st = stageOf(a, APPLICANTS_VIEW.now, APPLICANTS_VIEW.me);
      return renderToStaticMarkup(
        createElement(InterviewBlock, { a, st, cycle: APPLICANTS_VIEW.cycle, now: APPLICANTS_VIEW.now, canNudge, nudge, where: 'pv', onNudge: () => {}, onCancel: () => {}, onSend: () => {} }),
      );
    };
    // The same blocks with the mock cap do draw a nudge, so the live check is not empty.
    expect(codes.filter((c) => /data-ap-nudge/.test(block(c, true, 'none'))).length).toBeGreaterThan(1);
    for (const c of codes) for (const s of ['none', 'draft', 'sending', 'sent'] as NudgeState[]) expect(block(c, false, s)).not.toMatch(SEND);
  });
  it('live list: Export for admins only, never a nudge', () => {
    const board = (admin: boolean) => renderToStaticMarkup(createElement(ApplicantsBoard, { view: { ...APPLICANTS_VIEW, caps: liveCaps(admin) }, live: true }));
    expect(board(true)).toMatch(/ap-exp/);
    expect(board(false)).not.toMatch(/ap-exp/);
    expect(board(false)).not.toMatch(SEND);
  });
});

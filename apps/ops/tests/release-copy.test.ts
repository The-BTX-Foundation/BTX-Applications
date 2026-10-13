import { describe, expect, it } from 'vitest';
import { canShowRelease } from '@/lib/release';
import { emailLine, emailOutcome, releaseBody, releaseCounts, releaseTitle, releasedWhen } from '@/lib/release-copy';
import type { BatchResult } from '@/lib/email/send';

describe('canShowRelease', () => {
  it('shows the button to an admin once the main award is recorded', () => {
    expect(canShowRelease({ role: 'admin', hasMainAward: true, releasedAt: null })).toBe(true);
  });
  it('hides it from a board member without admin rights', () => {
    expect(canShowRelease({ role: 'board', hasMainAward: true, releasedAt: null })).toBe(false);
    expect(canShowRelease({ role: null, hasMainAward: true, releasedAt: null })).toBe(false);
  });
  it('hides it before the main award is recorded', () => {
    expect(canShowRelease({ role: 'admin', hasMainAward: false, releasedAt: null })).toBe(false);
  });
  it('hides it once decisions have gone out', () => {
    expect(canShowRelease({ role: 'admin', hasMainAward: true, releasedAt: '2026-11-23T14:00:00Z' })).toBe(false);
  });
});

describe('release copy', () => {
  const counts = { total: 18, mainName: 'Legacy', extras: 2, recorded: 3 };
  it('counts who won and who was not picked', () => {
    expect(releaseCounts(counts)).toBe('1 Legacy Scholarship, 2 extra awards, 15 not picked');
    expect(releaseCounts({ ...counts, won: true })).toBe('1 won the Legacy Scholarship, 2 extra awards, 15 not picked');
  });
  it('leaves out extra awards when there are none, and says "1 extra award" for one', () => {
    expect(releaseCounts({ ...counts, extras: 0, recorded: 1, won: true })).toBe('1 won the Legacy Scholarship, 17 not picked');
    expect(releaseCounts({ ...counts, extras: 1, recorded: 2 })).toBe('1 Legacy Scholarship, 1 extra award, 16 not picked');
  });
  it('never counts below zero', () => {
    expect(releaseCounts({ total: 1, mainName: 'Legacy', extras: 2, recorded: 3 })).toBe('1 Legacy Scholarship, 2 extra awards, 0 not picked');
  });
  it('titles the confirm step and says students see it in the Portal and that it cannot be undone', () => {
    expect(releaseTitle(18)).toBe('Release decisions to 18 applicants?');
    expect(releaseTitle(1)).toBe('Release decisions to 1 applicant?');
    const body = releaseBody('1 won the Legacy Scholarship, 15 not picked');
    expect(body).toContain('see their result in the Portal');
    expect(body).toContain('get an email');
    expect(body).toContain("can't be undone");
  });
  it('writes the release time in Eastern time', () => {
    expect(releasedWhen('2026-11-23T14:00:00Z')).toBe('Mon Nov 23, 9:00 AM');
    expect(releasedWhen('2026-10-23T14:00:00Z')).toBe('Fri Oct 23, 10:00 AM');
  });
});

describe('emails after release', () => {
  const ok = (o: Partial<Extract<BatchResult, { ok: true }>>): BatchResult => ({ ok: true, kind: 'decisions', sent: 0, skipped: 0, failed: 0, notConfigured: false, at: '2026-11-23T14:00:00Z', ...o });
  it('says plainly when email is not set up', () => {
    expect(emailLine(emailOutcome(ok({ notConfigured: true })))).toBe("Email isn't set up here, so no emails went out.");
    expect(emailLine(emailOutcome({ ok: false, reason: 'no-service-key' }))).toBe("Email isn't set up here, so no emails went out.");
  });
  it('counts sent, skipped and failed', () => {
    expect(emailLine(emailOutcome(ok({ sent: 18 })))).toBe('18 emails sent.');
    expect(emailLine(emailOutcome(ok({ sent: 1 })))).toBe('1 email sent.');
    expect(emailLine(emailOutcome(ok({ sent: 15, skipped: 2, failed: 1 })))).toBe('15 emails sent, 2 skipped, 1 failed.');
  });
  it('does not claim emails went out when the send was refused', () => {
    expect(emailLine(emailOutcome({ ok: false, reason: 'not-released' }))).toBe("Decisions are out, but the emails didn't send.");
    expect(emailLine(emailOutcome({ ok: false, reason: 'not-admin' }))).toBe("Decisions are out, but the emails didn't send.");
  });
});

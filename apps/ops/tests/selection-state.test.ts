// The Selection board's state rules (lib/selection-state.ts): the failure-then-re-read path, freshness, focus targets,
// failure wording, the released lines (including the partial-send warning) and the two-main-awards guard.
import { describe, expect, it } from 'vitest';
import { emailLine, type EmailOutcome } from '@/lib/release-copy';
import { NO_ANSWER, SAVE_ERR } from '@/lib/selection-map';
import {
  PARTIAL_EMAILS,
  UNCONFIRMED_EMAILS,
  canSettleCheck,
  confirmOpener,
  failText,
  focusAfterRecord,
  notReleasedLine,
  pickMeeting,
  relAfterReread,
  releasedLines,
  twoMainsWarning,
} from '@/lib/selection-state';
import type { SlAward } from '@/lib/selection-view';

describe('a release that failed or never answered', () => {
  it('waits for data read after the attempt', () => {
    expect(canSettleCheck({ rel: 'checking', idle: true, from: 't1', now: 't1' })).toBe(false);
    expect(canSettleCheck({ rel: 'checking', idle: false, from: 't1', now: 't2' })).toBe(false);
    expect(canSettleCheck({ rel: 'checking', idle: true, from: null, now: 't2' })).toBe(false);
    expect(canSettleCheck({ rel: 'confirm', idle: true, from: 't1', now: 't2' })).toBe(false);
    expect(canSettleCheck({ rel: 'checking', idle: true, from: 't1', now: 't2' })).toBe(true);
  });

  it('then says what the fresh data shows', () => {
    expect(relAfterReread({ loadFailed: true, releasedAt: null })).toBe('check-failed');
    expect(relAfterReread({ loadFailed: false, releasedAt: '2026-11-25T01:00:00Z' })).toBe('was-released');
    expect(relAfterReread({ loadFailed: false, releasedAt: null })).toBe('not-released');
  });

  it('says one consistent line when nothing was released', () => {
    expect(notReleasedLine("Couldn't release. Try again.")).toBe("Couldn't release. Decisions weren't released, so no emails went out. Reload the page before trying again.");
    expect(notReleasedLine('No answer in time.')).toBe("No answer in time. Decisions weren't released, so no emails went out. Reload the page before trying again.");
    expect(notReleasedLine('')).toBe("Decisions weren't released, so no emails went out. Reload the page before trying again.");
    expect(notReleasedLine('Only a board member with admin rights can send decisions')).toMatch(/^Only .*decisions\. Decisions weren't/);
  });
});

describe('the lines under Released', () => {
  const sent: EmailOutcome = { state: 'sent', sent: 21, skipped: 0, failed: 0 };
  const failed: EmailOutcome = { state: 'failed' };
  it('adds the partial-send warning beside the release-copy line', () => {
    expect(releasedLines({ emailLine: emailLine(sent), emails: sent, rel: 'idle' })).toEqual(['21 emails sent.']);
    expect(releasedLines({ emailLine: emailLine(failed), emails: failed, rel: 'idle' })).toEqual(["Decisions are out, but the emails didn't send.", PARTIAL_EMAILS]);
    expect(PARTIAL_EMAILS).toBe("Decisions are released. We could not confirm that every email went out: some may have. Don't release again.");
  });

  it('points to a reload when the release never answered but went out', () => {
    expect(releasedLines({ emailLine: null, emails: null, rel: 'was-released' })).toEqual([UNCONFIRMED_EMAILS]);
    expect(UNCONFIRMED_EMAILS).toContain("Reload the page to see the current state. Don't release again.");
    expect(releasedLines({ emailLine: null, emails: null, rel: 'idle' })).toEqual(['Each student sees the result in the Portal.']);
  });
});

describe('writes', () => {
  it('words a failure', () => {
    expect(failText({ kind: 'refused', message: 'That applicant already has an award.' })).toBe('That applicant already has an award.');
    expect(failText({ kind: 'refused', message: '' })).toBe(SAVE_ERR);
    expect(failText({ kind: 'unknown' })).toBe(NO_ANSWER);
    expect(failText({ kind: 'failed' })).toBe(SAVE_ERR);
  });

  it('moves focus to Undo after a save, to the error line after an extra-award refusal', () => {
    expect(focusAfterRecord('main', { kind: 'saved', id: 'a1' })).toBe('undoMain');
    expect(focusAfterRecord('extra', { kind: 'saved', id: 'x9' })).toBe('undoX-x9');
    expect(focusAfterRecord('extra', { kind: 'refused', message: 'No.' })).toBe('recErr');
    expect(focusAfterRecord('main', { kind: 'unknown' })).toBe('recErr');
  });

  it('returns Escape and Back to the control that opened the confirm', () => {
    expect(confirmOpener('main')).toBe('recordMain');
    expect(confirmOpener('extra')).toBe('recordX');
    expect(confirmOpener('release')).toBe('release');
  });
});

describe('two main awards', () => {
  const m = (id: string): SlAward => ({ id, applicationId: id, code: id, name: id, kind: 'main', awardName: 'Legacy', amountCents: 1, decidedAt: null, letterDone: false });
  it('warns only when more than one main is recorded', () => {
    expect(twoMainsWarning([m('a')])).toBeNull();
    expect(twoMainsWarning([m('a'), { ...m('b'), kind: 'extra' }])).toBeNull();
    expect(twoMainsWarning([m('a'), m('b')])).toBe('Two main awards are recorded. Ask an admin to remove one before releasing.');
  });
});

describe('pickMeeting', () => {
  const now = '2026-11-20T12:00:00Z';
  it('takes the next upcoming meeting, else the most recent past one', () => {
    const old = { id: 'old', starts_at: '2026-04-01T23:00:00Z' };
    const past = { id: 'past', starts_at: '2026-11-19T23:00:00Z' };
    const next = { id: 'next', starts_at: '2026-11-25T00:00:00Z' };
    const later = { id: 'later', starts_at: '2026-12-25T00:00:00Z' };
    expect(pickMeeting([old, later, next, past], now)?.id).toBe('next');
    expect(pickMeeting([old, past], now)?.id).toBe('past');
    expect(pickMeeting([], now)).toBeUndefined();
    expect(pickMeeting([{ id: 'bad', starts_at: null }], now)).toBeUndefined();
  });
});

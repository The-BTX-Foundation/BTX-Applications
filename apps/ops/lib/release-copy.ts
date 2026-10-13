// The words on the Selection page's "Release decisions" steps (the ready card, the confirm step and the after state),
// kept apart from the screen so the unit tests (tests/release-copy.test.ts) can check them.
import type { BatchResult } from './email/send';

/** What happened to the emails after the release. */
export type EmailOutcome = { state: 'sent'; sent: number; skipped: number; failed: number } | { state: 'not-configured' } | { state: 'failed' };

/** Turns the email batch's answer into what the page tells the board. Never claims emails went out when they did not. */
export function emailOutcome(r: BatchResult): EmailOutcome {
  if (!r.ok) return r.reason === 'no-service-key' ? { state: 'not-configured' } : { state: 'failed' };
  if (r.notConfigured) return { state: 'not-configured' };
  return { state: 'sent', sent: r.sent, skipped: r.skipped, failed: r.failed };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line under "Released ...": how many emails went out, and how many were skipped or failed. */
export function emailLine(o: EmailOutcome): string {
  if (o.state === 'not-configured') return "Email isn't set up here, so no emails went out.";
  if (o.state === 'failed') return "Decisions are out, but the emails didn't send.";
  const parts = [`${plural(o.sent, 'email', 'emails')} sent`];
  if (o.skipped > 0) parts.push(`${o.skipped} skipped`);
  if (o.failed > 0) parts.push(`${o.failed} failed`);
  return `${parts.join(', ')}.`;
}

/**
 * What the release covers. The card says "1 Legacy Scholarship, 2 extra awards, 15 not picked"; the confirm step says
 * "1 won the Legacy Scholarship, 2 extra awards, 15 not picked" (won: true). Extra awards are left out when there are none.
 */
export function releaseCounts(i: { total: number; mainName: string; extras: number; recorded: number; won?: boolean }): string {
  const notPicked = Math.max(0, i.total - i.recorded);
  const parts = [i.won ? `1 won the ${i.mainName} Scholarship` : `1 ${i.mainName} Scholarship`];
  if (i.extras > 0) parts.push(plural(i.extras, 'extra award', 'extra awards'));
  parts.push(`${notPicked} not picked`);
  return parts.join(', ');
}

/** The confirm step's heading. */
export const releaseTitle = (total: number) => `Release decisions to ${plural(total, 'applicant', 'applicants')}?`;

/** The confirm step's body: who gets what, what students see, and that it cannot be undone. */
export const releaseBody = (counts: string) => `${counts}. Students see their result in the Portal and get an email. This can't be undone.`;

/** "Mon Nov 23, 9:00 AM" in Eastern time, for "Released ...". */
export function releasedWhen(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(d).replace(',', '');
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day}, ${time}`;
}

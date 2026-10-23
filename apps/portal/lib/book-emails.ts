// Books or switches an interview time AND sends the emails that go with it. SERVER ONLY.
//
// The booking itself is the database function switch_booking, called as the signed-in student (so her own session and
// the database's rules decide). Around it, with the service role:
//   BEFORE  read the slot she holds now and who interviews it (the old pairing goes when she leaves the slot);
//   AFTER   read the new slot's pairing (the database pairs two interviewers when the booking is written) and send
//           "Your interview is booked" with a calendar invite to her and both interviewers; and, if she moved, a
//           her booked email says "moved" and its REQUEST (same UID, one calendar entry per interview) moves her
//           existing event; the OLD slot's interviewers who are not on the new pair get a CANCEL; those on both pairs get
//           only the new REQUEST, so their event updates.
// Emails never undo or fail a booking: any problem sending is logged and the booking result is returned as it was.
// 'unchanged' (the same time again, maybe a new note) and 'taken' send nothing. Each email goes out once (email_log).
import { deliverOnce, planBooked, planCancel, sendMail, type InterviewRow, type MailLog, type Mail, type Planned, type SendResult } from '@btx/emails';
import type { BookResult } from '@btx/data';
import { planBookedPushes, planCancelledPushes, type PushItem } from '@btx/push';

export type BookEmailDeps = {
  /** The switch_booking call as the signed-in student. */
  book: (slotId: string, note?: string) => Promise<BookResult>;
  /** The slot she holds now (active booking), or null. Service role. */
  heldSlot: () => Promise<string | null>;
  interviews: (slotIds: string[]) => Promise<InterviewRow[]>;
  cycleInfo: (cycleId: string) => Promise<{ term: string; award: string }>;
  log: MailLog;
  /** Sends pushes to the interviewers' phones (the Ops Hub iPhone app). Optional; a push problem never changes the booking. */
  push?: (items: PushItem[]) => Promise<unknown>;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  from: string | undefined;
  portalUrl: string;
  pauseMs?: number;
  /** Runs the emails after the answer goes back (Next's after()). The default runs them first. */
  later?: (work: () => Promise<void>) => void | Promise<void>;
};

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export async function bookAndNotify(slotId: string, note: string | undefined, d: BookEmailDeps): Promise<BookResult> {
  // Best effort: if the old pairing cannot be read, the booking still goes ahead.
  let before: InterviewRow | null = null;
  try {
    const held = await d.heldSlot();
    if (held && held !== slotId) before = (await d.interviews([held]))[0] ?? null;
  } catch (err) {
    console.error('[book] could not read the current booking', err);
  }

  const result = await d.book(slotId, note);
  if (!result.ok || (result.result !== 'booked' && result.result !== 'switched')) return result;

  const work = async () => {
    try {
      const after = (await d.interviews([slotId]))[0];
      if (!after) return;
      // Pushes first (they are quick; the emails are paced), in their own try so neither can stop the other.
      if (d.push) {
        try {
          const moved = result.result === 'switched';
          // Each booking action is its own push (a student who goes A, B, A, B gets her interviewers four pushes), so the key carries a per-request nonce.
          const nonce = crypto.randomUUID();
          await d.push([...planBookedPushes(after, moved ? 'moved' : 'booked', { nonce }), ...(moved && before ? planCancelledPushes(before, after, { nonce }) : [])]);
        } catch (err) {
          console.error('[book] could not send the interview pushes', err instanceof Error ? err.message : 'unknown');
        }
      }
      const info = await d.cycleInfo(after.cycleId);
      const ctx = { ...info, portalUrl: d.portalUrl, now: new Date() };
      const plans: Planned[] = [...planBooked(after, ctx, { moved: result.result === 'switched' }), ...(result.result === 'switched' && before ? planCancel(before, ctx, after) : [])];
      for (const { claim, mail } of plans) {
        const r = await deliverOnce(d.log, claim, mail, d.from, d.send ?? sendMail);
        if (r === 'sent') await wait(d.pauseMs ?? 550);
      }
    } catch (err) {
      console.error('[book] could not send the booking emails', err);
    }
  };
  if (d.later) await d.later(work);
  else await work();
  return result;
}

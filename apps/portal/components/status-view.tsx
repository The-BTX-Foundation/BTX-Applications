// The page after submitting (drafts status-wait.html and status-wait-phone.html): "Application submitted.", the
// submit time, the dates drawing from the cycle, things to do while waiting, and the Follow BTX card.
import { DatesDrawing, HELP_EMAIL, Icon, TopBar } from '@btx/ui';
import type { CycleView } from '@/lib/cycle';
import { daysBetween, easternDate, longDay, shortDay } from '@/lib/format';
import { LINKEDIN_URL } from '@/lib/config';
import { PrintLink } from './print-link';
import s from './status-view.module.css';

// "Sat Sep 12, 4:52 PM" in Eastern time.
function stamp(ts: string): string {
  const d = new Date(ts);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(d).replace(',', '');
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day}, ${time}`;
}

export function StatusView({
  view,
  accountName,
  email,
  code,
  submittedAt,
  today,
}: {
  view: CycleView;
  accountName: string;
  email: string;
  /** The application number, like APP-2026-00016 (left out in review mode, as the drafts show none). */
  code?: string;
  submittedAt: string;
  /** "YYYY-MM-DD" for the Today marker. */
  today: string;
}) {
  const d = view.drawing;
  const start = easternDate(submittedAt);
  // Dates relative to the day she submitted, so the line starts at "Applied".
  const drawing = d
    ? {
        mode: 'submitted' as const,
        days: {
          apply: 0,
          interviewStart: daysBetween(start, d.interviewStart),
          interviewEnd: daysBetween(start, d.interviewEnd),
          decision: daysBetween(start, d.decision),
          today: Math.max(0, daysBetween(start, today)),
        },
        dates: { opens: '', apply: '', interview: `${shortDay(d.interviewStart)} to ${shortDay(d.interviewEnd)}`, decision: shortDay(d.decision) },
      }
    : { mode: 'submitted' as const, dates: { opens: '', apply: '', interview: '[date]', decision: '[date]' } };
  const interviewDay = d ? longDay(d.interviewStart) : '[date]';

  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={accountName} />
      <main id="main" className={`pm ${s.page}`}>
        <div className={s.wrap}>
          <p className={s.stamp}>
            {code ? `Application ${code}. ` : ''}Submitted {stamp(submittedAt)}. Copy sent to {email}
          </p>
          <h1 className={s.title}>Application submitted.</h1>
          <p className={s.lead}>We&apos;ll email you {interviewDay} to schedule your video interview.</p>
          {/* TODO: the confirmation email itself ("Copy sent to ...") is sent later; this line is text only for now. */}
          <p className={s.copy}>
            {code ? `Application ${code}. ` : ''}Copy sent to {email}
          </p>
          <div className={s.drawing}>
            <DatesDrawing {...drawing} />
          </div>
          <div className={s.cols}>
            <div className={s.c1}>
              <p className={s.label}>While you wait</p>
              <div className={s.pick}>
                <a href="#" className={s.pickRow}>
                  <Icon name="file" />
                  <span className="lk">How to prepare for your interview</span>
                </a>
                <a href="#" className={s.pickRow}>
                  <Icon name="people" />
                  <span className="lk">What BTX offers students</span>
                </a>
                <div className={s.pickRow}>
                  <Icon name="check" />
                  <span>Certification program: we&apos;ll email you when it opens</span>
                </div>
              </div>
              <div className={s.foot}>
                <PrintLink className={s.footLink} />
                <span className={s.questions}>
                  Questions?{' '}
                  <a href={`mailto:${HELP_EMAIL}`} className="lk">
                    {HELP_EMAIL}
                  </a>
                </span>
              </div>
            </div>
            <div className={s.c2}>
              <section className={s.follow}>
                <span className={s.bar} aria-hidden="true" />
                <h2 className={s.followTitle}>Follow BTX</h2>
                <p className={s.followText}>Stories from BTX scholars, events and news.</p>
                <div className={s.links}>
                  <a href="https://www.instagram.com/btxfoundation" className={s.link}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="6" />
                      <circle cx="12" cy="12" r="4.2" />
                      <circle cx="17.4" cy="6.6" r="1.1" fill="var(--ink)" stroke="none" />
                    </svg>
                    <span>Instagram</span>
                    <b>@btxfoundation</b>
                    <Icon name="ext" small />
                  </a>
                  <a href={LINKEDIN_URL} className={s.link}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="var(--ink)"
                        fillRule="evenodd"
                        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                      />
                    </svg>
                    <span>LinkedIn</span>
                    <b>BTX Foundation</b>
                    <Icon name="ext" small />
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

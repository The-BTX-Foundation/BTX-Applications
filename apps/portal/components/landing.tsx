// The landing page in its three variants, picked from the cycle's dates:
//   open         applications are open        (drafts landing.html, landing-phone.html)
//   before-open  not open yet, "Opens Mon Aug 17."  (landing-soon.html, landing-soon-phone.html)
//   closed       closed, "The next cycle opens in October."  (landing-closed.html, landing-closed-phone.html)
// Empty cycle settings draw as the drafts' bracket placeholders.
import Link from 'next/link';
import { BottomBar, ButtonLink, DatesDrawing, Icon, TopBar } from '@btx/ui';
import type { CycleVariant } from '@btx/data';
import { drawingProps, type CycleView } from '@/lib/cycle';
import { PLACEHOLDER } from '@/lib/format';
import { NotifyForm } from './notify-form';
import s from './landing.module.css';

const WHO = [
  'Full-time Clark School undergraduate working toward a B.S. in engineering',
  '12 or more credits left in your program',
  'GPA of 2.5 or higher when you apply',
];
const NEED = ['Your Terpmail address', 'Your resume (PDF)', 'Your unofficial transcript (PDF), from Testudo'];
const NAME_FALLBACK = '[award name]';

// "Legacy Scholarship" -> ["The Legacy", "Scholarship."]
function headlineLines(name: string): [string, string] {
  const words = name.split(' ');
  if (words.length < 2) return ['The', `${name}.`];
  return [`The ${words.slice(0, -1).join(' ')}`, `${words[words.length - 1]}.`];
}

// The small external-link icon (20 x 20) used in "While you wait".
function ExtIcon() {
  return (
    <svg className="i" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11 3.5h5.5V9" />
      <path d="M16.5 3.5L9 11" />
      <path d="M14 11.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

// "While you wait": links and the two social accounts (closed landing). The targets are placeholders until the
// website addresses are decided (BUILD-PLAN.md, "Still owed").
function WhileYouWait() {
  return (
    <div className={`${s.block} ${s.wait}`}>
      <p className={s.waitHead}>While you wait</p>
      <ul className={s.waitList}>
        <li>
          <a href="#">
            <span className="lk">What BTX offers students</span>
            <ExtIcon />
          </a>
        </li>
        <li>
          <a href="#">
            <span className="lk">The certification program</span>
            <Icon name="right" small />
          </a>
        </li>
        <li>
          <a href="#">
            <span className="lk">Guides for students</span>
            <ExtIcon />
          </a>
        </li>
      </ul>
      <div className={s.social}>
        <a href="https://www.instagram.com/btxfoundation" aria-label="BTX Foundation on Instagram, @btxfoundation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="6" />
            <circle cx="12" cy="12" r="4.2" />
            <circle cx="17.4" cy="6.6" r="1.1" fill="var(--ink)" stroke="none" />
          </svg>
          <span>@btxfoundation</span>
        </a>
        <a href="#" aria-label="BTX Foundation on LinkedIn">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="var(--ink)"
              fillRule="evenodd"
              d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
            />
          </svg>
          <span>BTX Foundation</span>
        </a>
      </div>
    </div>
  );
}

export function Landing({ variant, view }: { variant: CycleVariant; view: CycleView }) {
  const name = view.awardName ?? NAME_FALLBACK;
  const season = view.term?.split(' ')[0].toLowerCase() ?? 'fall';
  const [l1, l2] = headlineLines(name);
  const root = variant === 'before-open' ? s.soon : variant === 'closed' ? s.closed : s.open;
  const closed = variant === 'closed';
  const soon = variant === 'before-open';
  const open = variant === 'open';

  return (
    <div className="app">
      <TopBar variant="signed-out" />
      <main className={`pm ${root}`}>
        <div className={s.top}>
          <div className={s.left}>
            <p className={s.status}>
              <span className={open ? 'gd' : `gd ${s.dotOpen}`} aria-hidden="true" />
              {open ? (
                <span>
                  Applications are open. Apply by {view.applyByLong}
                  <span className={s.laptopOnly}>, {view.deadlineTime} Eastern</span>.
                </span>
              ) : soon ? (
                <span>
                  The {name}
                  {view.term ? `, ${view.term}` : ''}
                </span>
              ) : (
                <span>The {name}</span>
              )}
            </p>
            <h1 className={`st ${s.headline}`}>
              {open ? (
                <>
                  {l1}
                  <br />
                  {l2}
                </>
              ) : soon ? (
                <>
                  Opens
                  <br />
                  {view.opensLong}.
                </>
              ) : (
                <>
                  Closed for
                  <br />
                  {view.term ? `${view.term}.` : 'now.'}
                </>
              )}
            </h1>
            <p className={s.lead}>
              {open ? (
                <>
                  {view.amount} for one Clark School engineering undergraduate this {season}. Apply once. Everyone who
                  interviews is considered for extra&nbsp;awards.
                </>
              ) : soon ? (
                <>
                  {view.amount} for one Clark School engineering undergraduate this {season}.
                </>
              ) : (
                <>The next cycle opens in {view.nextMonth}.</>
              )}
            </p>
            {open ? (
              <>
                <div className={s.row}>
                  <ButtonLink size="xl" href="/sign-in">
                    Start your application
                  </ButtonLink>
                  <p>
                    About 10 minutes.
                    <br />
                    Your answers save as you go.
                  </p>
                </div>
                <p className={s.minutes}>
                  About 10 minutes with your resume and transcript PDFs ready. Your answers save as you go.
                </p>
              </>
            ) : soon ? (
              <NotifyForm kind="applications_open" label="Email me when applications open" when="applications open" />
            ) : (
              <NotifyForm kind="next_cycle" label="Email me when the next cycle opens" when="the next cycle opens" />
            )}
            {soon ? null : (
              <p className={s.sub}>
                {open ? 'Started or already applied?' : 'Already applied?'}&nbsp;
                <Link href="/sign-in" className="lk">
                  {closed ? (
                    <>
                      <span className={s.laptopOnly}>Sign in to see your status</span>
                      <span className={s.phoneOnly}>Sign in</span>
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Link>
              </p>
            )}
          </div>
          <aside className={s.card} aria-label="Who can apply and what you need">
            <div className={s.block}>
              <h2>Who can apply</h2>
              <ul className="ed">
                {WHO.map((t) => (
                  <li key={t}>{t}</li>
                ))}
                {view.requirements.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {view.requirements.length === 0 ? <p className={s.note}>{view.awardName ? `[${name.split(' ')[0]} requirements to confirm]` : '[Requirements to confirm]'}</p> : null}
            </div>
            {closed ? null : (
              <div className={s.block}>
                <h2>What you&apos;ll need</h2>
                <ul className="ed">
                  {NEED.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {closed ? <WhileYouWait /> : null}
            <div className={`${s.block} ${s.nomination}`}>
              <p className={s.strong}>No nomination needed.</p>
              {closed ? null : <p className={s.after}>After you apply, you&apos;ll have a virtual interview.</p>}
            </div>
          </aside>
        </div>
        {closed ? null : (
          <section className={s.dates}>
            <h2>{view.term ?? PLACEHOLDER.date} dates.</h2>
            <DatesDrawing {...drawingProps(view, soon ? 'before' : 'open')} />
          </section>
        )}
      </main>
      {open ? (
        <BottomBar className={s.phoneBar} primary={<ButtonLink href="/sign-in">Start your application</ButtonLink>} />
      ) : null}
    </div>
  );
}

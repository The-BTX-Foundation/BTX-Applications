// The open landing page (draft landing.html on laptop, landing-phone.html on phone).
import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomBar, ButtonLink, DatesDrawing, TopBar } from '@btx/ui';
import { cycle } from '@/lib/cycle';
import s from './landing.module.css';

export const metadata: Metadata = { title: 'The Legacy Scholarship' };

// The three diamond lists on the page.
const WHO = [
  'Full-time Clark School undergraduate working toward a B.S. in engineering',
  '12 or more credits left in your program',
  'GPA of 2.5 or higher when you apply',
];
const NEED = ['Your Terpmail address', 'Your resume (PDF)', 'Your unofficial transcript (PDF), from Testudo'];

export default function LandingPage() {
  return (
    <div className="app">
      <TopBar variant="signed-out" />
      <main className="pm">
        <div className={s.top}>
          <div className={s.left}>
            <p className={s.status}>
              <span className="gd" aria-hidden="true" />
              <span>
                Applications are open. Apply by {cycle.applyBy}
                <span className={s.laptopOnly}>, {cycle.deadlineTime} Eastern</span>.
              </span>
            </p>
            <h1 className={`st ${s.headline}`}>
              The Legacy
              <br />
              Scholarship.
            </h1>
            <p className={s.lead}>
              {cycle.amount} for one Clark School engineering undergraduate this fall. Apply once. Everyone who
              interviews is considered for extra&nbsp;awards.
            </p>
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
            <p className={s.sub}>
              Started or already applied?&nbsp;
              <Link href="/sign-in" className="lk">
                Sign in
              </Link>
            </p>
          </div>
          <aside className={s.card} aria-label="Who can apply and what you need">
            <div className={s.block}>
              <h2>Who can apply</h2>
              <ul className="ed">
                {WHO.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className={s.note}>{cycle.requirementsNote}</p>
            </div>
            <div className={s.block}>
              <h2>What you&apos;ll need</h2>
              <ul className="ed">
                {NEED.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className={`${s.block} ${s.nomination}`}>
              <p className={s.strong}>No nomination needed.</p>
              <p className={s.after}>After you apply, you&apos;ll have a virtual interview.</p>
            </div>
          </aside>
        </div>
        <section className={s.dates}>
          <h2>{cycle.term} dates.</h2>
          <DatesDrawing />
        </section>
      </main>
      <BottomBar className={s.phoneBar} primary={<ButtonLink href="/sign-in">Start your application</ButtonLink>} />
    </div>
  );
}

// The decision screens on the status page: you won (drafts status-won, status-won-sent) and not picked (status-not),
// with their phone versions. Winner: "Congratulations", the next steps down a line of diamonds, and a preview of her
// scholar page. Not picked: thanks, no mention of other awards, and other ways BTX can help.
// Mock only until the Ops Hub tables (awards, award steps) are applied: see lib/journey-data.ts.
import Link from 'next/link';
import { HELP_EMAIL, Icon, TopBar } from '@btx/ui';
import { GUIDES_URL, LINKEDIN_URL } from '@/lib/config';
import { longDay } from '@/lib/format';
import type { AwardSample } from '@/lib/journey-demo';
import type { CycleView } from '@/lib/cycle';
import { PrintLink } from './print-link';
import { Name } from './text';
import d from './decision-status.module.css';

type Common = { accountName: string; firstName: string; fullName: string; view: CycleView; award: AwardSample };

const Instagram = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="6" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.4" cy="6.6" r="1.1" fill="var(--ink)" stroke="none" />
  </svg>
);
const LinkedIn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="var(--ink)"
      fillRule="evenodd"
      d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
    />
  </svg>
);

// A diamond on the next-steps line: done = small gold, now = big gold with an ink edge, next = open.
function Joint({ state }: { state: 'done' | 'now' | 'next' }) {
  return (
    <svg className={d.joint} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {state === 'done' ? (
        <path d="M12 3.5L20.5 12L12 20.5L3.5 12Z" fill="var(--gold)" />
      ) : state === 'now' ? (
        <path d="M12 1L23 12L12 23L1 12Z" fill="var(--gold)" stroke="var(--ink)" strokeWidth="1.5" />
      ) : (
        <path d="M12 5L19 12L12 19L5 12Z" fill="var(--bg)" stroke="var(--ink)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

function Foot() {
  return (
    <div className={d.foot}>
      <PrintLink className={d.footLink} />
      <span className={d.questions}>
        Questions?{' '}
        <a href={`mailto:${HELP_EMAIL}`} className="lk">
          {HELP_EMAIL}
        </a>
      </span>
    </div>
  );
}

export function WonStatus(p: Common & { sent: boolean; storyHref: string }) {
  const { view, award } = p;
  const first = <Name>{p.firstName}</Name>;
  const scholar = (view.awardName ?? 'Scholarship').replace(/ Scholarship$/, ' Scholar');
  const steps: { state: 'done' | 'now' | 'next'; date: string; title: string; text: string; action?: React.ReactNode }[] = [
    p.sent
      ? { state: 'done', date: `Sent ${award.sentDate}`, title: 'Photo and story sent', text: "We'll email you when your scholar page is live." }
      : {
          state: 'now',
          date: `Due ${view.photoDue}`,
          title: 'Add your photo and story',
          text: 'Your scholar page on the BTX website shows your photo and a few lines in your own words.',
          action: (
            <Link href={p.storyHref} className="btn p">
              Add your photo and story
            </Link>
          ),
        },
    { state: p.sent ? 'now' : 'next', date: award.payDate, title: `We send your ${view.amount}`, text: view.paymentNote },
    ...(view.eventOn
      ? [
          {
            state: 'next' as const,
            date: view.eventDate,
            title: 'Meet the board and the other scholars',
            text: view.eventDate === '[Event date]' ? "[Event]. We'll email you the details." : "We'll email you the details.",
          },
        ]
      : []),
  ];
  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={p.accountName} />
      <main id="main" className={`pm ${d.page}`}>
        <div className={d.wn}>
          <div className={d.wl}>
            <h1 className={d.h1}>Congratulations, {first}.</h1>
            <p className={d.lead}>
              The board picked you for the {view.term} {view.awardName}: {view.amount} toward your engineering degree.
            </p>
            <p className={`${d.label} ${d.sh}`}>Your next steps</p>
            <ol className={d.srs}>
              {steps.map((s, i) => (
                <li key={s.title} className={d.sr}>
                  {i < steps.length - 1 ? <span className={d.srLine} aria-hidden="true" /> : null}
                  <Joint state={s.state} />
                  <span className="cdt">{s.date}</span>
                  <b>{s.title}</b>
                  <p>{s.text}</p>
                  {s.action}
                </li>
              ))}
            </ol>
            <div className={d.lapFoot}>
              <Foot />
            </div>
          </div>
          <div className={d.wr}>
            <div className={d.scHd}>
              <p className={d.label}>Your scholar page</p>
              <span className={`mu ${d.lapOnly}`}>{p.sent ? 'In review' : 'Goes live after step 1'}</span>
            </div>
            <div className={d.sc}>
              <span className={d.scBar} aria-hidden="true" />
              <p className={d.scU}>thebtxfoundation.org/scholars/{award.slug}</p>
              <div className={d.scM}>
                <div className={`${d.scPh} ${award.photo ? d.scPhoto : ''}`}>
                  {award.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a small fixed-size preview of her uploaded photo
                    <img src={award.photo} alt="" />
                  ) : (
                    <>
                      <Icon name="user" />
                      <span>Your photo</span>
                    </>
                  )}
                </div>
                <div className={d.scId}>
                  <span className={d.scK}>
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M6 0.8L11.2 6L6 11.2L0.8 6Z" fill="var(--gold)" stroke="var(--ink)" strokeWidth="1" />
                    </svg>
                    <span className="cdt">
                      {scholar}, {view.term}
                    </span>
                  </span>
                  <p className={d.scN}>{p.fullName}</p>
                  <p className={d.scD}>{award.yearMajor}</p>
                  <p className={d.scS}>{award.school}</p>
                </div>
              </div>
              <p className={p.sent ? `${d.scSt} ${d.scStIn}` : d.scSt}>
                {p.sent ? award.story : "Your story goes here: a few lines about where you're from, what you study and what you want to build."}
              </p>
            </div>
            <p className={`${d.scNt} ${d.phoneOnly}`}>{p.sent ? "In review. We'll email you when it's live." : 'It goes live after you send your photo and story.'}</p>
            <p className={`${d.label} ${d.pkH}`}>As a BTX scholar</p>
            <div className={d.pk}>
              <div className={d.pkR}>
                <Icon name="people" />
                <span>Mentoring from board members and past scholars</span>
              </div>
              {award.certification ? (
                <div className={d.pkR}>
                  <Icon name="check" />
                  <span>Certification program: you&apos;re on the list</span>
                </div>
              ) : null}
              <div className={d.pkR}>
                <Instagram />
                <span>
                  Share the news and tag <b>@btxfoundation</b>
                </span>
              </div>
            </div>
            <div className={d.phoneOnly}>
              <Foot />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function NotPickedStatus(p: Common) {
  const { view, award } = p;
  const first = <Name>{p.firstName}</Name>;
  const share = `mailto:?subject=${encodeURIComponent(`The ${view.awardName ?? 'scholarship'}`)}&body=${encodeURIComponent('Applications for the BTX Foundation scholarship: https://thebtxfoundation.org')}`;
  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={p.accountName} />
      <main id="main" className={`pm ${d.page}`}>
        <div className={d.wn}>
          <div className={`${d.wl} ${d.nl}`}>
            <h1 className={`${d.h1} ${d.h1n}`}>Thank you, {first}.</h1>
            <p className={`${d.lead} ${d.leadN}`}>
              The board picked another applicant for the {view.awardName} this time. We appreciate the time you gave your application and your interview.
            </p>
            <p className={d.fb}>
              <Icon name="mail" />
              <span>Want to know how your interview went? Reply to your decision email and your interviewers will send a few notes.</span>
            </p>
            <p className={`${d.label} ${d.shN}`}>Other ways BTX can help</p>
            <div className={d.ops}>
              <div className={d.op}>
                <div className={d.opT}>
                  <b>Certification program</b>
                  <p>BTX pays the exam fee for a professional certification.</p>
                </div>
                {award.certification ? (
                  <div className={d.opS}>
                    <span className={d.opOn}>
                      <Icon name="check" />
                      You&apos;re on the list
                    </span>
                    <span className={d.opN}>We&apos;ll email you when it opens.</span>
                  </div>
                ) : null}
              </div>
              <div className={d.op}>
                <div className={d.opT}>
                  <b>Mentoring</b>
                  <p>Talk with a board member or a past BTX scholar about your classes, internships and plans.</p>
                </div>
                <div className={d.opS}>
                  <a href={`mailto:${HELP_EMAIL}?subject=${encodeURIComponent('Mentoring')}`} className="btn p">
                    <Icon name="mail" />
                    Ask about mentoring
                  </a>
                </div>
              </div>
              <div className={d.op}>
                <div className={d.opT}>
                  <b>Apply again in {view.nextMonth}</b>
                  <p>We&apos;ll email you the day the next cycle opens.</p>
                </div>
                <div className={d.opS}>
                  {award.reminder ? (
                    <>
                      <span className={d.opOn}>
                        <Icon name="check" />
                        Reminder on
                      </span>
                      <Link href="/" className={`lk ${d.opN} ${d.opLink}`}>
                        Change
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              <div className={d.op}>
                <div className={d.opT}>
                  <b>Guides for students</b>
                  <p>Short guides from the BTX board for engineering students.</p>
                </div>
                <div className={d.opS}>
                  <a href={GUIDES_URL} className={d.opX}>
                    <span className="lk">Read the guides</span>
                    <Icon name="ext" small />
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className={`${d.wr} ${d.nr}`}>
            <h2 className={d.cnH}>Stay connected</h2>
            <div className={d.cn}>
              <div className={d.cnR}>
                <Icon name="mail" />
                <div>
                  <b>BTX news</b>
                  <p>{award.news ? "You're signed up. About four emails a semester." : 'About four emails a semester.'}</p>
                </div>
                <a href={`mailto:${HELP_EMAIL}?subject=${encodeURIComponent('BTX news emails')}`} className={`lk ${d.cnChange}`}>
                  Change
                </a>
              </div>
              <a href="https://www.instagram.com/btxfoundation" className={`${d.cnR} ${d.cnA}`}>
                <Instagram />
                <span>Instagram</span>
                <b>@btxfoundation</b>
              </a>
              <a href={LINKEDIN_URL} className={`${d.cnR} ${d.cnA}`}>
                <LinkedIn />
                <span>LinkedIn</span>
                <b>BTX Foundation</b>
              </a>
              <div className={d.cnR}>
                <Icon name="people" />
                <div>
                  <b>Know a student who should apply?</b>
                  <p>
                    <a href={share} className="lk">
                      Share the {view.awardName}
                    </a>
                  </p>
                </div>
              </div>
            </div>
            <PrintLink className={d.npFt} />
          </div>
        </div>
      </main>
    </div>
  );
}

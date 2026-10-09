'use client';

// Step 2: This fall's scholarship (drafts step3.html and step3-phone.html). Shows what she is applying for, how the
// winner is chosen, and two optional boxes for other BTX programs. Name, amount and requirements come from the cycle;
// empty settings show their bracket placeholders. The boxes save as she ticks them.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox } from '@btx/ui';
import type { AppFile, Application } from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { savedTime } from '@/lib/format';
import { DEMO_SAVED, demoDone, railSteps } from '@/lib/steps';
import { STRESS } from '@/lib/stress';
import { useAutosave } from '@/lib/use-autosave';
import { ApplyShell } from './apply-shell';
import s from './scholarship-form.module.css';

export function ScholarshipForm({
  application,
  files,
  view,
  demo,
}: {
  application: Application | null;
  files: AppFile[];
  view: CycleView;
  demo?: string;
}) {
  const router = useRouter();
  const [cert, setCert] = useState(demo ? true : (application?.interest_certification ?? false));
  const [mentor, setMentor] = useState(application?.interest_mentoring ?? false);
  const [error, setError] = useState<string | null>(null);
  const auto = useAutosave(application?.id ?? null, application && application.updated_at !== application.created_at ? application.updated_at : null);
  const name = view.awardName ?? '[award name]';
  const season = view.term?.split(' ')[0] ?? 'Fall';
  const saved = demo ? DEMO_SAVED[2] : auto.failed ? "Couldn't save yet" : auto.savedAt ? `Saved ${savedTime(auto.savedAt)}` : undefined;

  // Continue: save both boxes and move to the essay (never backwards if she has been further).
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await auto.flush({
      interest_certification: cert,
      interest_mentoring: mentor,
      current_step: Math.max(application?.current_step ?? 1, 3),
    });
    if (ok) router.push('/apply/essay');
    else setError("We couldn't save your answers. Check your connection and try again.");
  }

  return (
    <ApplyShell
      current={2}
      steps={railSteps(application, files, 2, demo ? demoDone(2) : undefined)}
      view={view}
      accountName={demo ? (demo === 'stress' ? STRESS.name : 'Ebony Coleman') : application?.full_name || 'Your account'}
      saved={saved}
      onSubmit={onSubmit}
      backHref="/apply/basic-info"
      primary={<Button type="submit">Continue</Button>}
      wide
    >
      <h1 className="st">This {season.toLowerCase()}&apos;s scholarship.</h1>
      <p className="ld">Here&apos;s what you&apos;re applying for, and how the winner is chosen.</p>
      <div className={s.top}>
        <div className={s.card}>
          <div className={s.head}>
            <p className={s.name}>{name}</p>
            <p className={s.amount}>{view.amount}</p>
          </div>
          <div className={s.rule}>
            <p className="lb">How the winner is chosen</p>
            <ul className={s.list}>
              {[
                'You interview on video with two board members.',
                'Each of them scores the interview on their own.',
                `The top combined score wins the ${name}.`,
              ].map((t) => (
                <li key={t}>
                  <span className={s.dm} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={s.rule}>
            <p className="lb">Extra awards</p>
            <p className={s.text}>
              If more applicants stand out, the board can open an extra award after interviews, like the Empowerment
              Award. Everyone who interviews is considered. You don&apos;t apply for it.
            </p>
          </div>
          {view.requirements.length ? (
            <div className={s.rule}>
              <p className="lb">Requirements</p>
              <ul className={s.list}>
                {view.requirements.map((t) => (
                  <li key={t}>
                    <span className={s.dm} aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className={s.programs}>
        <p className="lb">
          Want to hear about other BTX programs? <i>(optional)</i>
        </p>
        <div className={s.grid}>
          <Checkbox
            card
            checked={cert}
            onChange={(v) => {
              setCert(v);
              auto.schedule({ interest_certification: v });
            }}
            label="Certification program"
            sub="BTX pays the exam fee for a professional certification. The first ones are being picked now."
          />
          <Checkbox
            card
            checked={mentor}
            onChange={(v) => {
              setMentor(v);
              auto.schedule({ interest_mentoring: v });
            }}
            label="Mentoring"
            sub="Board members and past scholars mentor students informally. We'll email you when an organized program starts."
          />
        </div>
      </div>
      {error ? (
        <p role="alert" style={{ marginTop: 24, fontSize: 15, fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
    </ApplyShell>
  );
}

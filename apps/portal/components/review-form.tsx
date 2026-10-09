'use client';

// Step 5: Review and submit (drafts step6.html, step6-phone.html and the failed state step6-failed*.html).
// Summarizes each step with an Edit link, then the two checkboxes. Submit calls the database function
// submit_application and turns its errors into the failed-submit box.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, ErrorIcon, ErrorSummary, Icon, type SummaryItem } from '@btx/ui';
import {
  getAuthMode,
  getBrowserClient,
  submitApplication,
  viewUrl,
  type AppFile,
  type Application,
  type SubmitResult,
} from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { LABELS } from '@/lib/basic-info';
import { savedTime } from '@/lib/format';
import { DEMO_SAVED, STEP_PATHS, demoDone, railSteps, stepsDone } from '@/lib/steps';
import { STRESS } from '@/lib/stress';
import { useAutosave } from '@/lib/use-autosave';
import { countWords } from '@/lib/words';
import { HELP_EMAIL } from '@btx/ui';
import { ApplyShell } from './apply-shell';
import { FileName, Name } from './text';
import { TerpmailRefusal } from './terpmail-refusal';
import s from './review-form.module.css';

// Database column -> the field id on the Basic info page and its label.
const COLUMN_FIELD: Record<string, { id: string; label: string }> = {
  full_name: { id: 'fullName', label: LABELS.fullName },
  phone: { id: 'phone', label: LABELS.phone },
  gender: { id: 'gender', label: LABELS.gender },
  race: { id: 'race', label: LABELS.race },
  heard_from: { id: 'hear', label: LABELS.hear },
  year_in_school: { id: 'year', label: LABELS.year },
  credits_left: { id: 'credits', label: LABELS.credits },
  major: { id: 'major', label: LABELS.major },
};

type Failure =
  | { kind: 'connection' }
  | { kind: 'closed' }
  | { kind: 'terpmail' }
  | { kind: 'missing'; items: SummaryItem[] };

const DEMO = {
  basic: 'Ebony Coleman, (301) 555-0148. Junior, Mechanical Engineering, 48 credits left.',
  words: 412,
  files: ['Coleman_Resume.pdf', 'Coleman_Unofficial_Transcript.pdf'],
};

export function ReviewForm({
  application,
  files,
  view,
  demo,
}: {
  application: Application | null;
  files: AppFile[];
  view: CycleView;
  /** Review mode: "1" or "failed". */
  demo?: string;
}) {
  const router = useRouter();
  const [stay, setStay] = useState(demo ? true : (application?.stay_in_touch ?? false));
  const [agreed, setAgreed] = useState(demo ? true : (application?.agreed_true ?? false));
  const [agreeError, setAgreeError] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(demo?.startsWith('failed') ? { kind: 'connection' } : demo === 'terpmail' ? { kind: 'terpmail' } : null);
  const [open, setOpen] = useState<'essay' | 'docs' | null>(null);
  const [busy, setBusy] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const auto = useAutosave(application?.id ?? null, application && application.updated_at !== application.created_at ? application.updated_at : null);
  const saved = demo ? DEMO_SAVED[5] : auto.failed ? "Couldn't save yet" : auto.savedAt ? `Saved ${savedTime(auto.savedAt)}` : undefined;

  const done = demo ? [true, true, true, true, false] : stepsDone(application, files);
  const a = application;
  const stress = Boolean(demo?.includes('stress'));
  const words = stress ? countWords(STRESS.essay) : demo ? DEMO.words : countWords(a?.essay ?? '');
  const name = view.awardName ?? '[award name]';
  const programs = [a?.interest_certification ? 'the certification program' : '', a?.interest_mentoring ? 'mentoring' : ''].filter(Boolean);
  const rows = [
    {
      step: 1,
      title: 'Basic info',
      text: stress ? (
        <>
          <Name>{STRESS.name}</Name>, (301) 555-0148. Sophomore, {STRESS.major}, 120 credits left.
        </>
      ) : demo ? (
        <>
          <Name>Ebony Coleman</Name>, (301) 555-0148. Junior, Mechanical Engineering, 48 credits left.
        </>
      ) : done[0] && a ? (
        <>
          <Name>{a.full_name ?? ''}</Name>, {a.phone}. {a.year_in_school}, {a.major}, {a.credits_left} credits left.
        </>
      ) : (
        'Some answers are missing.'
      ),
    },
    {
      step: 2,
      title: 'Scholarship and programs',
      text: demo ? `${name}, plus the certification program` : `${name}${programs.length ? `, plus ${programs.join(' and ')}` : ''}`,
    },
    { step: 3, title: 'Essay', text: words ? `${words} words` : 'No essay (optional)', view: words > 0 ? ('essay' as const) : undefined },
    {
      step: 4,
      title: 'Documents',
      text: (stress ? [STRESS.resume.name, STRESS.transcript.name] : demo ? DEMO.files : files.map((f) => f.filename)).length ? (
        (stress ? [STRESS.resume.name, STRESS.transcript.name] : demo ? DEMO.files : files.map((f) => f.filename)).map((n, i) => (
          <span key={n}>
            {i > 0 ? ', ' : ''}
            <FileName>{n}</FileName>
          </span>
        ))
      ) : (
        'No files yet.'
      ),
      view: files.length || demo ? ('docs' as const) : undefined,
    },
  ];

  // Opens one uploaded file in a new tab.
  async function openFile(path: string) {
    const url = await viewUrl(getBrowserClient(), path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  // Submit: save the two checkboxes, then ask the database to submit and map any error to the screen.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    if (!agreed) {
      setAgreeError(true);
      document.getElementById('agree')?.focus();
      return;
    }
    setAgreeError(false);
    if (demo) return;
    setBusy(true);
    let r: SubmitResult;
    if (getAuthMode() === 'mock' || !application) {
      await new Promise((res) => setTimeout(res, 300));
      r = { ok: true, code: 'APP-2026-00016' };
    } else {
      const saved = await auto.flush({ stay_in_touch: stay, agreed_true: agreed });
      r = saved ? await submitApplication(getBrowserClient(), application.id) : { ok: false, kind: 'network' };
    }
    setBusy(false);
    if (r.ok) {
      // the confirmation email is sent by the server (it only logs until the email service is configured)
      if (getAuthMode() !== 'mock') void fetch('/api/application-submitted', { method: 'POST' }).catch(() => {});
      router.push('/status');
      router.refresh();
      return;
    }
    if (r.kind === 'missing_answers') {
      setFailure({
        kind: 'missing',
        items: r.columns.map((c) => ({
          fieldId: COLUMN_FIELD[c]?.id ?? c,
          message: `${COLUMN_FIELD[c]?.label ?? c}: fill this in on Basic info.`,
          href: `${STEP_PATHS[0]}#${COLUMN_FIELD[c]?.id ?? c}`,
        })),
      });
    } else if (r.kind === 'missing_files') {
      setFailure({ kind: 'missing', items: [{ fieldId: 'docs', message: 'Documents: upload both your resume and your transcript.', href: STEP_PATHS[3] }] });
    } else if (r.kind === 'not_agreed') {
      setAgreeError(true);
    } else if (r.kind === 'terpmail_required') {
      setFailure({ kind: 'terpmail' });
    } else if (r.kind === 'cycle_closed') {
      setFailure({ kind: 'closed' });
    } else {
      setFailure({ kind: 'connection' });
    }
    setTimeout(() => {
      alertRef.current?.scrollIntoView({ block: 'center' });
      alertRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  return (
    <ApplyShell
      current={5}
      steps={railSteps(application, files, 5, demo ? demoDone(5) : undefined).map((st, i) => ({ ...st, done: done[i] }))}
      view={view}
      accountName={demo ? (demo.includes('stress') ? STRESS.name : 'Ebony Coleman') : application?.full_name || 'Your account'}
      saved={saved}
      onSubmit={onSubmit}
      backHref="/apply/documents"
      primary={
        <Button type="submit" disabled={busy}>
          Submit application
        </Button>
      }
      note="You can't edit after you submit."
      phoneNote
    >
      <h1 className="st">Review and submit.</h1>
      <p className="ld">
        <span className={s.laptopOnly}>Check your answers, then submit.</span>
        <span className={s.phoneOnly}>
          Check your answers, then submit by {view.applyByLong}, {view.deadlineTime} Eastern.
        </span>
      </p>
      {failure?.kind === 'terpmail' ? (
        <TerpmailRefusal className={s.fail} ref={alertRef} />
      ) : failure?.kind === 'connection' ? (
        <div className={`es ${s.fail}`} role="alert" tabIndex={-1} ref={alertRef}>
          <p>
            <ErrorIcon />
            <span>Your application wasn&apos;t submitted.</span>
          </p>
          <div className={s.failText}>
            The connection dropped while sending. Your answers and files are saved, so press Submit application again.
          </div>
          <div className={`${s.failText} ${s.small}`}>
            Still not working? Email{' '}
            <a href={`mailto:${HELP_EMAIL}`} className="lk">
              {HELP_EMAIL}
            </a>{' '}
            before the deadline, {view.applyByLong.replace(' ', ' ')}.
          </div>
        </div>
      ) : failure?.kind === 'closed' ? (
        <div className={`es ${s.fail}`} role="alert" tabIndex={-1} ref={alertRef}>
          <p>
            <ErrorIcon />
            <span>Your application wasn&apos;t submitted.</span>
          </p>
          <div className={s.failText}>The deadline has passed, so this cycle no longer takes applications.</div>
          <div className={`${s.failText} ${s.small}`}>
            Questions? Email{' '}
            <a href={`mailto:${HELP_EMAIL}`} className="lk">
              {HELP_EMAIL}
            </a>
            .
          </div>
        </div>
      ) : failure?.kind === 'missing' ? (
        <div className={s.fail}>
          <ErrorSummary items={failure.items} ref={alertRef} />
        </div>
      ) : null}
      <div className={failure ? `${s.list} ${s.listAfter}` : s.list}>
        {rows.map((r) => (
          <div className={s.row} key={r.step}>
            <span className={s.n}>
              {done[r.step - 1] ? <Icon name="check" /> : <span className={s.pending} aria-hidden="true" />}
              {r.title}
            </span>
            <span className={s.a}>{r.text}</span>
            <span className={r.view ? `${s.e} ${s.eMore}` : s.e}>
              {r.view ? (
                <button type="button" className="lk" aria-label={`View ${r.title}`} onClick={() => setOpen(open === r.view ? null : r.view!)}>
                  View
                </button>
              ) : null}
              <a href={STEP_PATHS[r.step - 1]} className="lk" aria-label={`Edit ${r.title}`}>
                Edit
              </a>
            </span>
            {open === 'essay' && r.view === 'essay' ? <p className={s.panel}>{a?.essay ?? 'Your essay appears here.'}</p> : null}
            {open === 'docs' && r.view === 'docs' ? (
              <p className={s.panel}>
                {files.map((f) => (
                  <button type="button" key={f.id} className="lk" onClick={() => void openFile(f.storage_path)} style={{ marginRight: 16 }}>
                    {f.kind === 'resume' ? 'Resume' : 'Transcript'}
                  </button>
                ))}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className={s.group}>
        <p className="lb">
          Stay in touch <i>(optional)</i>
        </p>
        <div className={s.boxes}>
          <Checkbox
            checked={stay}
            onChange={(v) => {
              setStay(v);
              auto.schedule({ stay_in_touch: v });
            }}
            text="Email me when the next cycle opens, plus BTX news. About four emails a&nbsp;semester."
          />
        </div>
      </div>
      <div className={`${s.group} ${s.last}`}>
        <p className="lb">Before you submit</p>
        <div className={s.boxes}>
          <Checkbox
            id="agree"
            checked={agreed}
            onChange={(v) => {
              setAgreed(v);
              if (v) setAgreeError(false);
              auto.schedule({ agreed_true: v });
            }}
            text={
              <>
                My answers are true, and I&apos;ve read the <span className="lk">scholarship terms</span> and{' '}
                <span className="lk">privacy policy</span>.
              </>
            }
          />
          {agreeError ? (
            <p className="em" role="alert">
              <ErrorIcon />
              <span>Check the box to confirm your answers are true.</span>
            </p>
          ) : null}
        </div>
      </div>
    </ApplyShell>
  );
}

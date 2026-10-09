'use client';

// Step 1 of the application: Basic info (drafts step1.html on laptop, step1-phone.html on phone).
// Validation follows the BTX form rule: Continue is never disabled. A field shows its error when you leave it
// (or after Continue), and Continue also puts a summary at the top that links to each problem.
import { useEffect, useRef, useState } from 'react';
import {
  BottomBar,
  Button,
  ButtonLink,
  ErrorSummary,
  Segmented,
  SelectField,
  StepProgress,
  StepRail,
  TextField,
  TopBar,
  type Step,
  type SummaryItem,
} from '@btx/ui';
import { getSignedInEmail } from '@btx/data';
import { cycle } from '@/lib/cycle';
import {
  EMPTY,
  GENDERS,
  HEARD_FROM,
  LABELS,
  MAJORS,
  ORDER,
  RACES,
  YEARS,
  fieldError,
  formatPhone,
  type BasicInfo,
  type FieldKey,
} from '@/lib/basic-info';
import s from './basic-info-form.module.css';

const STEPS: Step[] = [
  { name: 'Basic info', status: 'In progress' },
  { name: 'Scholarship and programs', status: 'Not started' },
  { name: 'Essay', status: 'Optional' },
  { name: 'Documents', status: 'Not started' },
  { name: 'Review and submit', status: 'Not started' },
];

// The sample answers from the draft (Ebony Coleman, phone one digit short), shown with ?demo=1 for design review.
const DEMO: BasicInfo = {
  ...EMPTY,
  fullName: 'Ebony Coleman',
  phone: '(301) 555-014',
  gender: 'Female',
  race: 'Black or African American',
  hear: 'A friend or mentor shared it with me',
};

export function BasicInfoForm({ demo }: { demo?: boolean }) {
  const [v, setV] = useState<BasicInfo>(demo ? DEMO : EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>(demo ? { phone: true } : {});
  const [submitted, setSubmitted] = useState(false);
  const [good, setGood] = useState(false);
  const [email, setEmail] = useState(demo ? 'ecoleman@terpmail.umd.edu' : '');
  const summary = useRef<HTMLDivElement>(null);

  // Reads the signed-in Terpmail address for the read-only field.
  useEffect(() => {
    if (demo) return;
    let live = true;
    getSignedInEmail().then((e) => {
      if (live && e) setEmail(e);
    });
    return () => {
      live = false;
    };
  }, [demo]);

  // Updates one answer; the other flags reset so old messages do not linger after an edit.
  function set<K extends FieldKey>(key: K, value: string) {
    setV((prev) => ({ ...prev, [key]: value }));
    setGood(false);
  }

  // Marks a field as visited so its error can show.
  function touch(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  // The message to draw on a field: only after the field was left or Continue was pressed.
  function shown(key: FieldKey): string | undefined {
    return touched[key] || submitted ? (fieldError(key, v) ?? undefined) : undefined;
  }

  const items: SummaryItem[] = submitted
    ? ORDER.flatMap((k) => {
        const m = fieldError(k, v);
        return m ? [{ fieldId: k, message: `${LABELS[k]}: ${m}` }] : [];
      })
    : [];

  // Continue: show every problem with a summary, or accept the answers.
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const bad = ORDER.some((k) => fieldError(k, v));
    setGood(!bad);
    if (bad) {
      // wait a tick so the summary is in the page, then move focus to it
      setTimeout(() => {
        summary.current?.scrollIntoView({ block: 'center' });
        summary.current?.focus({ preventScroll: true });
      }, 0);
    }
  }

  const saved = demo ? 'Saved 4:12 PM' : undefined;

  return (
    <div className="app">
      <TopBar
        variant="signed-in"
        accountName={demo ? 'Ebony Coleman' : 'Your account'}
        progress={<StepProgress total={STEPS.length} current={1} saved={saved} />}
      />
      <form className="wiz" onSubmit={onSubmit} noValidate>
        <StepRail
          steps={STEPS}
          current={1}
          subtitle={`${cycle.scholarshipName}. Apply by ${cycle.applyBy}, ${cycle.deadlineTime} Eastern.`}
          saved={saved}
        />
        <div className="wiz-main">
          <main className="wk">
            <div className="col">
              <h1 className="st">Basic info.</h1>
              <p className="ld">Tell us who you are and where you are in school.</p>
              {items.length ? (
                <div className={s.summary}>
                  <ErrorSummary items={items} ref={summary} />
                </div>
              ) : null}
              <div className={s.grid}>
                <TextField
                  id="fullName"
                  label="Full name"
                  className={s.name}
                  autoComplete="name"
                  value={v.fullName}
                  error={shown('fullName')}
                  onChange={(e) => set('fullName', e.target.value)}
                  onBlur={() => touch('fullName')}
                />
                <TextField
                  id="terpmail"
                  label="Terpmail address"
                  note="(from your sign-in)"
                  className={s.terp}
                  readOnlyLock
                  value={email}
                  placeholder="yourname@terpmail.umd.edu"
                  onChange={() => {}}
                />
                <TextField
                  id="secondaryEmail"
                  label="Secondary email"
                  note="(optional)"
                  className={s.secondary}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={v.secondaryEmail}
                  error={shown('secondaryEmail')}
                  onChange={(e) => set('secondaryEmail', e.target.value)}
                  onBlur={() => touch('secondaryEmail')}
                />
                <TextField
                  id="phone"
                  label="Phone number"
                  className={s.phone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={v.phone}
                  error={shown('phone')}
                  onChange={(e) => set('phone', e.target.value)}
                  onBlur={() => {
                    set('phone', formatPhone(v.phone));
                    touch('phone');
                  }}
                />
                <Segmented
                  id="gender"
                  label="Gender"
                  options={GENDERS}
                  value={v.gender}
                  error={shown('gender')}
                  onChange={(x) => {
                    set('gender', x);
                    touch('gender');
                  }}
                />
                <SelectField
                  id="race"
                  label="Race"
                  options={RACES}
                  value={v.race}
                  error={shown('race')}
                  onChange={(e) => set('race', e.target.value)}
                  onBlur={() => touch('race')}
                />
                <SelectField
                  id="hear"
                  label="How did you hear about this scholarship?"
                  options={HEARD_FROM}
                  value={v.hear}
                  error={shown('hear')}
                  onChange={(e) => set('hear', e.target.value)}
                  onBlur={() => touch('hear')}
                />
                <Segmented
                  id="year"
                  label="Year in school"
                  options={YEARS}
                  gridOnPhone
                  value={v.year}
                  error={shown('year')}
                  onChange={(x) => {
                    set('year', x);
                    touch('year');
                  }}
                />
                <TextField
                  id="credits"
                  label="Credits left to finish your degree"
                  inputMode="numeric"
                  placeholder="For example, 48"
                  value={v.credits}
                  error={shown('credits')}
                  onChange={(e) => set('credits', e.target.value)}
                  onBlur={() => touch('credits')}
                />
                <SelectField
                  id="major"
                  label="Major"
                  placeholder="Choose your major"
                  options={MAJORS}
                  value={v.major}
                  error={shown('major')}
                  onChange={(e) => set('major', e.target.value)}
                  onBlur={() => touch('major')}
                />
              </div>
              {good ? (
                <p className={s.good} role="status">
                  Every answer looks good. The next step is not built yet.
                </p>
              ) : null}
            </div>
          </main>
          <BottomBar
            back={
              <ButtonLink kind="s" icon="left" href="/">
                Back
              </ButtonLink>
            }
            primary={<Button type="submit">Continue</Button>}
          />
        </div>
      </form>
    </div>
  );
}


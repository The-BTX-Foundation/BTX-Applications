'use client';

// Step 1 of the application: Basic info (drafts step1.html on laptop, step1-phone.html on phone).
// Validation follows the BTX form rule: Continue is never disabled. A field shows its error when you leave it
// (or after Continue), and Continue also puts a summary at the top that links to each problem.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  ErrorSummary,
  Segmented,
  SelectField,
  TextField,
  type SummaryItem,
} from '@btx/ui';
import { getAuthMode, getBrowserClient, getSignedInEmail, saveApplication, type AppFile, type Application } from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { savedTime } from '@/lib/format';
import { railSteps } from '@/lib/steps';
import { ApplyShell } from './apply-shell';
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
  fromApplication,
  toPatch,
  type BasicInfo,
  type FieldKey,
} from '@/lib/basic-info';
import s from './basic-info-form.module.css';

// The sample answers from the draft (Ebony Coleman, phone one digit short), shown with ?demo=1 for design review.
const DEMO: BasicInfo = {
  ...EMPTY,
  fullName: 'Ebony Coleman',
  phone: '(301) 555-014',
  gender: 'Female',
  race: 'Black or African American',
  hear: 'A friend or mentor shared it with me',
};

type Patch = NonNullable<Parameters<typeof saveApplication>[2]>;

const SAVE_DELAY_MS = 800;

export function BasicInfoForm({
  demo,
  application,
  files,
  email: initialEmail,
  view,
}: {
  demo?: boolean;
  /** The saved application (live mode), or null in mock mode. */
  application: Application | null;
  files: AppFile[];
  /** The signed-in address (live mode); mock mode reads it in the browser. */
  email?: string;
  view: CycleView;
}) {
  const router = useRouter();
  const [v, setV] = useState<BasicInfo>(demo ? DEMO : application ? fromApplication(application) : EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>(demo ? { phone: true } : {});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [email, setEmail] = useState(demo ? 'ecoleman@terpmail.umd.edu' : (initialEmail ?? ''));
  // The time of the last save, as an ISO string. A fresh draft (never edited) shows no save time.
  const [savedAt, setSavedAt] = useState<string | null>(
    application && application.updated_at !== application.created_at ? application.updated_at : null,
  );
  const [saving, setSaving] = useState<'idle' | 'error'>('idle');
  const summary = useRef<HTMLDivElement>(null);
  // What the database already holds, so only changed fields are sent.
  const saved = useRef<Patch>(application ? toPatch(fromApplication(application)) : {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(v);
  const accountName = demo ? 'Ebony Coleman' : application?.full_name || 'Your account';

  // Mock mode: read the tab's remembered sign-in address for the read-only field.
  useEffect(() => {
    if (demo || initialEmail || getAuthMode() !== 'mock') return;
    let live = true;
    getSignedInEmail().then((e) => {
      if (live && e) setEmail(e);
    });
    return () => {
      live = false;
    };
  }, [demo, initialEmail]);

  // Sends the changed answers (and any extra columns) to the database. Returns true when saved.
  async function flush(extra: Partial<Patch> = {}): Promise<boolean> {
    if (demo) return true;
    const next = toPatch(latest.current);
    const changed: Record<string, unknown> = { ...extra };
    for (const [k, val] of Object.entries(next)) {
      if (saved.current[k as keyof Patch] !== val) changed[k] = val;
    }
    if (Object.keys(changed).length === 0) return true;
    // mock mode keeps nothing; it only pretends to save
    if (!application) {
      Object.assign(saved.current, next);
      setSavedAt(new Date().toISOString());
      return true;
    }
    const r = await saveApplication(getBrowserClient(), application.id, changed as Patch);
    if (!r.ok) {
      setSaving('error');
      return false;
    }
    Object.assign(saved.current, next);
    setSaving('idle');
    setSavedAt(r.savedAt);
    return true;
  }

  // Waits for a pause in typing (about 0.8 seconds), then saves.
  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, SAVE_DELAY_MS);
  }

  // Stops a pending save if the page goes away.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Updates one answer and schedules the autosave.
  function set<K extends FieldKey>(key: K, value: string) {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setV(next);
    setSaveError(null);
    scheduleSave();
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
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const bad = ORDER.some((k) => fieldError(k, v));
    if (!bad) {
      if (timer.current) clearTimeout(timer.current);
      // save every answer and move her on to step 2 (never backwards if she has been further)
      const ok = await flush({ current_step: Math.max(application?.current_step ?? 1, 2) });
      if (ok) router.push('/apply/scholarship');
      else setSaveError("We couldn't save your answers. Check your connection and try again.");
    } else {
      // wait a tick so the summary is in the page, then move focus to it
      setTimeout(() => {
        summary.current?.scrollIntoView({ block: 'center' });
        summary.current?.focus({ preventScroll: true });
      }, 0);
    }
  }

  const savedLabel = demo ? 'Saved 4:12 PM' : saving === 'error' ? "Couldn't save yet" : savedAt ? `Saved ${savedTime(savedAt)}` : undefined;

  return (
    <ApplyShell
      current={1}
      steps={railSteps(application, files, 1, demo ? [false, false, false, false, false] : undefined)}
      view={view}
      accountName={accountName}
      saved={savedLabel}
      onSubmit={onSubmit}
      backHref="/"
      primary={<Button type="submit">Continue</Button>}
    >
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
              {saveError ? (
                <p className={s.good} role="alert">
                  {saveError}
                </p>
              ) : null}
    </ApplyShell>
  );
}


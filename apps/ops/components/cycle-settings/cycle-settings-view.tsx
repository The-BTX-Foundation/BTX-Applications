'use client';

// The Cycle settings page (Figma "Options: Cycle settings"): one scrolling page, three columns on a laptop and one on a
// phone. Award and Dates, then Application and After the award, then what publishing still needs and a drawn preview of
// the Portal landing. Saving a published cycle changes what students see right away, and the page says so.
// Admins edit; everyone else sees the same page read-only.
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { AlertMark } from '@/components/icons';
import {
  MONTHS,
  clockName,
  dayName,
  missingForPublish,
  parseAmountCents,
  rowToForm,
  statusLine,
  validateForm,
  type CycleForm,
  type CycleRow,
  type FieldErrors,
  type FieldKey,
} from '@/lib/cycle-settings';
import { publishCycle, saveCycle, unpublishCycle, type SaveResult } from './actions';
import './cycle-settings.css';

type Props = { cycle: CycleRow; applications: number; otherPublishedTerm: string | null; canEdit: boolean };

// A text box that grows with what is typed, so a long name or requirement is never cut off.
function Grow({ value, onChange, id, placeholder = 'Not set', invalid, describedBy, ariaLabel, maxLength }: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  ariaLabel?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      className={`cs-in cs-grow${invalid ? ' bad' : ''}`}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
    />
  );
}

// "! Needed to publish" / a date-order message under a field.
function Note({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p className="cs-note" id={id}>
      <svg width="14" height="14" viewBox="0 0 26 26" aria-hidden="true" fill="currentColor"><circle cx="13" cy="13" r="12" /><path d="M13 6.5v8" stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" /><circle cx="13" cy="19.5" r="1.8" fill="var(--surface)" /></svg>
      {children}
    </p>
  );
}

export function CycleSettingsView({ cycle, applications, otherPublishedTerm, canEdit }: Props) {
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState<CycleForm>(() => rowToForm(cycle));
  const [status, setStatus] = useState(cycle.status);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const confirmRef = useRef<HTMLDialogElement>(null);

  const published = status === 'published';
  const archived = status === 'archived';
  const set = <K extends keyof CycleForm>(k: K, v: CycleForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setServerErrors({});
    setMessage(null);
  };
  const missing = missingForPublish(form);
  const missingKeys = new Set<FieldKey>(missing.map((m) => m.key));
  const errors: FieldErrors = { ...validateForm(form), ...serverErrors };
  const hasErrors = Object.keys(errors).length > 0;
  const locked = !canEdit || archived;
  const blocked = missing.length > 0 || hasErrors;

  // Runs one of the three actions and shows its answer.
  const run = (fn: () => Promise<SaveResult>, okText: (s: string) => string) => {
    setMessage(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setStatus(r.status);
        setServerErrors({});
        setMessage({ kind: 'ok', text: okText(r.status) });
        router.refresh();
      } else {
        setServerErrors(r.errors ?? {});
        setMessage({ kind: 'bad', text: r.message });
      }
    });
  };
  const onSave = () => {
    if (hasErrors) return setMessage({ kind: 'bad', text: 'Fix the highlighted fields first.' });
    if (published && missing.length) return setMessage({ kind: 'bad', text: `Fill in ${missing.map((m) => m.label.toLowerCase()).join(', ')} first.` });
    run(() => saveCycle(cycle.id, form), (s) => (s === 'published' ? 'Saved. Students see the changes now.' : 'Draft saved. Students can’t see it yet.'));
  };
  const onPublish = () => {
    if (blocked) return;
    if (otherPublishedTerm) return setMessage({ kind: 'bad', text: `${otherPublishedTerm} is already published, and only one cycle can be published at a time. Unpublish it first.` });
    run(() => publishCycle(cycle.id, form), () => 'Published. Students can see it now.');
  };
  const onUnpublish = () => {
    confirmRef.current?.close();
    run(() => unpublishCycle(cycle.id), () => 'Unpublished. Students can’t see it now.');
  };

  // The unpublish button goes away once the first application starts (to stop early, move the deadline).
  const canUnpublishNow = published && applications === 0;
  const jump = (target: string) => {
    const el = document.getElementById(target);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  const needed = (k: FieldKey) => !locked && missingKeys.has(k);
  const err = (k: FieldKey) => (needed(k) ? 'Needed to publish' : errors[k]);
  const bad = (k: FieldKey) => Boolean(needed(k) || errors[k]);
  const eid = (k: FieldKey) => `${uid}-${k}`;
  const dby = (k: FieldKey) => (err(k) ? eid(k) : undefined);

  const actions = (
    <>
      {locked ? null : published ? (
        <>
          {canUnpublishNow ? (
            <button type="button" className="o-btn s lg" disabled={pending} onClick={() => confirmRef.current?.showModal()}>
              Unpublish
            </button>
          ) : null}
          <button type="button" className="o-btn p lg" disabled={pending} onClick={onSave}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="o-btn s lg" disabled={pending} onClick={onSave}>
            {pending ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className="o-btn p lg" disabled={pending || blocked} aria-disabled={blocked || undefined} onClick={onPublish}>
            Publish
          </button>
        </>
      )}
    </>
  );

  const sub = (
    <>
      {statusLine(status, form)}
      {!canEdit ? ' · View only' : ''}
    </>
  );

  return (
    <div className="cs">
      <PageHeader title={`${cycle.term} settings`} sub={sub} actionsClass="cs-top-a">
        {actions}
      </PageHeader>

      {message ? (
        <p className={`cs-msg ${message.kind}`} role={message.kind === 'bad' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      {!canEdit ? <p className="cs-msg">Only board members with admin rights can change these settings. Everyone else can look.</p> : null}
      {published && canEdit ? (
        <p className="cs-live">
          This cycle is live. Save changes puts your edits in front of students right away.
          {!canUnpublishNow && applications > 0 ? ' Applications have started, so to stop early, move the deadline.' : ''}
        </p>
      ) : null}

      <fieldset className="cs-grid" disabled={locked || pending}>
        <legend className="cs-sr">Cycle settings</legend>
        <div className="cs-col">
          <section className="cs-card cs-o1" data-review="Cycle details">
            <h2>Award</h2>
            <div className="cs-body">
              <div className="cs-f">
                <label htmlFor="cs-award-name">Award name</label>
                <Grow id="cs-award-name" value={form.awardName} onChange={(v) => set('awardName', v)} invalid={bad('awardName')} describedBy={dby('awardName')} />
                {err('awardName') ? <Note id={eid('awardName')}>{err('awardName')}</Note> : null}
              </div>
              <div className="cs-f">
                <label htmlFor="cs-amount">Amount</label>
                <div className={`cs-in cs-money${bad('amount') ? ' bad' : ''}`}>
                  <span aria-hidden="true">$</span>
                  <input id="cs-amount" inputMode="decimal" value={form.amount} placeholder="Not set" aria-invalid={bad('amount') || undefined} aria-describedby={dby('amount')} onChange={(e) => set('amount', e.target.value)} />
                </div>
                {err('amount') ? <Note id={eid('amount')}>{err('amount')}</Note> : null}
              </div>
            </div>
          </section>

          <section className="cs-card cs-o2" data-review="Cycle dates">
            <h2>
              Dates <span>Eastern time</span>
            </h2>
            <div className="cs-body">
              <div className="cs-f">
                <span className="cs-lb" id={`${uid}-opens-l`}>Applications open</span>
                <div className="cs-pair" role="group" aria-labelledby={`${uid}-opens-l`}>
                  <input id="cs-opens-date" type="date" className={`cs-in${bad('opens') && !form.opensDate ? ' bad' : errors.opens ? ' bad' : ''}`} aria-label="Applications open date" value={form.opensDate} onChange={(e) => set('opensDate', e.target.value)} />
                  <input id="cs-opens-time" type="time" className={`cs-in${bad('opens') && form.opensDate && !form.opensTime ? ' bad' : ''}`} aria-label="Applications open time" value={form.opensTime} onChange={(e) => set('opensTime', e.target.value)} />
                </div>
                {err('opens') ? <Note id={eid('opens')}>{err('opens')}</Note> : null}
              </div>
              <div className="cs-f">
                <span className="cs-lb" id={`${uid}-closes-l`}>Deadline</span>
                <div className="cs-pair" role="group" aria-labelledby={`${uid}-closes-l`}>
                  <input id="cs-closes-date" type="date" className={`cs-in${(needed('closes') && !form.closesDate) || errors.closes ? ' bad' : ''}`} aria-label="Deadline date" value={form.closesDate} onChange={(e) => set('closesDate', e.target.value)} />
                  <input id="cs-closes-time" type="time" className={`cs-in${needed('closes') && form.closesDate && !form.closesTime ? ' bad' : ''}`} aria-label="Deadline time" value={form.closesTime} onChange={(e) => set('closesTime', e.target.value)} />
                </div>
                {err('closes') ? <Note id={eid('closes')}>{err('closes')}</Note> : null}
              </div>
              <div className="cs-f">
                <span className="cs-lb" id={`${uid}-iv-l`}>Interview weeks</span>
                <div className="cs-pair to" role="group" aria-labelledby={`${uid}-iv-l`}>
                  <input type="date" className={`cs-in${errors.interviewStart ? ' bad' : ''}`} aria-label="Interviews start" value={form.interviewStart} onChange={(e) => set('interviewStart', e.target.value)} />
                  <span aria-hidden="true">to</span>
                  <input type="date" className={`cs-in${errors.interviewEnd ? ' bad' : ''}`} aria-label="Interviews end" value={form.interviewEnd} onChange={(e) => set('interviewEnd', e.target.value)} />
                </div>
                {errors.interviewStart ? <Note id={eid('interviewStart')}>{errors.interviewStart}</Note> : null}
                {errors.interviewEnd ? <Note id={eid('interviewEnd')}>{errors.interviewEnd}</Note> : null}
              </div>
              <div className="cs-two">
                <div className="cs-f">
                  <label htmlFor="cs-decision">Decision date</label>
                  <input id="cs-decision" type="date" className={`cs-in${errors.decisionDate ? ' bad' : ''}`} value={form.decisionDate} onChange={(e) => set('decisionDate', e.target.value)} />
                </div>
                <div className="cs-f">
                  <label htmlFor="cs-next">Next cycle opens</label>
                  <select id="cs-next" className="cs-in" value={form.nextCycleMonth} onChange={(e) => set('nextCycleMonth', e.target.value)}>
                    <option value="">Not set</option>
                    {MONTHS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              {errors.decisionDate ? <Note id={eid('decisionDate')}>{errors.decisionDate}</Note> : null}
            </div>
          </section>
        </div>

        <div className="cs-col">
          <section className="cs-card cs-o3" data-review="Cycle award and requirements">
            <h2>Application</h2>
            <div className="cs-body">
              <div className="cs-f">
                <span className="cs-lb" id={`${uid}-req-l`}>Requirements</span>
                <ul className="cs-reqs" aria-labelledby={`${uid}-req-l`}>
                  {form.requirements.map((r, i) => (
                    <li key={i}>
                      <Grow value={r} ariaLabel={`Requirement ${i + 1}`} placeholder="Not set" onChange={(v) => set('requirements', form.requirements.map((x, j) => (j === i ? v : x)))} />
                      <button type="button" className="cs-link" aria-label={`Remove requirement ${i + 1}`} onClick={() => set('requirements', form.requirements.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {form.requirements.length === 0 ? <p className="cs-empty">Not set</p> : null}
                {errors.requirements ? <Note id={eid('requirements')}>{errors.requirements}</Note> : null}
                <button type="button" className="cs-link add" onClick={() => set('requirements', [...form.requirements, ''])}>
                  + Add a requirement
                </button>
                <p className="cs-hint">The three short-answer questions are the same every cycle, so they are not set here.</p>
              </div>
            </div>
          </section>

          <section className="cs-card cs-o4" data-review="Cycle extras">
            <h2>After the award</h2>
            <div className="cs-body">
              <div className="cs-f">
                <label htmlFor="cs-photo">Photo and story due</label>
                <input id="cs-photo" type="date" className={`cs-in${errors.photoDue ? ' bad' : ''}`} value={form.photoDue} onChange={(e) => set('photoDue', e.target.value)} />
              </div>
              <div className="cs-f">
                <label htmlFor="cs-pay">How the award is paid</label>
                <Grow id="cs-pay" value={form.paymentNote} onChange={(v) => set('paymentNote', v)} invalid={Boolean(errors.paymentNote)} describedBy={errors.paymentNote ? eid('paymentNote') : undefined} />
                {errors.paymentNote ? <Note id={eid('paymentNote')}>{errors.paymentNote}</Note> : null}
              </div>
              <div className="cs-f">
                <span className="cs-lb" id={`${uid}-ev-l`}>Meet-the-board event</span>
                <div className="cs-evrow">
                  <div className="cs-seg" role="group" aria-labelledby={`${uid}-ev-l`}>
                    <button type="button" aria-pressed={form.eventEnabled} className={form.eventEnabled ? 'on' : ''} onClick={() => set('eventEnabled', true)}>
                      On
                    </button>
                    <button type="button" aria-pressed={!form.eventEnabled} className={!form.eventEnabled ? 'on' : ''} onClick={() => set('eventEnabled', false)}>
                      Off
                    </button>
                  </div>
                  {form.eventEnabled ? (
                    <div className="cs-pair">
                      <input type="date" className={`cs-in${errors.event ? ' bad' : ''}`} aria-label="Event date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
                      <input type="time" className="cs-in" aria-label="Event time" value={form.eventTime} onChange={(e) => set('eventTime', e.target.value)} />
                    </div>
                  ) : null}
                </div>
                {errors.event ? <Note id={eid('event')}>{errors.event}</Note> : null}
              </div>
            </div>
          </section>
        </div>

        <div className="cs-col">
          {!published && !archived && missing.length > 0 ? (
            <section className="cs-card cs-miss cs-o6" aria-labelledby={`${uid}-miss`}>
              <h2 id={`${uid}-miss`}>
                <AlertMark size={16} /> Publish needs {missing.length} setting{missing.length === 1 ? '' : 's'}
              </h2>
              <p>Students see these first, so they can’t be blank.</p>
              <ul>
                {missing.map((m) => (
                  <li key={m.target}>
                    <button type="button" className="cs-link" onClick={() => jump(m.target)}>
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {!published && !archived && missing.length === 0 && otherPublishedTerm ? (
            <section className="cs-card cs-miss cs-o6" role="status">
              <h2>
                <AlertMark size={16} /> {otherPublishedTerm} is published
              </h2>
              <p>Only one cycle can be published at a time. Unpublish {otherPublishedTerm} first, or wait until it ends.</p>
            </section>
          ) : null}
          <Preview form={form} term={cycle.term} />
        </div>

        <div className="cs-bottom cs-o7">
          {actions}
        </div>
      </fieldset>

      <dialog ref={confirmRef} className="cs-dlg" aria-labelledby={`${uid}-dlg`}>
        <h2 id={`${uid}-dlg`}>Unpublish {cycle.term}?</h2>
        <p>Students won’t be able to see or start an application. Nothing is deleted, and you can publish it again.</p>
        <div className="cs-dlg-a">
          <button type="button" className="o-btn s lg" onClick={() => confirmRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="o-btn p lg" onClick={onUnpublish}>
            Unpublish
          </button>
        </div>
      </dialog>
    </div>
  );
}

function Br({ children }: { children: string }) {
  return <span className="cs-br">[{children}]</span>;
}

// The drawn Portal landing: what a student would see, with a gold-tint bracket for anything still empty.
function Preview({ form, term }: { form: CycleForm; term: string }) {
  const cents = parseAmountCents(form.amount);
  const open = form.opensDate ? dayName(form.opensDate) : '';
  const close = form.closesDate ? dayName(form.closesDate) : '';
  const time = form.closesTime ? `${clockName(form.closesTime)} ET` : '';
  const reqs = form.requirements.map((r) => r.trim()).filter(Boolean);
  const anyGap = !form.awardName.trim() || cents === null || !open || !close || !time;
  return (
    <section className="cs-card cs-o5" aria-label="Portal landing preview">
      <h2>
        Portal landing <span>Preview</span>
      </h2>
      <div className="cs-body">
        <div className="cs-pv">
          <p className="cs-pv-term">{term.toUpperCase()}</p>
          <p className="cs-pv-name">{form.awardName.trim() || <Br>award name</Br>}</p>
          {cents !== null ? <p className="cs-pv-amt">${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p> : <p className="cs-pv-gap"><Br>amount</Br></p>}
          <p className="cs-pv-dates">
            Apply {open || <Br>open date</Br>} to {close || <Br>deadline</Br>},{' '}
            {time || <Br>time</Br>}
          </p>
          {reqs.length ? (
            <>
              <p className="cs-pv-h">Requirements</p>
              <ul className="cs-pv-list">
                {reqs.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          <span className="cs-pv-apply">Apply</span>
        </div>
        {anyGap ? (
          <p className="cs-pv-key">
            <span className="cs-br">[ ]</span> Not set yet
          </p>
        ) : null}
      </div>
    </section>
  );
}

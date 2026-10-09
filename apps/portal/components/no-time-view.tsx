'use client';

// None of these times work (drafts notimes.html, notimes-phone.html). She picks the days and times she is free. If an
// open time fits, those times are offered as buttons and the gold button books one; otherwise "No open times fit." and
// Send passes her free times to BTX, who email a time.
// Sending free times has no table in the live schema yet (see lib/journey-data.ts), so live mode shows a failure with
// the help address. NOT TESTED AGAINST LIVE DATA.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, HELP_EMAIL, Icon } from '@btx/ui';
import { getAuthMode } from '@btx/data';
import { clock, dayLabel, slotsThatFit, WEEKDAYS, WINDOWS, type Slot } from '@/lib/journey';
import { Chip, ErrorBox, useBook } from './booking-parts';
import { JourneyPage } from './journey-page';
import b from './booking.module.css';

export type NoTimeProps = {
  accountName: string;
  slots: Slot[];
  scheduleHref: string;
  initialDays: string[];
  initialWindows: string[];
  initialNote: string;
  stress: boolean;
};

const SHOW = 6;

export function NoTimeView(p: NoTimeProps) {
  const router = useRouter();
  const [days, setDays] = useState<string[]>(p.initialDays);
  const [windows, setWindows] = useState<string[]>(p.initialWindows);
  const [note, setNote] = useState(p.initialNote);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [problem, setProblem] = useState<'pick' | 'unavailable' | null>(null);
  const { book, busy, problem: bookProblem } = useBook({ mode: 'schedule', stress: p.stress });

  const fit = slotsThatFit(p.slots, days, windows);
  const picked = fit.find((s) => s.id === pickedId) ?? null;
  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chosen = days.length > 0 && windows.length > 0;
  const label = picked ? `Book ${dayLabel(picked.startsAt)}, ${clock(picked.startsAt)}` : 'Send';

  function send() {
    if (picked) return void book(picked);
    if (!chosen) {
      setProblem('pick');
      return;
    }
    if (getAuthMode() === 'mock') {
      router.push(`/status?demo=sent${p.stress ? '-stress' : ''}&days=${days.join(',')}&windows=${windows.join(',')}`);
      return;
    }
    // no table for free times in the live schema yet
    setProblem('unavailable');
  }

  const shown = all ? fit : fit.slice(0, SHOW);
  return (
    <JourneyPage
      accountName={p.accountName}
      back={
        <Link href={p.scheduleHref} className="btn s">
          <Icon name="left" />
          Back
        </Link>
      }
      primary={
        <Button onClick={send} disabled={busy}>
          {label}
        </Button>
      }
    >
      <div className={b.nc}>
        <Link href={p.scheduleHref} className={`lk ${b.bk}`}>
          <Icon name="left" small />
          <span>Back to the open times</span>
        </Link>
        <h1 className={`st ${b.title}`}>Tell us when you&apos;re free.</h1>
        <p className={b.lead}>Pick the days and times you&apos;re free.</p>
        {problem === 'pick' ? <ErrorBox>Pick at least one day and one time.</ErrorBox> : null}
        {problem === 'unavailable' ? (
          <ErrorBox>
            We couldn&apos;t send your times. Email{' '}
            <a href={`mailto:${HELP_EMAIL}`} className="lk">
              {HELP_EMAIL}
            </a>{' '}
            and we&apos;ll find you a time.
          </ErrorBox>
        ) : null}
        {bookProblem === 'failed' ? <ErrorBox>We couldn&apos;t book that time. Check your connection and try again.</ErrorBox> : null}
        <div className={`f ${b.nf}`} role="group" aria-labelledby="nt-days">
          <p className="lb" id="nt-days">
            Days that work
          </p>
          <div className={b.tg}>
            {WEEKDAYS.map((d) => {
              const on = days.includes(d);
              return (
                <button type="button" key={d} className={`${b.tb} ${on ? b.on : ''}`} aria-pressed={on} onClick={() => toggle(days, d, setDays)}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className={`f ${b.nf}`} role="group" aria-labelledby="nt-times">
          <p className="lb" id="nt-times">
            Times that work
          </p>
          <div className={`${b.tg} ${b.tt}`}>
            {WINDOWS.map((w) => {
              const on = windows.includes(w.id);
              return (
                <button type="button" key={w.id} className={`${b.tb} ${on ? b.on : ''}`} aria-pressed={on} onClick={() => toggle(windows, w.id, setWindows)}>
                  {on ? <Icon name="check" /> : null}
                  {w.label}
                </button>
              );
            })}
          </div>
          {chosen ? (
            <div className={b.fit} role="status">
              {fit.length === 0 ? (
                <>
                  <p className={b.fitN}>No open times fit.</p>
                  <p className={b.fitS}>Send these and we&apos;ll email you a time.</p>
                </>
              ) : (
                <>
                  <p className={b.fitN}>
                    {fit.length} open {fit.length === 1 ? 'time fits' : 'times fit'} what you picked.
                  </p>
                  <div className={b.fitR}>
                    {shown.map((s) => (
                      <Chip key={s.id} slot={s} on={s.id === pickedId} onPick={(x) => setPickedId(x.id === pickedId ? null : x.id)} />
                    ))}
                    {!all && fit.length > SHOW ? (
                      <button type="button" className={`lk ${b.more}`} onClick={() => setAll(true)}>
                        +{fit.length - SHOW} more
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className={`f ${b.nf}`}>
          <label className="lb" htmlFor="nt-note">
            Anything else? <i style={{ fontStyle: 'normal', fontWeight: 400, color: 'var(--muted)' }}>(optional)</i>
          </label>
          <textarea id="nt-note" className={`${b.ta} ${b.ta64}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className={b.nAct}>
          <Button size="xl" onClick={send} disabled={busy}>
            {label}
          </Button>
        </div>
      </div>
    </JourneyPage>
  );
}

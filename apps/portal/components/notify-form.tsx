'use client';

// "Email me when ..." on the before-open and closed landings. Saves the address through the database function
// request_cycle_email (the only way in), then shows the confirmation line from draft landing-soon-after.html.
import { useState } from 'react';
import { Button, Icon, TextField } from '@btx/ui';
import { getAuthMode, getBrowserClient, requestCycleEmail, type NotifyKind } from '@btx/data';
import s from './landing.module.css';

type Props = {
  kind: NotifyKind;
  /** The field label, e.g. "Email me when applications open". */
  label: string;
  /** What the confirmation says she will be emailed about, e.g. "applications open". */
  when: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NotifyForm({ kind, label, when }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Checks the address, saves it, and switches to the confirmation.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError('Enter an email like you@example.com.');
      return;
    }
    setError(null);
    setBusy(true);
    // The mock mode never calls the database.
    const ok = getAuthMode() === 'mock' ? true : (await requestCycleEmail(getBrowserClient(), clean, kind)).ok;
    setBusy(false);
    if (ok) setSaved(clean);
    else setError("We couldn't save that. Check your connection and try again.");
  }

  if (saved) {
    return (
      <div className={s.notice} role="status">
        <Icon name="check" />
        <span>
          You&apos;re on the list. We&apos;ll email {saved} when {when}.
        </span>
        <button type="button" className="lk" onClick={() => setSaved(null)}>
          Undo
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className={s.notifyRow}>
        <TextField
          id="notify-email"
          label={label}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@example.com"
          value={email}
          error={error ?? undefined}
          onChange={(e) => setEmail(e.target.value)}
          className={s.notifyField}
        />
        <Button type="submit" className={s.notifyBtn} disabled={busy}>
          Email me
        </Button>
      </div>
      <p className={s.notifyNote}>We&apos;ll only use your email for this.</p>
    </form>
  );
}

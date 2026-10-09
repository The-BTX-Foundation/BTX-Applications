'use client';

// Ops Hub sign-in (Figma "Sign in, laptop" and "Sign in: code sent"): enter an email, then the 6-digit code from the
// email (or follow the link in it). "Keep me signed in" off means a new browser session signs out (see shell.tsx).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorIcon } from '@btx/ui';
import { checkStaffCode, sendStaffCode } from '@/lib/ops-auth';
import { NO_ACCESS } from '@/lib/role';
import { OIcon } from './icons';

const PORTAL = process.env.NEXT_PUBLIC_PORTAL_URL || '#';

export function SignIn({ next, notice }: { next?: string; notice?: 'access' | 'link' }) {
  const router = useRouter();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    notice === 'access' ? NO_ACCESS : notice === 'link' ? 'That sign-in link has expired or was already used. Send a new one.' : null,
  );

  // Sends the code and moves to the code screen.
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    const r = await sendStaffCode(clean, `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? '/')}`);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.reason === 'rate-limited'
          ? 'Too many codes requested. Wait a minute, then try again.'
          : "We couldn't send the code. Check your connection and try again.",
      );
      return;
    }
    setEmail(clean);
    setCode('');
    setError(null);
    setStage('code');
  }

  // Checks the code and the role, remembers the "keep me signed in" choice, and goes on.
  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(digits)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    const r = await checkStaffCode(email, digits);
    setBusy(false);
    if (r.ok) {
      try {
        localStorage.setItem('btx-ops-keep', keep ? '1' : '0');
        sessionStorage.setItem('btx-ops-alive', '1');
      } catch {
        // storage blocked: the session just stays as it is
      }
      router.push(next ?? '/');
      router.refresh();
      return;
    }
    setCode('');
    setError(
      r.reason === 'no-access'
        ? NO_ACCESS
        : r.reason === 'expired'
          ? 'That code has expired or is wrong. Send a new one.'
          : r.reason === 'wrong'
            ? "That code doesn't match. Check the newest email from us and try again."
            : "We couldn't check the code. Check your connection and try again.",
    );
    if (r.reason === 'no-access') setStage('email');
  }

  const portal = PORTAL === '#' ? <a className="o-si-lk">application portal</a> : <a className="o-si-lk" href={PORTAL}>application portal</a>;

  return (
    <main className={`o-si${stage === 'code' ? ' code' : ''}`}>
      <img src="/btx-logo-on-light.png" alt="The BTX Foundation" width={77} height={34} className="o-si-logo" />
      {stage === 'email' ? (
        <form className="o-si-box" onSubmit={sendCode} noValidate>
          <h1>Sign in to the Ops Hub</h1>
          <p className="o-si-sub">For BTX board members and staff.</p>
          <label className="o-si-lb" htmlFor="si-email">
            Email
          </label>
          <input
            id="si-email"
            className="o-si-in"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'si-err' : undefined}
          />
          {error ? (
            <p className="em" id="si-err" role="alert">
              <ErrorIcon />
              <span>{error}</span>
            </p>
          ) : null}
          <label className="o-si-keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span className="o-si-cb" aria-hidden="true">
              {keep ? <OIcon name="check" size={16} /> : null}
            </span>
            Keep me signed in
          </label>
          <button type="submit" className="o-si-btn" disabled={busy}>
            Email me a code
          </button>
          <p className="o-si-note">We’ll email you a 6-digit code. No password needed.</p>
        </form>
      ) : (
        <form className="o-si-box" onSubmit={checkCode} noValidate>
          <h1>Check your email</h1>
          <p className="o-si-sub">
            Code sent to {email} ·{' '}
            <button type="button" className="o-si-lk" onClick={() => { setStage('email'); setError(null); }}>
              Change email
            </button>
          </p>
          <label className="o-si-lb" htmlFor="si-code">
            6-digit code
          </label>
          <input
            id="si-code"
            className="o-si-in"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Enter the code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'si-err' : undefined}
            autoFocus
          />
          {error ? (
            <p className="em" id="si-err" role="alert">
              <ErrorIcon />
              <span>{error}</span>
            </p>
          ) : null}
          <button type="submit" className="o-si-btn code" disabled={busy}>
            Sign in
          </button>
          <p className="o-si-note">
            Didn’t get it?{' '}
            <button type="button" className="o-si-lk" onClick={() => void sendCode()}>
              Send a new code
            </button>
          </p>
        </form>
      )}
      <p className="o-si-foot">Applying for a scholarship? Go to the {portal}.</p>
    </main>
  );
}

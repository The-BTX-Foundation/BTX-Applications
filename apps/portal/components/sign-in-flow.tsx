'use client';

// Sign in with a Terpmail address and an emailed 6-digit code. Four screens in one component:
//   email    ask for the Terpmail address
//   code     "Enter your code" (normal)
//   wrong    the code did not match
//   expired  the code is too old
// Laptop shows a title on the left and a card on the right; phone shows the same content in one column.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, CodeBoxes, CODE_LENGTH, ErrorIcon, TextField, TopBar } from '@btx/ui';
import { getAuthMode, requestSignInCode, verifySignInCode } from '@btx/data';
import { OPS_HUB_URL } from '@/lib/config';
import { terpmailError } from '@/lib/terpmail';
import s from './sign-in-flow.module.css';

export type DemoState = 'email' | 'code' | 'wrong' | 'expired';
type Problem = 'incomplete' | 'wrong' | 'expired' | null;

const RESEND_SECONDS = 30;
const DEMO_EMAIL = 'ecoleman@terpmail.umd.edu';

export function SignInFlow({
  demo,
  next,
  codeLifetime,
  lifetimeMinutes,
  linkError,
  demoEmail,
}: {
  demo?: DemoState;
  /** Where to go after signing in (set by the proxy when it sends a signed-out visitor here). */
  next?: string;
  /** How long a code works, for the expired screen: "30 minutes" or "[time]". */
  codeLifetime: string;
  /** The same in minutes, to tell an expired code from a wrong one (Supabase reports both the same way). */
  lifetimeMinutes: number;
  /** She followed an email link that had expired or was already used. */
  linkError?: boolean;
  /** Review mode: the address shown on the code screens (the stress frames use a very long one). */
  demoEmail?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'email' | 'code'>(demo && demo !== 'email' ? 'code' : 'email');
  const [email, setEmail] = useState(demo ? (demo !== 'email' ? (demoEmail ?? DEMO_EMAIL) : (demoEmail ?? '')) : '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState(Boolean(linkError));
  const [code, setCode] = useState(demo === 'code' ? '4829' : '');
  const [problem, setProblem] = useState<Problem>(demo === 'wrong' ? 'wrong' : demo === 'expired' ? 'expired' : null);
  const [seconds, setSeconds] = useState(demo === 'code' ? 24 : RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);
  // When the current code was sent, to tell "expired" from "wrong" (Supabase uses one error for both).
  const sentAt = useRef<number>(Date.now());

  // Counts the resend timer down once a second on the code screen (frozen in demo mode).
  useEffect(() => {
    if (demo || stage !== 'code' || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [demo, stage, seconds]);

  // Sends (or re-sends) the code. Returns true when it went out.
  async function send(address: string): Promise<boolean> {
    setBusy(true);
    const r = await requestSignInCode(
      address,
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? '/apply/start')}`,
    );
    setBusy(false);
    if (r.ok) return true;
    setEmailError(
      r.reason === 'rate-limited'
        ? 'Too many codes requested. Wait a minute, then try again.'
        : "We couldn't send the code. Check your connection and try again.",
    );
    return false;
  }

  // Email screen: check the address, then ask for the code.
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLinkProblem(false);
    const err = terpmailError(email);
    setEmailError(err);
    if (err) return;
    const clean = email.trim().toLowerCase();
    setEmail(clean);
    if (await send(clean)) {
      setCode('');
      setProblem(null);
      setSeconds(RESEND_SECONDS);
      sentAt.current = Date.now();
      setStage('code');
    }
  }

  // Code screen: check the six digits. Success goes on to the application; the other results redraw the card.
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (problem === 'expired') return resend();
    if (code.length < CODE_LENGTH) {
      setProblem('incomplete');
      return;
    }
    setBusy(true);
    const r = await verifySignInCode(email, code);
    setBusy(false);
    if (r.ok) {
      // /apply/start finds or creates her application and sends her to the right step
      router.push(next ? `/apply/start?next=${encodeURIComponent(next)}` : '/apply/start');
      return;
    }
    setCode('');
    if (r.reason === 'failed') {
      setProblem(null);
      setEmailError("We couldn't check the code. Check your connection and try again.");
      return;
    }
    // "invalid-or-expired" is one error from Supabase: call it expired only when the code is older than its lifetime
    const old = Date.now() - sentAt.current > lifetimeMinutes * 60_000;
    setProblem(r.reason === 'invalid-or-expired' && (getAuthMode() === 'mock' || old) ? 'expired' : 'wrong');
    codeRef.current?.querySelector('input')?.focus();
  }

  // Asks for a fresh code and returns to the normal code screen.
  async function resend() {
    if (await send(email)) {
      setCode('');
      setProblem(null);
      setEmailError(null);
      setSeconds(RESEND_SECONDS);
      sentAt.current = Date.now();
      codeRef.current?.querySelector('input')?.focus();
    }
  }

  // Goes back to the email screen to use another address.
  function useDifferentEmail() {
    setStage('email');
    setCode('');
    setProblem(null);
    setEmailError(null);
  }

  const message =
    problem === 'wrong'
      ? "That code doesn't match. Check the newest email from us and try again."
      : problem === 'expired'
        ? 'This code has expired. Send a new one, then enter it here.'
        : problem === 'incomplete'
          ? 'Enter all 6 digits from the email.'
          : emailError;

  return (
    <div className="app">
      <TopBar variant="sign-in" />
      <main id="main" className="pm">
        <div className={s.wrap}>
          <div className={s.left}>
            <h1 className={`st ${s.title}`}>Sign in.</h1>
            <p className={s.lead}>New here? Signing in creates your account.</p>
          </div>
          <section className={s.card}>
            {stage === 'email' ? (
              <form onSubmit={submitEmail} noValidate className={s.form}>
                <h2 className={s.cardTitle}>Enter your email</h2>
                {linkProblem ? (
                  <p className="em" role="alert" style={{ marginTop: 12 }}>
                    <ErrorIcon />
                    <span>That sign-in link has expired or was already used. Send a new one.</span>
                  </p>
                ) : null}
                <TextField
                  id="email"
                  label="Terpmail address"
                  hint="We'll email you a code. No password needed."
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="yourname@terpmail.umd.edu"
                  value={email}
                  error={emailError ?? undefined}
                  onChange={(e) => setEmail(e.target.value)}
                  className={s.emailField}
                />
                <div className={s.action}>
                  <Button type="submit" size="xl" full className={s.btn} disabled={busy}>
                    Send code
                  </Button>
                </div>
                <p className={s.phoneNote}>New here? Signing in creates your account.</p>
                {process.env.NODE_ENV !== 'production' && getAuthMode() === 'mock' ? (
                  <p className={s.devNote}>Local mock: any Terpmail address works. Code 123456 signs in.</p>
                ) : null}
              </form>
            ) : (
              <form onSubmit={submitCode} noValidate className={s.form}>
                <h2 className={s.cardTitle}>Enter your code</h2>
                <p className={s.sentTo}>
                  We sent a code to <b>{email}</b>.
                </p>
                <p className={s.label} id="code-label">
                  6-digit code
                </p>
                <div ref={codeRef}>
                  <CodeBoxes
                    value={code}
                    onChange={(v) => {
                      setCode(v);
                      if (problem === 'incomplete') setProblem(null);
                    }}
                    error={problem !== null}
                    autoFocus
                    describedBy={message ? 'code-err' : undefined}
                  />
                </div>
                <p className={s.linkHint}>Or use the link in the email.</p>
                {message ? (
                  <p className="em" id="code-err" role="alert" style={{ marginTop: 12 }}>
                    <ErrorIcon />
                    <span>{message}</span>
                  </p>
                ) : null}
                <div className={message ? s.actionErr : s.action}>
                  <Button type="submit" size="xl" full className={s.btn} disabled={busy}>
                    {problem === 'expired' ? 'Send a new code' : 'Verify and continue'}
                  </Button>
                </div>
                <div className={problem === 'expired' ? `${s.row} ${s.stack}` : s.row}>
                  {problem === 'wrong' ? (
                    <button type="button" className="lk" onClick={resend}>
                      Send a new code
                    </button>
                  ) : problem === 'expired' ? (
                    <span className="mu">Codes work for {codeLifetime}.</span>
                  ) : seconds > 0 ? (
                    <span className="mu">Resend code in {seconds} seconds</span>
                  ) : (
                    <button type="button" className="lk" onClick={resend}>
                      Send a new code
                    </button>
                  )}
                  <button type="button" className="lk" onClick={useDifferentEmail}>
                    Use a different email
                  </button>
                </div>
              </form>
            )}
            <p className={s.ops}>
              BTX board member?&nbsp;
              {OPS_HUB_URL === '#' ? (
                <Link href="/sign-in" className="lk">
                  Go to the Ops Hub
                </Link>
              ) : (
                <a href={OPS_HUB_URL} className="lk">
                  Go to the Ops Hub
                </a>
              )}
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

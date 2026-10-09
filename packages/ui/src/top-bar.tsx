// The Portal top bar. Two headers are drawn and CSS shows one: `header.hd` on laptop (1024px and wider) and the
// phone top (`header.top` with `div.hb`) below that. Variants:
//   signed-out: laptop "Questions? Email us" + Sign in; phone Sign in. (Landing)
//   sign-in:    laptop "Questions? Email us" only; phone nothing. (The sign-in screen)
//   signed-in:  laptop Help + account button; phone menu button. (Inside the application)
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from './button';
import { Icon } from './icons';

export const HELP_EMAIL = 'info@thebtxfoundation.org';

type Props = {
  variant: 'signed-out' | 'sign-in' | 'signed-in';
  /** The signed-in student's name, shown on the laptop account button. */
  accountName?: string;
  /** Phone only: the step progress drawn under the header row (the wizard). */
  progress?: ReactNode;
  /** Where the logo links to. */
  homeHref?: string;
};

// The logo lockup: BTX logo, a hairline, and "Scholarship application".
function Brand({ homeHref }: { homeHref: string }) {
  return (
    <Link href={homeHref} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size PNG logo, no optimization needed */}
      <img src="/btx-logo-on-light.png" alt="The BTX Foundation" />
      <span>Scholarship application</span>
    </Link>
  );
}

// Draws the laptop and phone headers for the chosen variant.
export function TopBar({ variant, accountName = 'Your account', progress, homeHref = '/' }: Props) {
  const mail = `mailto:${HELP_EMAIL}`;
  return (
    <>
      <header className="hd">
        <Brand homeHref={homeHref} />
        <div className="hr">
          {variant === 'signed-in' ? (
            <>
              <a href={mail} className="lk">
                Help
              </a>
              <button type="button" className="acct" aria-label={`Account: ${accountName}`}>
                <Icon name="user" />
                <span>{accountName}</span>
                <Icon name="down" small />
              </button>
            </>
          ) : (
            <>
              <a href={mail} className="lk">
                Questions? Email us
              </a>
              {variant === 'signed-out' ? (
                <ButtonLink kind="s" href="/sign-in">
                  Sign in
                </ButtonLink>
              ) : null}
            </>
          )}
        </div>
      </header>
      <header className="top">
        <div className="hb">
          <Brand homeHref={homeHref} />
          {variant === 'signed-out' ? (
            <ButtonLink kind="s" href="/sign-in">
              Sign in
            </ButtonLink>
          ) : null}
          {variant === 'signed-in' ? (
            <button type="button" className="ib" aria-label="Menu">
              <Icon name="menu" />
            </button>
          ) : null}
        </div>
        {progress}
      </header>
    </>
  );
}

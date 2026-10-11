'use client';

// The signed-in menus in the top bar: the laptop account button opens a small list under it (Sign out), and the phone
// menu button opens the same list with Help added (the phone header has no Help link). Closes on Escape, on a click
// outside and on choosing an item. Sign out goes to the app's /sign-out page, which clears the session.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

type Props = {
  /** 'laptop' draws the account button; 'phone' the square menu button. */
  kind: 'laptop' | 'phone';
  accountName: string;
  helpHref: string;
  signOutHref?: string;
};

export function AccountMenu({ kind, accountName, helpHref, signOutHref = '/sign-out' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  let trigger: ReactNode;
  if (kind === 'laptop') {
    trigger = (
      <>
        <Icon name="user" />
        <span>{accountName}</span>
        <Icon name="down" small />
      </>
    );
  } else {
    trigger = <Icon name={open ? 'close' : 'menu'} />;
  }

  return (
    <div className="am" ref={root}>
      <button
        ref={button}
        type="button"
        className={kind === 'laptop' ? 'acct' : 'ib'}
        aria-label={kind === 'laptop' ? `Account: ${accountName}` : 'Menu'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open ? (
        <div className="am-list" id={id}>
          {kind === 'phone' ? <p className="am-name">{accountName}</p> : null}
          {kind === 'phone' ? (
            <a href={helpHref} className="am-item" onClick={() => setOpen(false)}>
              Help: email us
            </a>
          ) : null}
          <a href={signOutHref} className="am-item">
            Sign out
          </a>
        </div>
      ) : null}
    </div>
  );
}

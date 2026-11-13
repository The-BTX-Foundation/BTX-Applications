// Small pieces both Budget routes draw: the phone's Finance tabs, a step owner, a comment or chat message, the "Coming soon"
// tag beside a money action that stays off in live mode (owner, 2026-10-12), and the "Saved 9:14 AM · Undo" moment line.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import type { BuAuthor, BuWho } from '@/lib/budget-view';

// The three Finance pages as light text tabs under the title (phones only; laptops have the sidebar). `count` marks Budget
// when the plan waits on the viewer.
export function FinanceTabs({ count }: { count: number }) {
  return (
    <nav className="bu-secnav" aria-label="Finance">
      <Link href="/finance/budget" aria-current="page">
        Budget
        {count ? (
          <span className="bu-count">
            {count}
            <span className="rf-sr"> for you</span>
          </span>
        ) : null}
      </Link>
      <Link href="/finance/fundraising">Fundraising</Link>
      <Link href="/finance/grants">Grants</Link>
    </nav>
  );
}

// A step's owner: initials (gold when it is the viewer) and "You" or the name; a group gets the people mark.
export function Who({ who }: { who: BuWho }) {
  if (who.kind === 'none') {
    return (
      <span className="bu-who">
        <em className="bu-unas">Unassigned</em>
      </span>
    );
  }
  if (who.kind === 'group') {
    return (
      <span className="bu-who">
        <span className="bu-av bu-sq" aria-hidden="true">
          <Icon name="people" />
        </span>
        <span className="rf-nowrap">{who.name}</span>
      </span>
    );
  }
  return (
    <span className="bu-who">
      <span className={`bu-av${who.me ? ' bu-me' : ''}`} aria-hidden="true">
        {who.initials}
      </span>
      <span className="rf-nowrap">{who.me ? 'You' : who.name}</span>
    </span>
  );
}

// One comment or chat message: round initials, the name (or "You") with the time, the text.
export function Msg({ by, time, body, fresh = false }: { by: BuAuthor; time: string; body: string; fresh?: boolean }) {
  return (
    <div className={`bu-msg${by.me ? ' bu-mine' : ''}${fresh ? ' bu-fresh' : ''}`}>
      <span className="rf-avatar rf-round" aria-hidden="true">
        {by.initials}
      </span>
      <div>
        <p className="bu-from">
          <b>{by.me ? 'You' : by.name}</b>
          <span>{time}</span>
        </p>
        <p className="bu-txt">{body}</p>
      </div>
    </div>
  );
}

/** The small tag beside a money action that is drawn but switched off in live mode. */
export function Soon({ id }: { id?: string }) {
  return (
    <span className="bu-soon" id={id}>
      Coming soon
    </span>
  );
}

// A money control drawn but switched off in live mode: focusable (aria-disabled, not disabled, so a keyboard user reaches it
// and hears why), described by its "Coming soon" tag, and inert (no click handler).
export function OffButton({ className, describedBy, children }: { className: string; describedBy: string; children: ReactNode }) {
  return (
    <button type="button" className={className} aria-disabled="true" aria-describedby={describedBy}>
      {children}
    </button>
  );
}

// The line after an action (not a live region: the board's one announcer says the result): a tick (gold, or ink for a decline), the words, and an Undo (or the live "Coming soon" one).
export function Moment({ ink = false, small = false, children, undo }: { ink?: boolean; small?: boolean; children: ReactNode; undo: ReactNode }) {
  return (
    <p className={`bu-moment${small ? ' bu-sm' : ''}`}>
      <span className={`bu-tick${ink ? ' bu-ink' : ''}`}>
        <Icon name={ink ? 'x' : 'check'} />
      </span>
      {children}
      {undo ? (
        <>
          <span aria-hidden="true">&nbsp;·&nbsp;</span>
          {undo}
        </>
      ) : null}
    </p>
  );
}

/** A name kept on one line. */
export function Name({ children }: { children: string }) {
  return <span className="rf-nowrap">{children}</span>;
}

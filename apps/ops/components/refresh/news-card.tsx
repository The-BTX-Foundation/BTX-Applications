// The news card (.rf-nx): one "what happened / what's next" card under a page header or a panel heading. A kicker line,
// the news itself, and an optional "go" label with a chevron. It is a link with `href`, a button with `onClick`, or a
// plain block with neither (no dead control). `gold` marks the one item that needs the person.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type NewsCardProps = { icon: IconName; kicker: ReactNode; title: ReactNode; go?: string; gold?: boolean; href?: string; onClick?: () => void };

// One news card.
export function NewsCard({ icon, kicker, title, go, gold = false, href, onClick }: NewsCardProps) {
  const cls = `rf-nx${gold ? ' rf-gold' : ''}`;
  const body = (
    <>
      <span className="rf-nx-i" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="rf-nx-m">
        <span className="rf-nx-k">{kicker}</span>
        <span className="rf-nx-t">{title}</span>
      </span>
      {go && (href || onClick) ? (
        <span className="rf-nx-go">
          {go}
          <Icon name="chev" />
        </span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link className={cls} href={href}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

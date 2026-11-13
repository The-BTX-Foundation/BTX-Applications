// A panel: the section heading on the page ground (h2 plus an optional gold-ink link or control on the right) and a flat
// card under it (.rf-pcard). `className` adds the page's own prefixed class (e.g. "td-areas"); `card={false}` drops the
// card for content that brings its own surfaces (Today's interview tickets keep the card but flatten it in CSS).
import type { ReactNode } from 'react';

type PanelProps = { id: string; title: ReactNode; action?: ReactNode; className?: string; card?: boolean; children: ReactNode };

// One panel. `id` labels the section for screen readers (the h2 carries it).
export function Panel({ id, title, action, className, card = true, children }: PanelProps) {
  return (
    <section className={`rf-panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="rf-ph">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {card ? <div className="rf-pcard">{children}</div> : children}
    </section>
  );
}

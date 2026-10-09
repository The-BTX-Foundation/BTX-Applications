'use client';

// Small shared parts of the Money pages and People and roles: the dialog (the Figma "Log a sponsorship" and "Make ... an
// Admin?" pattern), the period chip, the avatar-and-name for an owner, the progress bar and the toast.
import { useEffect, useId, useRef } from 'react';
import { OIcon } from '@/components/icons';
import type { Who } from '@/lib/money-shared';

// A modal: a dimmed page and a white box with a title, the body and buttons (passed as children). Escape and the dimmed
// area both cancel. Focus moves into the box when it opens and returns to the button that opened it when it closes.
export function Dialog({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="mn-dlg-wrap">
      <button type="button" className="mn-dlg-scrim" aria-label="Cancel" tabIndex={-1} onClick={onClose} />
      <div ref={box} className={`mn-dlg${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// A labelled field in a dialog (the label is bold, the input is a 40px box).
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mn-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// The "Period 2026" chip. There is one budget year today, so the choices hold that one.
export function PeriodChip({ year, phone }: { year: number; phone?: boolean }) {
  return (
    <label className={phone ? 'mn-chip ph' : 'mn-chip'}>
      <span>{phone ? 'Period:' : 'Period'}</span>
      <b>{year}</b>
      <OIcon name="down" size={15} />
      <select aria-label="Period" defaultValue={String(year)}>
        <option value={String(year)}>{year}</option>
      </select>
    </label>
  );
}

// A person on a checklist row: a round ink avatar with their initials and the name. "Board" has no avatar;
// "Unassigned" has a dashed circle with a question mark.
export function WhoMark({ who }: { who: Who }) {
  if (who.kind === 'person') {
    return (
      <span className="mn-who">
        <span className="mn-av">{who.initials}</span>
        {who.name}
      </span>
    );
  }
  if (who.kind === 'group') return <span className="mn-who plain">{who.name}</span>;
  return (
    <span className="mn-who">
      <span className="mn-av none">?</span>
      Unassigned
    </span>
  );
}

// A progress bar: a grey track and an ink fill `pct` percent wide.
export function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={`mn-bt${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

// The dark message at the bottom of the page ("Kelsey Davis is now an Admin · Undo").
export function Toast({ children, onUndo }: { children: React.ReactNode; onUndo?: () => void }) {
  return (
    <div className="mn-toast" role="status">
      <span>{children}</span>
      {onUndo ? (
        <>
          {' · '}
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </>
      ) : null}
    </div>
  );
}

// The check circle on a checklist row: open, done (filled with a tick) or the current step (ink ring).
export function Tick({ done, current }: { done?: boolean; current?: boolean }) {
  return (
    <span className={`mn-ck${done ? ' done' : ''}${current ? ' cur' : ''}`} aria-label={done ? 'Done' : 'To do'}>
      {done ? <OIcon name="check" size={14} /> : null}
    </span>
  );
}

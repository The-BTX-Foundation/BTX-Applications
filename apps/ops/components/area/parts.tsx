'use client';

// Small parts the Programs and Outreach pages share: the owner chip, the step circle, the few extra glyphs the Figma
// frames use, the modal for the "log / add" forms, and the one-line "not connected yet" notice.
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { OIcon } from '../icons';
import { LoadError } from '../load-error';
import type { Owner } from '@/mock/area';
import './area.css';

/** A person's circle and name; "Unassigned" is a dashed circle with a question mark. */
export function OwnerChip({ o, solid, small }: { o: Owner; solid?: boolean; small?: boolean }) {
  if (!o) return null;
  if (o === 'unassigned') {
    return (
      <span className="ar-own">
        <span className={`ar-av q${solid ? ' solid' : ''}`}>?</span>
        <span className={solid ? '' : 'ar-un'}>Unassigned</span>
      </span>
    );
  }
  return (
    <span className="ar-own">
      <span className={`ar-av${small ? ' sm' : ''}`}>{o.initials}</span>
      <span>{o.name}</span>
    </span>
  );
}

/** The step circle: ink with a tick when done, an outlined ring when open. A button when it can be changed. */
export function StepCheck({ done, onClick, label, className }: { done: boolean; onClick?: () => void; label: string; className?: string }) {
  const cls = `ar-ck${done ? ' done' : ''}${className ? ` ${className}` : ''}`;
  if (!onClick) {
    return (
      <span className={cls} role="img" aria-label={`${label}: ${done ? 'done' : 'to do'}`}>
        {done ? <OIcon name="check" size={16} /> : null}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={done} aria-label={`${label}: ${done ? 'done, tap to reopen' : 'tap to mark done'}`} onClick={onClick}>
      {done ? <OIcon name="check" size={16} /> : null}
    </button>
  );
}

const G: Record<string, ReactNode> = {
  image: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <circle cx="7" cy="8" r="1.4" />
      <path d="M3 15l4.5-4.5 3 3 2.5-2.5L17 14.5" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 5.5l7 5.5 7-5.5" />
    </>
  ),
  people: (
    <>
      <circle cx="7.5" cy="7" r="2.6" />
      <path d="M2.5 16c.4-2.8 2.4-4.4 5-4.4s4.6 1.6 5 4.4" />
      <circle cx="14" cy="7.8" r="2.1" />
      <path d="M14 11.8c2 .1 3.2 1.4 3.5 3.6" />
    </>
  ),
  flag: <path d="M5 17.5V3M5 4h9.5l-2 3.5 2 3.5H5" />,
  tick: <path d="M5 10.5l3.2 3.2L15 6.8" />,
};
export type GlyphName = keyof typeof G;

/** A line glyph the shared icon set does not have (image, mail, people, flag). */
export function Glyph({ name, size = 20, className }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg className={`o-i${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {G[name]}
    </svg>
  );
}

/** A dialog over a dimmed page. Escape and Cancel close it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="ar-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ar-modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={box}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A labelled field for the forms. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ar-f">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A short line under a button or form for an answer ("Not connected yet.", "That didn't save."). */
export function Notice({ text }: { text: string | null }) {
  return text ? (
    <p className="ar-note" role="status">
      {text}
    </p>
  ) : null;
}

/** The page header for the area pages: laptop and phone can word the title and the line under it differently. */
export function AreaHeader({ title, phoneTitle, sub, phoneSub, children, phoneAction }: { title: string; phoneTitle?: string; sub: string; phoneSub?: string; children?: ReactNode; phoneAction?: ReactNode }) {
  return (
    <div className="o-top ar-top">
      <div className="o-top-t">
        <h1>
          <span className="o-lg">{title}</span>
          <span className="o-ph">{phoneTitle ?? title}</span>
        </h1>
        {sub ? (
          <p>
            <span className="o-lg">{sub}</span>
            <span className="o-ph">{phoneSub ?? sub}</span>
          </p>
        ) : null}
      </div>
      {children ? <div className="o-top-a o-lg">{children}</div> : null}
      {phoneAction ? <div className="o-top-a o-ph">{phoneAction}</div> : null}
    </div>
  );
}

/** A one-field form in a modal ("Add an idea", "Add a task", "Add a channel"). */
export function TextForm({ title, label, placeholder, submit, onClose, onSubmit }: { title: string; label: string; placeholder: string; submit: string; onClose: () => void; onSubmit: (value: string) => Promise<{ ok: boolean; message?: string }> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      setErr('Type a name first.');
      return;
    }
    setBusy(true);
    const r = await onSubmit(v);
    setBusy(false);
    if (r.ok) onClose();
    else setErr(r.message ?? "That didn't save.");
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go} noValidate>
        <Field label={label}>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={200} />
        </Field>
        {err ? <p className="ar-err" role="alert">{err}</p> : null}
        <div className="ar-btns">
          <button type="submit" className="o-btn p" disabled={busy}>
            {submit}
          </button>
          <button type="button" className="o-btn s" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The "didn't load" state of an area page: the page title (phone can word it differently) and the shared card. */
export function AreaLoadError({ title, phoneTitle, what }: { title: string; phoneTitle?: string; what: string }) {
  return (
    <div className="ar-errw">
      <AreaHeader title={title} phoneTitle={phoneTitle} sub="" />
      <LoadError what={what} />
    </div>
  );
}

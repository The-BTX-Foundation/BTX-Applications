// Form fields drawn the BTX way: a bold label, an optional hint, the control, and on error a thicker border plus
// the error icon and message under the control (the website's form rule). Continue is never disabled; errors show
// on the field and in an error summary at the top (see error-summary.tsx).
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Chevron, ErrorIcon, Icon } from './icons';

type FieldFrame = {
  /** Used for the label's htmlFor and as the base of the hint and error ids. */
  id: string;
  label: string;
  /** Muted words after the label, like "(optional)". */
  note?: string;
  hint?: string;
  /** The error message. When set, the field draws its error state. */
  error?: string;
};

// The ids a control uses to point at its hint and error text (aria-describedby).
function describedBy({ id, hint, error }: FieldFrame): string | undefined {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

// The label, hint and error message around one control. `children` is the control itself.
export function Field({ id, label, note, hint, error, children, className }: FieldFrame & { children: ReactNode; className?: string }) {
  return (
    <div className={['f', error ? 'err' : '', className].filter(Boolean).join(' ')} id={`${id}-field`}>
      <label className="lb" htmlFor={id}>
        {label}
        {note ? <> <i>{note}</i></> : null}
      </label>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="em" id={`${id}-err`}>
          <ErrorIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

// A one-line text field. `readOnlyLock` draws the muted read-only look with a lock (the Terpmail address).
export function TextField({
  id,
  label,
  note,
  hint,
  error,
  readOnlyLock,
  className,
  ...input
}: FieldFrame & { readOnlyLock?: boolean; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  const frame = { id, label, note, hint, error };
  return (
    <Field {...frame} className={className}>
      <div className={['in', readOnlyLock ? 'ro' : ''].filter(Boolean).join(' ')}>
        {readOnlyLock ? <Icon name="lock" /> : null}
        <input
          id={id}
          className="in-el"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(frame)}
          readOnly={readOnlyLock || input.readOnly}
          {...input}
        />
      </div>
    </Field>
  );
}

// A drop-down. The native <select> is drawn inside the field so phones keep their own picker.
export function SelectField({
  id,
  label,
  note,
  hint,
  error,
  placeholder = 'Choose one',
  options,
  value,
  className,
  ...select
}: FieldFrame & {
  placeholder?: string;
  options: readonly string[];
  value: string;
  className?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'value'>) {
  const frame = { id, label, note, hint, error };
  return (
    <Field {...frame} className={className}>
      <div className={['in', 'sel', value ? '' : 'ph'].filter(Boolean).join(' ')}>
        <select
          id={id}
          className="in-el"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(frame)}
          {...select}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
    </Field>
  );
}

// A segmented choice: one answer out of a few, drawn as a joined row (a 2 x 2 grid on phone with gridOnPhone). The buttons use aria-pressed; the group is named by the label.
export function Segmented({
  id,
  label,
  note,
  hint,
  error,
  options,
  value,
  onChange,
  gridOnPhone,
  className,
}: FieldFrame & {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  /** Draw as two columns on phone (four options that do not fit in one row). */
  gridOnPhone?: boolean;
  className?: string;
}) {
  const frame = { id, label, note, hint, error };
  return (
    <div className={['f', error ? 'err' : '', className].filter(Boolean).join(' ')} id={`${id}-field`} role="group" aria-labelledby={`${id}-label`}>
      <span className="lb" id={`${id}-label`}>
        {label}
        {note ? <> <i>{note}</i></> : null}
      </span>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <div className={gridOnPhone ? 'sg gp' : 'sg'} aria-describedby={describedBy(frame)}>
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            id={i === 0 ? id : undefined}
            className={o === value ? 'on' : undefined}
            aria-pressed={o === value}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {error ? (
        <p className="em" id={`${id}-err`}>
          <ErrorIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

// A checkbox row (bold label with an optional muted line under it, or plain text for a long agreement).
export function Checkbox({
  checked,
  onChange,
  label,
  sub,
  text,
  card,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  sub?: string;
  /** A plain (not bold) sentence instead of a bold label, for long agreements. */
  text?: string;
  /** Draw inside a bordered card. */
  card?: boolean;
}) {
  return (
    <button
      type="button"
      className={['cr', card ? 'cd' : ''].filter(Boolean).join(' ')}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className={checked ? 'cb on' : 'cb'} aria-hidden="true">
        {checked ? <Icon name="check" /> : null}
      </span>
      <span>
        {text ? <span className="ct">{text}</span> : <b>{label}</b>}
        {sub ? <span className="cs">{sub}</span> : null}
      </span>
    </button>
  );
}

'use client';

// The error summary at the top of a form: "Check this field" / "Check these N fields" and one link per problem.
// Each link moves focus to its field. The box takes focus itself when it appears so a screen reader reads it.
import { forwardRef } from 'react';
import { ErrorIcon } from './icons';

export type SummaryItem = {
  /** The control's id, so the link can focus it. */
  fieldId: string;
  message: string;
  /** A link to another page (a problem fixed on a different step). Without it the link focuses the field here. */
  href?: string;
};

// Moves focus to a field's control (the text input, select or first segmented button).
function focusField(fieldId: string) {
  const el = document.getElementById(fieldId);
  if (el) {
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }
}

export const ErrorSummary = forwardRef<HTMLDivElement, { items: SummaryItem[] }>(function ErrorSummary({ items }, ref) {
  const n = items.length;
  if (n === 0) return null;
  return (
    <div className="es" role="alert" tabIndex={-1} ref={ref}>
      <p>
        <ErrorIcon />
        <span>{n === 1 ? 'Check this field' : `Check these ${n} fields`}</span>
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              href={item.href ?? `#${item.fieldId}`}
              className="lk"
              onClick={
                item.href
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      focusField(item.fieldId);
                    }
              }
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

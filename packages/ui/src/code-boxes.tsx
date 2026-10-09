'use client';

// Six-digit code entry. One real input (numbers only, with the one-time-code hint so phones suggest the code
// from the email) sits invisibly over six drawn boxes. The next empty box shows the focus ring and a caret.
// `error` draws the thicker box borders of the wrong-code and expired-code states.
import { useState } from 'react';

export const CODE_LENGTH = 6;

export function CodeBoxes({
  value,
  onChange,
  error,
  autoFocus,
  describedBy,
  onComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  /** Id of the error message under the boxes. */
  describedBy?: string;
  /** Called when the sixth digit is typed or pasted. */
  onComplete?: (code: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const active = value.length < CODE_LENGTH ? value.length : -1;

  // Keeps only digits, caps at six, and tells the parent when the code is complete.
  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(digits);
    if (digits.length === CODE_LENGTH) onComplete?.(digits);
  }

  return (
    <div className={error ? 'cx err' : 'cx'} role="group" aria-label="6-digit code">
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <div key={i} className={focused && i === active ? 'cx-box f5' : 'cx-box'} aria-hidden="true">
          {value[i] ?? ''}
        </div>
      ))}
      <input
        className="cx-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={value}
        autoFocus={autoFocus}
        aria-label="6-digit code"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => handle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

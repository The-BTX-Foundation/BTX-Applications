'use client';

// "Your application (PDF)": opens the browser's print dialog, where "Save as PDF" makes the file. A real PDF export
// (with the application number and every answer) comes later.
import { Icon } from '@btx/ui';

export function PrintLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Icon name="download" />
      <span className="lk">Your application (PDF)</span>
    </button>
  );
}

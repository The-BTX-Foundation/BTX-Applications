// Loading skeleton pieces: grey blocks shaped like the page, no spinner. All are hidden from screen readers; the page's
// skeleton adds one sr-only h1 and a "Loading <page>" status line (see DESIGN-DNA.md, Shared layer).
import type { CSSProperties } from 'react';

// One grey block (a line of text by default). `style` sets its width or height where the shape needs it.
export function Sk({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={`rf-sk${className ? ` ${className}` : ''}`} style={style} />;
}

// A panel heading's grey block.
export function SkPanelHead() {
  return (
    <div className="rf-sk-ph">
      <Sk />
    </div>
  );
}

// A tab bar's grey blocks (`n` tabs).
export function SkTabs({ n = 3, hidden = false }: { n?: number; hidden?: boolean }) {
  return (
    <div className="rf-sk-tabs" aria-hidden={hidden || undefined}>
      {Array.from({ length: n }, (_, i) => (
        <Sk key={i} />
      ))}
    </div>
  );
}

// `n` list rows: the icon cell, a title and a meta line, and the trailing control.
export function SkRows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rf-sk-row">
          <Sk className="rf-c" />
          <span className="rf-lines">
            <Sk />
            <Sk />
          </span>
          <Sk />
        </div>
      ))}
    </>
  );
}

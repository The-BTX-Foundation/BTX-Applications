// The two plain states a section can be in besides its content: empty (one muted line, .rf-none) and load error (one line
// with the alert mark and a Try again button, .rf-load-err; the rest of the page still shows). While the retry runs, the
// error line holds the section's skeleton (`retrying` + `skeleton`), so the box does not jump.
import type { ReactNode } from 'react';
import { Icon } from './icons';

type StateLineProps =
  | { kind: 'empty'; children: ReactNode }
  | { kind: 'error'; children: ReactNode; onRetry: () => void; retrying?: boolean; skeleton?: ReactNode };

// One state line.
export function StateLine(props: StateLineProps) {
  if (props.kind === 'empty') return <p className="rf-none">{props.children}</p>;
  if (props.retrying) {
    return (
      <div className="rf-load-err rf-retrying" aria-busy="true">
        {props.skeleton}
      </div>
    );
  }
  return (
    <div className="rf-load-err" role="alert">
      <p>
        <Icon name="alert" />
        {props.children}
      </p>
      <button type="button" className="rf-btn" onClick={props.onRetry}>
        Try again
      </button>
    </div>
  );
}

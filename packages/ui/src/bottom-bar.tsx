// The action bar under the work area: Back on the left, the one gold action on the right. On phone it is
// pinned to the bottom of the screen; on laptop it sits under the work area and lines up with its column.
import type { ReactNode } from 'react';

export function BottomBar({
  back,
  primary,
  note,
  className,
}: {
  /** The Back button or link (leave out on the first screen). */
  back?: ReactNode;
  /** The one gold action. */
  primary: ReactNode;
  /** A small muted note beside the action (laptop only), like "Saved 4:12 PM". */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `bar ${className}` : 'bar'}>
      <div className="bw">
        {back}
        <div className="bx">
          {note ? <span className="bn">{note}</span> : null}
          {primary}
        </div>
      </div>
    </div>
  );
}

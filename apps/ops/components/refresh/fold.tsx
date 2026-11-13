'use client';

// Motion and text helpers every refreshed page uses: the height fold that every open/close and add/remove uses (nothing
// jumps), the fold timing that honors reduced motion (as a plain read and as a hook), the phone check, and the "names,
// codes and amounts never break" text helper.
import { Fragment, useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';

/** The fold length in ms (the demo's 230 ms; the CSS --fold is .22s plus a frame). */
export const FOLD_MS = 230;

/** True when the person asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How long a fold takes right now: FOLD_MS, or 0 with reduced motion (use it to time a removal after a fold closes). */
export function foldMs(): number {
  if (typeof window === 'undefined') return FOLD_MS;
  return prefersReducedMotion() ? 0 : FOLD_MS;
}

/** foldMs() as React state: follows the reduced-motion setting live (FOLD_MS on the server and the first render). */
export function useFoldMs(): number {
  const [ms, setMs] = useState(FOLD_MS);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMs(mq.matches ? 0 : FOLD_MS);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return ms;
}

/** True on the phone layout (under 760px, as in the demos). */
export function isPhone(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 759px)').matches;
}

type FoldProps = HTMLAttributes<HTMLDivElement> & { open: boolean; appear?: boolean; children: ReactNode; [data: `data-${string}`]: string | undefined };

// A block that opens and closes by animating its height (CSS grid rows 0fr <-> 1fr). With `appear`, it mounts closed
// and opens on the next frames, so a new or restored row grows into place instead of jumping in.
export function Fold({ open, appear = false, className, children, ...rest }: FoldProps) {
  const [appeared, setAppeared] = useState(!appear);
  useEffect(() => {
    if (appeared) return;
    let r2 = 0;
    // Two frames: the closed state must paint once before opening, or the browser skips the transition.
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setAppeared(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [appeared]);
  const closed = !(open && appeared);
  return (
    <div {...rest} className={`rf-fold${className ? ` ${className}` : ''}${closed ? ' rf-closed' : ''}`}>
      <div className="rf-fold-in">{children}</div>
    </div>
  );
}

const DATE = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2}(?:, \\d{1,2}:\\d{2} [AP]M)?';
const MONEY = '\\(\\$[\\d,]+\\)|\\$[\\d,]+';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Draws text with every name (and "Name's"), date ("Thu Nov 19, 7:00 PM") and amount ("($4,830)") kept on one line.
export function Nw({ text, names = [] }: { text: string; names?: string[] }) {
  // Longest names first, so "Ana Maria" wins over "Ana".
  const alts = [...names.filter(Boolean).sort((a, b) => b.length - a.length).map((n) => `${esc(n)}'s|${esc(n)}`), DATE, MONEY];
  const rx = new RegExp(`(${alts.join('|')})`, 'g');
  // split() with a capture group puts the matches at the odd indexes.
  const parts = text.split(rx);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rf-nowrap">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

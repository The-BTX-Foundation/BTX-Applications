'use client';

// Small parts the four Scholarships pages share: the video-camera mark, the round initials avatar, and the confirm
// dialog (scrim + a white card with a title, a paragraph and two buttons) used by "Re-run pairing", "Publish score" and
// the Selection confirm.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { OIcon } from './icons';

// The video-camera mark beside "Video" (17px on laptop, 15px on the phone cards).
export function VideoMark({ size = 17 }: { size?: number }) {
  return (
    <svg className="o-i" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="5" width="11" height="10" rx="2" />
      <path d="M13 9l5-2.8v7.6L13 11" />
    </svg>
  );
}

// The round initials avatar (24px on laptop lists). A "?" avatar stands for nobody yet.
export function Avatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return (
    <span className="s-av" style={{ height: size, minWidth: size }}>
      {initials}
    </span>
  );
}

// A modal dialog: closes on Escape or a click on the scrim, focuses its first button when it opens.
export function Dialog({ title, width = 460, onClose, children }: { title: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="s-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="s-dlg" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// A progress ring for scoring: n of 6 criteria picked. Gold arc while a draft is open, ink when all six are in (Figma
// "Progress ring", sizes 38 on the queue and 52 on the phone card).
export function ScoreRing({ n, size, of = 6 }: { n: number; size: 38 | 44 | 52; of?: number }) {
  const stroke = size === 38 ? 3.5 : size === 44 ? 4 : 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const half = size / 2;
  return (
    <span className="s-ring" style={{ width: size, height: size, fontSize: size === 38 ? 12 : size === 44 ? 12 : 13 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={half} cy={half} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {n > 0 ? (
          <circle
            cx={half}
            cy={half}
            r={r}
            fill="none"
            stroke={n >= of ? 'var(--ink)' : 'var(--gold)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${((c * n) / of).toFixed(1)} ${c.toFixed(1)}`}
            transform={`rotate(-90 ${half} ${half})`}
          />
        ) : null}
      </svg>
      <b>{n}/{of}</b>
    </span>
  );
}

// The phone scorecard's own top bar: a back arrow, the title and the avatar (it covers the shell's phone top bar).
export function PhoneBar({ title, initials = 'DM' }: { title: string; initials?: string }) {
  const router = useRouter();
  return (
    <div className="s-pbar o-ph">
      <button type="button" className="o-ib" aria-label="Back" onClick={() => router.back()}>
        <OIcon name="right" size={22} className="s-back" />
      </button>
      <b>{title}</b>
      <span className="o-av">{initials}</span>
    </div>
  );
}

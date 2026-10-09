'use client';

// Small parts the four Scholarships pages share: the video-camera mark, the round initials avatar, and the confirm
// dialog (scrim + a white card with a title, a paragraph and two buttons) used by "Re-run pairing", "Publish score" and
// the Selection confirm.
import { useEffect, useRef } from 'react';

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

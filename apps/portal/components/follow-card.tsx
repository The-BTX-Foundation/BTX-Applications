// The "Follow BTX" card (Instagram and LinkedIn), shared by the status screens. Styles come from the status page.
import { Icon } from '@btx/ui';
import { LINKEDIN_URL } from '@/lib/config';
import s from './status-view.module.css';

export function FollowCard({ className }: { className?: string }) {
  return (
    <section className={`${s.follow} ${className ?? ''}`}>
      <span className={s.bar} aria-hidden="true" />
      <h2 className={s.followTitle}>Follow BTX</h2>
      <p className={s.followText}>Stories from BTX scholars, events and news.</p>
      <div className={s.links}>
        <a href="https://www.instagram.com/btxfoundation" className={s.link}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="6" />
            <circle cx="12" cy="12" r="4.2" />
            <circle cx="17.4" cy="6.6" r="1.1" fill="var(--ink)" stroke="none" />
          </svg>
          <span>Instagram</span>
          <b>@btxfoundation</b>
          <Icon name="ext" small />
        </a>
        <a href={LINKEDIN_URL} className={s.link}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="var(--ink)"
              fillRule="evenodd"
              d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
            />
          </svg>
          <span>LinkedIn</span>
          <b>BTX Foundation</b>
          <Icon name="ext" small />
        </a>
      </div>
    </section>
  );
}

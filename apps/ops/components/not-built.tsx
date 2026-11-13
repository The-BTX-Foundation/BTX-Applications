// The "not built yet" screen, the safe fallback for a sidebar route that has no page (every sidebar item has one now).
// A calm card on the wash ground with a way back to Today.
import Link from 'next/link';
import '@/components/refresh/refresh.css';
import './shell-finish.css';
import { ShellMark } from './shell-mark';

// Draws the page's name as the one h1, then the card; the h2 inside is the message.
export function NotBuilt({ title }: { title: string }) {
  return (
    <div className="rf sf">
      <div className="sf-pg">
        <h1 className="sf-title">{title}</h1>
        <section className="sf-card" aria-live="polite">
          <ShellMark />
          <h2>This page isn’t built yet</h2>
          <p>It is still being designed and built.</p>
          <div className="sf-acts">
            <Link className="rf-btn rf-btn-gold" href="/">
              Back to Today
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

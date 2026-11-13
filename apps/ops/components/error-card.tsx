// The "Something went wrong" card used by the shell's error boundary. It takes only a retry callback on purpose: it is
// never handed the error, so a message or stack can't leak onto the screen.
import Link from 'next/link';
import '@/components/refresh/refresh.css';
import './shell-finish.css';
import { ShellMark } from './shell-mark';

// Draws the card: the message, the one gold primary (Try again) and a quiet link to Today.
export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rf sf">
      <div className="sf-pg sf-alone">
        <section className="sf-card" role="alert">
          <ShellMark />
          <h1>Something went wrong</h1>
          <p>This page didn’t load. Try again, or go back to Today.</p>
          <div className="sf-acts">
            <button type="button" className="rf-btn rf-btn-gold" onClick={onRetry}>
              Try again
            </button>
            <Link className="rf-btn" href="/">
              Back to Today
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

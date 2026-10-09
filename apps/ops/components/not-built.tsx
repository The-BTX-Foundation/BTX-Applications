// The "Not built yet" card, shared by every sidebar route that has no page yet and by the cycle settings page.
import { AlertMark } from './icons';

export function NotBuilt() {
  return (
    <section className="o-err" aria-live="polite">
      <AlertMark />
      <h2>Not built yet</h2>
      <p>This page is still being designed and built.</p>
    </section>
  );
}

// The 404 screen: a simple centered card on the wash ground with the BTX mark and a way back to Today. Next draws it
// for any path no page handles (inside the shell when the person is signed in, because the shell's catch-all route
// raises it).
import Link from 'next/link';
import type { Metadata } from 'next';
import '@/components/refresh/refresh.css';
import '@/components/shell-finish.css';
import { ShellMark } from '@/components/shell-mark';

export const metadata: Metadata = { title: 'Page not found' };

// The card.
export default function NotFound() {
  return (
    <div className="rf sf">
      <div className="sf-pg sf-alone">
        <img className="sf-logo" src="/btx-logo-on-light.webp" alt="The BTX Foundation" width={77} height={34} />
        <section className="sf-card">
          <ShellMark />
          <h1>That page doesn’t exist</h1>
          <p>The address may be mistyped, or the page may have moved.</p>
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

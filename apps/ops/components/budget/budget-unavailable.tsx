// /finance/budget/approval?plan=<id> when that plan does not exist or the viewer cannot see it: the title, the way back to
// Budget and one plain line. It never falls back to a different plan (a link must not approve the wrong quarter).
import '@/components/refresh/refresh.css';
import './budget.css';
import Link from 'next/link';
import { Icon } from '@/components/refresh/icons';
import { PageHeader } from '@/components/refresh/page-header';
import { headDate } from '@/lib/budget-map';

// The "That plan isn't available." page. `today` is the Eastern day ("2026-11-12") for the header's date.
export function BudgetUnavailable({ today }: { today: string }) {
  return (
    <div className="rf bu bu-ap">
      <PageHeader title="Budget" date={headDate(today)} />
      <Link className="rf-lnk bu-back" href="/finance/budget">
        <Icon name="back" />
        Budget
      </Link>
      <div className="bu-solo">
        <section className="rf-panel" aria-label="Plan">
          <div className="rf-pcard">
            <p className="rf-none">That plan isn&apos;t available.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

// Money actions that write are not open yet (owner, 2026-10-12). On Budget (and the phone approval screen), Fundraising
// and Grants each one shows as a disabled control with a small "Coming soon" label instead of opening its form. The
// pages still load and show whatever data exists; the write code in lib/money-writes.ts stays for later.
import { OIcon } from '@/components/icons';

/** The small "Coming soon" label beside a disabled money action. */
export function SoonTag() {
  return <span className="mn-soon">Coming soon</span>;
}

/** A header action ("Log spending", "Log a gift", "Add a grant"): the laptop button and the phone "+", both disabled. */
export function SoonHeaderAction({ label }: { label: string }) {
  return (
    <>
      <span className="mn-soonw o-lg">
        <button type="button" className="o-btn s lg" disabled aria-disabled="true">
          <OIcon name="plus" size={16} />
          {label}
        </button>
        <SoonTag />
      </span>
      <span className="mn-soonw o-ph">
        <SoonTag />
        <button type="button" className="o-sq" disabled aria-disabled="true" aria-label={`${label} (coming soon)`}>
          <OIcon name="plus" size={22} />
        </button>
      </span>
    </>
  );
}

/** An inline action ("Update", "Undo"): disabled, with the label after it. */
export function SoonLink({ label }: { label: string }) {
  return (
    <span className="mn-soonw">
      <button type="button" className="mn-link" disabled aria-disabled="true">
        {label}
      </button>
      <SoonTag />
    </span>
  );
}

/** A row of action buttons ("Approve $4,830 for Q4", "Decline"), disabled, with the label after them. */
export function SoonButtons({ primary, secondary, small }: { primary?: string; secondary?: string; small?: boolean }) {
  const size = small ? ' mn-b36' : '';
  return (
    <div className="mn-qa mn-soonw">
      {primary ? (
        <button type="button" className={`o-btn p${size}`} disabled aria-disabled="true">
          {primary}
        </button>
      ) : null}
      {secondary ? (
        <button type="button" className={`o-btn s${size}`} disabled aria-disabled="true">
          {secondary}
        </button>
      ) : null}
      <SoonTag />
    </div>
  );
}

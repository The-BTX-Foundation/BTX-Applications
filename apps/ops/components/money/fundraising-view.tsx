'use client';

// Money > Fundraising (Figma laptop and phone): the five numbers, recent gifts, where the money came from, and the
// Year-end giving checklist. Data: lib/fundraising.ts. "Log a gift" (and editing a gift) is "Coming soon" for now
// (owner, 2026-10-12): a disabled control with a small label (./soon.tsx); lib/money-writes.ts keeps logGift for later.
import Link from 'next/link';
import { MOCK_NOW } from '@/mock/applicants';
import { PageHeader } from '@/components/page-header';
import { dateOnlyLabel } from '@/lib/format';
import { useMockState } from '@/lib/mock-store';
import { GIFT_SOURCES, pct, usd, type FundraisingData } from '@/lib/money-shared';
import { SoonHeaderAction } from './soon';
import { Bar, PeriodChip } from './ui';
import { WideChecklistPanel } from './wide-checklist';

type State = Pick<FundraisingData, 'raised_cents' | 'donors' | 'new_donors' | 'monthly_donors' | 'sources' | 'recent'>;

export function FundraisingView({ data, demo }: { data: FundraisingData; demo?: string }) {
  const live = data.mode === 'live';
  const initial: State = { raised_cents: data.raised_cents, donors: data.donors, new_donors: data.new_donors, monthly_donors: data.monthly_donors, sources: data.sources, recent: data.recent };
  const [mock] = useMockState<State>(`fundraising:${demo ?? ''}`, initial);
  const s = live ? initial : mock;
  const goal = data.goal_cents;
  const max = Math.max(1, ...s.sources.map((x) => x.cents));

  const toGo = Math.max(0, goal - s.raised_cents);
  // The laptop table's Source column is narrow, so it uses the short names.
  const shortName = (k: string | null) => ({ individual: 'Individual', corporate: 'Corporate', event: 'Event', grant: 'Grant' })[k as string] ?? '[source]';
  const sourceName = (k: string | null) => GIFT_SOURCES.find((x) => x.key === k)?.label ?? '[source]';

  return (
    <>
      <PageHeader
        title="Fundraising"
        sub={
          <>
            <span className="o-lg">{`Q3 brought in ${usd(data.q3_cents)} · ${usd(toGo)} to go by Dec 31`}</span>
            <span className="o-ph">{`Money · ${usd(s.raised_cents)} of ${usd(goal)} raised`}</span>
          </>
        }
        actionsClass="mn-acts"
      >
        <span className="o-lg">
          <PeriodChip year={2026} />
        </span>
        <SoonHeaderAction label="Log a gift" />
      </PageHeader>
      <div className="o-ph mn-chiprow">
        <PeriodChip year={2026} phone />
      </div>

      <section className="mn-stats" aria-label="Fundraising numbers">
        <div className="o-card mn-stat">
          <p className="mn-sl">Raised</p>
          <p className="mn-sv">{usd(s.raised_cents)}</p>
          <p className="mn-ss">
            <span className="o-lg">of {usd(goal)}</span>
            <span className="o-ph">
              {pct(s.raised_cents, goal)}% of {usd(goal)}
            </span>
          </p>
          <span className="mn-pct o-lg">{pct(s.raised_cents, goal)}%</span>
        </div>
        <div className="o-card mn-stat">
          <p className="mn-sl">Donors</p>
          <p className="mn-sv">{s.donors}</p>
          <p className="mn-ss">Gave this year</p>
        </div>
        <div className="o-card mn-stat">
          <p className="mn-sl">Average gift</p>
          <p className="mn-sv">about {usd(data.avg_gift_cents)}</p>
          <p className="mn-ss">Across all gifts</p>
        </div>
        <div className="o-card mn-stat">
          <p className="mn-sl">New donors</p>
          <p className="mn-sv">{s.new_donors}</p>
          <p className="mn-ss">
            <span className="o-lg">This year</span>
            <span className="o-ph">{s.monthly_donors} give monthly</span>
          </p>
        </div>
        <div className="o-card mn-stat o-lg">
          <p className="mn-sl">Give monthly</p>
          <p className="mn-sv">{s.monthly_donors}</p>
          <p className="mn-ss">Donors who give every month</p>
        </div>
      </section>

      <WideChecklistPanel list={data.checklist} only="ph" now={data.mode === 'live' ? new Date().toISOString() : MOCK_NOW} />

      <div className="mn-two">
        <section className="o-card mn-panel mn-gifts" aria-labelledby="mn-g-h">
          <div className="mn-ph">
            <h2 id="mn-g-h">Recent gifts</h2>
            <span className="o-lg">Last 5</span>
            <Link href="/money/fundraising" className="mn-seeall">
              See all
            </Link>
          </div>
          <div className="mn-th mn-grow o-lg">
            <span>Date</span>
            <span>Donor</span>
            <span>Source</span>
            <span className="r">Amount</span>
          </div>
          {s.recent.map((g) => (
            <div key={g.id} className="mn-tr mn-grow">
              <span className="o-lg">{g.gift_on ? dateOnlyLabel(g.gift_on) : '[date]'}</span>
              <span className="o-lg">{g.donor || '[donor]'}</span>
              <span className="o-lg">{g.source ? shortName(g.source) : '[source]'}</span>
              <b className="r o-lg">{g.amount_cents != null ? usd(g.amount_cents) : '[amount]'}</b>
              <span className="mn-gph o-ph">
                <b>{g.donor || '[donor]'}</b>
                <b>{g.amount_cents != null ? usd(g.amount_cents) : '[amount]'}</b>
                <span>
                  {g.gift_on ? dateOnlyLabel(g.gift_on) : '[date]'} · {g.source ? sourceName(g.source) : '[source]'}
                </span>
              </span>
            </div>
          ))}
        </section>

        <section className="o-card mn-panel mn-src" aria-labelledby="mn-s-h">
          <div className="mn-ph">
            <h2 id="mn-s-h">By source</h2>
            <span>
              <span className="o-lg">2026 so far, </span>share of {usd(s.raised_cents)}
            </span>
          </div>
          <div className="mn-src-b">
            {s.sources.map((x) => (
              <div key={x.key} className="mn-srow">
                <p>
                  <b>{x.label}</b>
                  <span>
                    <b>{usd(x.cents)}</b> {x.cents > 0 ? <i>{pct(x.cents, s.raised_cents)}%</i> : <i>none yet</i>}
                  </span>
                </p>
                <Bar pct={(x.cents / max) * 100} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <WideChecklistPanel list={data.checklist} only="lg" />

    </>
  );
}

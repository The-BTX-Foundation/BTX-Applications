// A stand-in for the steps that are not built yet (2 to 5), in the same shell as the real steps.
import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomBar, ButtonLink, StepProgress, StepRail, TopBar } from '@btx/ui';
import { STEPS } from '@/lib/steps';

export const metadata: Metadata = { title: 'Coming next' };

export default async function ComingNextPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  const n = Math.min(Math.max(Number(step) || 2, 2), STEPS.length);
  const steps = STEPS.map((s, i) => ({ ...s, status: i + 1 < n ? 'Done' : i + 1 === n ? 'In progress' : s.status, href: i === 0 ? '/apply/basic-info' : undefined }));
  return (
    <div className="app">
      <TopBar variant="signed-in" progress={<StepProgress total={STEPS.length} current={n} />} />
      <div className="wiz">
        <StepRail steps={steps} current={n} />
        <div className="wiz-main">
          <main className="wk">
            <div className="col">
              <h1 className="st">Coming next.</h1>
              <p className="ld">
                {STEPS[n - 1].name} is not ready yet. Your answers so far are saved. <Link href="/apply/basic-info" className="lk">Go back to Basic info</Link>.
              </p>
            </div>
          </main>
          <BottomBar
            back={
              <ButtonLink kind="s" icon="left" href="/apply/basic-info">
                Back
              </ButtonLink>
            }
            primary={<span />}
          />
        </div>
      </div>
    </div>
  );
}

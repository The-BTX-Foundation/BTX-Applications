'use client';

// The frame around every application step: top bar, step rail (laptop) or step progress (phone), the work area, and
// the bottom bar. Each step passes its own content and its Back and Continue buttons.
import type { ReactNode } from 'react';
import { BottomBar, ButtonLink, StepProgress, StepRail, TopBar, type Step } from '@btx/ui';
import type { CycleView } from '@/lib/cycle';

export function ApplyShell({
  current,
  steps,
  view,
  accountName,
  saved,
  onSubmit,
  backHref,
  primary,
  note,
  phoneNote,
  wide,
  children,
}: {
  /** The step on screen, counting from 1. */
  current: number;
  steps: Step[];
  view: CycleView;
  accountName: string;
  /** "Saved 4:12 PM", or nothing before the first save. */
  saved?: string;
  onSubmit?: (e: React.FormEvent) => void;
  backHref: string;
  primary: ReactNode;
  note?: ReactNode;
  /** Show the note on phone too (taller bar). */
  phoneNote?: boolean;
  /** 800px column (step 2) instead of 720px. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <TopBar
        variant="signed-in"
        accountName={accountName}
        progress={
          <StepProgress
            total={steps.length}
            current={current}
            saved={saved}
            done={steps.flatMap((s, i) => (s.done ? [i + 1] : []))}
          />
        }
      />
      <form className="wiz" onSubmit={onSubmit} noValidate style={wide ? ({ '--col': '800px' } as React.CSSProperties) : undefined}>
        <StepRail
          steps={steps}
          current={current}
          title={`${view.term ?? '[term]'} application`}
          subtitle={`${view.awardName ?? '[award name]'}. Apply by ${view.applyByLong}, ${view.deadlineTime} Eastern.`}
          saved={saved}
        />
        <div className="wiz-main">
          <main className="wk">
            <div className="col">{children}</div>
          </main>
          <BottomBar
            back={
              <ButtonLink kind="s" icon="left" href={backHref}>
                Back
              </ButtonLink>
            }
            primary={primary}
            note={note}
            phoneNote={phoneNote}
          />
        </div>
      </form>
    </div>
  );
}

// The Budget routes (app/(shell)/(budget)/finance/budget[/approval]/page.tsx): both require staff, hand the loader's view
// (with its caps) to the board unchanged, pass the approval page's ?plan= to the loader, and draw "That plan isn't
// available." for an unknown plan (never a different plan).
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = vi.fn();
const staff = vi.fn();
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/budget-view-loader', () => ({ loadBudgetView: (...a: unknown[]) => load(...a) }));
vi.mock('@/lib/user', () => ({ requireStaff: () => staff() }));
vi.mock('@/components/budget/budget-board', () => ({ BudgetBoard: () => null }));
vi.mock('@/components/budget/budget-skeleton', () => ({ BudgetSkeleton: () => null }));
vi.mock('@/components/budget/budget-unavailable', () => ({ BudgetUnavailable: () => null }));
vi.mock('@/components/load-error', () => ({ LoadError: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));

import BudgetPage from '@/app/(shell)/(budget)/finance/budget/page';
import BudgetApprovalPage from '@/app/(shell)/(budget)/finance/budget/approval/page';
import { BudgetBoard } from '@/components/budget/budget-board';
import { BudgetUnavailable } from '@/components/budget/budget-unavailable';
import { liveCaps } from '@/lib/budget-map';
import { BUDGET_VIEW } from '@/mock/budget-view';

const CAPS = { ...liveCaps(), comment: true };
type Props = { view: { caps: unknown }; live: boolean; mode: string };

describe('Budget routes', () => {
  beforeEach(() => {
    load.mockReset();
    staff.mockReset();
    staff.mockResolvedValue({ id: 'u1' });
    load.mockResolvedValue({ ...BUDGET_VIEW, caps: CAPS, failed: false });
  });
  it('the board page requires staff and wires the loader\'s caps through unchanged', async () => {
    const el = (await BudgetPage({ searchParams: Promise.resolve({}) })) as ReactElement<Props>;
    expect(staff).toHaveBeenCalledTimes(1);
    expect(isValidElement(el) && el.type).toBe(BudgetBoard);
    expect(el.props.view.caps).toBe(CAPS);
    expect([el.props.live, el.props.mode]).toEqual([true, 'page']);
    expect(load.mock.calls[0][0]).toEqual({ demo: undefined, me: 'u1' });
  });
  it('the approval page passes ?plan= to the loader and wires the caps through', async () => {
    const el = (await BudgetApprovalPage({ searchParams: Promise.resolve({ plan: 'abc' }) })) as ReactElement<Props>;
    expect(staff).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toEqual({ demo: undefined, me: 'u1', plan: 'abc' });
    expect(el.type).toBe(BudgetBoard);
    expect(el.props.view.caps).toBe(CAPS);
    expect(el.props.mode).toBe('approval');
  });
  it('a repeated ?plan= is not one plan', async () => {
    await BudgetApprovalPage({ searchParams: Promise.resolve({ plan: ['a', 'b'] }) });
    expect(load.mock.calls[0][0].plan).toBe('');
  });
  it('an unavailable plan draws the "isn\'t available" page', async () => {
    load.mockResolvedValue({ failed: true, unavailable: true });
    const el = (await BudgetApprovalPage({ searchParams: Promise.resolve({ plan: 'abc' }) })) as ReactElement;
    expect(el.type).toBe(BudgetUnavailable);
  });
});

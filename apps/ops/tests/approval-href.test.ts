// The Review link of an approval carries the plan it belongs to, so it opens THAT plan on /finance/budget/approval and
// never "Q4 of the newest year" (Budget review, 2026-11-12). Without a plan id (mock data, a checklist with no plan) it is the
// bare page, which opens the plan awaiting approval.
import { describe, expect, it } from 'vitest';
import { approvalDetail } from '@/lib/daily-tasks';
import { approvalHref, mapTask as mapTodayTask } from '@/lib/today-map';
import { APPROVAL_HREF, mapApproval, mapTask } from '@/lib/tasks-map';
import type { TaskItem } from '@/lib/tasks-shared';

const PLAN = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';

describe('approvalHref', () => {
  it('carries a plan id', () => {
    expect(approvalHref(PLAN)).toBe(`/finance/budget/approval?plan=${PLAN}`);
  });

  it('falls back to the bare page for no id, an empty id or an id that is not a uuid', () => {
    expect(approvalHref()).toBe(APPROVAL_HREF);
    expect(approvalHref(null)).toBe(APPROVAL_HREF);
    expect(approvalHref('')).toBe(APPROVAL_HREF);
    expect(approvalHref('q4; drop table')).toBe(APPROVAL_HREF);
    expect(approvalHref('../../x')).toBe(APPROVAL_HREF);
  });
});

describe('approval links on Today and Tasks', () => {
  const detail = approvalDetail({ id: PLAN, quarter: 4, year: 2026 }, [{ label: 'Scholarships', cents: 250000 }], null, null);

  it('approvalDetail records the plan id', () => {
    expect(detail.planId).toBe(PLAN);
  });

  it('the Tasks approval panel and Review link point at that plan', () => {
    expect(mapApproval(detail).href).toBe(`/finance/budget/approval?plan=${PLAN}`);
    const t = { id: 't1', title: 'Approve the Q4 plan', type: 'approval', type_label: 'Approval', area: 'money', area_name: 'Finance', status: 'open', due_on: null, bucket: 'later', owner_id: null, context: null, mine: true, team: true, comment_count: 0, approval: detail } as unknown as TaskItem;
    expect(mapTask('2026-11-12', t, []).link).toEqual({ label: 'Review', href: `/finance/budget/approval?plan=${PLAN}` });
  });

  it('the Today row links to that plan too', () => {
    const row = mapTodayTask({ id: 't1', title: 'Approve the Q4 plan', type: 'approval', area_name: 'Finance', due_on: null, comment_count: 0, approval: { planId: PLAN } });
    expect(row.link).toEqual({ label: 'Review', href: `/finance/budget/approval?plan=${PLAN}` });
  });

  it('an approval with no plan keeps the bare link (mock data)', () => {
    const row = mapTodayTask({ id: 't1', title: 'Approve the Q4 plan', type: 'approval', area_name: 'Finance', due_on: null, comment_count: 0 });
    expect(row.link).toEqual({ label: 'Review', href: APPROVAL_HREF });
  });
});

// The live Budget board draws no working money write (rule 3a): Approve, Decline, Undo, Log spending and Update funds are
// switched-off controls (aria-disabled, still reachable by keyboard, described by their "Coming soon" tag), and the mock-only
// comment reply, chat reply and nudge are not drawn at all. Also: who the "Approved" line names, the declined and failed-load
// states, and that the board never imports the money-write code.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/finance/budget' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@/lib/mock-store', () => ({ useMockState: <T,>(_k: string, init: T) => [init, () => {}] }));

import { BudgetBoard } from '@/components/budget/budget-board';
import { approvalHref, approvedBy } from '@/components/budget/budget-plan';
import { liveCaps } from '@/lib/budget-map';
import type { BudgetView } from '@/lib/budget-view';
import { BUDGET_VIEW, BUDGET_VIEW_EMPTY } from '@/mock/budget-view';

// The board's HTML for a live view (every cap off), in page or approval mode.
function html(view: BudgetView, mode: 'page' | 'approval') {
  return renderToStaticMarkup(createElement(BudgetBoard, { view: { ...view, caps: liveCaps() }, live: true, mode }));
}
// Every <button …>…</button> in the HTML whose text contains `word`.
const buttons = (h: string, word: string) => [...h.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].filter((m) => m[2].replace(/<[^>]+>/g, '').includes(word));
// A switched-off control: aria-disabled (not the disabled attribute, which takes it out of the tab order) and described by
// a "Coming soon" tag that exists in the HTML.
function expectOff(h: string, attrs: string) {
  expect(attrs).toContain('aria-disabled="true"');
  expect(attrs).not.toMatch(/\sdisabled=""/);
  const id = attrs.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(id).toBeTruthy();
  expect(h).toContain(`id="${id}">Coming soon</span>`);
}
// The sample with its plan approved by `decidedBy`.
function approved(decidedBy: BudgetView['plan']['decidedBy']): BudgetView {
  return { ...BUDGET_VIEW, plan: { ...BUDGET_VIEW.plan, status: 'approved', decidedBy, decidedAt: '2026-11-10T14:00:00Z' } };
}

describe('live Budget board', () => {
  for (const mode of ['page', 'approval'] as const) {
    it(`${mode}: Approve and Decline are switched off with "Coming soon"`, () => {
      const h = html(BUDGET_VIEW, mode);
      for (const w of ['Approve', 'Decline']) {
        const b = buttons(h, w);
        expect(b.length).toBeGreaterThan(0);
        for (const m of b) expectOff(h, m[1]);
      }
      // No working approve/decline hooks, no comment reply box.
      expect(h).not.toMatch(/data-k="(page|full):(approve|decline|why|reply)"/);
    });
    it(`${mode}: a decided plan's Undo is switched off`, () => {
      const h = html(approved({ name: 'Dana Mercer', me: true }), mode);
      const b = buttons(h, 'Undo');
      expect(b.length).toBeGreaterThan(0);
      for (const m of b) expectOff(h, m[1]);
      expect(h).not.toMatch(/data-k="(page|full):aundo"/);
    });
    it(`${mode}: a declined plan reads "Sent back to" with its note and a switched-off Undo`, () => {
      const h = html({ ...BUDGET_VIEW, plan: { ...BUDGET_VIEW.plan, status: 'declined', declineNote: 'Trim outreach to $100.', decidedAt: '2026-11-10T14:00:00Z' } }, mode);
      expect(h).toContain('Sent back to');
      expect(h).toContain('Trim outreach to $100.');
      const undo = buttons(h, 'Undo');
      expect(undo.length).toBe(1);
      expectOff(h, undo[0][1]);
      expect(buttons(h, 'Approve')).toEqual([]);
    });
    it(`${mode}: a failed load is the header and one alert line with Try again, and no second live region`, () => {
      const h = html({ ...BUDGET_VIEW, loadFailed: true }, mode);
      expect(h).toContain('Budget didn&#x27;t load.');
      expect(buttons(h, 'Try again').length).toBe(1);
      expect((h.match(/aria-live=|role="status"|role="alert"/g) ?? []).length).toBe(1);
      expect(h).toContain('role="alert"');
      expect(h).not.toContain('Approve');
    });
  }
  it('"Approved" names you only when you decided; a missing decider has no name', () => {
    const none = html(approved(null), 'approval');
    expect(none).toMatch(/Approved, /);
    expect(none).not.toMatch(/Approved by/);
    expect(html(approved({ name: 'Dana Mercer', me: true }), 'approval')).toContain('Approved by you');
    expect(html(approved({ name: 'Keith Dawson', me: false }), 'approval')).toContain('Approved by Keith Dawson');
    expect([approvedBy(true, null), approvedBy(false, null), approvedBy(true, { name: 'Keith Dawson', me: false })]).toEqual(['Approved', 'Approved by you', 'Approved by Keith Dawson']);
  });
  it('the plan title links to the approval page by plan id in live mode', () => {
    expect(approvalHref(true, '11111111-1111-4111-8111-111111111111', '')).toBe('/finance/budget/approval?plan=11111111-1111-4111-8111-111111111111');
    expect(approvalHref(true, '', '')).toBe('/finance/budget/approval');
    expect(approvalHref(false, 'plan-q4', '?demo=stress')).toBe('/finance/budget/approval?demo=stress');
    expect(html(BUDGET_VIEW, 'page')).toContain('href="/finance/budget/approval?plan=plan-q4"');
  });
  it('page: Log spending and Update funds are switched off; no chat reply, no nudge', () => {
    const h = html(BUDGET_VIEW, 'page');
    // Log spending is a switched-off row with the button role, Update a switched-off button; both carry "Coming soon".
    expect(buttons(h, 'Log spending')).toEqual([]);
    const row = h.match(/<div class="bu-add-open bu-off"([^>]*)>[\s\S]*?Log spending/);
    expect(row?.[1]).toContain('role="button"');
    expect(row?.[1]).toContain('tabindex="0"');
    expectOff(h, row?.[1] ?? '');
    const u = buttons(h, 'Update');
    expect(u.length).toBe(1);
    expectOff(h, u[0][1]);
    expect(h).not.toMatch(/data-k="(sp:open|sp:in|funds:edit|funds:in|chat:in)"/);
    const e = html(BUDGET_VIEW_EMPTY, 'page');
    expect(e).not.toContain('Nudge');
  });
  it('page: "And N more" counts every spending row of the quarter, not only the five sent', () => {
    const spend = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, on: '2026-11-02', categoryId: 'ops', category: 'Operations', title: 'x', cents: 100 }));
    const h = html({ ...BUDGET_VIEW, spend, spendAll: { count: 12, cents: 1_200 } }, 'page');
    expect(h).toContain('And 7 more this quarter');
  });
  it('has exactly one live region (the announcer)', () => {
    const h = html(approved({ name: 'Dana Mercer', me: true }), 'page');
    expect((h.match(/aria-live=|role="status"|role="alert"/g) ?? []).length).toBe(1);
  });
});

// Whether a file exists.
function exists(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

// The entry file and every local file it imports, followed transitively (only "@/" and relative imports), relative to apps/ops.
function importGraph(entry: string): string[] {
  const root = join(__dirname, '..');
  const seen = new Set<string>();
  // Reads one file and visits what it imports.
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+'([^']+)'|import\s+'([^']+)'/g)) {
      const spec = m[1] ?? m[2];
      const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? join(dirname(file), spec) : null;
      if (!base) continue;
      const hit = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((x) => base + x).find(exists);
      if (hit) visit(hit);
    }
  };
  visit(join(root, entry));
  return [...seen].map((f) => f.slice(root.length + 1));
}

describe('the Budget routes never reach the money-write code', () => {
  it.each(['components/budget/budget-board.tsx', 'app/(shell)/(budget)/finance/budget/page.tsx', 'app/(shell)/(budget)/finance/budget/approval/page.tsx'])('%s', (entry) => {
    const files = importGraph(entry);
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((f) => /money-writes|use-budget/.test(f))).toEqual([]);
  });
});

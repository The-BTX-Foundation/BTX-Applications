// The live Cycle settings board draws only what the caller may do (caps from lib/cycle-settings-rows capsFor, built from
// the role the auth server gave): a board member and an archived cycle get no Edit, Set, Remove, Add or Publish; an admin
// gets Edit everywhere, Publish on a draft (switched off while another cycle is published), and Unpublish only while nobody
// has applied. Also: one polite live region, no aria-live or role=alert anywhere else, long text wraps.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/cycle/settings' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@/lib/cycle-settings-actions', () => ({ saveCycleFields: vi.fn(), publishCycleNow: vi.fn(), unpublishCycleNow: vi.fn() }));

import { CycleSettingsBoard } from '@/components/cycle-settings/cycle-settings-board';
import { capsFor } from '@/lib/cycle-settings-rows';
import type { CycleSettingsView } from '@/lib/cycle-settings-view';
import { CS_VIEW, CS_VIEW_DRAFT, CS_VIEW_STRESS } from '@/mock/cycle-settings-view';

// The board's HTML for a live view whose caps come from `admin`, the cycle's status and the applications count.
function html(base: CycleSettingsView, admin: boolean, patch: Partial<CycleSettingsView> = {}, status?: string) {
  const cycle = base.cycle ? { ...base.cycle, status: status ?? base.cycle.status } : null;
  const v = { ...base, ...patch, cycle };
  const view: CycleSettingsView = { ...v, canEdit: admin, caps: capsFor(admin, cycle?.status ?? '', v.applications, false) };
  return renderToStaticMarkup(createElement(CycleSettingsBoard, { view, live: true }));
}
const texts = (h: string) => [...h.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]+>/g, '') }));
const has = (h: string, word: string) => texts(h).some((b) => b.text === word);
const WRITES = ['Edit', 'Set', 'Remove', 'Add a requirement', 'Publish', 'Unpublish'];

describe('live Cycle settings board', () => {
  it('a board member sees the settings and no write control', () => {
    const h = html(CS_VIEW, false);
    for (const w of WRITES) expect(has(h, w)).toBe(false);
    expect(h).toContain('Only board members with admin rights can change these settings.');
    expect(h).toContain('Fall 2026 · Published · View only');
    // the event switch is drawn but switched off
    expect(texts(h).filter((b) => b.text === 'On' || b.text === 'Off').every((b) => /\sdisabled=""/.test(b.attrs))).toBe(true);
  });
  it('an archived cycle is view only, even for an admin', () => {
    const h = html(CS_VIEW, true, {}, 'archived');
    for (const w of WRITES) expect(has(h, w)).toBe(false);
    expect(h).toContain('Fall 2026 · Archived · View only');
  });
  it('an admin edits a running cycle but cannot unpublish it once students applied', () => {
    const h = html(CS_VIEW, true);
    expect(has(h, 'Edit')).toBe(true);
    expect(has(h, 'Add a requirement')).toBe(true);
    expect(has(h, 'Unpublish')).toBe(false);
    expect(has(h, 'Publish')).toBe(false);
  });
  it('an admin can unpublish only before applications open and while none is submitted', () => {
    const ahead = { ...CS_VIEW, cycle: { ...CS_VIEW.cycle!, opens_at: '2026-12-01T14:00:00.000Z', closes_at: '2026-12-20T04:59:00.000Z' } };
    expect(has(html(ahead, true, { applications: 0 }), 'Unpublish')).toBe(true);
    expect(has(html(ahead, true, { applications: 1 }), 'Unpublish')).toBe(false);
    // opened (Oct 12, before the view's now): no Unpublish even with no submitted application
    expect(has(html(CS_VIEW, true, { applications: 0 }), 'Unpublish')).toBe(false);
  });
  it('Publish on a draft is switched off while it misses settings or another cycle is published', () => {
    const missing = texts(html(CS_VIEW_DRAFT, true)).find((b) => b.text === 'Publish')!;
    expect(missing.attrs).toMatch(/\sdisabled=""/);
    const complete = { ...CS_VIEW_DRAFT, cycle: { ...CS_VIEW.cycle!, id: 'x', term: 'Spring 2027', status: 'draft' } };
    expect(texts(html(complete, true)).find((b) => b.text === 'Publish')!.attrs).toMatch(/\sdisabled=""/);
    const free = texts(html(complete, true, { otherPublishedTerm: null })).find((b) => b.text === 'Publish')!;
    expect(free.attrs).not.toMatch(/\sdisabled=""/);
    expect(has(html(complete, false, { otherPublishedTerm: null }), 'Publish')).toBe(false);
  });
  it('has one polite live region and no alert roles', () => {
    const h = html(CS_VIEW_STRESS, true);
    expect(h.match(/aria-live=/g)).toHaveLength(1);
    expect(h).toContain('aria-live="polite"');
    expect(h).not.toContain('role="alert"');
  });
  it('a failed load shows the line and Try again, nothing to edit', () => {
    const h = html({ ...CS_VIEW, cycle: null, loadFailed: true }, true);
    expect(h).toContain('Cycle settings didn&#x27;t load.');
    expect(has(h, 'Try again')).toBe(true);
    for (const w of WRITES) expect(has(h, w)).toBe(false);
  });
});

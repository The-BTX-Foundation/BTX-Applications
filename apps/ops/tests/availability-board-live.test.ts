// The Your availability board drawn as static markup with live caps: no booked interviews, student names or "next
// interview" card live (the current page shows none); "at most" limit words; one polite live region; the load error and
// no-dates states say the right thing. Mock mode draws the demo's bookings.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/scholarships/interviews/availability' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}), hasSupabaseEnv: () => true }));
const actions = vi.hoisted(() => ({ saveAvailability: vi.fn(), readTypedAvailability: vi.fn() }));
vi.mock('@/lib/actions/availability', () => actions);

import { AvailabilityBoard } from '@/components/availability/availability-board';
import type { AvailabilityView } from '@/lib/availability-view';
import { AV_VIEW } from '@/mock/availability-view';

const LIVE = { send: true, reader: true, bookings: false, mock: false };
const html = (view: AvailabilityView, live = true) => renderToStaticMarkup(createElement(AvailabilityBoard, { view, live }));
const asLive = (v: AvailabilityView): AvailabilityView => ({ ...v, caps: LIVE });

describe('availability board', () => {
  it('live: no bookings, student names or booked legend, even when rows hold bookings', () => {
    const h = html(asLive(AV_VIEW));
    expect(h).not.toContain('Ada Okafor');
    expect(h).not.toContain('Keith Dawson');
    expect(h).not.toContain('Booked interview');
    expect(h).not.toContain('fy-bk');
    expect(h).not.toContain('of 5 booked');
    expect(h).toContain('at most');
  });
  it('mock: the demo bookings and the next interview card', () => {
    const h = html(AV_VIEW, false);
    expect(h).toContain('Ada Okafor');
    expect(h).toContain('Booked interview');
  });
  it('renders without calling any action', () => {
    html(asLive(AV_VIEW));
    expect(actions.saveAvailability).not.toHaveBeenCalled();
    expect(actions.readTypedAvailability).not.toHaveBeenCalled();
  });
  it('one polite live region, and no aria-live elsewhere', () => {
    const h = html(asLive(AV_VIEW));
    expect(h.match(/aria-live/g)).toHaveLength(1);
    expect(h).toContain('aria-live="polite"');
  });
  it('load error and no dates', () => {
    expect(html({ ...asLive(AV_VIEW), loadFailed: true })).toContain('Try again');
    expect(html({ ...asLive(AV_VIEW), noDates: true, days: [] })).toContain('dates aren');
  });
});

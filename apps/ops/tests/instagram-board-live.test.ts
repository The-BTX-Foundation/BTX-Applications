// The live Instagram board draws only the controls with a backing write: adding a post and sending one for board approval.
// Ticking steps, the caption editor, owner changes, the nudge, Undo and "Mark it scheduled/posted" are mock only and are
// not drawn live; nothing on the page posts to Instagram or messages anyone.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/outreach/instagram' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement('a', { href, ...p }, children as never) }));

import { InstagramBoard } from '@/components/instagram/instagram-board';
import { liveCaps } from '@/lib/instagram-map';
import type { IgPost, IgView } from '@/lib/instagram-view';
import { IG_MOCK_CAPS, IG_VIEW } from '@/mock/instagram-view';

const html = (view: IgView, live = true) => renderToStaticMarkup(createElement(InstagramBoard, { view, live }));
const liveView = (posts: IgPost[], hasChannel = true): IgView => ({ ...IG_VIEW, posts, caps: liveCaps(hasChannel) });
// A live post as lib/instagram-map.ts maps it: no approver, no caption writer.
const plain = (o: Partial<IgPost>): IgPost => ({ ...IG_VIEW.posts[3], approver: null, captionBy: null, ...o });

describe('live Instagram board', () => {
  it('draws no mock-only control', () => {
    const h = html(liveView(IG_VIEW.posts.map((p) => ({ ...p, approver: null, captionBy: null }))));
    expect(h).not.toMatch(/data-step=|data-x="(chown|nudge|nsend|capedit|capsave|capundo|unown|unsend|sched|posted|next)"/);
    expect(h).not.toContain('Nudge');
    expect(h).not.toContain('Change owner');
    expect(h).toContain('Add a post');
  });
  it('offers "Send for approval" only on a post with a caption and a photo at the approval step', () => {
    const ready = plain({ id: 'r', date: '2099-01-05', caption: 'Hi', photo: 'Photo added', steps: [true, true, false, false, false] });
    expect(html(liveView([ready]))).toMatch(/data-x="send"/);
    const notReady = plain({ id: 'n', date: '2099-01-05', steps: [true, false, false, false, false] });
    expect(html(liveView([notReady]))).not.toMatch(/data-x="send"/);
    const sent = { ...ready, sent: true };
    const h = html(liveView([sent]));
    expect(h).not.toMatch(/data-x="send"/);
    expect(h).toContain('Waiting for approval');
  });
  it('draws no add line without an Instagram channel', () => {
    expect(html({ ...liveView([], false), channelId: null })).not.toContain('Add a post');
  });
  it('mock mode draws the demo controls', () => {
    const h = html({ ...IG_VIEW, caps: IG_MOCK_CAPS }, false);
    expect(h).toMatch(/data-step="0"/);
    expect(h).toContain('Change owner');
  });
});

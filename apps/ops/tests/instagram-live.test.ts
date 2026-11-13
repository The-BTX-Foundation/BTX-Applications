// The Instagram page's live loader (lib/instagram-live.ts) against a stand-in reader: which reads it makes, the view it
// builds, and that a failed read shows the load error, never "No posts yet".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLiveIgView, type IgReader, type PostFilter } from '@/lib/instagram-live';

const NOW = new Date('2026-11-10T15:00:00Z');
const STAFF = [{ user_id: 'u1', display_name: 'Ann Lee', initials: 'AL' }];

function reader(o: Partial<IgReader> = {}) {
  const asked: PostFilter[] = [];
  const r: IgReader = {
    channel: async () => ({ id: 'ch1', target: '4 posts a month' }),
    staff: async () => STAFF,
    posts: async (_c, f) => {
      asked.push(f);
      if ('from' in f) return [{ id: 'a', post_on: '2026-11-20', owner_id: 'u1', status: 'drafting' }];
      if ('undated' in f) return [{ id: 'b', post_on: null, status: 'not_started' }];
      return [{ id: 'c', post_on: '2026-10-28', status: 'approved' }];
    },
    ...o,
  };
  return { r, asked };
}

afterEach(() => vi.restoreAllMocks());

describe('loadLiveIgView', () => {
  it('reads this month on, the undated posts and older open ones, and builds the view', async () => {
    const { r, asked } = reader();
    const v = await loadLiveIgView(r, 'u1', NOW);
    expect(asked).toEqual([{ from: '2026-11-01' }, { undated: true }, { openBefore: '2026-11-01' }]);
    expect(v.failed).toBe(false);
    if (v.failed) return;
    expect(v).toMatchObject({ today: '2026-11-10', target: 4, channelId: 'ch1', me: 'u1', loadFailed: false, mockWrite: null });
    expect(v.posts.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(v.posts[1].owner?.name).toBe('Ann Lee');
    expect(v.caps).toMatchObject({ add: true, send: true, tick: false, caption: false });
  });
  it('draws no add line and reads no posts when there is no Instagram channel', async () => {
    const { r, asked } = reader({ channel: async () => null });
    const v = await loadLiveIgView(r, 'u1', NOW);
    expect(asked).toEqual([]);
    expect(v).toMatchObject({ failed: false, channelId: null, target: null, posts: [], loadFailed: false });
    if (!v.failed) expect(v.caps.add).toBe(false);
  });
  it('shows the load error when any read fails, and logs the table and code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = await loadLiveIgView(reader({ posts: async () => { throw { table: 'posts', code: '57014', message: 'Ann Lee row' }; } }).r, 'u1', NOW);
    expect(v).toMatchObject({ failed: false, loadFailed: true, posts: [] });
    expect(log).toHaveBeenCalledWith('[instagram] read failed', { table: 'posts', code: '57014' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Ann');
    const s = await loadLiveIgView(reader({ staff: async () => { throw new Error('rls'); } }).r, null, NOW);
    expect(s).toMatchObject({ loadFailed: true });
    expect(log).toHaveBeenLastCalledWith('[instagram] read failed', { table: 'unknown', code: 'unknown' });
  });
});

// The Board chat page's pure logic (lib/chat-map.ts) against the demo's sample (mock/chat-view.ts) and sample live rows:
// unread counts, the "N new" line, the news card, read markers, the thread's grouping, message text, and the live mapping
// (who is in the chat, area and direct channels, unread settling).
import { describe, expect, it } from 'vitest';
import {
  ALL,
  bodyParts,
  buildThread,
  chatPeople,
  countLabel,
  dateLabel,
  dayLabel,
  directKey,
  inView,
  mapChannels,
  mapMessages,
  mapPins,
  markReadLocal,
  matches,
  nextUp,
  firstPush,
  isDuplicateInsert,
  laterStamps,
  markStamps,
  mergeChannelReads,
  newFromOthers,
  readStamps,
  draftFor,
  newestServerAt,
  newMessageId,
  viewCapped,
  viewStart,
  viewScope,
  compareAt,
  stampCap,
  withDraft,
  settleUnread,
  splitFor,
  totalUnread,
  unreadOf,
  viewIds,
} from '@/lib/chat-map';
import { CHAT_VIEW, CHAT_VIEW_EMPTY, CHAT_VIEW_STRESS } from '@/mock/chat-view';

const ME = CHAT_VIEW.me.userId;
const { channels, messages } = CHAT_VIEW;
const byKey = (k: string) => channels.find((c) => c.key === k)!;

describe('labels', () => {
  it('caps counts at 99+', () => {
    expect(countLabel(4)).toBe('4');
    expect(countLabel(99)).toBe('99');
    expect(countLabel(120)).toBe('99+');
  });
  it('writes the title date and day dividers in Eastern days', () => {
    expect(dateLabel('2026-11-10')).toBe('Tue, Nov 10');
    expect(dayLabel('2026-11-10', '2026-11-10T09:00:00-05:00')).toBe('Today');
    expect(dayLabel('2026-11-10', '2026-11-09T16:00:00-05:00')).toBe('Yesterday');
    expect(dayLabel('2026-11-10', '2026-11-08T12:00:00-05:00')).toBe('Sun Nov 8');
    // 11:30 PM Eastern on the 9th is already the 10th in UTC: still "Yesterday".
    expect(dayLabel('2026-11-10', '2026-11-10T04:30:00Z')).toBe('Yesterday');
  });
});

describe('unread counts (the demo: All areas 4, Scholarships 3, Finance 1)', () => {
  it('counts other people\'s messages after the last read, never my own', () => {
    expect(unreadOf(byKey('ch-sch'), messages, ME)).toBe(3);
    expect(unreadOf(byKey('ch-fin'), messages, ME)).toBe(1);
    expect(unreadOf(byKey('ch-pro'), messages, ME)).toBe(0);
    expect(totalUnread(channels, messages, ME)).toBe(4);
  });
  it('adds the server count for older unread messages (stress: 99+)', () => {
    const sch = CHAT_VIEW_STRESS.channels.find((c) => c.key === 'ch-sch')!;
    expect(unreadOf(sch, CHAT_VIEW_STRESS.messages, ME)).toBe(120);
    expect(countLabel(totalUnread(CHAT_VIEW_STRESS.channels, CHAT_VIEW_STRESS.messages, ME))).toBe('99+');
  });
  it('counts nothing for a direct chat that was never opened', () => {
    const unopened = { ...byKey('direct:u-kd'), id: null };
    expect(unreadOf(unopened, messages, ME)).toBe(0);
    expect(viewIds([unopened], unopened.key)).toEqual([]);
  });
  it('leaves direct chats out of the All areas total', () => {
    const dm = { id: 'x', channelId: 'dm-kd', authorId: 'u-kd', isBot: false, body: 'Hi', taskId: null, createdAt: '2026-11-10T09:10:00-05:00' };
    expect(unreadOf(byKey('direct:u-kd'), [...messages, dm], ME)).toBe(1);
    expect(totalUnread(channels, [...messages, dm], ME)).toBe(4);
  });
});

describe('the "N new" line, the news card and read markers', () => {
  it('puts the line before the first unread message of the view', () => {
    expect(splitFor(channels, messages, viewIds(channels, ALL), ME)).toEqual({ firstId: 'm6', count: 4 });
    expect(splitFor(channels, messages, ['ch-fin'], ME)).toEqual({ firstId: 'm8', count: 1 });
    expect(splitFor(channels, messages, ['ch-pro'], ME)).toBeNull();
  });
  it('picks the area with the most unread, skipping the open one with its line', () => {
    expect(nextUp(channels, messages, ME, ALL, true)).toEqual({ key: 'ch-sch', kicker: '4 new', title: 'Scholarships' });
    const read = markReadLocal(channels, ['ch-sch'], '2026-11-10T09:14:00-05:00');
    expect(nextUp(read, messages, ME, 'ch-sch', true)).toEqual({ key: 'ch-fin', kicker: '1 new', title: 'Finance' });
    expect(nextUp(markReadLocal(read, ['ch-fin'], '2026-11-10T09:14:00-05:00'), messages, ME, ALL, false)).toBeNull();
    expect(nextUp(CHAT_VIEW_EMPTY.channels, [], ME, ALL, false)).toBeNull();
  });
  it('marks channels read and clears their older unread', () => {
    const read = markReadLocal(CHAT_VIEW_STRESS.channels, ['ch-sch'], '2026-11-10T09:14:00-05:00');
    const sch = read.find((c) => c.key === 'ch-sch')!;
    expect(sch.unreadExtra).toBe(0);
    expect(unreadOf(sch, CHAT_VIEW_STRESS.messages, ME)).toBe(0);
    expect(read.find((c) => c.key === 'ch-fin')!.lastReadAt).toBe(byKey('ch-fin').lastReadAt);
  });
});

describe('read stamps (live: never the browser clock)', () => {
  const NOW = '2026-11-10T15:00:00.000Z';
  it('stamps each channel at its newest loaded message, or the server time when none is loaded', () => {
    const fresh = channels.map((c) => ({ ...c, lastReadAt: null }));
    const s = readStamps(fresh, messages, ['ch-sch', 'ch-fin', 'ch-out'], NOW);
    expect(s['ch-sch']).toBe('2026-11-10T09:12:00-05:00');
    expect(s['ch-fin']).toBe('2026-11-10T09:08:00-05:00');
    expect(s['ch-out']).toBe(NOW);
  });
  it('never moves a marker backwards', () => {
    const ahead = channels.map((c) => (c.key === 'ch-sch' ? { ...c, lastReadAt: '2026-11-10T16:00:00.000Z' } : c));
    expect(readStamps(ahead, messages, ['ch-sch'], NOW)['ch-sch']).toBe('2026-11-10T16:00:00.000Z');
    expect(laterStamps(ahead, { 'ch-sch': '2026-11-10T14:00:00.000Z' })['ch-sch']).toBe('2026-11-10T16:00:00.000Z');
  });
  it('ignores messages still sending or drawn locally', () => {
    const fresh = channels.map((c) => ({ ...c, lastReadAt: null }));
    const mine = { ...messages[0], channelId: 'ch-sch', id: 'p1', createdAt: '2026-11-10T14:59:00.000Z', pending: true };
    const local = { ...messages[0], channelId: 'ch-sch', id: 'local-1', createdAt: '2026-11-10T14:58:00.000Z' };
    expect(readStamps(fresh, [...messages, mine, local], ['ch-sch'], NOW)['ch-sch']).toBe('2026-11-10T09:12:00-05:00');
  });
  it('never stamps past the server time plus 5 minutes (a message dated 2030)', () => {
    const fresh = channels.map((c) => ({ ...c, lastReadAt: null }));
    const future = { ...messages[0], channelId: 'ch-pro', id: 'f1', createdAt: '2030-01-01T00:00:00.000Z' };
    expect(readStamps(fresh, [...messages, future], ['ch-pro'], NOW)['ch-pro']).toBe('2026-11-10T15:05:00.000Z');
    expect(stampCap(NOW)).toBe('2026-11-10T15:05:00.000Z');
  });
  it('a message saved while the page loaded (just after `now`) is stamped at its own time, not left unread', () => {
    const fresh = channels.map((c) => ({ ...c, lastReadAt: null }));
    const during = { ...messages[0], channelId: 'ch-pro', id: 'd1', authorId: 'u-kd', createdAt: '2026-11-10T15:00:01.250731+00:00' };
    const s = readStamps(fresh, [...messages, during], ['ch-pro'], NOW);
    expect(s['ch-pro']).toBe('2026-11-10T15:00:01.250731+00:00');
    expect(unreadOf(markStamps(fresh, s).find((c) => c.key === 'ch-pro')!, [during], ME)).toBe(0);
  });
  it('after a send, reads the target only up to what was loaded before it (not a newer unseen message)', () => {
    // Taken when the send is queued: the newest server message then loaded in Scholarships.
    const upTo = newestServerAt(messages, 'ch-sch', NOW);
    expect(upTo).toBe('2026-11-10T09:12:00-05:00');
    // A newer message from someone else arrives before the send settles: it stays unread after the stamp.
    const unseen = { ...messages[0], channelId: 'ch-sch', id: 'late', authorId: 'u-kd', createdAt: '2026-11-10T14:30:00.000Z' };
    const after = markStamps(channels, { 'ch-sch': upTo! });
    expect(unreadOf(after.find((c) => c.key === 'ch-sch')!, [...messages, unseen], ME)).toBe(1);
    expect(newestServerAt([], 'ch-sch', NOW)).toBeNull();
  });
  it('marks only the target channel', () => {
    const read = markStamps(CHAT_VIEW_STRESS.channels, { 'ch-fin': '2026-11-10T14:20:00.000Z' });
    expect(read.find((c) => c.key === 'ch-fin')).toMatchObject({ lastReadAt: '2026-11-10T14:20:00.000Z', unreadExtra: 0 });
    // Scholarships keeps its unread (117 older + 3 loaded).
    expect(unreadOf(read.find((c) => c.key === 'ch-sch')!, CHAT_VIEW_STRESS.messages, ME)).toBe(120);
  });
});

describe('per-channel reads and the cap', () => {
  const row = (id: string, ch: string, at: string, author = 'u2') => ({ id, channel_id: ch, author_id: author, is_bot: false, body: id, created_at: at });
  it('merges each channel\'s newest messages oldest first, ties broken by id; capped only when one more came back', () => {
    // Read one past the cap (2): busy returned 3, so it is capped and draws its newest 2.
    const busy = [row('b3', 'busy', '2026-11-10T14:03:00Z'), row('b2', 'busy', '2026-11-10T14:02:00Z'), row('b1', 'busy', '2026-11-10T14:01:00Z')];
    const quiet = [row('q1', 'quiet', '2026-11-01T10:00:00Z')];
    // Exactly 2 (the cap) is everything: not capped.
    const same = [row('s-b', 'same', '2026-11-10T14:02:00Z'), row('s-a', 'same', '2026-11-10T14:02:00Z')];
    const { messages: m, capped } = mergeChannelReads(['busy', 'quiet', 'same'], [busy, quiet, same], 2);
    // The quiet channel's old message is kept: a busy channel never pushes it out.
    expect(m.map((x) => x.id)).toEqual(['q1', 'b2', 's-a', 's-b', 'b3']);
    expect(capped).toEqual(['busy']);
  });
  it('starts All areas at the latest oldest-loaded time among capped channels (no hidden gap)', () => {
    const ms = mapMessages([row('a1', 'A', '2026-11-01T10:00:00Z'), row('a2', 'A', '2026-11-09T10:00:00Z'), row('b1', 'B', '2026-11-05T10:00:00Z'), row('c1', 'C', '2026-11-03T10:00:00Z')]);
    expect(viewStart(ms, ['A', 'B'], ['A', 'B', 'C'])).toBe('2026-11-05T10:00:00Z');
    expect(viewStart(ms, [], ['A', 'B', 'C'])).toBeNull();
    expect(viewStart(ms, ['A'], ['A', 'C'])).toBe('2026-11-01T10:00:00Z');
  });
  it('All areas with a capped channel stamps and splits only what it shows (the reviewer\'s example)', () => {
    // Scholarships is capped: its 50 newest run back to Nov 5. Money's only message, unread, is from Nov 1.
    const sch = Array.from({ length: 50 }, (_, i) => row(`s${i}`, 'c-sch', `2026-11-${String(5 + Math.floor(i / 10)).padStart(2, '0')}T1${i % 10}:00:00Z`));
    const ms = mapMessages([...sch, row('f1', 'c-fin', '2026-11-01T10:00:00Z')]);
    const chs = [
      { ...byKey('ch-sch'), id: 'c-sch', lastReadAt: '2026-11-07T00:00:00Z', unreadExtra: 0 },
      { ...byKey('ch-fin'), id: 'c-fin', lastReadAt: '2026-10-30T00:00:00Z', unreadExtra: 0 },
    ];
    const ids = ['c-sch', 'c-fin'];
    const sc = viewScope(chs, ms, ['c-sch'], ids, true, ME);
    expect(sc.ids).toEqual(['c-sch']);
    expect(sc.stampIds).toEqual(['c-sch']);
    expect(sc.messages.some((m) => m.id === 'f1')).toBe(false);
    const stamps = readStamps(chs, sc.messages, sc.stampIds, '2026-11-10T12:00:00Z');
    expect(Object.keys(stamps)).toEqual(['c-sch']);
    // Money is not stamped: its badge stays.
    expect(unreadOf(markStamps(chs, stamps).find((c) => c.id === 'c-fin')!, ms, ME)).toBe(1);
    // The "N new" line sits on the first unread message shown, not on Money's hidden one.
    expect(splitFor(chs, sc.messages, sc.ids, ME)?.firstId).toBe('s20');
    // One area, or no capped channel: everything counts.
    expect(viewScope(chs, ms, ['c-sch'], ['c-fin'], false, ME)).toEqual({ messages: ms, ids: ['c-fin'], stampIds: ['c-fin'] });
    expect(viewScope(chs, ms, [], ids, true, ME).stampIds).toEqual(ids);
  });
  describe('All areas never marks a hidden unread message read', () => {
    // Scholarships is capped and starts Nov 5. Money's marker is Oct 30.
    const sch = [row('s1', 'c-sch', '2026-11-05T10:00:00Z'), row('s2', 'c-sch', '2026-11-07T10:00:00Z')];
    const chs = [
      { ...byKey('ch-sch'), id: 'c-sch', lastReadAt: '2026-11-06T00:00:00Z', unreadExtra: 0 },
      { ...byKey('ch-fin'), id: 'c-fin', lastReadAt: '2026-10-30T00:00:00Z', unreadExtra: 0 },
    ];
    const ids = ['c-sch', 'c-fin'];
    const NOW2 = '2026-11-10T12:00:00Z';
    it('Money with unread Nov 1 (hidden) and Nov 6 (shown) is not stamped; its badge stays at 2', () => {
      const ms = mapMessages([...sch, row('f1', 'c-fin', '2026-11-01T10:00:00Z'), row('f2', 'c-fin', '2026-11-06T10:00:00Z')]);
      const sc = viewScope(chs, ms, ['c-sch'], ids, true, ME);
      expect(sc.ids).toEqual(ids); // Money's Nov 6 message is shown (and the "N new" line can sit on it)
      expect(sc.stampIds).toEqual(['c-sch']);
      const after = markStamps(chs, readStamps(chs, sc.messages, sc.stampIds, NOW2));
      expect(unreadOf(after.find((c) => c.id === 'c-fin')!, ms, ME)).toBe(2);
      expect(unreadOf(after.find((c) => c.id === 'c-sch')!, ms, ME)).toBe(0);
    });
    it('own message as the only shown one does not cover a hidden unread message', () => {
      const ms = mapMessages([...sch, row('f1', 'c-fin', '2026-11-01T10:00:00Z'), row('f2', 'c-fin', '2026-11-08T10:00:00Z', ME)]);
      expect(viewScope(chs, ms, ['c-sch'], ids, true, ME).stampIds).toEqual(['c-sch']);
    });
    it('a send from All areas to Money does not mark Money read while its unread is hidden', () => {
      const ms = mapMessages([...sch, row('f1', 'c-fin', '2026-11-01T10:00:00Z'), row('f2', 'c-fin', '2026-11-06T10:00:00Z')]);
      // The board stamps the target after a send only when it is in stampIds (chat-board.tsx sendReadIds).
      const may = viewScope(chs, ms, ['c-sch'], ids, true, ME).stampIds.includes('c-fin');
      expect(may).toBe(false);
      // Sending from Money itself (no start) stamps it as before.
      expect(viewScope(chs, ms, ['c-sch'], ['c-fin'], false, ME).stampIds).toEqual(['c-fin']);
    });
    it('every unread shown: stamped as before', () => {
      const ms = mapMessages([...sch, row('f0', 'c-fin', '2026-10-29T10:00:00Z'), row('f2', 'c-fin', '2026-11-06T10:00:00Z')]);
      const sc = viewScope(chs, ms, ['c-sch'], ids, true, ME);
      expect(sc.stampIds).toEqual(ids);
      const after = markStamps(chs, readStamps(chs, sc.messages, sc.stampIds, NOW2));
      expect(after.find((c) => c.id === 'c-fin')!.lastReadAt).toBe('2026-11-06T10:00:00Z');
    });
  });
  it('compares and stamps with microseconds kept (no Date round trip)', () => {
    expect(compareAt('2026-11-10T14:00:00.123456Z', '2026-11-10T14:00:00.123Z')).toBeGreaterThan(0);
    expect(compareAt('2026-11-10T14:00:00.123Z', '2026-11-10T14:00:00.123000Z')).toBe(0);
    expect(compareAt('2026-11-10T14:00:00Z', '2026-11-10T14:00:00.000001Z')).toBeLessThan(0);
    expect(compareAt('2026-11-10T09:00:00.5-05:00', '2026-11-10T14:00:00.4Z')).toBeGreaterThan(0);
    // Digits past milliseconds never round: .1239 is before .1240, .9999999 is before the next second.
    expect(compareAt('2026-11-10T14:00:00.1239Z', '2026-11-10T14:00:00.1240Z')).toBeLessThan(0);
    expect(compareAt('2026-11-10T14:00:00.1240Z', '2026-11-10T14:00:00.1239Z')).toBeGreaterThan(0);
    expect(compareAt('2026-11-10T14:00:00.9999999Z', '2026-11-10T14:00:01Z')).toBeLessThan(0);
    expect(compareAt('2026-11-10T14:00:00.12395Z', '2026-11-10T14:00:00.123950000Z')).toBe(0);
    const ms = mapMessages([row('x1', 'A', '2026-11-10T14:00:00.123400+00:00'), row('x2', 'A', '2026-11-10T14:00:00.123456+00:00')]);
    expect(newestServerAt(ms, 'A', '2026-11-10T15:00:00Z')).toBe('2026-11-10T14:00:00.123456+00:00');
    // A message 0.056 ms after the marker is still unread.
    const ch = { ...byKey('ch-sch'), id: 'A', lastReadAt: '2026-11-10T14:00:00.123400+00:00', unreadExtra: 0 };
    expect(unreadOf(ch, ms, ME)).toBe(1);
    expect(laterStamps([ch], { A: '2026-11-10T14:00:00.123Z' })).toEqual({ A: '2026-11-10T14:00:00.123400+00:00' });
    expect(viewStart(ms, ['A'], ['A'])).toBe('2026-11-10T14:00:00.123400+00:00');
  });
  it('says a view is capped when any channel in it is', () => {
    expect(viewCapped(['ch-sch'], viewIds(channels, ALL))).toBe(true);
    expect(viewCapped(['ch-sch'], ['ch-fin'])).toBe(false);
    expect(viewCapped([], viewIds(channels, ALL))).toBe(false);
  });
  it('follows to the newest only when a refresh brings messages from others', () => {
    const mine = { ...messages[0], id: 'new-mine', authorId: ME };
    const theirs = { ...messages[0], id: 'new-theirs', authorId: 'u-kd' };
    expect(newFromOthers(messages, [...messages, mine], ME)).toBe(false);
    expect(newFromOthers(messages, [...messages, theirs], ME)).toBe(true);
    expect(newFromOthers(messages, messages, ME)).toBe(false);
  });
});

describe('composing', () => {
  it('keeps one draft per view, so switching never carries text across', () => {
    let d = withDraft({}, 'direct:u-kd', 'Private note to Keith');
    d = withDraft(d, ALL, 'For the board');
    expect(draftFor(d, 'direct:u-kd')).toBe('Private note to Keith');
    expect(draftFor(d, 'ch-sch')).toBe('');
    expect(draftFor(d, ALL)).toBe('For the board');
    expect(withDraft(d, ALL, '')).toEqual({ 'direct:u-kd': 'Private note to Keith' });
  });
  it('gives every new message its own id, even with the same words', () => {
    const a = newMessageId();
    const b = newMessageId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('builds a v4 id from getRandomValues when randomUUID is missing', () => {
    const fake = { getRandomValues: <T extends Uint8Array>(x: T) => (x.fill(0xff), x) };
    expect(newMessageId(fake)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('counts a unique-id refusal as already saved, and pushes each message once', () => {
    expect(isDuplicateInsert({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isDuplicateInsert({ code: '42501' })).toBe(false);
    expect(isDuplicateInsert(null)).toBe(false);
    const pushed = new Set<string>();
    expect(firstPush(pushed, 'm1')).toBe(true);
    expect(firstPush(pushed, 'm1')).toBe(false);
    expect(firstPush(pushed, 'm2')).toBe(true);
  });
});

describe('the thread', () => {
  it('shows area messages in All areas and one channel otherwise', () => {
    expect(messages.filter((m) => inView(m, ALL, channels))).toHaveLength(9);
    expect(messages.filter((m) => inView(m, 'ch-fin', channels)).map((m) => m.id)).toEqual(['m2', 'm3', 'm8']);
  });
  it('groups by day, by person and channel within two hours, with the "N new" line', () => {
    const items = buildThread(messages, '2026-11-10', { firstId: 'm6', count: 4 });
    const shape = items.map((i) => (i.kind === 'group' ? `g:${i.lines.map((l) => l.id).join('+')}` : i.kind === 'day' ? `day:${i.label}` : `new:${i.count}`));
    expect(shape).toEqual(['day:Yesterday', 'g:m1', 'day:Today', 'g:m2+m3', 'g:m4', 'g:m5', 'new:4', 'g:m6', 'g:m7', 'g:m8', 'g:m9']);
  });
  it('starts a new group after two hours', () => {
    const a = { ...messages[1], id: 'a', createdAt: '2026-11-10T06:00:00-05:00' };
    const b = { ...messages[1], id: 'b', createdAt: '2026-11-10T08:01:00-05:00' };
    expect(buildThread([a, b], '2026-11-10', null).filter((i) => i.kind === 'group')).toHaveLength(2);
  });
  it('finds messages by words or writer ("BTX" for the system)', () => {
    const names = new Map(CHAT_VIEW.people.map((p) => [p.userId, p.displayName]));
    expect(messages.filter((m) => matches(m, 'grants', names)).map((m) => m.id)).toEqual(['m8']);
    expect(messages.filter((m) => matches(m, 'keith', names)).map((m) => m.id)).toEqual(['m3', 'm8', 'm9']);
    expect(messages.filter((m) => matches(m, 'btx', names))).toHaveLength(5);
  });
  it('splits text into bold, unbreakable and link parts', () => {
    expect(bodyParts('Keith Dawson assigned you **Approve the Q4 budget ($4,830)**, due Fri Nov 13.', ['Keith Dawson'])).toEqual([
      { text: 'Keith Dawson', bold: false, kind: 'nowrap' },
      { text: ' assigned you ', bold: false, kind: 'text' },
      { text: 'Approve the Q4 budget ', bold: true, kind: 'text' },
      { text: '($4,830)', bold: true, kind: 'nowrap' },
      { text: ', due Fri Nov 13.', bold: false, kind: 'text' },
    ]);
    expect(bodyParts('Ready for APP-2026-00013 at https://x.org/a/b')).toEqual([
      { text: 'Ready for ', bold: false, kind: 'text' },
      { text: 'APP-2026-00013', bold: false, kind: 'nowrap' },
      { text: ' at ', bold: false, kind: 'text' },
      { text: 'https://x.org/a/b', bold: false, kind: 'url' },
    ]);
  });
});

describe('live mapping', () => {
  const profiles = [
    { user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: 'u2', display_name: 'Keith Dawson', initials: 'KD' },
    { user_id: 'u3', display_name: 'Miles Donovan', initials: 'MD' },
    { user_id: 'u4', display_name: 'Jayden Intern', initials: 'JI' },
  ];
  const directory = [
    { user_id: 'u1', role: 'admin' },
    { user_id: 'u2', role: 'board' },
    { user_id: 'u3', role: 'board' },
    { user_id: 'u4', role: 'staff' },
  ];
  const areas = [
    { slug: 'money', name: 'Finance', position: 2 },
    { slug: 'scholarships', name: 'Scholarships', position: 1 },
  ];
  const rows = {
    channels: [
      { id: 'c-fin', kind: 'area', area: 'money' },
      { id: 'c-sch', kind: 'area', area: 'scholarships' },
      // Row-level security lists only my own direct channels: this one is mine with u2.
      { id: 'c-d12', kind: 'direct', direct_key: directKey('u2', 'u1') },
    ],
    unread: [
      { channel_id: 'c-sch', unread: 5 },
      { channel_id: 'c-d12', unread: 1 },
    ],
    markers: [{ channel_id: 'c-sch', last_read_at: '2026-11-10T13:00:00Z' }],
    areas,
  };

  it('keeps admins and board members only', () => {
    expect(chatPeople({ profiles, directory }).map((p) => p.userId)).toEqual(['u1', 'u2', 'u3']);
  });
  it('sorts the direct key like the database', () => {
    expect(directKey('u2', 'u1')).toBe('u1:u2');
  });
  it('lists areas in order, then one direct entry per other member with its channel once it exists', () => {
    const people = chatPeople({ profiles, directory });
    const list = mapChannels(rows, people, 'u1');
    expect(list.map((c) => [c.key, c.id, c.name])).toEqual([
      ['c-sch', 'c-sch', 'Scholarships'],
      ['c-fin', 'c-fin', 'Finance'],
      ['direct:u2', 'c-d12', 'Keith Dawson'],
      ['direct:u3', null, 'Miles Donovan'],
    ]);
    expect(list[0]).toMatchObject({ lastReadAt: '2026-11-10T13:00:00Z', unreadExtra: 5, people: 3 });
    expect(list[1]).toMatchObject({ lastReadAt: null, unreadExtra: 0 });
    expect(list[2]).toMatchObject({ kind: 'direct', otherUserId: 'u2', initials: 'KD', unreadExtra: 1, people: 2 });
    expect(list[3]).toMatchObject({ lastReadAt: null, unreadExtra: 0 });
  });
  it('never lists a direct chat between two other people', () => {
    const others = { ...rows, channels: [...rows.channels, { id: 'c-d23', kind: 'direct', direct_key: directKey('u2', 'u3') }] };
    const list = mapChannels(others, chatPeople({ profiles, directory }), 'u1');
    expect(list.some((c) => c.id === 'c-d23')).toBe(false);
  });
  it('orders messages oldest first and keeps only the unread the loaded ones do not explain', () => {
    const msgs = mapMessages([
      { id: 'b', channel_id: 'c-sch', author_id: 'u2', body: 'Later', created_at: '2026-11-10T14:00:00Z', is_bot: false },
      { id: 'a', channel_id: 'c-sch', author_id: null, body: 'Earlier', created_at: '2026-11-10T13:30:00Z', is_bot: true, task_id: 't1' },
      { id: 'z', channel_id: 'c-sch', author_id: 'u1', body: 'Mine', created_at: '2026-11-10T14:05:00Z', is_bot: false },
    ]);
    expect(msgs.map((m) => m.id)).toEqual(['a', 'b', 'z']);
    expect(msgs[0]).toMatchObject({ authorId: null, isBot: true, taskId: 't1' });
    const people = chatPeople({ profiles, directory });
    const settled = settleUnread(mapChannels(rows, people, 'u1'), msgs, 'u1');
    // Server says 5 unread; 2 are loaded, so 3 older ones stay as the extra and the page still counts 5.
    expect(settled[0].unreadExtra).toBe(3);
    expect(unreadOf(settled[0], msgs, 'u1')).toBe(5);
    expect(settled[3].unreadExtra).toBe(0);
  });
  it('maps pins, null channel = All areas', () => {
    expect(mapPins([{ id: 'p', channel_id: null, label: 'Q4 budget' }])).toEqual([{ id: 'p', channelId: null, label: 'Q4 budget' }]);
  });
});

describe('mock loader (no Supabase env)', () => {
  it('serves the demo flags', async () => {
    const { loadChatView } = await import('@/lib/chat-view-loader');
    expect(await loadChatView({ demo: 'failed' })).toEqual({ failed: true });
    const err = await loadChatView({ demo: 'error' });
    expect(!err.failed && err.threadFailed).toBe(true);
    const empty = await loadChatView({ demo: 'empty' });
    expect(!empty.failed && empty.messages.length).toBe(0);
    const normal = await loadChatView({});
    expect(!normal.failed && normal.caps).toEqual({ send: true, openDirect: true, markRead: true, unsend: true, pinToggle: true });
    expect(!normal.failed && normal.capped).toEqual([]);
  });
  it('reads the mock-only behaviour flags, never in live mode', async () => {
    const { chatDemo, loadChatView } = await import('@/lib/chat-view-loader');
    expect(chatDemo('failsend', false)).toEqual({ failSend: true, capped: false });
    expect(chatDemo('capped', false)).toEqual({ failSend: false, capped: true });
    expect(chatDemo('failsend', true)).toEqual({ failSend: false, capped: false });
    expect(chatDemo('capped', true)).toEqual({ failSend: false, capped: false });
    expect(chatDemo(undefined, false)).toEqual({ failSend: false, capped: false });
    const capped = await loadChatView({ demo: 'capped' });
    expect(!capped.failed && capped.capped).toEqual(['ch-sch']);
  });
});

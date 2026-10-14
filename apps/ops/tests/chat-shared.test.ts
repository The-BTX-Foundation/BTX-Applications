import { describe, expect, it } from 'vitest';
import type { ChatChannel, ChatMessageRow } from '@/lib/chat';
import { dayName, isDirectKeyOf, toAreaMessages, unreadSplit } from '@/lib/chat-shared';

const NOW = Date.parse('2026-10-12T16:00:00Z'); // noon Eastern
const ch = (id: string, lastReadAt: string | null): ChatChannel => ({ id, kind: 'area', area: id, name: id, otherUserId: null, initials: null, unread: null, lastReadAt, people: 3 });
const msg = (id: string, channelId: string, authorId: string | null, createdAt: string): ChatMessageRow => ({ id, channelId, authorId, isBot: authorId === null, body: id, taskId: null, createdAt });

describe('dayName', () => {
  it('names today, yesterday and older days in Eastern time', () => {
    expect(dayName('2026-10-12T13:00:00Z', NOW)).toBe('Today');
    expect(dayName('2026-10-12T03:00:00Z', NOW)).toBe('Yesterday'); // 11 PM Eastern on the 11th
    expect(dayName('2026-09-30T16:00:00Z', NOW)).toBe('Wed Sep 30');
  });
});

describe('unreadSplit', () => {
  const channels = [ch('a', '2026-10-12T10:00:00Z'), ch('b', null)];
  const messages = [
    msg('m1', 'a', 'x', '2026-10-12T09:00:00Z'),
    msg('m2', 'a', 'me', '2026-10-12T11:00:00Z'),
    msg('m3', 'a', 'x', '2026-10-12T12:00:00Z'),
    msg('m4', 'b', null, '2026-10-01T12:00:00Z'),
  ];
  it('finds the first unread message by others after the read marker', () => {
    expect(unreadSplit(channels, messages, ['a'], 'me')).toEqual({ firstId: 'm3', count: 1 });
    expect(unreadSplit(channels, messages, ['a', 'b'], 'me')).toEqual({ firstId: 'm3', count: 2 });
    expect(unreadSplit(channels, messages, ['b'], 'x')).toEqual({ firstId: 'm4', count: 1 });
  });
  it('is null when everything is read', () => {
    expect(unreadSplit([ch('a', '2026-10-13T00:00:00Z')], messages, ['a'], 'me')).toBeNull();
  });
});

describe('isDirectKeyOf', () => {
  it('matches the pair in either order', () => {
    expect(isDirectKeyOf('a1:b2', 'a1', 'b2')).toBe(true);
    expect(isDirectKeyOf('a1:b2', 'b2', 'a1')).toBe(true);
    expect(isDirectKeyOf('a1:b2', 'a1', 'c3')).toBe(false);
    expect(isDirectKeyOf(null, 'a1', 'b2')).toBe(false);
  });
});

describe('toAreaMessages', () => {
  it('draws authors, the bot and your own messages', () => {
    const people = new Map([['kd', { displayName: 'Kelsey Davis', initials: 'KD' }]]);
    const rows = [
      { id: '1', authorId: null, isBot: true, body: 'Score published', createdAt: '2026-10-11T22:00:00Z' },
      { id: '2', authorId: 'kd', isBot: false, body: 'Hi', createdAt: '2026-10-12T13:00:00Z' },
      { id: '3', authorId: 'me', isBot: false, body: 'Mine', createdAt: '2026-10-12T14:00:00Z' },
      { id: '4', authorId: 'gone', isBot: false, body: 'Old', createdAt: '2026-10-12T14:10:00Z' },
    ];
    const out = toAreaMessages(rows, people, 'me', NOW, () => 't');
    expect(out[0]).toMatchObject({ day: 'Yesterday', who: 'BTX', bot: true });
    expect(out[1]).toMatchObject({ day: 'Today', who: 'Kelsey Davis', initials: 'KD', mine: undefined });
    expect(out[2]).toMatchObject({ mine: true });
    expect(out[3]).toMatchObject({ who: 'Former member', initials: '?' });
  });
});

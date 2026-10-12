import { describe, expect, it } from 'vitest';
import { chatDay, mapChat, nextMonthName, monthName, ownerDueLine, staffMap, taskOwner, usd } from '@/lib/area-map';

const staff = staffMap([
  { user_id: 'u1', display_name: 'Dania Morris', initials: 'DM' },
  { user_id: 'u2', display_name: 'Tomi Falodun', initials: 'TF' },
]);

describe('usd', () => {
  it('shows whole dollars without cents and keeps real cents', () => {
    expect(usd(150000)).toBe('$1,500');
    expect(usd(30050)).toBe('$300.50');
    expect(usd(0)).toBe('$0');
  });
});

describe('month words', () => {
  it('names the month and the one after (December wraps)', () => {
    expect(monthName('2026-10-12')).toBe('October');
    expect(nextMonthName('October')).toBe('November');
    expect(nextMonthName('December')).toBe('January');
  });
});

describe('taskOwner', () => {
  it('prefers the first known assignee, then the group, then nobody', () => {
    expect(taskOwner(['nope', 'u2'], 'bot', staff)).toMatchObject({ name: 'Tomi Falodun' });
    expect(taskOwner([], 'bot', staff)).toMatchObject({ name: 'BTX' });
    expect(taskOwner([], null, staff)).toBeNull();
  });
});

describe('ownerDueLine', () => {
  it('joins owner and due date, with a fallback', () => {
    expect(ownerDueLine({ name: 'Dania Morris', initials: 'DM' }, '2026-10-22')).toBe('Dania Morris · Thu Oct 22');
    expect(ownerDueLine('unassigned', null)).toBe('Unassigned');
    expect(ownerDueLine(null, null)).toBe('Not scheduled');
  });
});

describe('chat', () => {
  const now = '2026-10-12T16:00:00Z';
  it('labels days in Eastern time', () => {
    expect(chatDay('2026-10-12T13:00:00Z', now)).toBe('Today');
    expect(chatDay('2026-10-11T22:00:00Z', now)).toBe('Yesterday');
    expect(chatDay('2026-10-09T22:00:00Z', now)).toBe('Fri Oct 9');
    // 02:00 UTC on Oct 12 is still Oct 11 in New York
    expect(chatDay('2026-10-12T02:00:00Z', now)).toBe('Yesterday');
  });
  it('maps messages: bot, mine, someone else', () => {
    const chat = mapChat(
      'Programs chat',
      [
        { id: 'a', author_id: null, is_bot: true, body: 'Call is set', created_at: '2026-10-11T20:00:00Z' },
        { id: 'b', author_id: 'u2', is_bot: false, body: 'FE exam', created_at: '2026-10-11T21:00:00Z' },
        { id: 'c', author_id: 'u1', is_bot: false, body: 'Agreed', created_at: '2026-10-12T12:40:00Z' },
      ],
      staff,
      'u1',
      now,
    );
    expect(chat.people).toBe(2);
    expect(chat.messages.map((m) => [m.who, m.bot, m.mine, m.day])).toEqual([
      ['BTX', true, false, 'Yesterday'],
      ['Tomi Falodun', false, false, 'Yesterday'],
      ['You', false, true, 'Today'],
    ]);
    expect(chat.messages[2].time).toBe('8:40 AM');
  });
});

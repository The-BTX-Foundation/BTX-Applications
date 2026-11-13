// The Instagram "Not added" store (lib/instagram-unadded.ts): kept per person, retried, removed, and cleared when the server
// lists the id a failed try used (the save went through after all).
import { describe, expect, it } from 'vitest';
import { dropListedNotAdded, dropNotAdded, keepNotAdded, notAddedSnapshot, setNotAddedState, subscribeNotAdded } from '@/lib/instagram-unadded';

const post = { channelId: 'ch', title: 'Thank our donors', postOn: null, ownerId: null };

describe('not added', () => {
  it('keeps entries per person, replaces by key, and tells subscribers', () => {
    let n = 0;
    const off = subscribeNotAdded(() => n++);
    keepNotAdded('a', { key: 'k1', post, state: 'failed', id: 'id-1' });
    keepNotAdded('a', { key: 'k1', post, state: 'failed', id: 'id-2' });
    expect(notAddedSnapshot('a')).toEqual([{ key: 'k1', post, state: 'failed', id: 'id-2' }]);
    expect(notAddedSnapshot('b')).toEqual([]);
    setNotAddedState('a', 'k1', 'adding');
    expect(notAddedSnapshot('a')[0].state).toBe('adding');
    dropNotAdded('a', 'k1');
    expect(notAddedSnapshot('a')).toEqual([]);
    off();
    expect(n).toBe(4);
  });
  it('clears an entry once the server lists its id, and keeps the same array otherwise', () => {
    keepNotAdded('c', { key: 'k1', post, state: 'failed', id: 'id-1' });
    keepNotAdded('c', { key: 'k2', post: { ...post, title: 'Other' }, state: 'failed' });
    const before = notAddedSnapshot('c');
    dropListedNotAdded('c', new Set(['zzz']));
    expect(notAddedSnapshot('c')).toBe(before);
    dropListedNotAdded('c', new Set(['id-1']));
    expect(notAddedSnapshot('c').map((x) => x.key)).toEqual(['k2']);
  });
});

// The notes boxes' autosave rules (lib/interview-notes-flow.ts): never lose words, never mark later words saved by an
// earlier save, keep "Not saved" visible until a save works, take a server refresh only into a clean, idle box.
import { describe, expect, it } from 'vitest';
import { anyUnsaved, boxReducer, boxStatus, dirty, newBox, shouldSave, type Box } from '@/lib/interview-notes-flow';

const run = (b: Box, ...events: Parameters<typeof boxReducer>[1][]) => events.reduce(boxReducer, b);

describe('boxReducer', () => {
  it('typing makes the box dirty; a save of those words marks it Saved', () => {
    const b = run(newBox(''), { type: 'type', text: 'hi' }, { type: 'start' }, { type: 'done', ok: true });
    expect(b).toEqual({ text: 'hi', saved: 'hi', state: 'saved', sending: null });
    expect(boxStatus(b)).toBe('Saved');
  });
  it('words typed during a save stay unsaved and still need a save', () => {
    const b = run(newBox(''), { type: 'type', text: 'a' }, { type: 'start' }, { type: 'type', text: 'ab' }, { type: 'done', ok: true });
    expect(b.saved).toBe('a');
    expect(b.text).toBe('ab');
    expect(b.state).toBe('idle');
    expect(shouldSave(b)).toBe(true);
  });
  it('one save at a time; nothing to save when clean', () => {
    const saving = run(newBox(''), { type: 'type', text: 'a' }, { type: 'start' });
    expect(boxReducer(saving, { type: 'start' })).toBe(saving);
    expect(shouldSave(newBox('x'))).toBe(false);
  });
  it('a failed save keeps the words and says Not saved, also while typing on', () => {
    const b = run(newBox(''), { type: 'type', text: 'a' }, { type: 'start' }, { type: 'done', ok: false }, { type: 'type', text: 'ab' });
    expect(b.text).toBe('ab');
    expect(b.state).toBe('failed');
    expect(boxStatus(b)).toBe('Not saved');
    expect(anyUnsaved({ x: b })).toBe(true);
  });
  it('a server refresh is taken only by a clean, idle box', () => {
    expect(boxReducer(newBox('old'), { type: 'server', saved: 'new' }).text).toBe('new');
    const typing = run(newBox('old'), { type: 'type', text: 'mine' });
    expect(boxReducer(typing, { type: 'server', saved: 'new' }).text).toBe('mine');
    const sending = run(typing, { type: 'start' });
    expect(boxReducer(sending, { type: 'server', saved: 'new' })).toBe(sending);
    expect(dirty(newBox('x'))).toBe(false);
  });
  it('a stray done with no save running changes nothing', () => {
    const b = newBox('x');
    expect(boxReducer(b, { type: 'done', ok: true })).toBe(b);
  });
});

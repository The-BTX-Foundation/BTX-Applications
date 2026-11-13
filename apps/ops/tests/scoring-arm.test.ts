// The Scoring confirm's go button (lib/scoring-arm.ts): unarmed for ARM_MS after the confirm opens; a held Enter (repeats),
// or a key-up whose key-down began elsewhere (the "Publish score" button that opened the confirm), never publishes.
import { describe, expect, it } from 'vitest';
import { ARM_MS, createArm } from '@/lib/scoring-arm';

describe('createArm', () => {
  it('is unarmed before it opens and for ARM_MS after', () => {
    const a = createArm();
    expect(a.click(0)).toBe(false);
    a.open(1000);
    expect(a.click(1000)).toBe(false);
    expect(a.click(1000 + ARM_MS - 1)).toBe(false);
    expect(a.click(1000 + ARM_MS)).toBe(true);
  });

  it('ignores a held Enter that began on the opening button', () => {
    const a = createArm();
    a.open(0);
    // Repeats from the key still held after it opened the confirm.
    expect(a.keyDown('pub-yes', 'Enter', true)).toBe(true);
    expect(a.keyDown('pub-yes', 'Enter', true)).toBe(true);
    expect(a.keyUp('pub-yes', 'Enter', 5000)).toEqual({ handled: true, act: false });
  });

  it('acts on the key-up of a fresh key-down on the button, once armed', () => {
    const a = createArm();
    a.open(0);
    a.keyDown('pub-yes', 'Enter', false);
    expect(a.keyUp('pub-yes', 'Enter', ARM_MS - 1).act).toBe(false);
    a.keyDown('pub-yes', ' ', false);
    expect(a.keyUp('pub-yes', ' ', ARM_MS + 10).act).toBe(true);
  });

  it('a new open forgets an earlier key-down', () => {
    const a = createArm();
    a.open(0);
    a.keyDown('pub-yes', 'Enter', false);
    a.open(1000);
    expect(a.keyUp('pub-yes', 'Enter', 5000).act).toBe(false);
  });

  it('leaves other keys alone', () => {
    const a = createArm();
    a.open(0);
    expect(a.keyDown('pub-yes', 'Tab', false)).toBe(false);
    expect(a.keyUp('pub-yes', 'Tab', 5000)).toEqual({ handled: false, act: false });
  });
});

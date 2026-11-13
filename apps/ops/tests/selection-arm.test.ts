// The Selection confirms' arming (lib/selection-arm.ts): unarmed until opened and for SL_ARM_MS after; a held key's
// repeats never press; a key acts only on the key-up of a key-down that began on the same button.
import { describe, expect, it } from 'vitest';
import { SL_ARM_MS, createSlArm } from '@/lib/selection-arm';

describe('createSlArm', () => {
  it('is unarmed before it opens and for SL_ARM_MS after', () => {
    const a = createSlArm();
    expect(a.click(1_000_000)).toBe(false);
    a.open(1000);
    expect(a.click(1000)).toBe(false);
    expect(a.click(1000 + SL_ARM_MS - 1)).toBe(false);
    expect(a.click(1000 + SL_ARM_MS)).toBe(true);
  });

  it('ignores a held Enter carried over from the control that opened the confirm', () => {
    const a = createSlArm();
    a.open(0);
    // Only repeats arrive on the go button (the key went down on "Release decisions").
    expect(a.keyDown('go', 'Enter', true)).toBe(true);
    expect(a.keyUp('go', 'Enter', 5000)).toEqual({ handled: true, act: false });
  });

  it('acts on a fresh press once armed, never before', () => {
    const a = createSlArm();
    a.open(0);
    a.keyDown('go', 'Enter', false);
    expect(a.keyUp('go', 'Enter', SL_ARM_MS - 1).act).toBe(false);
    a.keyDown('go', ' ', false);
    expect(a.keyUp('go', ' ', SL_ARM_MS).act).toBe(true);
  });

  it('needs the key-down on the same button, and ignores other keys', () => {
    const a = createSlArm();
    a.open(0);
    a.keyDown('back', 'Enter', false);
    expect(a.keyUp('go', 'Enter', 9999).act).toBe(false);
    expect(a.keyDown('go', 'Tab', false)).toBe(false);
    expect(a.keyUp('go', 'Escape', 9999)).toEqual({ handled: false, act: false });
  });

  it('re-opening starts the wait again', () => {
    const a = createSlArm();
    a.open(0);
    expect(a.click(SL_ARM_MS)).toBe(true);
    a.open(10_000);
    expect(a.click(10_000 + 10)).toBe(false);
  });
});

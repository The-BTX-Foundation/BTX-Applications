// The Cycle settings confirms' armed gold button (lib/cycle-settings-arm.ts): nothing acts in the first 400 ms, a held
// key's repeats never count, and a key-up acts only after a key-down that began on the same button.
import { describe, expect, it } from 'vitest';
import { ARM_MS, createArm } from '@/lib/cycle-settings-arm';

describe('createArm', () => {
  it('a click acts only once the confirm has been open for ARM_MS', () => {
    const a = createArm();
    a.open(1000);
    expect(a.click(1000)).toBe(false);
    expect(a.click(1000 + ARM_MS - 1)).toBe(false);
    expect(a.click(1000 + ARM_MS)).toBe(true);
  });
  it('a key-up acts after a key-down that began on the same button, once armed', () => {
    const a = createArm();
    a.open(0);
    expect(a.keyDown('confirm:amount', 'Enter', false)).toBe(true);
    expect(a.keyUp('confirm:amount', 'Enter', ARM_MS + 5)).toEqual({ handled: true, act: true });
    // Space works the same way
    a.keyDown('publish', ' ', false);
    expect(a.keyUp('publish', ' ', ARM_MS + 5)).toEqual({ handled: true, act: true });
  });
  it('a key-up too soon, or with no key-down on that button, does nothing', () => {
    const a = createArm();
    a.open(0);
    a.keyDown('publish', 'Enter', false);
    expect(a.keyUp('publish', 'Enter', ARM_MS - 1)).toEqual({ handled: true, act: false });
    // the key-down was used up: a stray key-up later does nothing
    expect(a.keyUp('publish', 'Enter', ARM_MS + 50)).toEqual({ handled: true, act: false });
    // a key-down on another button does not count for this one
    a.keyDown('unpublish', 'Enter', false);
    expect(a.keyUp('publish', 'Enter', ARM_MS + 60)).toEqual({ handled: true, act: false });
  });
  it("a held key's repeats never start an action (the Enter that opened the confirm keeps repeating)", () => {
    const a = createArm();
    a.open(0);
    expect(a.keyDown('confirm:closes', 'Enter', true)).toBe(true);
    expect(a.keyUp('confirm:closes', 'Enter', ARM_MS * 3)).toEqual({ handled: true, act: false });
  });
  it('opening again un-arms and forgets an earlier key-down', () => {
    const a = createArm();
    a.open(0);
    a.keyDown('confirm:amount', 'Enter', false);
    a.open(10_000);
    expect(a.keyUp('confirm:amount', 'Enter', 10_000 + ARM_MS)).toEqual({ handled: true, act: false });
    expect(a.click(10_000 + 100)).toBe(false);
  });
  it('leaves other keys to the page', () => {
    const a = createArm();
    a.open(0);
    expect(a.keyDown('publish', 'Escape', false)).toBe(false);
    expect(a.keyUp('publish', 'Tab', ARM_MS)).toEqual({ handled: false, act: false });
  });
});

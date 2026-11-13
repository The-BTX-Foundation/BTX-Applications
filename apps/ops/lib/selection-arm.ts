// The Selection confirms' go buttons ("Record Ada", "Record the award", "Release and email 21") act only on purpose: the
// house pattern (copied from lib/cycle-settings-arm.ts, kept per page). When a confirm opens, focus lands on its words, not
// the button, and the button stays unarmed for SL_ARM_MS, so a held or double Enter, a double tap or a second click on
// the control that opened the confirm can't also fire it. From the keyboard it acts on the key-up of an Enter or Space
// whose key-down began on that same button (a held key's repeats are ignored); a pointer click acts once armed. One
// difference from the original: a new arm is unarmed until open() is called (never armed by default). Pure (the clock is
// passed in), so tests/selection-arm.test.ts covers every path.

export const SL_ARM_MS = 400;

/** The clock the board's handlers read (only ever called from a handler or an effect). */
export const slNowMs = (): number => Date.now();

/** One confirm's arming state. */
export type SlArm = {
  /** The confirm just opened: unarmed for SL_ARM_MS from `at`, and no key-down counts yet. */
  open(at: number): void;
  /** Whether the button is armed at `at`. */
  armed(at: number): boolean;
  /** A pointer click on the button at `at`: true when it should act. */
  click(at: number): boolean;
  /** A key-down on button `id`. True when the key belongs to the button (the caller stops the browser's own click). */
  keyDown(id: string, key: string, repeat: boolean): boolean;
  /** A key-up on button `id` at `at`. `handled` as for keyDown; `act` true when it should act. */
  keyUp(id: string, key: string, at: number): { handled: boolean; act: boolean };
};

const ACT_KEYS = new Set(['Enter', ' ']);

// Makes one arm (unarmed until open()).
export function createSlArm(): SlArm {
  let openedAt = Number.POSITIVE_INFINITY;
  let downOn: string | null = null;
  const armed = (at: number) => at - openedAt >= SL_ARM_MS;
  return {
    open(at) {
      openedAt = at;
      downOn = null;
    },
    armed,
    click(at) {
      return armed(at);
    },
    keyDown(id, key, repeat) {
      if (!ACT_KEYS.has(key)) return false;
      // A repeat of a key held since before (or from another control) never starts a press here.
      if (!repeat) downOn = id;
      return true;
    },
    keyUp(id, key, at) {
      if (!ACT_KEYS.has(key)) return { handled: false, act: false };
      const began = downOn === id;
      downOn = null;
      return { handled: true, act: began && armed(at) };
    },
  };
}

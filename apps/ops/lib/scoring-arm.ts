// The Scoring confirm's gold "Publish" button acts only on purpose (the house pattern, as lib/cycle-settings-arm.ts).
// When the confirm opens, focus lands on its words (not the button), and the button stays unarmed for ARM_MS, so a held
// or double Enter, or a second click, can't publish. From the keyboard it acts on the key-up of an Enter or Space whose
// key-down began on that same button (a held key's repeats are ignored); a pointer click acts once armed. Pure (the clock
// is passed in), so tests/scoring-arm.test.ts covers every path.

export const ARM_MS = 400;

/** The clock the board's handlers read (a plain function, so it is only ever called from a handler). */
export const nowMs = (): number => Date.now();

/** One confirm's arming state. */
export type Arm = {
  /** The confirm just opened: unarmed for ARM_MS from `at`, and no key-down counts yet. */
  open(at: number): void;
  /** A pointer click on the button at `at`: true when it should act. */
  click(at: number): boolean;
  /** A key-down on button `id`. True when the key belongs to the button (the caller stops the browser's own click). */
  keyDown(id: string, key: string, repeat: boolean): boolean;
  /** A key-up on button `id` at `at`. `handled` as for keyDown; `act` true when it should act. */
  keyUp(id: string, key: string, at: number): { handled: boolean; act: boolean };
};

const ACT_KEYS = new Set(['Enter', ' ']);

export function createArm(): Arm {
  let openedAt = Number.POSITIVE_INFINITY;
  let downOn: string | null = null;
  const armed = (at: number) => at - openedAt >= ARM_MS;
  return {
    open(at) {
      openedAt = at;
      downOn = null;
    },
    click(at) {
      return armed(at);
    },
    keyDown(id, key, repeat) {
      if (!ACT_KEYS.has(key)) return false;
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

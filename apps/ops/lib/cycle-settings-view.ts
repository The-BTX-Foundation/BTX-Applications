// The Cycle settings page's data contract (Ops Hub refresh 2026-11-12, demo p-cycle-settings). Types only: the line
// between the page and its data. Mock mode fills it from mock/cycle-settings-view.ts, live mode from
// lib/cycle-settings-live.ts; lib/cycle-settings-view-loader.ts picks. Dates travel as strings (the cycle row as stored).
import type { CycleRow } from './cycle-settings';

/**
 * What the page may do. In live mode each flag is true only where the real write exists and the viewer may use it:
 * - `edit`: admin rights (the role re-read from the auth server) and the cycle is not archived; writes go through the
 *   server action saveCycleFields (lib/cycle-settings-actions.ts), which checks the role again and every field.
 * - `publish`: `edit` and the cycle is a draft (the old publishCycle action, which re-checks everything).
 * - `unpublish`: `edit`, the cycle is published, its open time has not come yet and no application has been submitted
 *   (staff can read only submitted applications, so after the open time a started one could be invisible); the server
 *   action unpublishCycleNow checks both again.
 */
export type CycleSettingsCaps = { edit: boolean; publish: boolean; unpublish: boolean };

/** The page's data when it loaded. `cycle` null = there is no draft or published cycle (the empty state). */
export type CycleSettingsView = {
  failed: false;
  /** The cycle's read failed: the header and the "didn't load" line with Try again (the demo's Load error state). */
  loadFailed: boolean;
  /** Today in Eastern time ("2026-11-10"), from the server. */
  today: string;
  /** The moment the server built the view (an ISO instant; mock: the demo's 9:00 AM on `today`). */
  now: string;
  cycle: CycleRow | null;
  /** Submitted applications in this cycle, the only ones staff can read (decides Unpublish; "the 21 applicants"). */
  applications: number;
  /** Active interview bookings in this cycle ("5 of the 21 have booked a time"), or null when that count could not be read
   * (the confirm then leaves that sentence out). */
  booked: number | null;
  /** The term of a different, published cycle (a draft can't be published while one is). */
  otherPublishedTerm: string | null;
  /** Admin rights: the settings can be changed (board members see the page read-only). */
  canEdit: boolean;
  caps: CycleSettingsCaps;
};

/** The whole page failed (mock `?demo=failed`): the shared "didn't load" card under the title. */
export type CycleSettingsResult = CycleSettingsView | { failed: true };

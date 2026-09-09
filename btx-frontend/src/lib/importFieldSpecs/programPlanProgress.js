// Field spec for the program_plan_progress import (plain upsert -- every
// mapped column is always written, full-row replace on conflict). Unlike
// every other numeric field elsewhere in these specs, all six counters
// here are NOT NULL at the DB level (DEFAULT 0), so they're required
// rather than optional.
import { required, parseIntegerCell } from '../importValidators.js'

export default {
  fields: [
    { column: 'plan_year', label: 'Plan Year', validate: required(parseIntegerCell) }, // upsert key
    { column: 'milestones_complete', label: 'Milestones Complete', validate: required(parseIntegerCell) },
    { column: 'milestones_total', label: 'Milestones Total', validate: required(parseIntegerCell) },
    { column: 'tasks_complete', label: 'Tasks Complete', validate: required(parseIntegerCell) },
    { column: 'tasks_total', label: 'Tasks Total', validate: required(parseIntegerCell) },
    { column: 'tasks_in_progress', label: 'Tasks In Progress', validate: required(parseIntegerCell) },
    { column: 'tasks_not_started', label: 'Tasks Not Started', validate: required(parseIntegerCell) },
  ],

  // Cross-field checks that can't be expressed by a single cell's
  // validator -- run once per row, after every field above already passed.
  // Mirrors sync-program-plan-progress's own two sanity checks exactly;
  // deliberately does NOT check tasks_complete + tasks_in_progress +
  // tasks_not_started == tasks_total, matching the Edge Function's own
  // intentionally looser rule.
  validateRow(row) {
    if (row.milestones_complete > row.milestones_total) {
      return { ok: false, error: 'milestones_complete cannot exceed milestones_total' }
    }
    if (row.tasks_complete > row.tasks_total) {
      return { ok: false, error: 'tasks_complete cannot exceed tasks_total' }
    }
    return { ok: true }
  },
}

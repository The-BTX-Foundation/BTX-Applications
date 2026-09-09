// Field spec for the marketing_tasks import (plain insert -- create-only,
// no natural key). Mirrors createTask() in src/stores/marketingTasks.js.
import { required, parseOptionalStringCell, parseDateCell, parseEnumCell } from '../importValidators.js'
import { resolveAssignee } from '../importAssigneeLookup.js'
import { MARKETING_TASK_TYPES } from '../marketingTaskTypes.js'

export default {
  fields: [
    { column: 'title', label: 'Title', validate: required(parseOptionalStringCell) }, // NOT NULL at the DB level already -- no divergence here, unlike tasks_alerts' title
    {
      column: 'assigned_to',
      label: 'Assigned To',
      needsContext: 'assigneeLookup', // prefetched name -> id map from buildAssigneeLookup()
      validate: (raw, context) => resolveAssignee(context.assigneeLookup, raw),
    },
    { column: 'date', label: 'Date', validate: required(parseDateCell) }, // NOT NULL at the DB level
    {
      column: 'type',
      label: 'Type',
      // MARKETING_TASK_TYPES is the same constant NewTaskModal.vue's
      // dropdown uses, and matches this table's real DB CHECK constraint
      // exactly (Phase 1) -- imported directly rather than re-declared,
      // since an actual shared source of truth already exists for this
      // table (unlike tasks_alerts.type, which has no DB constraint to
      // mirror and so needed its own local list).
      validate: required((raw) => parseEnumCell(raw, MARKETING_TASK_TYPES)),
    },
    { column: 'description', label: 'Description', validate: parseOptionalStringCell },
  ],

  // status is deliberately not an importable field at all -- every existing
  // createTask() call across all four task stores hardcodes status: 'Open'
  // regardless of caller input (Phase 1), mirrored here exactly. A "status"
  // column present in an uploaded file is simply ignored, never mapped.
  fixedFields: { status: 'Open' },
}

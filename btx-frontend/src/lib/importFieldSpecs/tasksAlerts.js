// Field spec for the tasks_alerts import (plain insert -- create-only, no
// natural key). Mirrors createTask() in src/stores/tasksAlerts.js, including
// two places import deliberately departs from a literal schema read: see
// the comments on `title` and `fixedFields` below.
import { required, parseOptionalStringCell, parseDateCell, parseEnumCell } from '../importValidators.js'
import { resolveAssignee } from '../importAssigneeLookup.js'

// NewTaskModal.vue's vocabulary for this destination -- no DB CHECK exists
// on tasks_alerts.type (Phase 1), so this is a frontend-only rule import
// deliberately mirrors rather than leaving wide open to any string.
const TYPE_OPTIONS = ['Task', 'Approval']

export default {
  fields: [
    {
      column: 'title',
      label: 'Title',
      // The DB column allows NULL, but every existing creation path
      // (NewTaskModal.vue) enforces a non-empty title via HTML `required`.
      // Import mirrors that practical UI constraint rather than the looser
      // DB constraint, so a blank-title row is rejected here even though
      // the database itself would silently accept it.
      validate: required(parseOptionalStringCell),
    },
    {
      column: 'assigned_to',
      label: 'Assigned To',
      needsContext: 'assigneeLookup', // prefetched name -> id map from buildAssigneeLookup()
      validate: (raw, context) => resolveAssignee(context.assigneeLookup, raw),
    },
    { column: 'due_date', label: 'Due Date', validate: parseDateCell }, // nullable at the DB level
    { column: 'type', label: 'Type', validate: (raw) => parseEnumCell(raw, TYPE_OPTIONS) },
  ],

  // status is deliberately not an importable field at all -- every existing
  // createTask() call across all four task stores hardcodes status: 'Open'
  // regardless of caller input (Phase 1), so import mirrors that exactly
  // rather than letting a CSV set an arbitrary initial status. A "status"
  // column present in an uploaded file is simply ignored, never mapped.
  fixedFields: { status: 'Open' },
}

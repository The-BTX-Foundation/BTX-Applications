// Field spec for the event_tracker_events import (plain upsert -- every
// mapped column is always written, full-row replace on conflict). Only
// three columns exist for this table via sync-event-tracker-events, and
// the same is true here -- all three also form the natural key.
import { required, parseOptionalStringCell, parseDateCell } from '../importValidators.js'

export default {
  fields: [
    { column: 'event_date', label: 'Event Date', validate: required(parseDateCell) }, // upsert key
    { column: 'category', label: 'Category', validate: required(parseOptionalStringCell) }, // upsert key
    { column: 'event_name', label: 'Event Name', validate: required(parseOptionalStringCell) }, // upsert key
  ],
}

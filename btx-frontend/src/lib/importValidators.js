// Shared cell-level validators for the Import feature. Every validator takes
// the raw string from one parsed CSV/TSV cell (or undefined if a row has
// fewer columns than the header) and returns { ok: true, value } or
// { ok: false, error }. All base validators treat an empty/missing cell as
// null (valid) by default -- required() wraps any validator to reject empty
// instead, so "required-ness" is expressed once per field rather than
// duplicated across validator implementations, unlike the sync Edge
// Functions' separate parseNumeric/parseRequiredString-style pairs.

// Wraps a validator so an empty/missing cell is rejected instead of treated
// as null. Every "required" field spec entry is required(someValidator)
// rather than a separate hand-written implementation. The returned function
// is marked with .isRequired so callers (e.g. Preview's unmapped-optional-
// field notice) can tell required and optional fields apart by checking the
// actual validator, rather than needing a separate `required: true` flag on
// each field spec entry that could silently drift out of sync with which
// validator it's actually paired with.
export function required(validateFn) {
  // Rejects an empty/missing cell before delegating to the wrapped validator.
  const wrapped = (raw, context) => {
    if (raw === '' || raw == null) return { ok: false, error: 'This field is required' }
    return validateFn(raw, context)
  }
  wrapped.isRequired = true
  return wrapped
}

// Parses a decimal number. Empty cell -> null (field left blank on purpose).
export function parseNumericCell(raw) {
  if (raw === '' || raw == null) return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: `"${raw}" is not a valid number` }
  return { ok: true, value: n }
}

// Same as parseNumericCell but rejects non-whole numbers (e.g. "12.5"),
// mirroring the Edge Functions' parseInteger.
export function parseIntegerCell(raw) {
  const result = parseNumericCell(raw)
  if (!result.ok) return result
  if (result.value !== null && !Number.isInteger(result.value)) {
    return { ok: false, error: `"${raw}" must be a whole number` }
  }
  return result
}

// Trims a string cell. Empty/whitespace-only -> null (not empty string) so
// every table's "blank cell means null" contract stays unambiguous.
export function parseOptionalStringCell(raw) {
  const trimmed = (raw ?? '').trim()
  return { ok: true, value: trimmed === '' ? null : trimmed }
}

// Accepts case-insensitive "true"/"false", matching sync-donor-impact's own
// published-field coercion. Empty cell -> null, distinct from false.
export function parseBooleanCell(raw) {
  if (raw === '' || raw == null) return { ok: true, value: null }
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true') return { ok: true, value: true }
  if (normalized === 'false') return { ok: true, value: false }
  return { ok: false, error: `"${raw}" must be true or false` }
}

// Validates against a fixed allowed-value list. Deliberately case-sensitive,
// exact match -- mirrors sync-grant-pipeline's status check, which rejects
// "submitted" (lowercase) rather than silently normalizing it.
export function parseEnumCell(raw, allowedValues) {
  if (raw === '' || raw == null) return { ok: true, value: null }
  const trimmed = raw.trim()
  if (!allowedValues.includes(trimmed)) {
    return { ok: false, error: `"${trimmed}" must be one of: ${allowedValues.join(', ')}` }
  }
  return { ok: true, value: trimmed }
}

// Parses a YYYY-MM-DD date (or the leading digits of a full ISO timestamp).
// Validates it's a real calendar date using Date.UTC + UTC getters rather
// than a plain `new Date(str)` round-trip, specifically to avoid local-
// timezone skew silently shifting a date by a day -- mirrors
// sync-event-tracker-events' date parser exactly.
export function parseDateCell(raw) {
  if (raw === '' || raw == null) return { ok: true, value: null }
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return { ok: false, error: `"${raw}" must be in YYYY-MM-DD format` }
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const check = new Date(Date.UTC(year, month - 1, day))
  const isRealDate =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  if (!isRealDate) return { ok: false, error: `"${raw}" is not a real calendar date` }
  return { ok: true, value: `${yearStr}-${monthStr}-${dayStr}` }
}

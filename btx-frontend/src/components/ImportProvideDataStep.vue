<script setup>
import { ref } from 'vue'
import Papa from 'papaparse'

const rawRows = defineModel({ default: () => [] })

// Set when a parse "succeeds" (no thrown error) but the result doesn't look
// like real tabular data, or when nothing could be parsed at all. Cleared
// on the next parse attempt, successful or not.
const parseError = ref(null)

// Row count shown after a successful parse, purely as feedback -- advancing
// to Preview is still a separate, manual Next click (see ImportWizard.vue's
// canAdvance), so this doesn't drive navigation on its own.
const parseSuccessCount = ref(0)

// PapaParse behaves differently for a plain string vs. a File: a string is
// parsed synchronously and its `complete` callback fires before Papa.parse()
// itself even returns, but a File is read via the browser's FileReader
// internally, which is unavoidably asynchronous -- there is no usable
// synchronous return value for a File at all. Relying only on the
// `complete` callback (never Papa.parse()'s return value) is the one code
// path that behaves correctly for both input types without branching on
// which one was used.
function parseInput(input) {
  Papa.parse(input, {
    header: true,
    skipEmptyLines: true, // a pasted spreadsheet block's trailing blank line shouldn't count as a bogus row
    complete: handleParseComplete,
  })
}

// Row-level shape problems -- PapaParse's FieldMismatch errors for ragged
// rows (too many/few fields in one row) -- are deliberately NOT checked
// here. They're meaningless without knowing which of this file's columns
// map to which required DB fields, and that mapping doesn't happen until
// Preview, which already has a complete per-row/per-cell error surface
// designed for exactly this. rawRows is stored exactly as PapaParse parsed
// it, ragged rows and all, for Preview to interpret.
function handleParseComplete(results) {
  if (looksLikeGarbageInput(results)) {
    parseError.value = describeGarbageInput(results)
    parseSuccessCount.value = 0
    // A previous parse attempt (paste or file) may have left rawRows
    // populated -- without clearing it here, Next would stay enabled on
    // stale rows that no longer match what's currently in the input,
    // disagreeing with the error message shown above.
    rawRows.value = []
    return
  }
  parseError.value = null
  parseSuccessCount.value = results.data.length
  rawRows.value = results.data
}

// Neither of PapaParse's own signals is trustworthy alone: an empty
// `errors` array doesn't mean the data is sensible (prose text with no
// delimiters "succeeds", with the whole sentence parsed as one bogus header
// field), and a non-empty one doesn't mean nothing usable came through
// (ragged rows still parse -- see the FieldMismatch note above). The
// smallest real field spec in the whole registry (event_tracker_events,
// program_plan_milestones) has 3 required columns, and even the most
// minimal plausible donor_impact partial update needs at least a key plus
// one field to change -- fewer than 2 parsed columns is never legitimate
// data for any of the 11 importable tables.
function looksLikeGarbageInput(results) {
  return results.meta.fields.length < 2 || results.data.length === 0
}

function describeGarbageInput(results) {
  if (results.data.length === 0) {
    return 'No data rows found — check that your file or paste includes a header row plus at least one row of data below it.'
  }
  return "This doesn't look like table data — check that it's actually comma- or tab-separated."
}

function handleFileChange(event) {
  const file = event.target.files[0]
  if (file) parseInput(file)
}
</script>

<template>
  <div class="provide-data">
    <label class="field">
      <span class="field-label">Paste CSV or TSV data</span>
      <textarea
        class="paste-area"
        rows="10"
        placeholder="Paste rows copied from a spreadsheet, including the header row..."
        @input="parseInput($event.target.value)"
      ></textarea>
    </label>

    <div class="divider-row">
      <span class="divider-label">or</span>
    </div>

    <label class="file-btn">
      Choose File
      <input type="file" accept=".csv,.tsv,.txt" class="file-input" @change="handleFileChange" />
    </label>

    <p v-if="parseError" class="error">{{ parseError }}</p>
    <p v-else-if="parseSuccessCount > 0" class="success">
      Parsed {{ parseSuccessCount }} row{{ parseSuccessCount === 1 ? '' : 's' }}.
    </p>
  </div>
</template>

<style scoped>
.provide-data {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 480px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.paste-area {
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #2d3142;
  resize: vertical;
}

.divider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.divider-label {
  font-size: 12px;
  color: #8a8a85;
}

.file-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* Visually hidden rather than display:none -- keeps the input focusable
   and clickable via its wrapping label, which is what actually triggers
   the native file picker. */
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.error {
  margin: 0;
  color: #b3261e;
  font-size: 13px;
}

.success {
  margin: 0;
  color: #2e7d32;
  font-size: 13px;
}
</style>

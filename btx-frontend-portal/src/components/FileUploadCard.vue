<script setup>
import { computed, ref } from 'vue'

// Reusable dashed-border upload card used by both of Step 6's document
// slots (Resume, Unofficial transcript). The parent owns validation and the
// actual File objects -- this component only renders whichever of its four
// states applies and emits the raw picked File back up on 'select'.
defineProps({
  title: { type: String, required: true },
  hint: { type: String, required: true },
  accept: { type: String, default: '' },
  file: { type: File, default: null },
  savedName: { type: String, default: '' },
  error: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const inputRef = ref(null)

// The visible "Choose file"/"Replace file" button just proxies a click to
// the hidden native file input.
function onChooseClick() {
  inputRef.value?.click()
}

// Handles the native file input's change event, emitting the picked file.
function onChange(event) {
  const picked = event.target.files?.[0] ?? null
  // Reset the input's value so picking the exact same file again still
  // fires a 'change' event next time -- browsers treat an unchanged value
  // as a no-op otherwise.
  event.target.value = ''
  if (picked) emit('select', picked)
}

// Formats a byte count as a human-readable B/KB/MB string.
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="upload-card">
    <h3 class="upload-title">{{ title }}</h3>

    <!-- Selected: a File object is currently in memory. -->
    <template v-if="file">
      <p class="upload-filename">{{ file.name }}</p>
      <p class="upload-filesize">{{ formatSize(file.size) }}</p>
    </template>

    <!-- Needs reselect: a filename was persisted from an earlier visit, but
         the File itself doesn't survive a reload. -->
    <template v-else-if="savedName">
      <p class="upload-savedname">{{ savedName }}</p>
      <p class="upload-reselect-hint">
        Please choose this file again — files aren't kept if you leave the page.
      </p>
    </template>

    <!-- Empty: nothing picked yet, nothing saved. -->
    <p v-else class="upload-hint">{{ hint }}</p>

    <input ref="inputRef" type="file" class="upload-input" :accept="accept" @change="onChange" />
    <button type="button" class="upload-btn" @click="onChooseClick">
      {{ file ? 'Replace file' : 'Choose file' }}
    </button>

    <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.upload-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: 16px;
  background: var(--color-surface);
  padding: 36px 24px;
  text-align: center;
}

.upload-title {
  font-weight: 700;
  font-size: 17px;
  color: var(--color-text-primary);
}

.upload-hint {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.upload-filename {
  margin-top: 10px;
  max-width: 100%;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.upload-filesize {
  margin-top: 2px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.upload-savedname {
  margin-top: 10px;
  max-width: 100%;
  font-size: 14px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.upload-reselect-hint {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.upload-input {
  display: none;
}

.upload-btn {
  margin-top: 22px;
  padding: 14px 28px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
}

.upload-btn:hover {
  opacity: 0.92;
}

.upload-error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-danger-text);
}
</style>

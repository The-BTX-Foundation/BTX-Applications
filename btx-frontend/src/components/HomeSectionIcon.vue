<script setup>
// Small inline line-art icons for Home's section rows -- no icon library,
// just the same stroke="currentColor" convention already used by
// HomeView.vue's hamburger/chevron SVGs, so `color` on the wrapping tile
// (see HomeSectionRow.vue) is all that's needed to recolor one.
defineProps({
  name: {
    type: String,
    required: true,
    validator: (value) =>
      ['warning', 'checkbox', 'calendar', 'dollar', 'trending-up', 'folder', 'graduation-cap', 'megaphone'].includes(
        value,
      ),
  },
})
</script>

<template>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'warning'">
      <path d="M12 3 22 20H2Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </template>
    <template v-else-if="name === 'checkbox'">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <polyline points="8 12 11 15 16 9" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </template>
    <template v-else-if="name === 'dollar'">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15.5c.7.7 1.8 1 3 1 1.9 0 3-.9 3-2.2 0-1.3-1.1-1.8-3-2.3-1.9-.5-3-1-3-2.3C9 8.5 10.1 7.5 12 7.5c1.2 0 2.3.3 3 1" />
      <line x1="12" y1="6" x2="12" y2="7.5" />
      <line x1="12" y1="16.5" x2="12" y2="18" />
    </template>
    <template v-else-if="name === 'trending-up'">
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="14 6 21 6 21 13" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </template>
    <template v-else-if="name === 'graduation-cap'">
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" />
      <line x1="22" y1="10" x2="22" y2="15.5" />
    </template>
    <template v-else-if="name === 'megaphone'">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2Z" />
      <path d="M13 8a4 4 0 0 1 0 8" />
      <path d="M16 5a8 8 0 0 1 0 14" />
    </template>
  </svg>
</template>

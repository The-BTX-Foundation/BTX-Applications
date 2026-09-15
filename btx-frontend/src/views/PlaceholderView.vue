<script setup>
// Generic "not built yet" view — reused across every sidebar route that
// doesn't have a real page yet, parameterized by the route's title prop.
defineProps({
  title: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <div class="placeholder">
    <h2 data-page-heading>{{ title }}</h2>
    <p>Coming soon.</p>
  </div>
</template>

<style scoped>
.placeholder h2 {
  margin: 0 0 8px;
}

.placeholder p {
  margin: 0;
  color: #8a8a85;
}
</style>

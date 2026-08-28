<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close'])

const title = ref('')
const date = ref('')

// No backend exists yet for events, so there's nothing to call and nothing
// that can fail — this just closes the modal, the same shape as a
// successful submit elsewhere in the app, without an error state that
// could never actually occur.
function handleSubmit() {
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <h3 class="heading">Add Event</h3>

      <form @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field-label">Title</span>
          <input v-model="title" type="text" required />
        </label>

        <label class="field">
          <span class="field-label">Date</span>
          <input v-model="date" type="date" required />
        </label>

        <!-- Visible for the whole time the form is open, not just after
             submitting — sets the expectation upfront that this page has
             no real data source yet, since it's being actively demoed. -->
        <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>

        <div class="actions">
          <button type="button" class="btn btn--outline" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn--gold">Create</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  color: #2d3142;
}

.heading {
  margin: 0 0 16px;
  font-size: 17px;
  font-weight: 600;
}

form {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.field input {
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  color: #2d3142;
  font-family: inherit;
}

.not-connected-note {
  margin: 0;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
}

.btn--gold {
  background: #c9932a;
  color: #fff;
  border: 1px solid #c9932a;
}
</style>

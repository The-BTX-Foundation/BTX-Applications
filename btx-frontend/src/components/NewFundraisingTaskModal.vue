<script setup>
import { onMounted, ref } from 'vue'
import { useFundraisingTasksStore } from '@/stores/fundraisingTasks'

const emit = defineEmits(['close'])

const fundraisingTasksStore = useFundraisingTasksStore()

const title = ref('')
const assignedTo = ref('')
const date = ref('')
const description = ref('')
const submitting = ref(false)
const error = ref(null)

onMounted(() => {
  fundraisingTasksStore.fetchAssignableUsers()
})

// Inserts the new row via the store; closes the modal on success, or shows
// an inline error and leaves the form open so the user can retry.
async function handleSubmit() {
  submitting.value = true
  error.value = null

  const success = await fundraisingTasksStore.createTask({
    title: title.value,
    date: date.value,
    assignedTo: assignedTo.value,
    description: description.value,
  })

  submitting.value = false

  if (success) {
    emit('close')
  } else {
    error.value = fundraisingTasksStore.error
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <h3 class="heading">New Fundraising Task</h3>

      <form @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field-label">Title</span>
          <input v-model="title" type="text" required />
        </label>

        <label class="field">
          <span class="field-label">Assigned To</span>
          <select v-model="assignedTo" required>
            <option value="" disabled>Select a person</option>
            <option v-for="user in fundraisingTasksStore.assignableUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Date</span>
          <input v-model="date" type="date" required />
        </label>

        <label class="field">
          <span class="field-label">Description</span>
          <textarea v-model="description" rows="3"></textarea>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="actions">
          <button type="button" class="btn btn--outline" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn--gold" :disabled="submitting">
            {{ submitting ? 'Creating…' : 'Create' }}
          </button>
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

.field input,
.field select,
.field textarea {
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  color: #2d3142;
  font-family: inherit;
  resize: vertical;
}

.error {
  margin: 0;
  color: #b3261e;
  font-size: 13px;
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

.btn:disabled {
  opacity: 0.6;
  cursor: default;
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

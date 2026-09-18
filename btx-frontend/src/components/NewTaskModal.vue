<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useMarketingTasksStore } from '@/stores/marketingTasks'
import { useBudgetingTasksStore } from '@/stores/budgetingTasks'
import { useFundraisingTasksStore } from '@/stores/fundraisingTasks'
import { MARKETING_TASK_TYPES } from '@/lib/marketingTaskTypes'

const emit = defineEmits(['close'])

const tasksAlertsStore = useTasksAlertsStore()
const marketingTasksStore = useMarketingTasksStore()
const budgetingTasksStore = useBudgetingTasksStore()
const fundraisingTasksStore = useFundraisingTasksStore()

// Maps each destination option to the store that actually owns that table,
// so submit can build the right payload and call the right createTask()
// without a long if/else chain scattered through the component.
const storesByDestination = {
  tasks_alerts: tasksAlertsStore,
  marketing_tasks: marketingTasksStore,
  budgeting_tasks: budgetingTasksStore,
  fundraising_tasks: fundraisingTasksStore,
}

const DESTINATIONS = [
  { value: 'tasks_alerts', label: 'Task & Approval' },
  { value: 'marketing_tasks', label: 'Marketing' },
  { value: 'budgeting_tasks', label: 'Budgeting' },
  { value: 'fundraising_tasks', label: 'Fundraising' },
]

const destination = ref('tasks_alerts')
const title = ref('')
const assignedTo = ref('')
const date = ref('')
// Only meaningful when destination is tasks_alerts (Task/Approval) or
// marketing_tasks (its 3 category values) — budgeting_tasks and
// fundraising_tasks have no type column at all, so this is simply unused
// for those two destinations.
const type = ref('Task')
const description = ref('')
const submitting = ref(false)
const error = ref(null)

// Whether the Type field applies to the current destination — tasks_alerts
// and marketing_tasks each have their own, unrelated type vocabulary;
// budgeting/fundraising have none.
const showTypeField = computed(() => destination.value === 'tasks_alerts' || destination.value === 'marketing_tasks')

// Which set of type options to offer, matching whichever vocabulary the
// current destination's table actually constrains `type` to.
const typeOptions = computed(() => (destination.value === 'tasks_alerts' ? ['Task', 'Approval'] : MARKETING_TASK_TYPES))

// Only tasks_alerts has no description column — the other three do.
const showDescriptionField = computed(() => destination.value !== 'tasks_alerts')

// "Due Date" matches Task & Approval's existing wording; the other three
// destinations' own (now-removed) modals used the plainer "Date" — kept
// here so the label doesn't change meaning depending on context.
const dateLabel = computed(() => (destination.value === 'tasks_alerts' ? 'Due Date' : 'Date'))

// The assignable-people list for the currently selected destination. All
// four stores query the same `profiles` table, so the option values are
// identical regardless of destination — this just reads whichever store's
// copy is already loaded.
const assignableUsers = computed(() => storesByDestination[destination.value].assignableUsers)

// Loads every destination's assignable-people list once on mount (cheap,
// identical underlying query each time) so switching Destination doesn't
// need a fresh fetch — just reads whichever store the current selection
// maps to.
onMounted(() => {
  tasksAlertsStore.fetchAssignableUsers()
  marketingTasksStore.fetchAssignableUsers()
  budgetingTasksStore.fetchAssignableUsers()
  fundraisingTasksStore.fetchAssignableUsers()
})

// Resets `type` to a sane default whenever the destination changes, so
// switching from Task & Approval to Marketing doesn't leave it set to
// "Task" — a value that isn't in Marketing's vocabulary at all.
watch(destination, (newDestination) => {
  if (newDestination === 'tasks_alerts') {
    type.value = 'Task'
  } else if (newDestination === 'marketing_tasks') {
    type.value = MARKETING_TASK_TYPES[0]
  }
})

// Builds the destination-appropriate insert payload and routes it to the
// matching store's createTask(). Field names differ per destination
// (dueDate vs date, type present or not, description present or not)
// because each table's own createTask() already expects its own shape —
// this just assembles the right one and calls it.
async function handleSubmit() {
  submitting.value = true
  error.value = null

  const store = storesByDestination[destination.value]
  const payload =
    destination.value === 'tasks_alerts'
      ? { title: title.value, assignedTo: assignedTo.value, dueDate: date.value, type: type.value }
      : destination.value === 'marketing_tasks'
        ? {
            title: title.value,
            type: type.value,
            date: date.value,
            assignedTo: assignedTo.value,
            description: description.value,
          }
        : { title: title.value, date: date.value, assignedTo: assignedTo.value, description: description.value }

  const success = await store.createTask(payload)

  submitting.value = false

  if (success) {
    emit('close')
  } else {
    error.value = store.error
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <h3 class="heading">New Task</h3>

      <form @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field-label">Destination</span>
          <select v-model="destination" required>
            <option v-for="dest in DESTINATIONS" :key="dest.value" :value="dest.value">
              {{ dest.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Title</span>
          <input v-model="title" type="text" required />
        </label>

        <label v-if="showTypeField" class="field">
          <span class="field-label">Type</span>
          <select v-model="type" required>
            <option v-for="option in typeOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Assigned To</span>
          <select v-model="assignedTo" required>
            <option value="" disabled>Select a person</option>
            <option v-for="user in assignableUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">{{ dateLabel }}</span>
          <input v-model="date" type="date" required />
        </label>

        <label v-if="showDescriptionField" class="field">
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
  background: var(--color-surface);
  border-radius: 12px;
  padding: 24px;
  color: var(--color-text-primary);
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
  color: var(--color-text-label);
}

.field input,
.field select,
.field textarea {
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  color: var(--color-text-primary);
  font-family: inherit;
  resize: vertical;
}

.error {
  margin: 0;
  color: var(--color-danger-text);
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
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}

.btn--gold {
  background: var(--color-accent);
  color: var(--color-surface);
  border: 1px solid var(--color-accent);
}
</style>

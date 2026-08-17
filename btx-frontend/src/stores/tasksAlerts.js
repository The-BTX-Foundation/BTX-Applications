import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchTasks and markComplete return identically
// shaped rows — keeps the row swapped into `tasks` after an update
// consistent with rows loaded from the initial fetch.
const TASK_COLUMNS = 'task_id, title, due_date, status, type, assigned_to:profiles(name)'

// Pinia store for the Tasks & Approvals list. Reads/writes go through
// Supabase's RLS policies on `tasks_alerts`, so the rows returned here are
// already scoped to what the signed-in user is allowed to see/edit — no
// client-side filtering by user or role is needed on top of this.
export const useTasksAlertsStore = defineStore('tasksAlerts', () => {
  const tasks = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads all tasks/alerts visible to the current user under RLS, soonest
  // due date first.
  async function fetchTasks() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('tasks_alerts')
      .select(TASK_COLUMNS)
      .order('due_date')

    if (fetchError) {
      error.value = fetchError.message
    } else {
      tasks.value = data
    }
    loading.value = false
  }

  // Updates a row's status (Complete/Declined). The update itself is still
  // governed by RLS, so this will silently fail with an update error for
  // users who aren't allowed to act on this particular row (e.g. non
  // board/admin roles).
  async function updateStatus(taskId, status) {
    error.value = null

    const { data, error: updateError } = await supabase
      .from('tasks_alerts')
      .update({ status })
      .eq('task_id', taskId)
      .select(TASK_COLUMNS)
      .single()

    if (updateError) {
      error.value = updateError.message
      return
    }

    // Patch the single row in place rather than refetching the whole list.
    const index = tasks.value.findIndex((task) => task.task_id === taskId)
    if (index !== -1) {
      tasks.value[index] = data
    }
  }

  // Marks a task/approval complete (used for "Mark complete" and "Approve").
  function markComplete(taskId) {
    return updateStatus(taskId, 'Complete')
  }

  // Declines an approval row.
  function declineTask(taskId) {
    return updateStatus(taskId, 'Declined')
  }

  return { tasks, loading, error, fetchTasks, markComplete, declineTask }
})

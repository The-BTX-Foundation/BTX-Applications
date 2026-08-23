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
  const assignableUsers = ref([])
  const assignedOpenCount = ref(0)

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

  // Loads board/admin profiles for the New Task modal's Assigned To dropdown.
  // Gated by the same "Board/Admin can view profiles" RLS policy as every
  // other read of this table, so this silently returns nothing for roles
  // that shouldn't see it rather than needing a client-side role check.
  async function fetchAssignableUsers() {
    const { data, error: fetchError } = await supabase.from('profiles').select('id, name').order('name')

    if (fetchError) {
      error.value = fetchError.message
    } else {
      assignableUsers.value = data
    }
  }

  // Creates a new task/approval row, defaulting status to 'Open'. Refetches
  // the list on success (rather than splicing the row in locally) so the
  // due-date ordering stays correct regardless of where the new row falls.
  // Returns whether the insert succeeded so the modal knows to close.
  async function createTask({ title, assignedTo, dueDate, type }) {
    error.value = null

    const { error: insertError } = await supabase.from('tasks_alerts').insert({
      title,
      assigned_to: assignedTo,
      due_date: dueDate,
      type,
      status: 'Open',
    })

    if (insertError) {
      error.value = insertError.message
      return false
    }

    await fetchTasks()
    return true
  }

  // Counts open (not Complete/Declined) rows assigned to the given user, for
  // the Home page's "X open items assigned to you" line. A head-only count
  // query rather than fetchTasks(), since fetchTasks() aliases assigned_to
  // to the joined profile object and loses the raw id needed to filter here.
  async function fetchAssignedOpenCount(userId) {
    const { count, error: fetchError } = await supabase
      .from('tasks_alerts')
      .select('task_id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .not('status', 'in', '(Complete,Declined)')

    if (!fetchError) {
      assignedOpenCount.value = count ?? 0
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

  return {
    tasks,
    loading,
    error,
    assignableUsers,
    assignedOpenCount,
    fetchTasks,
    fetchAssignableUsers,
    fetchAssignedOpenCount,
    createTask,
    markComplete,
    declineTask,
  }
})

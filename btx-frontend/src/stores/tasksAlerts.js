import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchTasks and updateStatus return identically
// shaped rows — keeps the row swapped into `tasks` after an update
// consistent with rows loaded from the initial fetch. `assigned_to` is
// selected raw (not aliased to the profiles join) so components can compare
// it against the signed-in user's id for button-visibility checks; the
// joined name is exposed separately as `profiles`.
const TASK_COLUMNS = 'task_id, title, due_date, status, type, assigned_to, completed_at, profiles(name)'

// Pinia store for the Tasks & Approvals list. Reads go through Supabase's
// RLS SELECT policy on `tasks_alerts`, so the rows returned here are already
// scoped to what the signed-in user is allowed to see — no client-side
// filtering by user or role is needed for visibility. Writes are further
// restricted to the row's assignee by the UPDATE policy, but that's only
// enforced server-side here — components still need their own
// assigned_to-based check to decide whether to show action buttons at all.
export const useTasksAlertsStore = defineStore('tasksAlerts', () => {
  const tasks = ref([])
  const loading = ref(false)
  const error = ref(null)
  const assignableUsers = ref([])
  const assignedOpenCount = ref(0)
  const globalOpenCount = ref(0)

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

  // Updates a row's status (Approved/Complete/Declined). The update itself
  // is still governed by RLS (assignee-only), so this can be rejected by the
  // database even though the UI only shows the triggering button to the
  // assignee — e.g. a race where the row gets reassigned after the page
  // loads but before the click lands. Sets completed_at client-side the
  // moment a row reaches a terminal status (Complete/Declined), since that's
  // the instant the change is known to have succeeded. Deliberately does
  // NOT touch the shared `error` ref (that's reserved for list-load
  // failures that legitimately blank the whole tab) — instead returns the
  // failure message directly so the caller can show a per-row error without
  // ever affecting the rest of the list.
  async function updateStatus(taskId, status) {
    const payload = { status }
    if (status === 'Complete' || status === 'Declined') {
      payload.completed_at = new Date().toISOString()
    }

    const { data, error: updateError } = await supabase
      .from('tasks_alerts')
      .update(payload)
      .eq('task_id', taskId)
      .select(TASK_COLUMNS)
      .single()

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    // Patch the single row in place rather than refetching the whole list.
    const index = tasks.value.findIndex((task) => task.task_id === taskId)
    if (index !== -1) {
      tasks.value[index] = data
    }
    return { success: true, message: null }
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
  // the Home page's "X open items assigned to you" line. Approved rows count
  // as open too — an approval isn't finished until the assignee marks it
  // Complete. A head-only count query rather than fetchTasks(), to avoid
  // pulling full rows just to count them.
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

  // Counts every Open row platform-wide (not scoped to any one user), for
  // the Finance & Funding Headline Metric page's "Pending Tasks" card.
  // tasks_alerts' SELECT policy grants board/admin/reviewer unrestricted
  // read access (unlike UPDATE, which is assignee-gated), so this already
  // sees the full table — no extra filtering needed for a true global count.
  async function fetchGlobalOpenCount() {
    const { count, error: fetchError } = await supabase
      .from('tasks_alerts')
      .select('task_id', { count: 'exact', head: true })
      .eq('status', 'Open')

    if (!fetchError) {
      globalOpenCount.value = count ?? 0
    }
  }

  // Marks a task/approval complete. For Task-type rows this finalizes the
  // row directly; for Approval-type rows this is the second step, only
  // available once the row is already 'Approved'. Returns { success,
  // message }, so the caller can surface a per-row error on failure.
  function markComplete(taskId) {
    return updateStatus(taskId, 'Complete')
  }

  // First step of the Approval flow: moves an Approval row to 'Approved'
  // rather than completing it immediately, so the assignee still has to
  // come back and Mark Complete to finalize it. Returns { success,
  // message }, so the caller can surface a per-row error on failure.
  function approveTask(taskId) {
    return updateStatus(taskId, 'Approved')
  }

  // Declines an approval row. Terminal — unlike Approve, there's no
  // follow-up step. Returns { success, message }, so the caller can
  // surface a per-row error on failure.
  function declineTask(taskId) {
    return updateStatus(taskId, 'Declined')
  }

  return {
    tasks,
    loading,
    error,
    assignableUsers,
    assignedOpenCount,
    globalOpenCount,
    fetchTasks,
    fetchAssignableUsers,
    fetchAssignedOpenCount,
    fetchGlobalOpenCount,
    createTask,
    markComplete,
    approveTask,
    declineTask,
  }
})

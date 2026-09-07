import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchTasks and updateStatus return identically
// shaped rows. Same shape as marketingTasks.js's columns minus `type` —
// budgeting_tasks has no type column at all, unlike marketing_tasks where
// it exists purely for Calendar color-coding.
// `created_at` is only used by Alert Center's New Items section, not by
// anything in this store itself.
const BUDGETING_TASK_COLUMNS =
  'id, title, date, assigned_to, description, status, completed_at, created_at, profiles(name)'

// Pinia store for the Budgeting Tasks list. Mirrors marketingTasks.js's
// pattern closely: reads go through Supabase's RLS SELECT policy on
// `budgeting_tasks`, so rows are already scoped to what the signed-in user
// is allowed to see. Writes are further restricted to the row's assignee by
// the UPDATE policy, enforced server-side — components still need their own
// assigned_to-based check to decide whether to show action buttons at all.
export const useBudgetingTasksStore = defineStore('budgetingTasks', () => {
  const tasks = ref([])
  const loading = ref(false)
  const error = ref(null)
  const assignableUsers = ref([])

  // Loads all budgeting tasks visible to the current user under RLS,
  // soonest date first.
  async function fetchTasks() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('budgeting_tasks')
      .select(BUDGETING_TASK_COLUMNS)
      .order('date')

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
  // moment a row reaches a terminal status (Complete/Declined). Deliberately
  // does NOT touch the shared `error` ref (that's reserved for list-load
  // failures that legitimately blank the whole tab) — instead returns the
  // failure message directly so the caller can show a per-row error without
  // ever affecting the rest of the list.
  async function updateStatus(id, status) {
    const payload = { status }
    if (status === 'Complete' || status === 'Declined') {
      payload.completed_at = new Date().toISOString()
    }

    const { data, error: updateError } = await supabase
      .from('budgeting_tasks')
      .update(payload)
      .eq('id', id)
      .select(BUDGETING_TASK_COLUMNS)
      .single()

    if (updateError) {
      return { success: false, message: updateError.message }
    }

    // Patch the single row in place rather than refetching the whole list.
    const index = tasks.value.findIndex((task) => task.id === id)
    if (index !== -1) {
      tasks.value[index] = data
    }
    return { success: true, message: null }
  }

  // Loads board/admin profiles for the New Task modal's Assigned To
  // dropdown. Gated by the same "Board/Admin can view profiles" RLS policy
  // as every other read of this table, so this silently returns nothing for
  // roles that shouldn't see it rather than needing a client-side role check.
  async function fetchAssignableUsers() {
    const { data, error: fetchError } = await supabase.from('profiles').select('id, name').order('name')

    if (fetchError) {
      error.value = fetchError.message
    } else {
      assignableUsers.value = data
    }
  }

  // Creates a new budgeting task, defaulting status to 'Open'. Refetches the
  // list on success (rather than splicing the row in locally) so the date
  // ordering stays correct regardless of where the new row falls. Returns
  // whether the insert succeeded so the modal knows to close.
  async function createTask({ title, date, assignedTo, description }) {
    error.value = null

    const { error: insertError } = await supabase.from('budgeting_tasks').insert({
      title,
      date,
      assigned_to: assignedTo,
      description,
      status: 'Open',
    })

    if (insertError) {
      error.value = insertError.message
      return false
    }

    await fetchTasks()
    return true
  }

  // Marks a budgeting task complete — the second step of the approval flow,
  // only available once the row is already 'Approved'. Returns { success,
  // message }, so the caller can surface a per-row error on failure.
  function markComplete(id) {
    return updateStatus(id, 'Complete')
  }

  // First step of the approval flow: moves a row to 'Approved' rather than
  // completing it immediately, so the assignee still has to come back and
  // Mark Complete to finalize it. Returns { success, message }, so the
  // caller can surface a per-row error on failure.
  function approveTask(id) {
    return updateStatus(id, 'Approved')
  }

  // Declines a budgeting task. Terminal — unlike Approve, there's no
  // follow-up step. Returns { success, message }, so the caller can
  // surface a per-row error on failure.
  function declineTask(id) {
    return updateStatus(id, 'Declined')
  }

  return {
    tasks,
    loading,
    error,
    assignableUsers,
    fetchTasks,
    fetchAssignableUsers,
    createTask,
    markComplete,
    approveTask,
    declineTask,
  }
})

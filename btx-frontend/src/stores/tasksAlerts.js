import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

const TASK_COLUMNS = 'task_id, title, due_date, status, type, assigned_to:profiles(name)'

export const useTasksAlertsStore = defineStore('tasksAlerts', () => {
  const tasks = ref([])
  const loading = ref(false)
  const error = ref(null)

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

  async function markComplete(taskId) {
    error.value = null

    const { data, error: updateError } = await supabase
      .from('tasks_alerts')
      .update({ status: 'Complete' })
      .eq('task_id', taskId)
      .select(TASK_COLUMNS)
      .single()

    if (updateError) {
      error.value = updateError.message
      return
    }

    const index = tasks.value.findIndex((task) => task.task_id === taskId)
    if (index !== -1) {
      tasks.value[index] = data
    }
  }

  return { tasks, loading, error, fetchTasks, markComplete }
})

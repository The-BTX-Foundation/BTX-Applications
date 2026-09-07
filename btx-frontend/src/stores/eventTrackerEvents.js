import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchEvents always returns identically shaped rows.
const EVENT_COLUMNS = 'id, event_date, category, event_name'

// Pinia store for Event Tracker events. Reads go through Supabase's RLS
// SELECT policy on `event_tracker_events` (admin, board, and reviewer),
// which matches Event Calendar's own "applicant is denied" gate exactly --
// so nothing client-side needs to filter further. Read-only: the only
// writer is the sync-event-tracker-events edge function (an external Apps
// Script sync), not this app, so there's no create/update here the way
// tasksAlerts.js has.
export const useEventTrackerEventsStore = defineStore('eventTrackerEvents', () => {
  const events = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every event visible under RLS, earliest date first.
  async function fetchEvents() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('event_tracker_events')
      .select(EVENT_COLUMNS)
      .order('event_date', { ascending: true })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      events.value = data
    }
    loading.value = false
  }

  return { events, loading, error, fetchEvents }
})

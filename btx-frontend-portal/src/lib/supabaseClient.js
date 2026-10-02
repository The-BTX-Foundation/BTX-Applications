import { createClient } from '@supabase/supabase-js'

// Shared Supabase client for the app. Uses the publishable (anon) key, so
// all data access is constrained by the RLS policies defined on each table —
// this client never bypasses row-level security. Used by SignInView.vue's
// applicant OTP and staff password flows, and by router/index.js's
// requireSession guard.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

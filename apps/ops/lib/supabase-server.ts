// A Supabase client for server components that acts as the signed-in person (their cookies carry the session).
import { cookies } from 'next/headers';
import { createSessionClient } from '@btx/data/server';

// Builds the client from the request's cookies. Row-level security applies exactly as in the browser.
export async function sessionClient() {
  const store = await cookies();
  return createSessionClient({
    getAll: () => store.getAll(),
    setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
  });
}

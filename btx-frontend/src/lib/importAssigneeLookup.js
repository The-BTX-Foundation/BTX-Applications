// Resolves a person's display name (as typed in an imported CSV/TSV) to a
// profiles.id UUID for the assigned_to column on all four task tables.
// No such resolution exists anywhere else in the app -- every existing
// assignment flow uses a <select> already populated with real ids (see
// fetchAssignableUsers() in the task stores), so this is new, purpose-built
// for import, reusing that same profiles(id, name) query as its data source.

// Fetches every assignable profile once per import run and builds a
// case-insensitive, trimmed name -> [ids] map. Values are arrays (not a
// single id) so a name collision is detectable rather than silently
// resolving to whichever profile happened to be read last.
export async function buildAssigneeLookup(supabase) {
  const { data, error } = await supabase.from('profiles').select('id, name')
  if (error) throw error

  const byName = new Map()
  for (const profile of data) {
    const key = profile.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(profile.id)
  }
  return byName
}

// Resolves one raw "assigned to" cell against the prebuilt lookup map.
// An empty cell is valid (unassigned) -- never guesses when a name matches
// zero or more than one profile, since silently assigning a task to the
// wrong person is worse than blocking the row with a clear error.
export function resolveAssignee(byName, raw) {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const matches = byName.get(trimmed.toLowerCase()) ?? []
  if (matches.length === 0) return { ok: false, error: `No profile found matching "${trimmed}"` }
  if (matches.length > 1) return { ok: false, error: `Multiple profiles match "${trimmed}" -- ambiguous` }
  return { ok: true, value: matches[0] }
}

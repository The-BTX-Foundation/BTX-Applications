// MOCK: the sample people and chat shapes the Programs and Outreach pages share (names come from the Figma frames).
/** A staff member; `id` is the staff_profiles.user_id in live mode. */
export type Person = { name: string; initials: string; id?: string };
/** An owner cell: a person, "Unassigned" (a dashed circle with a ?), or nothing. */
export type Owner = Person | 'unassigned' | null;

export const DANIA: Person = { name: 'Dania Morris', initials: 'DM' };
export const KELSEY: Person = { name: 'Kelsey Davis', initials: 'KD' };
export const TOMI: Person = { name: 'Tomi Falodun', initials: 'TF' };
export const MARCUS: Person = { name: 'Marcus Davis', initials: 'MD' };
export const CHARIAH: Person = { name: 'Chariah Ghee', initials: 'CG' };
export const DARIEN: Person = { name: 'Darien Strachan', initials: 'DS' };
export const CILLISHA: Person = { name: 'Cillisha Knights', initials: 'CK' };

/** Who the "owner" pickers offer in mock mode (live mode reads staff_profiles). */
export const MOCK_STAFF: Person[] = [DANIA, KELSEY, TOMI, MARCUS, CHARIAH];
export const MOCK_STAFF_STRESS: Person[] = [DARIEN, CILLISHA, DANIA, KELSEY, MARCUS, CHARIAH];

export type ChatMsg = { id: string; day: string; who: string; initials?: string; bot?: boolean; mine?: boolean; time: string; text: string };
export type AreaChat = { title: string; people: number; messages: ChatMsg[] };

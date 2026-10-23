// MOCK: the sample people and chat shapes the Programs and Outreach pages share (names come from the Figma frames).
/** A staff member; `id` is the staff_profiles.user_id in live mode. */
export type Person = { name: string; initials: string; id?: string };
/** An owner cell: a person, "Unassigned" (a dashed circle with a ?), or nothing. */
export type Owner = Person | 'unassigned' | null;

export const DANIA: Person = { name: 'Dana Mercer', initials: 'DM' };
export const KELSEY: Person = { name: 'Keith Dawson', initials: 'KD' };
export const TOMI: Person = { name: 'Toby Faraday', initials: 'TF' };
export const MARCUS: Person = { name: 'Miles Donovan', initials: 'MD' };
export const CHARIAH: Person = { name: 'Charlie Gaines', initials: 'CG' };
export const DARIEN: Person = { name: 'Dorian Sutton', initials: 'DS' };
export const CILLISHA: Person = { name: 'Camila Keane', initials: 'CK' };

/** Who the "owner" pickers offer in mock mode (live mode reads staff_profiles). */
export const MOCK_STAFF: Person[] = [DANIA, KELSEY, TOMI, MARCUS, CHARIAH];
export const MOCK_STAFF_STRESS: Person[] = [DARIEN, CILLISHA, DANIA, KELSEY, MARCUS, CHARIAH];

export type ChatMsg = { id: string; day: string; who: string; initials?: string; bot?: boolean; mine?: boolean; time: string; text: string };
/** channelId + canPost are set only in live mode: the composer posts to that channel (admin and board, per the database rules). */
export type AreaChat = { title: string; people: number; messages: ChatMsg[]; channelId?: string | null; canPost?: boolean };

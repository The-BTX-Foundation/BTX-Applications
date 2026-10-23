// MOCK: the admins and board members who appear on the Scholarships pages, shaped like the draft Ops Hub table
// `staff_profiles` (user_id, display_name, title, initials). The names are the ones the Figma frames spell out. The real
// table does not exist yet (draft: supabase/migrations/20261010120000_ops_hub.sql on branch db/ops-schema).
export type StaffProfile = {
  user_id: string;
  display_name: string;
  title: string | null;
  /** Two or three capital letters, no dots ("DM"). */
  initials: string;
};

export const MOCK_STAFF: StaffProfile[] = [
  { user_id: 'mock-staff-dm', display_name: 'Dana Mercer', title: null, initials: 'DM' },
  { user_id: 'mock-staff-cg', display_name: 'Charlie Gaines', title: null, initials: 'CG' },
  { user_id: 'mock-staff-md', display_name: 'Miles Donovan', title: null, initials: 'MD' },
  { user_id: 'mock-staff-kd', display_name: 'Keith Dawson', title: null, initials: 'KD' },
  { user_id: 'mock-staff-tf', display_name: 'Toby Faraday', title: null, initials: 'TF' },
  { user_id: 'mock-staff-ck', display_name: 'Camila Keane', title: null, initials: 'CK' },
  { user_id: 'mock-staff-ds', display_name: 'Dorian Sutton', title: null, initials: 'DS' },
];

/** The signed-in person in mock mode (the same Dana Mercer the shell shows). */
export const MOCK_ME = 'mock-staff-dm';

const BY_ID = new Map(MOCK_STAFF.map((s) => [s.user_id, s]));
const BY_INITIALS = new Map(MOCK_STAFF.map((s) => [s.initials, s]));

/** A staff profile by user id, if the fixture knows it. */
export function staffById(id: string): StaffProfile | undefined {
  return BY_ID.get(id);
}

/** A staff profile by initials ("DM"), if the fixture knows it. */
export function staffByInitials(initials: string): StaffProfile | undefined {
  return BY_INITIALS.get(initials);
}

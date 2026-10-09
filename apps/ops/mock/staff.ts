// MOCK: the board members and reviewers who appear on the Scholarships pages, shaped like the draft Ops Hub table
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
  { user_id: 'mock-staff-dm', display_name: 'Dania Morris', title: null, initials: 'DM' },
  { user_id: 'mock-staff-cg', display_name: 'Chariah Ghee', title: null, initials: 'CG' },
  { user_id: 'mock-staff-md', display_name: 'Marcus Davis', title: null, initials: 'MD' },
  { user_id: 'mock-staff-kd', display_name: 'Kelsey Davis', title: null, initials: 'KD' },
  { user_id: 'mock-staff-tf', display_name: 'Tomi Falodun', title: null, initials: 'TF' },
  { user_id: 'mock-staff-ck', display_name: 'Cillisha Knights', title: null, initials: 'CK' },
  { user_id: 'mock-staff-ds', display_name: 'Darien Strachan', title: null, initials: 'DS' },
];

/** The signed-in person in mock mode (the same Dania Morris the shell shows). */
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

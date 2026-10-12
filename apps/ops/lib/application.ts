// One submitted application, for the full-application page. Live mode, read as the signed-in person (blind review, D2):
// board members and reviewers get the blind view `application_reviews` (code, initials, year, credits, major, interests,
// the three short answers) and the files; an admin also gets the name, contact details, demographics and the rest from
// `applications`. In mock mode it is a made-up applicant so the page can be seen without a database.
import { hasSupabaseEnv } from '@btx/data';
import { MOCK_APPLICANTS } from '@/mock/applicants';
import type { StaffRole } from './role';
import { blindByCode, db } from './sch-live';
import { dayLabel } from './format';

export type ApplicationDetail = {
  code: string;
  initials: string;
  submitted: string;
  /** The cycle's term ("Fall 2026"). */
  term: string;
  /** Identity fields: admins only (reviews are blind); empty for everyone else. */
  identity: { label: string; value: string }[];
  /** The answers, in the order the Portal asks them. */
  answers: { label: string; value: string }[];
  /** The three short answers, in the order of SHORT_ANSWER_QUESTIONS; an empty string means not answered. */
  shortAnswers: [string, string, string];
  files: { kind: 'resume' | 'transcript'; label: string; filename: string | null }[];
  mock: boolean;
};

const yesNo = (v: boolean | null | undefined) => (v ? 'Yes' : 'No');
const text = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 'Not answered' : String(v));

// Loads the application with this code, or null if there is none (or this account may not read it).
export async function loadApplication(code: string, role: StaffRole): Promise<ApplicationDetail | null> {
  if (!hasSupabaseEnv()) {
    const m = MOCK_APPLICANTS.find((a) => a.code === code);
    if (!m) return null;
    return {
      code,
      initials: m.initials,
      submitted: dayLabel(m.appliedAt),
      term: 'Fall 2026',
      identity: [
        { label: 'Name', value: 'Sample Applicant' },
        { label: 'Terpmail', value: 'sample@terpmail.umd.edu' },
        { label: 'Other email', value: 'Not answered' },
        { label: 'Phone', value: '(301) 555-0100' },
        { label: 'Gender', value: 'Not answered' },
        { label: 'Race', value: 'Not answered' },
      ],
      answers: [
        { label: 'Year in school', value: 'Junior' },
        { label: 'Major', value: 'Mechanical engineering' },
        { label: 'Credits left', value: '54' },
        { label: 'Heard about the scholarship from', value: 'A professor' },
        { label: 'Interested in certification', value: 'Yes' },
        { label: 'Interested in mentoring', value: 'No' },
        { label: 'Stay in touch', value: 'Yes' },
        { label: 'Confirmed the answers are true', value: 'Yes' },
      ],
      shortAnswers: [
        'I joined the UMD Engineers Without Borders chapter my sophomore year. Our team was stuck on a water filter design for a school abroad, so I offered to build a test rig in the machine shop. We ran three rounds of flow tests and cut the cost per unit by about a third. I now help train new members on the rig, and two of them are leading the next round.',
        'Thermodynamics was the first class where rereading my notes stopped working. I got a 58 on the first exam. I started drawing the system before touching an equation, joined a study group that met twice a week, and worked old exams under a timer. I got an 81 on the second exam and finished with a B+.',
        'I want to work on making older public buildings accessible without huge renovation costs. Over the summer I helped the campus facilities team survey door widths and ramp slopes in fourteen buildings. This semester I am taking a materials course and a CAD elective so I can design and test standard parts for these fixes.',
      ],
      files: [
        { kind: 'resume', label: 'Resume', filename: 'resume.pdf' },
        { kind: 'transcript', label: 'Transcript', filename: 'transcript.pdf' },
      ],
      mock: true,
    };
  }
  const client = await db();
  // Blind review (D2): every staff role reads the blind view; only an admin reads the applications table itself.
  const blind = await blindByCode(client, code);
  if (!blind) return null;
  const { data: cyc } = await client.from('cycles').select('term').eq('id', blind.cycle_id).maybeSingle();
  // application_files_select_staff: staff read the file rows of submitted applications (is_submitted_application()).
  const { data: files } = await client.from('application_files').select('kind, filename').eq('application_id', blind.id);
  const fileOf = (k: 'resume' | 'transcript') => (files as { kind: string; filename: string }[] | null)?.find((f) => f.kind === k)?.filename ?? null;
  const shared = {
    code,
    initials: blind.initials ?? '—',
    submitted: dayLabel(blind.submitted_at),
    term: (cyc as { term: string } | null)?.term ?? '',
    shortAnswers: [blind.answer_1 ?? '', blind.answer_2 ?? '', blind.answer_3 ?? ''] as [string, string, string],
    files: [
      { kind: 'resume' as const, label: 'Resume', filename: fileOf('resume') },
      { kind: 'transcript' as const, label: 'Transcript', filename: fileOf('transcript') },
    ],
    mock: false,
  };
  if (role !== 'admin') {
    return {
      ...shared,
      identity: [],
      answers: [
        { label: 'Year in school', value: text(blind.year_in_school) },
        { label: 'Major', value: text(blind.major) },
        { label: 'Credits left', value: text(blind.credits_left) },
        { label: 'Interested in certification', value: yesNo(blind.interest_certification) },
        { label: 'Interested in mentoring', value: yesNo(blind.interest_mentoring) },
      ],
    };
  }
  // Admins only (applications_select_admin).
  const { data: a, error } = await client
    .from('applications')
    .select('full_name, terpmail, secondary_email, phone, gender, race, heard_from, year_in_school, major, credits_left, interest_certification, interest_mentoring, stay_in_touch, agreed_true')
    .eq('id', blind.id)
    .maybeSingle();
  if (error || !a) return null;
  return {
    ...shared,
    identity: [
      { label: 'Name', value: text(a.full_name) },
      { label: 'Terpmail', value: text(a.terpmail) },
      { label: 'Other email', value: text(a.secondary_email) },
      { label: 'Phone', value: text(a.phone) },
      { label: 'Gender', value: text(a.gender) },
      { label: 'Race', value: text(a.race) },
    ],
    answers: [
      { label: 'Year in school', value: text(a.year_in_school) },
      { label: 'Major', value: text(a.major) },
      { label: 'Credits left', value: text(a.credits_left) },
      { label: 'Heard about the scholarship from', value: text(a.heard_from) },
      { label: 'Interested in certification', value: yesNo(a.interest_certification) },
      { label: 'Interested in mentoring', value: yesNo(a.interest_mentoring) },
      { label: 'Stay in touch', value: yesNo(a.stay_in_touch) },
      { label: 'Confirmed the answers are true', value: yesNo(a.agreed_true) },
    ],
  };
}

// One submitted application with every answer, for the full-application page. REAL in live mode (the `applications` and
// `application_files` tables, read as the signed-in person: staff may read submitted applications and their files). In
// mock mode it is a made-up applicant so the page can be seen without a database.
import { hasSupabaseEnv } from '@btx/data';
import { MOCK_APPLICANTS } from '@/mock/applicants';
import { sessionClient } from './supabase-server';
import { dayLabel, dottedInitials } from './format';

export type ApplicationDetail = {
  code: string;
  initials: string;
  submitted: string;
  /** Identity fields: shown to admins only (reviews are blind). */
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
export async function loadApplication(code: string): Promise<ApplicationDetail | null> {
  if (!hasSupabaseEnv()) {
    const m = MOCK_APPLICANTS.find((a) => a.code === code);
    if (!m) return null;
    return {
      code,
      initials: m.initials,
      submitted: dayLabel(m.appliedAt),
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
  const client = await sessionClient();
  // RLS (applications_select_staff): only submitted applications are visible to staff, and only to staff.
  const { data: a } = await client.from('applications').select('*').eq('applicant_code', code).eq('status', 'submitted').maybeSingle();
  if (!a) return null;
  const { data: files } = await client.from('application_files').select('kind, filename').eq('application_id', a.id);
  const fileOf = (k: 'resume' | 'transcript') => files?.find((f) => f.kind === k)?.filename ?? null;
  return {
    code,
    initials: dottedInitials(a.full_name),
    submitted: dayLabel(a.submitted_at),
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
    shortAnswers: [a.answer_1 ?? '', a.answer_2 ?? '', a.answer_3 ?? ''],
    files: [
      { kind: 'resume', label: 'Resume', filename: fileOf('resume') },
      { kind: 'transcript', label: 'Transcript', filename: fileOf('transcript') },
    ],
    mock: false,
  };
}

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
  essay: string;
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
      essay: 'Sample essay text. In live mode this is the applicant’s own essay, exactly as submitted.',
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
    essay: a.essay ?? '',
    files: [
      { kind: 'resume', label: 'Resume', filename: fileOf('resume') },
      { kind: 'transcript', label: 'Transcript', filename: fileOf('transcript') },
    ],
    mock: false,
  };
}

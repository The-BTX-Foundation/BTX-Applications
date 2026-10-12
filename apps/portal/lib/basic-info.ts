// Step 1 (Basic info): the answer lists and the validation rules.
// The wording of the phone message is the signed-off draft's; the other messages follow its pattern.
export const GENDERS = ['Female', 'Male', 'Prefer not to say'] as const;
export const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;
// Placeholder lists until BTX supplies the real ones (BUILD-PLAN.md, "Still owed").
export const RACES = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native Hawaiian or Pacific Islander',
  'White',
  'Two or more races',
  'Prefer not to say',
] as const;
export const HEARD_FROM = [
  'A friend or mentor shared it with me',
  'Instagram or LinkedIn',
  'A professor or advisor',
  'A BTX email or newsletter',
  'Someone nominated me',
  'Another way',
] as const;
export const MAJORS = [
  'Aerospace Engineering',
  'Bioengineering',
  'Chemical and Biomolecular Engineering',
  'Civil Engineering',
  'Computer Engineering',
  'Electrical Engineering',
  'Environmental Engineering',
  'Fire Protection Engineering',
  'Materials Science and Engineering',
  'Mechanical Engineering',
] as const;

import type { Application } from '@btx/data';

export type BasicInfo = {
  fullName: string;
  secondaryEmail: string;
  phone: string;
  gender: string;
  race: string;
  hear: string;
  year: string;
  credits: string;
  major: string;
};

export type FieldKey = keyof BasicInfo;

export const EMPTY: BasicInfo = {
  fullName: '',
  secondaryEmail: '',
  phone: '',
  gender: '',
  race: '',
  hear: '',
  year: '',
  credits: '',
  major: '',
};

// The labels, in page order, used in the error summary.
export const LABELS: Record<FieldKey, string> = {
  fullName: 'Full name',
  secondaryEmail: 'Secondary email',
  phone: 'Phone number',
  gender: 'Gender',
  race: 'Race',
  hear: 'How you heard about this scholarship',
  year: 'Year in school',
  credits: 'Credits left',
  major: 'Major',
};

export const ORDER: FieldKey[] = ['fullName', 'secondaryEmail', 'phone', 'gender', 'race', 'hear', 'year', 'credits', 'major'];

// Formats exactly ten digits as (301) 555-0148; anything else is returned unchanged.
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

// Returns the error message for one field, or null when the answer is fine.
export function fieldError(key: FieldKey, v: BasicInfo): string | null {
  switch (key) {
    case 'fullName':
      return v.fullName.trim().length < 2 ? 'Enter your full name.' : null;
    case 'secondaryEmail':
      // optional: only checked when something is typed
      return v.secondaryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.secondaryEmail.trim())
        ? 'Enter an email like you@example.com.'
        : null;
    case 'phone':
      return v.phone.replace(/\D/g, '').length === 10 ? null : 'Enter all 10 digits, like (301) 555-0148.';
    case 'credits':
      return /^\d{1,3}$/.test(v.credits.trim()) ? null : 'Enter a whole number, like 48.';
    case 'major':
      return v.major ? null : 'Choose your major.';
    default:
      return v[key] ? null : 'Choose one.';
  }
}

// The columns Basic info saves.
export type BasicPatch = {
  full_name: string | null;
  secondary_email: string | null;
  phone: string | null;
  gender: string | null;
  race: string | null;
  heard_from: string | null;
  major: string | null;
  year_in_school?: string | null;
  credits_left?: number | null;
};

// Turns the form's answers into the application's columns. Blank answers save as null; a credits value that is not a
// whole number from 0 to 300 is left out (it stays unsaved until it is valid).
export function toPatch(v: BasicInfo): BasicPatch {
  const text = (x: string) => (x.trim() ? x.trim() : null);
  const patch: BasicPatch = {
    full_name: text(v.fullName),
    secondary_email: text(v.secondaryEmail),
    phone: text(v.phone),
    gender: text(v.gender),
    race: text(v.race),
    heard_from: text(v.hear),
    major: text(v.major),
  };
  if (v.year === '' || (YEARS as readonly string[]).includes(v.year)) patch.year_in_school = v.year || null;
  const credits = v.credits.trim();
  if (credits === '') patch.credits_left = null;
  else if (/^\d{1,3}$/.test(credits) && Number(credits) <= 300) patch.credits_left = Number(credits);
  return patch;
}

// The saved application's answers as form values.
export function fromApplication(a: Application): BasicInfo {
  return {
    fullName: a.full_name ?? '',
    secondaryEmail: a.secondary_email ?? '',
    phone: a.phone ?? '',
    gender: a.gender ?? '',
    race: a.race ?? '',
    hear: a.heard_from ?? '',
    year: a.year_in_school ?? '',
    credits: a.credits_left === null ? '' : String(a.credits_left),
    major: a.major ?? '',
  };
}

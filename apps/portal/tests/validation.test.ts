import { describe, expect, it } from 'vitest';
import { EMPTY, fieldError, formatPhone, toPatch, type BasicInfo } from '@/lib/basic-info';

const good: BasicInfo = {
  fullName: 'Ebony Coleman',
  secondaryEmail: '',
  phone: '(301) 555-0148',
  gender: 'Female',
  race: 'Asian',
  hear: 'Instagram or LinkedIn',
  year: 'Junior',
  credits: '48',
  major: 'Mechanical Engineering',
};

describe('Basic info validation', () => {
  it('accepts a complete set of answers', () => {
    for (const k of Object.keys(good) as (keyof BasicInfo)[]) expect(fieldError(k, good)).toBeNull();
  });
  it('asks for all ten digits of the phone number, with the signed-off message', () => {
    expect(fieldError('phone', { ...good, phone: '(301) 555-014' })).toBe('Enter all 10 digits, like (301) 555-0148.');
    expect(fieldError('phone', { ...good, phone: '3015550148' })).toBeNull();
    expect(fieldError('phone', EMPTY)).not.toBeNull();
  });
  it('formats exactly ten digits and leaves anything else alone', () => {
    expect(formatPhone('3015550148')).toBe('(301) 555-0148');
    expect(formatPhone('301555014')).toBe('301555014');
  });
  it('treats the secondary email as optional but checks its shape when typed', () => {
    expect(fieldError('secondaryEmail', { ...good, secondaryEmail: '' })).toBeNull();
    expect(fieldError('secondaryEmail', { ...good, secondaryEmail: 'nope' })).not.toBeNull();
    expect(fieldError('secondaryEmail', { ...good, secondaryEmail: 'a@b.co' })).toBeNull();
  });
  it('wants a whole number of credits from 0 to 999', () => {
    expect(fieldError('credits', { ...good, credits: '' })).not.toBeNull();
    expect(fieldError('credits', { ...good, credits: '4.5' })).not.toBeNull();
    expect(fieldError('credits', { ...good, credits: '120' })).toBeNull();
  });
  it('requires every choice', () => {
    for (const k of ['gender', 'race', 'hear', 'year', 'major'] as const) expect(fieldError(k, { ...good, [k]: '' })).not.toBeNull();
  });
  it('maps answers to columns: blanks are null, bad credits are left out', () => {
    expect(toPatch({ ...good, secondaryEmail: '  ' }).secondary_email).toBeNull();
    expect(toPatch({ ...good, credits: '48' }).credits_left).toBe(48);
    expect('credits_left' in toPatch({ ...good, credits: 'abc' })).toBe(false);
    expect('credits_left' in toPatch({ ...good, credits: '999' })).toBe(false);
    expect(toPatch({ ...good, year: 'Sophomore' }).year_in_school).toBe('Sophomore');
  });
});

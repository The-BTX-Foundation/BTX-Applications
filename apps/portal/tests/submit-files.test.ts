import { describe, expect, it } from 'vitest';
import { submitApplication } from '../../../packages/data/src/submit';
import { checkPdf } from '../../../packages/data/src/files';
import type { BtxClient } from '../../../packages/data/src/client';

// A stand-in client whose submit_application call returns the given result.
const clientReturning = (result: { data?: string; error?: { message: string; code?: string } }) =>
  ({ rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) as unknown as BtxClient;

describe('submit error mapping', () => {
  it('returns the application number on success', async () => {
    expect(await submitApplication(clientReturning({ data: 'APP-2026-00016' }), 'x')).toEqual({ ok: true, code: 'APP-2026-00016' });
  });
  it('lists the missing answer columns', async () => {
    const r = await submitApplication(clientReturning({ error: { message: 'missing_answers:full_name,phone', code: 'P0001' } }), 'x');
    expect(r).toEqual({ ok: false, kind: 'missing_answers', columns: ['full_name', 'phone'] });
  });
  it.each(['cycle_closed', 'missing_files', 'not_agreed', 'not_found'])('maps %s', async (kind) => {
    expect(await submitApplication(clientReturning({ error: { message: kind, code: 'P0001' } }), 'x')).toEqual({ ok: false, kind });
  });
  it('calls an error without a database code a network failure, and an unknown one unknown', async () => {
    expect(await submitApplication(clientReturning({ error: { message: 'TypeError: Failed to fetch' } }), 'x')).toEqual({ ok: false, kind: 'network' });
    expect(await submitApplication(clientReturning({ error: { message: 'weird', code: '12345' } }), 'x')).toEqual({ ok: false, kind: 'unknown' });
  });
});

describe('PDF checks', () => {
  it('accepts a PDF under 10 MB', () => {
    expect(checkPdf({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
  });
  it('rejects other types, big files and empty files with a message', () => {
    expect(checkPdf({ name: 'a.docx', type: 'application/msword', size: 1000 })).toMatch(/PDF/);
    expect(checkPdf({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(checkPdf({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
  });
});

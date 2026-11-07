import { describe, expect, it, vi } from 'vitest';
import { getAccessToken, keepTokenFresh, TEAMS_CLIENT_ID, TEAMS_SCOPE, TEAMS_TOKEN_URL, TOKEN_MESSAGES, type TokenStore } from '@/lib/teams/token';

// An in-memory token store that counts writes.
function memoryStore(initial: string | null, opts: { readFails?: boolean; writeFails?: boolean; updatedAt?: string | null } = {}) {
  const state = { token: initial, updatedAt: opts.updatedAt === undefined ? '2026-11-01T00:00:00Z' : opts.updatedAt, writes: [] as string[] };
  const store: TokenStore = {
    read: async () => {
      if (opts.readFails) throw new Error('db down');
      return state.token ? { token: state.token, updatedAt: state.updatedAt } : null;
    },
    write: async (t) => {
      if (opts.writeFails) throw new Error('db down');
      state.writes.push(t);
      state.token = t;
      state.updatedAt = '2026-12-01T00:00:00Z';
    },
  };
  return { state, store };
}

// A fake Microsoft token endpoint: `answers` maps a refresh token to its reply (anything else is refused).
function tokenEndpoint(answers: Record<string, { access: string; refresh?: string } | 'down'>) {
  const seen: string[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(TEAMS_TOKEN_URL);
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('client_id')).toBe(TEAMS_CLIENT_ID);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('scope')).toBe(TEAMS_SCOPE);
    expect(form.get('client_secret')).toBeNull(); // public client
    const rt = form.get('refresh_token') ?? '';
    seen.push(rt);
    const a = answers[rt];
    if (a === 'down') return new Response('busy', { status: 503 });
    if (!a) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify({ access_token: a.access, refresh_token: a.refresh, token_type: 'Bearer' }), { status: 200 });
  });
  return { f: f as unknown as typeof fetch, seen };
}

describe('Teams token store', () => {
  it('uses the saved token and writes the rotated one back', async () => {
    const { state, store } = memoryStore('rt-saved');
    const { f } = tokenEndpoint({ 'rt-saved': { access: 'at-1', refresh: 'rt-new' } });
    expect(await getAccessToken({ store, envToken: 'rt-env', fetch: f })).toEqual({ ok: true, accessToken: 'at-1' });
    expect(state.writes).toEqual(['rt-new']);
    expect(state.token).toBe('rt-new');
  });

  it('seeds from the env var when the table is empty, then saves the new token', async () => {
    const { state, store } = memoryStore(null);
    const { f, seen } = tokenEndpoint({ 'rt-env': { access: 'at-2', refresh: 'rt-rotated' } });
    expect(await getAccessToken({ store, envToken: 'rt-env', fetch: f })).toEqual({ ok: true, accessToken: 'at-2' });
    expect(seen).toEqual(['rt-env']);
    expect(state.writes).toEqual(['rt-rotated']);
  });

  it('falls back to the env seed when the saved token is refused (re-connecting Teams)', async () => {
    const { state, store } = memoryStore('rt-stale');
    const { f, seen } = tokenEndpoint({ 'rt-fresh': { access: 'at-3', refresh: 'rt-fresh-2' } });
    expect(await getAccessToken({ store, envToken: 'rt-fresh', fetch: f })).toEqual({ ok: true, accessToken: 'at-3' });
    expect(seen).toEqual(['rt-stale', 'rt-fresh']);
    expect(state.token).toBe('rt-fresh-2');
  });

  it('saves the env seed itself when Microsoft does not rotate it', async () => {
    const { state, store } = memoryStore(null);
    const { f } = tokenEndpoint({ 'rt-env': { access: 'at-4' } });
    expect(await getAccessToken({ store, envToken: 'rt-env', fetch: f })).toMatchObject({ ok: true });
    expect(state.writes).toEqual(['rt-env']);
  });

  it('does not write when nothing changed', async () => {
    const { state, store } = memoryStore('rt-same');
    const { f } = tokenEndpoint({ 'rt-same': { access: 'at-5', refresh: 'rt-same' } });
    expect(await getAccessToken({ store, fetch: f })).toMatchObject({ ok: true });
    expect(state.writes).toEqual([]);
  });

  it('is "not connected" with no saved token and no env var, without calling Microsoft', async () => {
    const { store } = memoryStore(null);
    const { f } = tokenEndpoint({});
    expect(await getAccessToken({ store, envToken: '  ', fetch: f })).toEqual({ ok: false, reason: 'not-connected' });
    expect(f).not.toHaveBeenCalled();
    expect(TOKEN_MESSAGES['not-connected']).toBe("Teams isn't connected yet.");
  });

  it('is "not connected" with no service key (no store)', async () => {
    const { f } = tokenEndpoint({ 'rt-env': { access: 'at' } });
    expect(await getAccessToken({ store: null, envToken: 'rt-env', fetch: f })).toEqual({ ok: false, reason: 'not-connected' });
    expect(f).not.toHaveBeenCalled();
  });

  it('says refused when every token is turned down, and failed when Microsoft or the database is down', async () => {
    expect(await getAccessToken({ store: memoryStore('rt-a').store, envToken: 'rt-b', fetch: tokenEndpoint({}).f })).toEqual({ ok: false, reason: 'refused' });
    expect(await getAccessToken({ store: memoryStore('rt-a').store, fetch: tokenEndpoint({ 'rt-a': 'down' }).f })).toEqual({ ok: false, reason: 'failed' });
    expect(await getAccessToken({ store: memoryStore('rt-a', { readFails: true }).store, fetch: tokenEndpoint({}).f })).toEqual({ ok: false, reason: 'failed' });
  });

  it('still returns the access token when saving the rotated token fails, and logs it with no detail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = memoryStore('rt-a', { writeFails: true });
    expect(await getAccessToken({ store, fetch: tokenEndpoint({ 'rt-a': { access: 'at-6', refresh: 'rt-b' } }).f })).toEqual({ ok: true, accessToken: 'at-6' });
    expect(log).toHaveBeenCalledWith('[teams] token save failed');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/rt-|at-6/);
    log.mockRestore();
  });

  it('never puts a token in its answer or its messages', async () => {
    const r = await getAccessToken({ store: memoryStore('rt-secret').store, fetch: tokenEndpoint({}).f });
    expect(JSON.stringify(r)).not.toContain('rt-secret');
    for (const m of Object.values(TOKEN_MESSAGES)) expect(m).not.toMatch(/rt-|token/i);
  });
});

describe('keepTokenFresh (the daily cron, monthly in effect)', () => {
  const NOW = new Date('2026-12-01T12:00:00Z');
  it('does nothing while the saved token is younger than 25 days', async () => {
    const { store } = memoryStore('rt-a', { updatedAt: '2026-11-10T00:00:00Z' });
    const { f } = tokenEndpoint({ 'rt-a': { access: 'at', refresh: 'rt-b' } });
    expect(await keepTokenFresh({ store, fetch: f, now: NOW })).toBe('fresh');
    expect(f).not.toHaveBeenCalled();
  });
  it('refreshes an older token once and saves the rotated one', async () => {
    const { state, store } = memoryStore('rt-a', { updatedAt: '2026-11-01T00:00:00Z' });
    const { f } = tokenEndpoint({ 'rt-a': { access: 'at', refresh: 'rt-b' } });
    expect(await keepTokenFresh({ store, fetch: f, now: NOW })).toBe('refreshed');
    expect(state.writes).toEqual(['rt-b']);
  });
  it('treats an unknown date as old', async () => {
    const { store } = memoryStore('rt-a', { updatedAt: null });
    expect(await keepTokenFresh({ store, fetch: tokenEndpoint({ 'rt-a': { access: 'at', refresh: 'rt-b' } }).f, now: NOW })).toBe('refreshed');
  });
  it('skips when nothing is saved or there is no service key, without calling Microsoft', async () => {
    const { f } = tokenEndpoint({ 'rt-env': { access: 'at' } });
    expect(await keepTokenFresh({ store: memoryStore(null).store, envToken: 'rt-env', fetch: f, now: NOW })).toBe('skipped');
    expect(await keepTokenFresh({ store: null, envToken: 'rt-env', fetch: f, now: NOW })).toBe('skipped');
    expect(f).not.toHaveBeenCalled();
  });
  it('fails quietly with a no-detail log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await keepTokenFresh({ store: memoryStore('rt-a', { updatedAt: '2026-01-01T00:00:00Z' }).store, fetch: tokenEndpoint({}).f, now: NOW })).toBe('failed');
    expect(await keepTokenFresh({ store: memoryStore('rt-a', { readFails: true }).store, fetch: tokenEndpoint({}).f, now: NOW })).toBe('failed');
    expect(log.mock.calls).toEqual([['[teams] token refresh failed'], ['[teams] token refresh failed']]);
    log.mockRestore();
  });
});

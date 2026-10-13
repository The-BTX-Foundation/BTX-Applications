import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFreeTimes } from '../src/index';

const base = { windowStart: '2026-11-10', windowEnd: '2026-11-15', today: '2026-11-09', audience: 'board' as const };

describe('the local stand-in reader (BTX_AI_FAKE=1)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads weeknights after 6 without a key', async () => {
    vi.stubEnv('BTX_AI_FAKE', '1');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const r = await readFreeTimes({ ...base, text: 'weeknights after 6' });
    expect(r).toEqual({ ok: true, unread: [], ranges: [
      { day: '2026-11-10', start: '18:00', end: '21:00' },
      { day: '2026-11-11', start: '18:00', end: '21:00' },
      { day: '2026-11-12', start: '18:00', end: '21:00' },
      { day: '2026-11-13', start: '18:00', end: '21:00' },
    ] });
  });

  it('says it could not read anything else', async () => {
    vi.stubEnv('BTX_AI_FAKE', '1');
    expect(await readFreeTimes({ ...base, text: 'asdf' })).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('is off in a production build', async () => {
    vi.stubEnv('BTX_AI_FAKE', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await readFreeTimes({ ...base, text: 'weeknights after 6' })).toEqual({ ok: false, reason: 'not-configured' });
  });
});

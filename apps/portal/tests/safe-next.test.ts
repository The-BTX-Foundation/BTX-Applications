import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('allows same-site /apply and /status paths', () => {
    expect(safeNext('/apply/short-answers')).toBe('/apply/short-answers');
    expect(safeNext('/apply')).toBe('/apply');
    expect(safeNext('/status')).toBe('/status');
    expect(safeNext('/apply/basic-info#phone')).toBe('/apply/basic-info#phone');
  });
  it('refuses everything else', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/applyx', '/admin', '/apply\\evil', 'apply/short-answers', '', null, undefined]) {
      expect(safeNext(bad as string | null | undefined)).toBeUndefined();
    }
  });
});

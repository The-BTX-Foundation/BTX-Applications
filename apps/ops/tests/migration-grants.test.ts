import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The BTX database's default privileges give a new table no read or write rights for any role, the server's included
// (pg_default_acl, checked 2026-10-22). A table created without explicit grants therefore fails at runtime with
// "permission denied", and no unit test notices because tests never touch the real database. This happened to the push
// tables. From that migration on, every new table must be granted to service_role in some migration.
const DIR = path.resolve(__dirname, '../../../supabase/migrations');
const FROM = '20261022200000';

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f.slice(0, 14) >= FROM).sort();
const sql = files.map((f) => readFileSync(path.join(DIR, f), 'utf8')).join('\n').toLowerCase().replace(/--[^\n]*/g, '');

describe('new tables are granted to the server role', () => {
  it('finds the migrations it checks', () => {
    expect(files).toContain('20261022200000_ops_push.sql');
  });

  const tables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  it.each(tables)('%s has a grant to service_role', (table) => {
    const granted = new RegExp(`grant[^;]*\\bon\\s+(?:table\\s+)?(?:public\\.)?${table}\\b[^;]*\\bto\\b[^;]*\\bservice_role\\b`).test(sql);
    expect(granted).toBe(true);
  });

  const sequences = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^;]*?)\);/g)].flatMap((m) =>
    [...m[2].matchAll(/\n\s*([a-z_][a-z0-9_]*)\s+(?:big)?serial\b/g)].map((c) => `${m[1]}_${c[1]}_seq`),
  );
  it.each(sequences)('sequence %s is usable by service_role', (seq) => {
    expect(new RegExp(`grant[^;]*\\bon\\s+sequence\\s+(?:public\\.)?${seq}\\b[^;]*\\bto\\b[^;]*\\bservice_role\\b`).test(sql)).toBe(true);
  });
});

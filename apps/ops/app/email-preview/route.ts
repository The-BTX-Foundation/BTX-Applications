// A browser preview of the staff invite email with sample data. Mock mode only (never in a real deployment).
// `?role=` picks admin (default) or board. Nothing here sends anything.
import { NextResponse } from 'next/server';
import { getAuthMode } from '@btx/data';
import { staffInviteHtml } from '@btx/emails';
import { roleLabel, isStaffRole } from '@/lib/role';

export async function GET(request: Request) {
  if (getAuthMode() !== 'mock') return new NextResponse('Not found', { status: 404 });
  const url = new URL(request.url);
  const asked = url.searchParams.get('role');
  const role = isStaffRole(asked) ? asked : 'admin';
  const html = staffInviteHtml({ name: 'Kelsey', to: 'kelsey@example.org', role: roleLabel(role), opsUrl: url.origin });
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

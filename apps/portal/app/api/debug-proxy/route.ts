// TEMPORARY preview-only probe (removed before merge): which request headers reach a route after proxy.ts.
// Lists header NAMES only (cookies and authorization left out) and whether the CSP request headers arrived.
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// Reports which request headers arrived.
export async function GET(request: NextRequest) {
  const names = [...request.headers.keys()].filter((n) => !/cookie|authorization/i.test(n)).sort();
  return NextResponse.json({
    names,
    csp: Boolean(request.headers.get('content-security-policy')),
    cspReportOnly: Boolean(request.headers.get('content-security-policy-report-only')),
    probe: request.headers.get('x-btx-probe'),
  });
}

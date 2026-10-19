// Content-Security-Policy violation reports (the Report-Only trial, lib/csp.ts, owner notes CSP.md). Browsers POST here
// whenever a page loads something the policy would refuse. Each violation is logged as one short line in the Vercel
// runtime logs, "[csp-report] {...}", with only the cleaned fields from readViolations(): the directive, the blocked
// origin or keyword, the Portal route, the causing script and its line. Report bodies can hold page addresses with
// query strings, signed storage links and page text, so nothing else is kept.
//
// Public by design: browsers send reports without a session. The route reads at most 16 KB, logs at most 20 violations
// per request, never echoes anything back, and always answers 204.
import { NextResponse, type NextRequest } from 'next/server';
import { portalOrigins, readViolations } from '@/lib/csp';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024;
const REPORT_TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

// An empty "received" answer, the same for every outcome, so the route reveals nothing.
const received = () => new NextResponse(null, { status: 204 });

// Reads the body as text, stopping (and returning null) once it passes the size cap, whatever Content-Length says. A
// body cut off mid-way (the sender hung up) also returns null.
async function readCapped(request: NextRequest): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// Logs the cleaned violations in a report and answers 204.
export async function POST(request: NextRequest) {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!REPORT_TYPES.includes(type)) return received();
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return received();
  const text = await readCapped(request);
  if (!text) return received();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return received();
  }
  // the e2e run serves the Portal under its production name on a local port; count that address as the Portal's too
  const origins = portalOrigins(request.nextUrl.origin, process.env);
  if (process.env.BTX_E2E_PROD_HOST === '1') origins.push(`http://apply.thebtxfoundation.org:${request.nextUrl.port}`);
  for (const v of readViolations(body, origins)) console.warn(`[csp-report] ${JSON.stringify(v)}`);
  return received();
}

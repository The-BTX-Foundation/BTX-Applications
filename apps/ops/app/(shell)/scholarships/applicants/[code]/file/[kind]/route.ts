// Opens one of an application's two PDFs. It looks the file up (as the signed-in person, so only staff get a row), asks
// storage for a signed link that works for 60 seconds, and redirects to it. The bucket is private; the link is the only
// way in, and it is made fresh on every click and never stored.
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '@/lib/supabase-server';

type Ctx = { params: Promise<{ code: string; kind: string }> };

// Redirects to a 60-second signed URL (or to the sample PDF in mock mode).
export async function GET(request: NextRequest, { params }: Ctx) {
  const { code, kind } = await params;
  if (kind !== 'resume' && kind !== 'transcript') return new NextResponse('Not found', { status: 404 });
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL('/mock/sample.pdf', request.nextUrl.origin));

  const client = await sessionClient();
  // RLS: application_files_select_staff lets staff read the rows of submitted applications.
  const { data: app } = await client.from('applications').select('id').eq('applicant_code', decodeURIComponent(code)).eq('status', 'submitted').maybeSingle();
  if (!app) return new NextResponse('Not found', { status: 404 });
  const { data: file } = await client.from('application_files').select('storage_path').eq('application_id', app.id).eq('kind', kind).maybeSingle();
  if (!file) return new NextResponse('Not found', { status: 404 });
  // The storage policy applicant_documents_select_staff allows this read for staff only.
  const { data: signed, error } = await client.storage.from('applicant-documents').createSignedUrl(file.storage_path, 60);
  if (error || !signed) return new NextResponse('The file could not be opened.', { status: 502 });
  return NextResponse.redirect(signed.signedUrl);
}

// The resume and transcript PDFs: upload to the private storage bucket `applicant-documents` and record each in
// application_files. Storage rules (see the fresh-start migration) let an applicant write only under
// `{her user id}/{her application id}/` and only while the application is a draft.
import type { BtxClient } from './client';
import type { Row } from './database.types';

export type DocKind = 'resume' | 'transcript';
export type AppFile = Row<'application_files'>;

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const BUCKET = 'applicant-documents';

// The two files saved so far on an application.
export async function listFiles(client: BtxClient, applicationId: string): Promise<AppFile[]> {
  const { data } = await client.from('application_files').select('*').eq('application_id', applicationId);
  return data ?? [];
}

// Checks a chosen file before uploading. Returns the message to show, or null when the file is fine.
export function checkPdf(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return "That file isn't a PDF. Choose a PDF.";
  if (file.size > MAX_PDF_BYTES) return 'That file is over 10 MB. Choose a smaller PDF.';
  if (file.size === 0) return 'That file is empty. Choose a different PDF.';
  return null;
}

export type UploadHandle = {
  /** Resolves when the file is stored and recorded; rejects with a message otherwise. */
  done: Promise<AppFile>;
  /** Stops the upload (the Cancel link). */
  cancel: () => void;
};

// Uploads one PDF to `{userId}/{applicationId}/{kind}.pdf` (replacing any earlier one) with progress, then records
// it in application_files. The upload goes straight to Storage with XMLHttpRequest because that reports progress.
export function uploadDocument(
  client: BtxClient,
  args: { userId: string; applicationId: string; kind: DocKind; file: File; onProgress: (sent: number, total: number) => void },
): UploadHandle {
  const { userId, applicationId, kind, file, onProgress } = args;
  const path = `${userId}/${applicationId}/${kind}.pdf`;
  const xhr = new XMLHttpRequest();
  const done = (async () => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('signed-out');
    await new Promise<void>((resolve, reject) => {
      xhr.open('POST', `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage-${xhr.status}`)));
      xhr.onerror = () => reject(new Error('network'));
      xhr.onabort = () => reject(new Error('cancelled'));
      xhr.send(file);
    });
    return recordFile(client, { applicationId, kind, path, file });
  })();
  return { done, cancel: () => xhr.abort() };
}

// Adds or replaces the application_files row for this kind. (An upsert would try to rewrite application_id and kind,
// which an applicant has no right to update, so this reads first and then inserts or updates.)
async function recordFile(
  client: BtxClient,
  a: { applicationId: string; kind: DocKind; path: string; file: File },
): Promise<AppFile> {
  const existing = await client
    .from('application_files')
    .select('id')
    .eq('application_id', a.applicationId)
    .eq('kind', a.kind)
    .maybeSingle();
  const values = { storage_path: a.path, filename: a.file.name.slice(0, 255), size_bytes: a.file.size };
  const res = existing.data
    ? await client
        .from('application_files')
        .update({ ...values, uploaded_at: new Date().toISOString() })
        .eq('id', existing.data.id)
        .select('*')
        .single()
    : await client
        .from('application_files')
        .insert({ application_id: a.applicationId, kind: a.kind, ...values })
        .select('*')
        .single();
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// A short-lived link to view an uploaded file (works while the application is a draft).
export async function viewUrl(client: BtxClient, path: string): Promise<string | null> {
  const { data } = await client.storage.from(BUCKET).createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

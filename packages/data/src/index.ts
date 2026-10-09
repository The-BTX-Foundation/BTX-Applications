// Public surface of @btx/data (browser-safe). Server helpers live in "@btx/data/server" and the proxy helper in
// "@btx/data/proxy", so browser bundles never pull in server code.
export { getBrowserClient, hasSupabaseEnv, type BtxClient } from './client';
export { getAuthMode, getSignedInEmail, requestSignInCode, signOut, verifySignInCode } from './auth';
export type { AuthMode, SendResult, VerifyResult } from './auth';
export { cycleVariant, ensureApplication, isTerpmailRefusal, fetchPublishedCycle, getPublishedCycle, requestCycleEmail, saveApplication } from './cycles';
export type { Application, Cycle, CycleVariant, EnsureResult, NotifyKind } from './cycles';
export type { Database, Json, Row, Insert, Update } from './database.types';
export { checkPdf, listFiles, MAX_PDF_BYTES, uploadDocument, viewUrl } from './files';
export type { AppFile, DocKind, UploadHandle } from './files';
export { submitApplication } from './submit';
export type { SubmitResult } from './submit';
export { bookSlot } from './booking';
export type { BookResult } from './booking';

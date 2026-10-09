// Public surface of @btx/data (browser-safe). Server helpers live in "@btx/data/server" and the proxy helper in
// "@btx/data/proxy", so browser bundles never pull in server code.
export { getBrowserClient, hasSupabaseEnv, type BtxClient } from './client';
export { getAuthMode, getSignedInEmail, requestSignInCode, signOut, verifySignInCode } from './auth';
export type { AuthMode, SendResult, VerifyResult } from './auth';
export { cycleVariant, ensureApplication, getPublishedCycle, requestCycleEmail, saveApplication } from './cycles';
export type { Application, Cycle, CycleVariant, EnsureResult, NotifyKind } from './cycles';
export type { Database, Json, Row, Insert, Update } from './database.types';

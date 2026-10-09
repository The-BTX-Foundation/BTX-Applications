// Public surface of @btx/data.
export { getBrowserClient, hasSupabaseEnv } from './client';
export { getAuthMode, requestSignInCode, verifySignInCode } from './auth';
export type { AuthMode, SendResult, VerifyResult } from './auth';
export type { Database } from './database.types';

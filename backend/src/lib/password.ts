import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env';

const BCRYPT_COST = env.isTest ? 4 : 12;

/**
 * bcrypt truncates inputs at 72 bytes. Passwords are therefore pre-hashed with
 * SHA-256 (hex, 64 bytes) together with a server-side pepper before bcrypt.
 * This allows long passphrases without silent truncation and adds a secret the
 * database alone does not contain.
 */
function prehash(password: string): string {
  return crypto.createHash('sha256').update(env.PASSWORD_PEPPER).update('\u0000').update(password, 'utf8').digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(prehash(password), BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(prehash(password), hash);
  } catch {
    return false;
  }
}

/** Constant-work comparison so a missing account is not detectable by timing. */
const DUMMY_HASH = bcrypt.hashSync(prehash('dummy-password-for-timing-equalisation'), BCRYPT_COST);
export async function verifyDummyPassword(password: string): Promise<void> {
  await bcrypt.compare(prehash(password), DUMMY_HASH);
}

export type PasswordIssue = string;

/** Policy: 12-128 chars, at least 3 of 4 character classes, no whitespace-only. */
export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (typeof password !== 'string' || password.length < 12) issues.push('Must be at least 12 characters long');
  if (password.length > 128) issues.push('Must be at most 128 characters long');
  if (/\s/.test(password) && password.trim().length === 0) issues.push('Must not be only whitespace');
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) issues.push('Must contain at least three of: lowercase, uppercase, number, symbol');
  const common = ['password', 'letmein', 'qwerty', 'admin', 'welcome', 'labflow'];
  if (common.some((c) => password.toLowerCase().includes(c))) issues.push('Must not contain a common password word');
  return issues;
}

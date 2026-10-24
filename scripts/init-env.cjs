#!/usr/bin/env node
/**
 * Creates backend/.env from .env.example when it does not exist and fills the
 * required random secrets. Existing .env files are never overwritten.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const example = path.join(root, '.env.example');
const target = path.join(root, 'backend', '.env');

if (fs.existsSync(target)) {
  console.log('[init-env] backend/.env already exists - leaving it untouched');
  process.exit(0);
}

const random = (n) => crypto.randomBytes(n).toString('hex');
let contents = fs.readFileSync(example, 'utf8');
contents = contents.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${random(48)}`);
contents = contents.replace(/^PASSWORD_PEPPER=.*$/m, `PASSWORD_PEPPER=${random(32)}`);
contents = contents.replace(/^DEMO_ADMIN_PASSWORD=.*$/m, 'DEMO_ADMIN_PASSWORD=');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 });
console.log('[init-env] wrote backend/.env with generated secrets (mode 600)');

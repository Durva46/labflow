# LabFlow

LabFlow is a new, full-stack laboratory automation system for a manufacturing/laboratory unit. It implements the confirmed first two workflow stages (Monthly Excel Upload + Media Preparation, and the Autoclave Log Book with weekly cleaning) and leaves stages 3–7 as explicit "Coming Soon" placeholders with no invented business logic.

## Quick start (local development)

> The repository root used here is `C:\Users\Durva\lab-automation` (the original `C:\Users\OpenCode Projects` was read-only on this machine).

### Prerequisites
- Node.js >= 20
- npm 11 (use `npm.cmd` on Windows PowerShell if `npm.ps1` is blocked by execution policy)

### 1) Install dependencies
```bash
# from repo root
npm run setup
```
`npm run setup` copies `.env.example` to `backend/.env` (with generated secrets) and installs both workspaces.

### 2) Set up the database (SQLite for local dev)
```bash
npm run db:dev
```
This generates `backend/prisma/schema.dev.prisma` from the PostgreSQL source schema (Prisma cannot share one datasource provider across SQLite/Postgres) and runs `prisma db push` against a local SQLite database.

### 3) (Optional) Seed demo users for local evaluation
Demo seeding is **disabled** by default and is **refused** if `NODE_ENV=production`.

Edit `backend/.env`:
```env
NODE_ENV=development
ALLOW_DEMO_SEED=true
DEMO_ADMIN_EMAIL=admin@labflow.local
DEMO_ADMIN_PASSWORD=YourStrongTempPass!1234
```
Then run:
```bash
npm run db:seed
```
Demo accounts are created with `mustChangePassword=true`.

### 4) Run the app
```bash
npm run dev
```
- Backend: http://localhost:4000  (health: GET /health)
- Frontend: http://localhost:5173 (proxies `/api` to the backend)

## Project structure
```
lab-automation/
├── backend/        # Express + TypeScript + Prisma
├── frontend/       # React + TypeScript + Vite + Tailwind
├── docs/           # API contract, requirement gaps, security notes
├── scripts/        # init-env, use-sqlite helpers
└── README.md
```

## Environment variables
See `.env.example` and `backend/.env` after setup. 
- **Production:** `SESSION_SECRET` and `PASSWORD_PEPPER` must be set (>=32/>=16 chars), `DATABASE_URL` must be PostgreSQL, `CORS_ORIGINS` must be explicit `https://` origins with no wildcards, `ALLOW_DEMO_SEED` must be `false`, `TRUST_PROXY` must be enabled if behind a reverse proxy. The server **fails fast** if these are violated.
- **Auth:** HttpOnly cookie sessions (`lf_session`) + double-submit CSRF (`lf_csrf` / `X-CSRF-Token`).
- **No secrets** in the repository. Never commit `.env` files or real laboratory data.

## Database
- Source of truth: `backend/prisma/schema.prisma` (PostgreSQL).
- Local dev: generated `backend/prisma/schema.dev.prisma` (SQLite) — do **not** commit it.
- Migrations: `npm --prefix backend run db:migrate:dev` for dev, `npm --prefix backend run db:migrate` for production deploys.
- SQLite is used for local development parity testing only; production must use PostgreSQL.

## Testing
```bash
npm test
```
Backend tests use Vitest + Supertest against a reset SQLite DB. Frontend tests use Vitest + jsdom + Testing Library.

## Build
```bash
npm run build
```

## Security highlights
- Bcrypt passwords with SHA-256 prehash + server pepper; generic login errors; account lockout + per-IP rate limiting; HttpOnly+Secure+SameSite cookies; double-submit CSRF; origin checks on mutating requests; strict CORS; helmet; request size limits; safe error responses with no stack traces in production.
- File uploads: memory only, `.xlsx` and `.csv` only, extension/MIME/signature checks, size limits, row caps, formula-injection protection on exports.
- Audit log is append-only (no delete/update API for any role); actions are recorded with metadata sanitised.
- SQL is only executed via Prisma parameterised APIs (`$queryRawUnsafe`/`$executeRawUnsafe` are forbidden by tests).

## Known limitations / unconfirmed rules
See [docs/REQUIREMENTS-GAPS.md](docs/REQUIREMENTS-GAPS.md). Key points:
- **Media Preparation:** no recipe/ingredient/stock calculation rules were provided — only user-entered records are stored.
- **Water/non-water:** requires explicit mapping column or admin-defined rules; rows that cannot be classified are rejected.
- **Autoclave grouping:** `PER_DAY` only (one draft per registration day). Procedure not specified.
- **Cleaning schedule:** defaults reproduce the September example (6-day then 7-day) because of a spec inconsistency; this is configurable.
- **Inventory/refills:** not implemented (no rules provided).
- **`.xls`:** not supported.
- **Self-service password reset:** not implemented (admin reset only).

## Documentation
- [docs/API.md](docs/API.md) — API contract
- [docs/REQUIREMENTS-GAPS.md](docs/REQUIREMENTS-GAPS.md) — contradictions and decisions
- [docs/SECURITY.md](docs/SECURITY.md) — configuration, backups, deployment notes
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production checklist

## Definition of done notes
This build implements the controls above and the first two stages functionally. It does **not** claim formal security certification or a completed penetration test.

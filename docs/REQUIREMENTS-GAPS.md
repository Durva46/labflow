# Requirement gaps and the decisions taken

This file is part of the deliverable. The specification contains unresolved
points and at least one internal contradiction. Rather than inventing laboratory
procedure, LabFlow isolates every unconfirmed rule behind configuration and
records the decision here. **Anything marked `[UNCONFIRMED]` must be signed off
by the laboratory before the records it produces are treated as authoritative.**

## 1. Stack contradiction - SQLAlchemy vs Prisma

The security section asks for "SQLAlchemy parameterized queries and ORM
methods". The mandated stack is Node.js/Express/TypeScript with Prisma.
SQLAlchemy is Python-only and cannot coexist with that stack.

**Decision:** the intent ("use the ORM, never concatenate SQL") is implemented
with Prisma. Raw SQL is limited to `$queryRaw` / `$executeRaw` tagged templates
(parameterised). `$queryRawUnsafe` and `$executeRawUnsafe` are not used anywhere
in the codebase; a test asserts this.

## 2. Media Preparation business rules - NOT SPECIFIED

No recipe, ingredient, quantity, stock-consumption or calculation rule has been
provided.

**Decision:** the module stores *confirmed, user-entered* preparation records
linked to samples: preparation date, media type, batch/lot reference, quantity,
unit, notes. **No formula, recipe or automatic stock deduction is implemented.**
`MediaPreparation.status` is limited to `DRAFT` and `RECORDED` because no
verification workflow for this stage has been defined. `[UNCONFIRMED]`

## 3. Water / non-water classification - NOT SPECIFIED

No classification rule was supplied.

**Decision:** classification comes from either
(a) an explicitly mapped spreadsheet column, or
(b) configurable rules (case-insensitive substring or `/regex/` against the
sample name) stored in settings and editable by an administrator.

If a row cannot be classified it is **rejected with a row-level error** and is
not imported. The application never guesses. `[UNCONFIRMED]`

## 4. Autoclave cycle-load grouping - NOT SPECIFIED

The specification says not every sample needs its own cycle and that grouping
"must follow the actual laboratory procedure", but the procedure is not given.

**Decision:** the only implemented grouping rule is `PER_DAY` - one draft cycle
per reporting date present in the imported samples, named
`Daily load - <date>`. Additional rules can be added behind `groupingRule`.
Grouping never fabricates a date or a sample. `[UNCONFIRMED]`

## 5. Weekly cleaning schedule - INTERNALLY INCONSISTENT

The example dates are 1, 7, 14, 21 and 28 September: a **6-day** gap between the
first two dates and **7-day** gaps afterwards. A plain "every 7 days from the
1st" generator produces 1, 8, 15, 22 and 29 September, which contradicts the
required output.

**Decision:** the schedule is stored as `{ anchorDate, firstIntervalDays,
intervalDays }` with defaults `(1 September of the reporting year, 6, 7)`, which
reproduces the example exactly. It is editable so the laboratory can confirm the
intended rule. Generation is idempotent: completed cleaning rows are never
deleted or overwritten when a month is regenerated. `[UNCONFIRMED]`

## 6. Lab Staff permissions - NOT SPECIFIED

"Access only the features and actions assigned to them" does not define the
assignment matrix.

**Decision (provisional, see `backend/src/lib/permissions.ts`):**

| Capability | Admin | Lab Manager | Lab Staff |
|---|---|---|---|
| View dashboard / samples / media / autoclave / reports | yes | yes | yes |
| Upload / replace monthly Excel import | yes | no | no |
| Create & edit media preparation records | yes | yes | no |
| Edit autoclave drafts and actual readings | yes | yes | yes |
| Verify autoclave records | yes | yes | no |
| Complete scheduled cleaning | yes | yes | yes |
| Manage users, settings, document metadata | yes | no | no |
| Read audit log | yes | yes | no |
| Delete audit records | **nobody** | no | no |

`[UNCONFIRMED]` - change the matrix in one file, it is enforced server-side.

## 7. Inventory / refills - NOT SPECIFIED

RBAC mentions inventory and refills but no stage defines them, and no fields or
adjustment rules are given. **Decision:** not implemented. No `InventoryItem`
table was invented, therefore the "prevent negative stock" requirement has no
target in this build. Tracked as a blocker for Stage 3+.

## 8. Original spreadsheet retention - CONTRADICTION

"Never permanently store original Excel files" conflicts with downloadable
validation reports and import history.

**Decision:** the original workbook is **never written to disk** (multer memory
storage) and is discarded once parsed. Import history is preserved as database
metadata plus the *rejected row* records needed to regenerate the validation
report. The SHA-256 of the file is stored for duplicate detection. Retention:
import metadata and audit records are retained for 7 years by default; a purge
procedure is documented in `docs/SECURITY.md`.

## 9. Audit log immutability

Admins can manage users, but must not be able to erase their own trail.

**Decision:** no API route updates or deletes `AuditLog` rows, for any role.
The production grant script gives the application role SELECT/INSERT on that
table only (`docs/DEPLOYMENT.md`). The limitation - a database superuser can
still alter rows - is documented rather than claimed as cryptographic
immutability.

## 10. `.xls` support

`.xls` is not supported. Uploads are restricted to `.xlsx` and `.csv`, with
extension, MIME type and ZIP/CSV signature checks. Requesting `.xls` returns a
clear `UNSUPPORTED_FILE_TYPE` error.

## 11. Password reset

Not enabled. Email delivery is out of scope. Administrators can reset a user's
password (the user must change it at next login; the action is audited).
Self-service reset is intentionally absent rather than implemented insecurely.

## 12. Escape hatches that were deliberately NOT built

- No seeded production credentials. Demo users only exist when
  `ALLOW_DEMO_SEED=true` **and** `NODE_ENV !== 'production'`.
- No default admin/admin login.
- No permissive CORS fallback: if `CORS_ORIGINS` is empty in production the
  server refuses to start.
- No auto-verification of sterilization based on default values; generated rows
  are `DRAFT`.
- No "mark all cleaning complete".
- No user-supplied filenames, paths or storage locations.

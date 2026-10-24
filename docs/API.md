# LabFlow API contract (v1)

Base path: `/api/v1`. All responses are JSON unless a file download.

## Conventions

Success (single object): `{ "data": { ... } }`
Success (list): `{ "data": [ ... ], "meta": { "page": 1, "pageSize": 25, "total": 42, "totalPages": 2 } }`
Error: `{ "error": { "code": "STRING_CODE", "message": "Safe human message", "details"?: [...] } }`

Status codes: 200 OK, 201 Created, 204 No Content, 400 BAD_REQUEST,
401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT,
413 PAYLOAD_TOO_LARGE, 422 VALIDATION_ERROR, 429 RATE_LIMITED, 500 INTERNAL.

Downloads send `Content-Disposition: attachment; filename="..."` and are **not**
wrapped in `{ data }`.

## Auth cookies / CSRF

- `lf_session` — HttpOnly, SameSite=Lax, Secure in production. Session token.
  15 minutes idle timeout is not used; TTL comes from `SESSION_TTL_MINUTES`.
- `lf_csrf` — readable, SameSite=Lax, Secure in production. Double-submit token.
- Every state-changing request (POST/PATCH/PUT/DELETE) MUST send
  `X-CSRF-Token: <value of lf_csrf>`. The browser must send cookies
  (`withCredentials: true`).
- `GET /auth/csrf` returns the token and (re)issues the cookie. The SPA calls it
  once at boot and after login.
- Mutating requests are also rejected when `Origin` is present and not in
  `CORS_ORIGINS`.

## Roles

`ADMIN`, `LAB_MANAGER`, `LAB_STAFF`. Enforced server-side per endpoint.

## Endpoints

### Auth
| Method | Path | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/auth/csrf` | public | – | `{ data: { csrfToken } }` sets `lf_csrf` |
| POST | `/auth/login` | public | `{ email, password }` | sets session; `{ data: { user } }` |
| POST | `/auth/logout` | auth | – | destroys session, clears cookies |
| GET | `/auth/me` | auth | – | `{ data: { user, permissions } }` |
| POST | `/auth/change-password` | auth | `{ currentPassword, newPassword }` | invalidates other sessions |

User shape: `{ id, name, email, role, isActive, mustChangePassword, createdAt }`

Login failures always return `401 { error: { code: "INVALID_CREDENTIALS" } }`.
Locked account: `401 INVALID_CREDENTIALS` after the lockout expires;
during lockout also `401 INVALID_CREDENTIALS` (no enumeration). Rate limit: `429 RATE_LIMITED`.

### Users (ADMIN only, except `/users/me` read via `/auth/me`)
| Method | Path | Body |
|---|---|---|
| GET | `/users?search=&page=&pageSize=` | – |
| POST | `/users` | `{ name, email, password, role }` |
| PATCH | `/users/:id` | `{ name?, role?, isActive? }` |
| POST | `/users/:id/reset-password` | `{ newPassword }` (sets mustChangePassword, revokes sessions) |

Users cannot deactivate or demote their own account (`409 SELF_ACTION_FORBIDDEN`).

### Monthly imports
| Method | Path | Access | Body / query |
|---|---|---|---|
| POST | `/imports/monthly` | ADMIN | multipart: `file`, `reportingMonth`, `reportingYear`, `replace` (bool), `columnMapping` (JSON string) |
| GET | `/imports?page=&pageSize=` | ADMIN, LAB_MANAGER | – |
| GET | `/imports/:id` | ADMIN, LAB_MANAGER | – |
| GET | `/imports/:id/errors?format=json\|csv` | ADMIN, LAB_MANAGER | – |
| POST | `/imports/:id/rollback` | ADMIN | `{ confirm: true }` (only if no dependent media/autoclave rows) |

Import shape: `{ id, filename, fileHash, reportingMonth, reportingYear, status,
totalRows, acceptedRows, rejectedRows, duplicateRows, uploadedBy: { id, name },
createdAt, completedAt }`

Upload response adds `preview`: `{ headers: string[], detectedMapping,
categories: { water, nonWater, unknown }, dailyCounts: [{ date, total }] }`
and `errors: [{ rowNumber, message }]` (first 50).

Errors: `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_FILE_SIGNATURE`,
`DUPLICATE_IMPORT` (409, includes `existingImportId`), `MISSING_COLUMNS` (422,
details list headers found), `EMPTY_WORKBOOK`, `TOO_MANY_ROWS`, `REPLACE_BLOCKED`,
`INVALID_MONTH`.

### Samples
| Method | Path | Access | Query |
|---|---|---|---|
| GET | `/samples` | any authenticated | `month, year, category, search, page, pageSize` |
| GET | `/samples/daily-summary` | any authenticated | `month, year` |
| GET | `/samples/:id` | any authenticated | – |

Sample shape: `{ id, sampleIdentifier, sampleName, registrationDate, sampleCategory,
importId, createdAt, updatedAt }`
`sampleCategory` is `WATER`, `NON_WATER` or `UNKNOWN`.
Daily summary: `{ data: { days: [{ date, total, water, nonWater, unknown }], totals: { total, water, nonWater, unknown } } }`

### Media preparation
| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/media-preparation?month=&year=&status=&search=&page=&pageSize=` | any authenticated | – |
| POST | `/media-preparation` | ADMIN, LAB_MANAGER | `{ sampleId?, preparationDate, mediaType, batchNo?, quantity?, unit?, notes? }` |
| GET | `/media-preparation/:id` | any authenticated | – |
| PATCH | `/media-preparation/:id` | ADMIN, LAB_MANAGER | same fields, all optional; no sampleId change |

Shape: `{ id, sampleId, sampleName, sampleIdentifier, preparationDate, mediaType,
batchNo, quantity, unit, notes, status: "DRAFT"|"RECORDED", createdBy, updatedBy,
createdAt, updatedAt }`

No recipe/stock calculations are implemented (see REQUIREMENTS-GAPS.md).

### Autoclave log book
| Method | Path | Access | Body / query |
|---|---|---|---|
| GET | `/autoclave-logs?month=&year=&status=` | any authenticated | – |
| POST | `/autoclave-logs/generate` | ADMIN, LAB_MANAGER | `{ month, year }` |
| GET | `/autoclave-logs/:id` | any authenticated | – |
| PATCH | `/autoclave-logs/:id` | any authenticated* | editable fields |
| GET | `/autoclave-settings` | any authenticated | – |
| PATCH | `/autoclave-settings` | ADMIN | settings fields |
| GET | `/autoclave-cleaning?month=&year=` | any authenticated | – |
| POST | `/autoclave-cleaning/generate` | ADMIN, LAB_MANAGER | `{ month, year }` |
| POST | `/autoclave-cleaning/:id/complete` | any authenticated | `{ completedAt?, responsibleUserId?, remarks? }` |

\* Lab staff may edit draft/pending records; only ADMIN/LAB_MANAGER may set
`verificationStatus: "VERIFIED"`. Verified records are immutable except for an
ADMIN reopen (`verificationStatus: "DRAFT"`).

Log shape: `{ id, logDate, cycleLoadName, sampleId, autoclaveStartTime,
sterilizationStartTime, temperature, temperatureUnit, pressure, pressureUnit,
sterilizationDurationMinutes, endTime, endTimeOverridden, verificationStatus,
responsibleUser: { id, name } | null, responsibleUserId, remarks, createdAt, updatedAt }`
Times are `"HH:mm"` 24-hour strings. `endTime` = start + duration unless overridden.

Generate response: `{ data: { created: 12, skipped: 3, groupingRule: "PER_DAY" } }`

Settings shape: `{ id, labName, labAddress, documentFormatNo, documentSopReference,
equipmentNumber, autoclaveStartTime, sterilizationStartTime, temperature,
temperatureUnit, pressure, pressureUnit, durationMinutes, cleaningAnchorDate,
cleaningFirstIntervalDays, cleaningIntervalDays, groupingRule, updatedAt }`

Cleaning shape: `{ id, scheduledDate, completedAt, status: "PENDING"|"COMPLETED"|"OVERDUE",
responsibleUser, remarks }`

### Reports (binary downloads)
`GET /reports/autoclave/excel?month=&year=`
`GET /reports/autoclave/pdf?month=&year=`
`GET /reports/monthly/excel?month=&year=`
`GET /reports/monthly/pdf?month=&year=`

Filenames: `Autoclave_Log_September_2026.xlsx` / `.pdf`,
`Monthly_Lab_Report_September_2026.xlsx` / `.pdf`.
Missing/invalid month: `422 VALIDATION_ERROR`.

### Dashboard
`GET /dashboard?month=&year=` →
```json
{
  "data": {
    "reportingMonth": 9,
    "reportingYear": 2026,
    "importStatus": { "state": "COMPLETED", "import": { ... } } ,
    "samples": { "total": 0, "water": 0, "nonWater": 0, "unknown": 0 },
    "media": { "total": 0, "draft": 0, "recorded": 0 },
    "autoclave": { "total": 0, "draft": 0, "pendingVerification": 0, "verified": 0 },
    "cleaning": { "scheduled": 0, "completed": 0, "pending": 0, "overdue": 0,
                  "nextDue": "2026-09-28", "items": [ ... ] },
    "recentActivity": [{ "id", "action", "entityType", "entityId", "actorName", "createdAt" }]
  }
}
```

### Settings (document metadata + import mapping + classification)
| Method | Path | Access |
|---|---|---|
| GET | `/settings` | any authenticated |
| PATCH | `/settings` | ADMIN |

Settings shape: `{ labName, labAddress, documentFormatNo, documentSopReference,
equipmentNumber, columnMapping: { sampleIdentifier, sampleName, registrationDate,
sampleCategory }, classificationRules: [{ match: string, category: "WATER"|"NON_WATER" }],
retentionDays }`

### Audit log
`GET /audit?page=&pageSize=&entityType=` — ADMIN, LAB_MANAGER. Read-only, no
delete/update endpoint exists for any role.

### Health
`GET /health` (public) → `{ status: "ok", uptime, version }` — no secrets.

## Security behaviour used by tests

- Unauthenticated request to any protected route → `401 UNAUTHENTICATED`.
- Authenticated but wrong role → `403 FORBIDDEN`.
- Missing/invalid CSRF header on mutating route → `403 CSRF_FAILED`.
- Body over `MAX_UPLOAD_BYTES` → `413 PAYLOAD_TOO_LARGE`.
- Upload `.xls`, `.exe`, renamed file → `400 UNSUPPORTED_FILE_TYPE` /
  `400 INVALID_FILE_SIGNATURE`.
- Invalid login × N → `429 RATE_LIMITED`; account lockout is independent of IP.
- All server errors return a generic message with a `requestId`; stack traces
  only appear in development and never for 5xx in production.

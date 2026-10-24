export const ROLES = ['ADMIN', 'LAB_MANAGER', 'LAB_STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard:read',
  'samples:read',
  'imports:read',
  'imports:write',
  'media:read',
  'media:write',
  'autoclave:read',
  'autoclave:write',
  'autoclave:verify',
  'cleaning:write',
  'reports:read',
  'settings:read',
  'settings:write',
  'users:read',
  'users:write',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Server-side capability matrix. This is the single place permissions are
 * defined; the frontend only uses the derived list for navigation affordances.
 * See docs/REQUIREMENTS-GAPS.md section 6 - the Lab Staff column is provisional
 * until the laboratory confirms its assignment matrix.
 */
const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  LAB_MANAGER: [
    'dashboard:read',
    'samples:read',
    'imports:read',
    'media:read',
    'media:write',
    'autoclave:read',
    'autoclave:write',
    'autoclave:verify',
    'cleaning:write',
    'reports:read',
    'settings:read',
    'users:read',
    'audit:read',
  ],
  LAB_STAFF: [
    'dashboard:read',
    'samples:read',
    'media:read',
    'autoclave:read',
    'autoclave:write',
    'cleaning:write',
    'reports:read',
    'settings:read',
  ],
};

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Waafi Cargo RBAC — frontend mirror of backend config (v2.0)
 *
 * Two roles only:
 *   1 = Admin    — full system access
 *   2 = Employee — operational access
 */

export const ROLES = {
  ADMIN:    1,
  EMPLOYEE: 2
};

export const ROLE_NAMES = {
  1: 'Admin',
  2: 'Employee'
};

export const ROLE_PRIVILEGES = {
  'dashboard.view':   [1, 2],

  'shipments.view':   [1, 2],
  'shipments.create': [1, 2],
  'shipments.delete': [1],

  'customers.view':   [1, 2],
  'customers.manage': [1, 2],

  'tracking.view':    [1, 2],

  'payments.view':    [1, 2],
  'payments.create':  [1, 2],

  'invoices.view':    [1, 2],
  'invoices.create':  [1, 2],

  'trips.view':       [1, 2],
  'trips.manage':     [1, 2],

  // Shared read-only (employees need these for operational pages)
  'setup.read':       [1, 2],
  'branches.list':    [1, 2],

  // Admin-only
  'reports.view':     [1],
  'branches.view':    [1],
  'branches.manage':  [1],
  'users.manage':     [1],
  'hr.manage':        [1],
  'salary.view':      [1],
  'salary.manage':    [1],
  'employees.view':   [1],
  'settings.manage':  [1],
  'accounts.manage':  [1],
  'expenses.manage':  [1]
};

export const READ_ONLY_PRIVILEGES = {};

/** Route path patterns → privilege required to access the page */
export const ROUTE_PRIVILEGES = [
  { pattern: /^\/dashboard$/,          privilege: 'dashboard.view' },
  { pattern: /^\/employee\/dashboard/, privilege: 'dashboard.view' },
  { pattern: /^\/employee\/profile/,   privilege: 'dashboard.view' },

  { pattern: /^\/cargo\/track/,        privilege: 'tracking.view' },
  { pattern: /^\/cargo\/new$/,         privilege: 'shipments.create' },
  { pattern: /^\/cargo\/[^/]+$/,       privilege: 'shipments.view' },
  { pattern: /^\/cargo$/,              privilege: 'shipments.view' },

  { pattern: /^\/customers\/new$/,     privilege: 'customers.manage' },
  { pattern: /^\/customers/,           privilege: 'customers.view' },

  { pattern: /^\/payments/,            privilege: 'payments.view' },
  { pattern: /^\/invoices/,            privilege: 'invoices.view' },
  { pattern: /^\/trips/,               privilege: 'trips.view' },

  { pattern: /^\/notifications/,       privilege: 'dashboard.view' },

  // Admin-only pages
  { pattern: /^\/reports/,             privilege: 'reports.view' },
  { pattern: /^\/accounts/,            privilege: 'accounts.manage' },
  { pattern: /^\/expenses/,            privilege: 'expenses.manage' },
  { pattern: /^\/setup/,               privilege: 'branches.view' },
  { pattern: /^\/users/,               privilege: 'users.manage' },
  { pattern: /^\/employees/,           privilege: 'employees.view' },
  { pattern: /^\/salary/,              privilege: 'salary.view' },
  { pattern: /^\/schedule/,            privilege: 'hr.manage' },
  { pattern: /^\/attendance/,          privilege: 'hr.manage' },
  { pattern: /^\/transport/,           privilege: 'settings.manage' },
  { pattern: /^\/insurance/,           privilege: 'settings.manage' },
  { pattern: /^\/live-map/,            privilege: 'settings.manage' },
  { pattern: /^\/disputes/,            privilege: 'invoices.view' }
];

export function getRoleId(user) {
  if (!user) return null;
  const raw = user.role ?? user.role_id;
  const roleId = Number(raw);
  return Number.isInteger(roleId) && roleId > 0 ? roleId : null;
}

export function roleHasPrivilege(roleId, privilegeCode) {
  if (!roleId) return false;
  if (roleId === ROLES.ADMIN) return true;
  const allowed = ROLE_PRIVILEGES[privilegeCode];
  if (!allowed) return false;
  return allowed.includes(roleId);
}

export function isReadOnlyPrivilege() {
  return false;
}

export function getPrivilegeForPath(pathname) {
  const match = ROUTE_PRIVILEGES.find(({ pattern }) => pattern.test(pathname));
  return match?.privilege ?? null;
}

export function canAccessPath(roleId, pathname) {
  const privilege = getPrivilegeForPath(pathname);
  if (!privilege) return true;
  return roleHasPrivilege(roleId, privilege);
}

export function getDefaultRoute(roleId) {
  if (roleId === ROLES.ADMIN) return '/dashboard';
  return '/employee/dashboard';
}

export function isEmployeeRole(roleId) {
  return roleId === ROLES.EMPLOYEE;
}

/**
 * Waafi Cargo RBAC — role & privilege definitions (v2.0)
 *
 * Two roles only:
 *   1 = Admin    — full system access
 *   2 = Employee — operational access (cargo, customers, payments, trips, invoices)
 */

const ROLES = {
  ADMIN:    1,
  EMPLOYEE: 2
};

const ROLE_NAMES = {
  1: 'Admin',
  2: 'Employee'
};

/**
 * Privilege code → role IDs granted that privilege.
 * Admin (1) bypasses all checks in middleware — not listed per entry.
 */
const ROLE_PRIVILEGES = {
  'dashboard.view':    [1, 2],

  'shipments.view':    [1, 2],
  'shipments.create':  [1, 2],
  'shipments.delete':  [1],

  'customers.view':    [1, 2],
  'customers.manage':  [1, 2],

  'tracking.view':     [1, 2],

  'payments.view':     [1, 2],
  'payments.create':   [1, 2],

  'invoices.view':     [1, 2],
  'invoices.create':   [1, 2],

  'trips.view':        [1, 2],
  'trips.manage':      [1, 2],

  // Shared read-only (employees need these for operational pages)
  'setup.read':        [1, 2],
  'branches.list':     [1, 2],

  // Admin-only
  'reports.view':      [1],
  'branches.view':     [1],
  'branches.manage':   [1],
  'users.manage':      [1],
  'hr.manage':         [1],
  'salary.view':       [1],
  'salary.manage':     [1],
  'employees.view':    [1],
  'settings.manage':   [1],
  'accounts.manage':   [1],
  'expenses.manage':   [1],
  'analytics.view':    [1]
};

const READ_ONLY_PRIVILEGES = {};

function getRoleId(user) {
  if (!user) return null;
  const raw = user.role ?? user.role_id;
  const roleId = Number(raw);
  return Number.isInteger(roleId) && roleId > 0 ? roleId : null;
}

function roleHasPrivilege(roleId, privilegeCode) {
  if (roleId === ROLES.ADMIN) return true;
  const allowed = ROLE_PRIVILEGES[privilegeCode];
  if (!allowed) return false;
  return allowed.includes(roleId);
}

function isReadOnlyPrivilege() {
  return false;
}

function requirePrivilegeRoles(...privilegeCodes) {
  const roles = new Set([ROLES.ADMIN]);
  for (const code of privilegeCodes) {
    const allowed = ROLE_PRIVILEGES[code];
    if (allowed) allowed.forEach((r) => roles.add(r));
  }
  return [...roles];
}

module.exports = {
  ROLES,
  ROLE_NAMES,
  ROLE_PRIVILEGES,
  READ_ONLY_PRIVILEGES,
  getRoleId,
  roleHasPrivilege,
  isReadOnlyPrivilege,
  requirePrivilegeRoles
};

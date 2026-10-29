const {
  ROLE_PRIVILEGES,
  ROLES,
  getRoleId,
  roleHasPrivilege
} = require('../config/rbac');

/**
 * Express middleware factory — enforce a privilege code against req.user.role.
 *
 * Usage:
 *   router.get('/cargo', authenticate, checkPrivilege('shipments.view'), handler);
 *
 * - Admin (role 1) bypasses all checks.
 * - Reads role from req.user.role, falls back to req.user.role_id (JWT legacy).
 * - Returns 401 if unauthenticated, 403 if role lacks the privilege.
 */
const checkPrivilege = (permissionCode) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!permissionCode || !ROLE_PRIVILEGES[permissionCode]) {
      return res.status(500).json({
        success: false,
        message: `Unknown privilege code: ${permissionCode}`
      });
    }

    const roleId = getRoleId(req.user);

    if (roleId === ROLES.ADMIN) {
      return next();
    }

    if (roleHasPrivilege(roleId, permissionCode)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Permission denied',
      required: permissionCode
    });
  };
};

module.exports = checkPrivilege;

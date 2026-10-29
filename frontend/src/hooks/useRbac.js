import useAuthStore from '../store/authStore';
import {
  canAccessPath,
  getDefaultRoute,
  getPrivilegeForPath,
  isReadOnlyPrivilege,
  roleHasPrivilege
} from '../config/rbac';

export default function useRbac() {
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);

  return {
    roleId,
    can: (privilegeCode) => roleHasPrivilege(roleId, privilegeCode),
    canAccessPath: (pathname) => canAccessPath(roleId, pathname),
    isReadOnly: (privilegeCode) => isReadOnlyPrivilege(roleId, privilegeCode),
    isReadOnlyForPath: (pathname) => {
      const privilege = getPrivilegeForPath(pathname);
      return privilege ? isReadOnlyPrivilege(roleId, privilege) : false;
    },
    defaultRoute: getDefaultRoute(roleId)
  };
}

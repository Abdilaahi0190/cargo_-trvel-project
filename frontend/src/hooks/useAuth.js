import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logout as logoutApi } from '../api/auth.api';
import useAuthStore from '../store/authStore';
import { canAccessPath, ROLES } from '../config/rbac';
import ForbiddenPage from '../pages/errors/ForbiddenPage';
import { createElement } from 'react';

export default function useAuth() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const branchId = useAuthStore((state) => state.branchId);
  const branchName = useAuthStore((state) => state.branchName);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      clearAuth();
      queryClient.clear();
      navigate('/login');
    }
  };

  return {
    user,
    token,
    branchId,
    branchName,
    isAuthenticated,
    setAuth,
    clearAuth,
    logout
  };
}

export function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);

  if (!isAuthenticated && !token) {
    return createElement(Navigate, { to: '/login', replace: true });
  }

  return children ? children : createElement(Outlet, null);
}

/**
 * Layout guard — blocks direct URL access when the user's role lacks the
 * privilege mapped to the current path.
 */
export function RbacGuard() {
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);
  const location = useLocation();

  if (!canAccessPath(roleId, location.pathname)) {
    return createElement(ForbiddenPage);
  }

  return createElement(Outlet, null);
}

/** Page-level guard for explicit allowedRoles (optional extra check). */
export function RoleRoute({ children, allowedRoles }) {
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(roleId)) {
    return createElement(ForbiddenPage);
  }

  return children;
}

/** Allows only Admin (role 1). Non-admins are sent to /employee/dashboard. */
export function AdminOnlyRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);

  if (!isAuthenticated && !token) {
    return createElement(Navigate, { to: '/login', replace: true });
  }
  if (roleId !== null && roleId !== ROLES.ADMIN) {
    return createElement(Navigate, { to: '/employee/dashboard', replace: true });
  }
  return createElement(Outlet, null);
}

/** Allows only non-admin employees. Admin is sent to /dashboard. */
export function EmployeeOnlyRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);

  if (!isAuthenticated && !token) {
    return createElement(Navigate, { to: '/login', replace: true });
  }
  if (roleId === ROLES.ADMIN) {
    return createElement(Navigate, { to: '/dashboard', replace: true });
  }
  return createElement(Outlet, null);
}

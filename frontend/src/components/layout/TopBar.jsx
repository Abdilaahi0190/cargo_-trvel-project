import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, ChevronDown, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logout as logoutApi } from '../../api/auth.api';
import useAuthStore from '../../store/authStore';
import { ThemeContext } from '../../layouts/DashboardLayout';
import { getNotifications } from '../../api/dashboard.api';

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function getCollection(payload) {
  const source = payload?.data ?? payload;

  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return [];
  }

  return [
    source.data,
    source.items,
    source.results,
    source.rows,
    source.records,
    source.list,
    source.notifications
  ].find(Array.isArray) || [];
}

function getUnreadNotificationsCount(items) {
  return items.reduce((count, item) => {
    const unreadFlag = item?.is_read ?? item?.read ?? item?.isRead ?? item?.seen;

    if (typeof unreadFlag === 'boolean') {
      return unreadFlag ? count : count + 1;
    }

    const status = normalizeStatus(item?.status || item?.state);
    if (status === 'unread' || status === 'pending' || status === 'new') {
      return count + 1;
    }

    return count;
  }, 0);
}

export default function TopBar({ title, onToggleMobile, sidebarCollapsed }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const branchName = useAuthStore((state) => state.branchName);
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const navigate = useNavigate();
  const notificationsQuery = useQuery({
    queryKey: ['topbar-notifications'],
    queryFn: async () => (await getNotifications()).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    function handlePointerDown(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handlePointerDown);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [dropdownOpen]);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } finally {
      clearAuth();
      setDropdownOpen(false);
      navigate('/login');
    }
  };

  const { theme, toggleTheme } = useContext(ThemeContext);
  const notifications = useMemo(() => getCollection(notificationsQuery.data), [notificationsQuery.data]);
  const unreadCount = useMemo(() => getUnreadNotificationsCount(notifications), [notifications]);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'WC';

  const branchLabel = branchName || user?.activeBranchName || 'No branch selected';
  const userLabel = user?.name || 'Admin User';

  return (
    <div className="sticky top-0 z-20 w-full border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-xl transition-colors duration-300">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobile}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)] md:hidden"
            aria-label="Open sidebar"
          >
          <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--text)] sm:text-xl">{title}</h1>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)]"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          <div className="hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-right lg:block">
            <p className="max-w-[220px] truncate text-sm font-medium text-[var(--text)]">{branchLabel}</p>
            <p className="text-xs text-[var(--text-secondary)]">Active branch</p>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm shadow-sm transition hover:bg-[var(--surface-strong)] sm:px-3"
              aria-label="Open user menu"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                {initials}
              </span>
              <div className="hidden text-left sm:block">
                <p className="max-w-[160px] truncate text-sm font-semibold text-[var(--text)]">{userLabel}</p>
                <p className="max-w-[160px] truncate text-xs text-[var(--text-secondary)] lg:hidden">{branchLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>

            {dropdownOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-lg transition-colors duration-300">
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold">{userLabel}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{user?.role || 'Admin'}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{branchLabel}</p>
                </div>
                <div className="border-t border-[var(--border)]" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import EmployeeSidebar from '../components/layout/EmployeeSidebar';
import { getEmployeePageTitle } from '../components/layout/employeeNavigation';
import useAuthStore from '../store/authStore';
import { logout as logoutApi } from '../api/auth.api';
import { getNotifications } from '../api/dashboard.api';

export const EmployeeThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

function getCollection(payload) {
  const source = payload?.data ?? payload;
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== 'object') return [];
  return [source.data, source.items, source.notifications].find(Array.isArray) || [];
}

function getUnreadCount(items) {
  return items.reduce((count, item) => {
    const flag = item?.is_read ?? item?.read ?? item?.isRead ?? item?.seen;
    if (typeof flag === 'boolean') return flag ? count : count + 1;
    const s = String(item?.status || item?.state || '').trim().toLowerCase().replace(/\s+/g, '_');
    return (s === 'unread' || s === 'pending' || s === 'new') ? count + 1 : count;
  }, 0);
}

function EmployeeTopBar({ title, onToggleMobile, sidebarCollapsed }) {
  const { theme, toggleTheme } = useContext(EmployeeThemeContext);
  const user       = useAuthStore((s) => s.user);
  const branchName = useAuthStore((s) => s.branchName);
  const clearAuth  = useAuthStore((s) => s.clearAuth);
  const navigate   = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const notifQuery = useQuery({
    queryKey: ['emp-topbar-notifications'],
    queryFn: async () => (await getNotifications()).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const notifications = useMemo(() => getCollection(notifQuery.data), [notifQuery.data]);
  const unread        = useMemo(() => getUnreadCount(notifications), [notifications]);
  const branchLabel   = branchName || user?.activeBranchName || 'No branch';
  const initials      = user?.name
    ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : 'EP';

  const handleLogout = async () => {
    try { await logoutApi(); } finally {
      clearAuth();
      setDropdownOpen(false);
      navigate('/login');
    }
  };

  return (
    <div className="sticky top-0 z-20 w-full border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-xl transition-colors duration-300">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onToggleMobile} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)] md:hidden" aria-label="Open sidebar">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-semibold text-[var(--text)] sm:text-xl">{title}</h1>
              <span className={`hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] xl:inline-flex ${sidebarCollapsed ? '2xl:inline-flex' : ''}`}>
                Employee Portal
              </span>
            </div>
            <p className="hidden text-sm text-[var(--text-secondary)] lg:block">Your workspace — shipments, operations, and team tools.</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleTheme} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)]" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button type="button" onClick={() => navigate('/notifications')} className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-strong)]" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          <div className="hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-right lg:block">
            <p className="max-w-[200px] truncate text-sm font-medium text-[var(--text)]">{branchLabel}</p>
            <p className="text-xs text-[var(--text-secondary)]">Active branch</p>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button type="button" onClick={() => setDropdownOpen((p) => !p)} className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm shadow-sm transition hover:bg-[var(--surface-strong)] sm:px-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{initials}</span>
              <div className="hidden text-left sm:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-[var(--text)]">{user?.name ?? 'Employee'}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-lg">
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold">{user?.name ?? 'Employee'}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{branchLabel}</p>
                </div>
                <div className="border-t border-[var(--border)]" />
                <button type="button" onClick={() => { setDropdownOpen(false); navigate('/employee/profile'); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]">
                  My Profile
                </button>
                <div className="border-t border-[var(--border)]" />
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeePortalLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen]             = useState(false);
  const location = useLocation();

  useEffect(() => {
    const saved = localStorage.getItem('emp_sidebar_collapsed');
    setSidebarCollapsed(saved === 'true');
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('emp_sidebar_collapsed', String(next));
  };

  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const stored = localStorage.getItem('wc_theme');
    const init   = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(init);
    document.documentElement.classList.toggle('dark', init === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('wc_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const contentMarginClass = sidebarCollapsed ? 'md:ml-[76px]' : 'md:ml-[268px]';
  const title = getEmployeePageTitle(location.pathname);

  return (
    <EmployeeThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
        <EmployeeSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />

        <div className={`${contentMarginClass} flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300`}>
          <EmployeeTopBar
            title={title}
            onToggleMobile={() => setMobileOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
          />
          <main className="app-scrollbar flex-1 overflow-y-auto bg-[var(--bg)] px-4 py-5 transition-colors duration-300 sm:px-5 lg:px-6 xl:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </EmployeeThemeContext.Provider>
  );
}

export default EmployeePortalLayout;

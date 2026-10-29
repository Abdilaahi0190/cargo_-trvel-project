import { createContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { getPageTitle } from '../components/layout/navigation';

export const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {}
});

function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const saved = localStorage.getItem('wc_sidebar_collapsed');
    setSidebarCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('wc_sidebar_collapsed', String(next));
  };

  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const storedTheme = localStorage.getItem('wc_theme');
    const initialTheme =
      storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('wc_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const contentMarginClass = sidebarCollapsed ? 'md:ml-[76px]' : 'md:ml-[280px]';
  const title = getPageTitle(location.pathname);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />

      <div className={`${contentMarginClass} flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300`}>
        <TopBar
          title={title}
          onToggleMobile={() => setMobileOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main className="app-scrollbar flex-1 overflow-y-auto bg-[var(--bg)] px-4 py-5 transition-colors duration-300 sm:px-5 lg:px-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
    </ThemeContext.Provider>
  );
}

export default DashboardLayout;

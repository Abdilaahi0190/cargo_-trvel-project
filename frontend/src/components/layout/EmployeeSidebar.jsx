import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Search } from 'lucide-react';
import { employeeNavigationSections } from './employeeNavigation';
import { ROLE_INFO } from './navigation';
import useAuthStore from '../../store/authStore';
import { roleHasPrivilege } from '../../config/rbac';

const EXPANDED_W  = 268;
const COLLAPSED_W = 72;

export default function EmployeeSidebar({ collapsed, onToggleCollapse, mobileOpen, setMobileOpen, onNavigate }) {
  const user      = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const roleId    = user?.role_id ?? null;
  const navigate  = useNavigate();
  const location  = useLocation();
  const searchRef = useRef(null);

  const roleInfo = ROLE_INFO[roleId] ?? {
    title:    'Employee',
    short:    'Staff',
    gradient: 'from-slate-500 to-slate-600',
    dot:      'bg-slate-400',
    badge:    'bg-slate-500/20 text-slate-300 ring-slate-500/30'
  };

  const isVisible = (item) => {
    if (!item.privilege) return true;
    return roleHasPrivilege(roleId, item.privilege);
  };

  const sections = employeeNavigationSections
    .map((sec) => ({ ...sec, items: sec.items.filter(isVisible) }))
    .filter((sec) => sec.items.length > 0);

  const getActiveSectionLabel = (path) =>
    sections.find((s) =>
      s.items.some((item) => path === item.path || path.startsWith(item.path + '/'))
    )?.label ?? sections[0]?.label ?? null;

  const [openSection, setOpenSection] = useState(() => getActiveSectionLabel(location.pathname));
  const [search, setSearch]           = useState('');

  useEffect(() => {
    const active = getActiveSectionLabel(location.pathname);
    if (active) setOpenSection(active);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle    = (label) => setOpenSection((prev) => (prev === label ? null : label));
  const handleNav = () => { onNavigate?.(); setMobileOpen?.(false); };
  const handleLogout = () => { clearAuth(); navigate('/login'); };

  const initials = (user?.name ?? 'E')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const filteredSections = search.trim()
    ? sections
        .map((sec) => ({
          ...sec,
          items: sec.items.filter((item) =>
            item.label.toLowerCase().includes(search.toLowerCase())
          )
        }))
        .filter((sec) => sec.items.length > 0)
    : sections;

  const w = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ width: w }}
      >
        <aside
          className="flex h-full flex-col bg-[#0f1623] text-white"
          style={{ width: w, boxShadow: '4px 0 32px rgba(0,0,0,0.5)', transition: 'width 0.3s' }}
        >
          {/* ── Brand ──────────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-b border-white/[0.07]">
            <div className="flex h-[62px] items-center px-4">
              {collapsed ? (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Expand sidebar"
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${roleInfo.gradient} text-sm font-bold shadow-lg transition hover:opacity-90`}
                >
                  E
                </button>
              ) : (
                <div className="flex w-full items-center gap-3">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${roleInfo.gradient} text-sm font-bold shadow-lg`}>
                    E
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-none text-white">Employee Portal</p>
                    <p className="mt-1 text-[12px] leading-none text-slate-500">Waafi Cargo</p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.1] text-slate-500 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {!collapsed && (
              <div className="px-4 pb-3">
                <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ${roleInfo.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${roleInfo.dot} animate-pulse`} />
                  {roleInfo.title}
                </span>
              </div>
            )}
          </div>

          {/* ── Search ─────────────────────────────────────────────────────── */}
          {!collapsed && (
            <div className="flex-shrink-0 px-4 py-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition focus-within:border-white/20 focus-within:bg-white/[0.07]">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-600" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search menu..."
                  className="w-full bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ── Nav ────────────────────────────────────────────────────────── */}
          <nav className="app-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-3 py-1">
            {filteredSections.map((section, si) => {
              const SectionIcon = section.icon;
              const isOpen      = openSection === section.label || search.trim() !== '';
              const hasActive   = section.items.some(
                (item) =>
                  location.pathname === item.path ||
                  location.pathname.startsWith(item.path + '/')
              );

              return (
                <div key={section.label} className={si > 0 ? 'mt-1' : ''}>
                  {collapsed ? (
                    <>
                      {si > 0 && <div className="mx-auto my-2 h-px w-10 bg-white/[0.07]" />}
                      <ul className="space-y-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <li key={item.path}>
                              <NavLink
                                to={item.path}
                                end={item.path !== '/cargo'}
                                title={item.label}
                                onClick={handleNav}
                                className={({ isActive }) =>
                                  `group relative flex h-11 w-full items-center justify-center rounded-xl transition-all duration-150
                                  ${isActive
                                    ? `bg-gradient-to-br ${roleInfo.gradient} text-white shadow-md`
                                    : 'text-slate-500 hover:bg-white/[0.07] hover:text-slate-200'
                                  }`
                                }
                              >
                                {({ isActive }) => (
                                  <>
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-white' : ''}`} />
                                    <span
                                      className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-xl border border-white/[0.1] bg-[#1c2b45] px-3.5 py-2 text-[13px] font-medium text-white opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100"
                                      style={{ top: '50%', transform: 'translateY(-50%)' }}
                                    >
                                      {item.label}
                                      <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-[#1c2b45]" />
                                    </span>
                                  </>
                                )}
                              </NavLink>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <>
                      {section.flat ? (
                        <>
                          <div className="mx-1 mb-2 mt-3 h-px bg-white/[0.07]" />
                          <ul className="space-y-0.5">
                            {section.items.map((item) => {
                              const Icon = item.icon;
                              return (
                                <li key={item.path}>
                                  <NavLink
                                    to={item.path}
                                    end
                                    onClick={handleNav}
                                    className={({ isActive }) =>
                                      `group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150
                                      ${isActive
                                        ? `bg-gradient-to-r ${roleInfo.gradient} bg-opacity-15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]`
                                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                                      }`
                                    }
                                  >
                                    {({ isActive }) => (
                                      <>
                                        {isActive && (
                                          <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b ${roleInfo.gradient}`} />
                                        )}
                                        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all
                                          ${isActive
                                            ? `bg-gradient-to-br ${roleInfo.gradient} text-white shadow-sm`
                                            : 'bg-white/[0.05] text-slate-500 group-hover:bg-white/[0.09] group-hover:text-slate-300'
                                          }`}
                                        >
                                          <Icon className="h-[17px] w-[17px]" />
                                        </span>
                                        <span className="text-[14px] font-semibold">{item.label}</span>
                                      </>
                                    )}
                                  </NavLink>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggle(section.label)}
                            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150
                              ${hasActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'}
                              hover:bg-white/[0.05]`}
                          >
                            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all
                              ${hasActive
                                ? `bg-gradient-to-br ${roleInfo.gradient} text-white shadow-md`
                                : 'bg-white/[0.05] text-slate-500 group-hover:bg-white/[0.09] group-hover:text-slate-300'
                              }`}
                            >
                              <SectionIcon className="h-[17px] w-[17px]" />
                            </span>
                            <span className="flex-1 text-[14px] font-semibold">{section.label}</span>
                            <ChevronDown
                              className={`h-4 w-4 flex-shrink-0 text-slate-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            />
                          </button>

                          {isOpen && (
                            <ul className="mb-2 mt-0.5 space-y-0.5 pl-[44px] pr-1">
                              {section.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                  <li key={item.path}>
                                    <NavLink
                                      to={item.path}
                                      end={item.path !== '/cargo'}
                                      onClick={handleNav}
                                      className={({ isActive }) =>
                                        `group relative flex items-center gap-2.5 rounded-xl py-2.5 pl-2 pr-3 transition-all duration-150
                                        ${isActive
                                          ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]'
                                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                                        }`
                                      }
                                    >
                                      {({ isActive }) => (
                                        <>
                                          {isActive && (
                                            <span className={`absolute left-[-10px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b ${roleInfo.gradient}`} />
                                          )}
                                          <Icon className={`h-[15px] w-[15px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'}`} />
                                          <span className="text-[13.5px] font-medium leading-none">{item.label}</span>
                                        </>
                                      )}
                                    </NavLink>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          {/* ── User card ──────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-white/[0.07] p-3">
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${roleInfo.gradient} text-[12px] font-bold text-white`}>
                  {initials}
                </div>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Expand"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.1] text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
                <div className="relative flex-shrink-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${roleInfo.gradient} text-[13px] font-bold text-white`}>
                    {initials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0f1623] bg-emerald-400" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold leading-none text-white">
                    {user?.name ?? 'Employee'}
                  </p>
                  <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold leading-none
                    ${roleInfo.badge.split(' ').filter((c) => c.startsWith('text-')).join(' ')}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${roleInfo.dot}`} />
                    {roleInfo.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.07] hover:text-red-400"
                >
                  <LogOut className="h-[16px] w-[16px]" />
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen?.(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          aria-label="Close sidebar"
        />
      )}
    </>
  );
}

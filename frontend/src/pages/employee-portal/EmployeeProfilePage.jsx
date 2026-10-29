import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, ShieldCheck, User } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { logout as logoutApi } from '../../api/auth.api';

const EMPLOYEE_MODULES = [
  'Dashboard',
  'Customer Management — full CRUD',
  'Cargo Management — full CRUD',
  'Track Shipment',
  'Payments',
  'Trips',
  'Invoices',
  'Notifications',
  'My Profile'
];

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-4 py-4">
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-strong)] text-[var(--text-secondary)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{label}</p>
        <p className="mt-0.5 text-[15px] font-medium text-[var(--text)]">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const user       = useAuthStore((s) => s.user);
  const branchName = useAuthStore((s) => s.branchName);
  const clearAuth  = useAuthStore((s) => s.clearAuth);
  const navigate   = useNavigate();

  const initials = (user?.name ?? 'E')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try { await logoutApi(); } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-500 to-purple-600 text-2xl font-bold text-white shadow-lg">
            {initials}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-[var(--text)] sm:text-3xl">
              {user?.name ?? 'Employee'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-violet-500/20 px-3 py-1.5 text-[12px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                Employee
              </span>
              {branchName && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                  <Building2 className="h-3.5 w-3.5" />
                  {branchName}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account info */}
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--text)]">Account Information</h2>
          <div className="mt-2 divide-y divide-[var(--border)]">
            <InfoRow icon={User}       label="Full Name" value={user?.name} />
            <InfoRow icon={User}       label="Username"  value={user?.username} />
            <InfoRow icon={ShieldCheck}label="Role"      value="Employee" />
            <InfoRow icon={Building2}  label="Branch"    value={branchName || user?.activeBranchName} />
          </div>
        </section>

        {/* Module access */}
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--text)]">Accessible Modules</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Modules available to your Employee role.</p>
          <ul className="mt-4 space-y-2">
            {EMPLOYEE_MODULES.map((m) => (
              <li key={m} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-violet-400" />
                <span className="text-sm text-[var(--text)]">{m}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Security notice */}
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <p className="text-sm font-medium text-[var(--text)]">Security Notice</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          Your session is secured with a time-limited JWT. You will be automatically signed out when it expires. Always sign out on shared devices.
        </p>
      </section>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  Package,
  Route,
  Search,
  UserCheck
} from 'lucide-react';
import api from '../../api/axios';
import useAuthStore from '../../store/authStore';
import Spinner from '../../components/ui/Spinner';
import { roleHasPrivilege } from '../../config/rbac';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <article className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-[var(--text)]">{value ?? '—'}</p>
    </article>
  );
}

function QuickLink({ icon: Icon, label, path, description, color }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="group rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-base font-semibold text-[var(--text)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
    </button>
  );
}

const QUICK_LINKS = [
  { icon: Package,   label: 'Cargo',          path: '/cargo',       description: 'Manage all shipments.',       color: 'bg-blue-500/10 text-blue-400' },
  { icon: UserCheck, label: 'Customers',       path: '/customers',   description: 'View and manage customers.',  color: 'bg-cyan-500/10 text-cyan-400' },
  { icon: Search,    label: 'Track Shipment',  path: '/cargo/track', description: 'Track cargo by number.',      color: 'bg-emerald-500/10 text-emerald-400' },
  { icon: CreditCard,label: 'Payments',        path: '/payments',    description: 'Process and view payments.',  color: 'bg-violet-500/10 text-violet-400' },
  { icon: Route,     label: 'Trips',           path: '/trips',       description: 'View and manage trips.',      color: 'bg-amber-500/10 text-amber-400' },
  { icon: FileText,  label: 'Invoices',        path: '/invoices',    description: 'View and manage invoices.',   color: 'bg-rose-500/10 text-rose-400' },
  { icon: Bell,      label: 'Notifications',   path: '/notifications',description: 'Your alerts and messages.', color: 'bg-orange-500/10 text-orange-400' },
  { icon: BarChart3, label: 'Reports',         path: '/reports',     description: 'Operational reports.',        color: 'bg-indigo-500/10 text-indigo-400', privilege: 'reports.view' }
];

export default function EmployeeDashboardPage() {
  const user     = useAuthStore((s) => s.user);
  const branchId = useAuthStore((s) => s.branchId);
  const roleId   = user?.role_id ?? null;
  const quickLinks = QUICK_LINKS.filter((link) => !link.privilege || roleHasPrivilege(roleId, link.privilege));

  const cargoQuery = useQuery({
    queryKey: ['emp-dash-cargo', branchId],
    queryFn: async () => (await api.get('/api/cargo', { params: { limit: 1 } })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const customersQuery = useQuery({
    queryKey: ['emp-dash-customers', branchId],
    queryFn: async () => (await api.get('/api/customers', { params: { limit: 1 } })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const paymentsQuery = useQuery({
    queryKey: ['emp-dash-payments', branchId],
    queryFn: async () => (await api.get('/api/payments', { params: { limit: 1 } })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const cargoTotal    = cargoQuery.data?.meta?.total    ?? cargoQuery.data?.total    ?? null;
  const customerTotal = customersQuery.data?.meta?.total ?? customersQuery.data?.total ?? null;
  const paymentTotal  = paymentsQuery.data?.meta?.total  ?? paymentsQuery.data?.total  ?? null;

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (cargoQuery.isLoading) {
    return (
      <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 shadow-sm">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">{greeting}</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--text)] sm:text-3xl">
              {user?.name ?? 'Employee'}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Signed in as <span className="font-semibold text-[var(--text)]">Employee</span>
              {user?.activeBranchName ? ` · ${user.activeBranchName}` : ''}
            </p>
          </div>
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--bg)] px-5 py-4 sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Branch</p>
            <p className="mt-1 text-lg font-bold text-[var(--text)]">{user?.activeBranchName ?? '—'}</p>
            <p className="text-xs text-[var(--text-secondary)]">Employee Portal</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Package}    label="Total Cargo"    value={cargoTotal}    color="bg-blue-500/10 text-blue-400" />
        <StatCard icon={UserCheck}  label="Customers"      value={customerTotal} color="bg-cyan-500/10 text-cyan-400" />
        <StatCard icon={CreditCard} label="Payments"       value={paymentTotal}  color="bg-violet-500/10 text-violet-400" />
      </section>

      {/* Quick Access */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Quick Access</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <QuickLink key={link.path} {...link} />
          ))}
        </div>
      </section>

      {/* Branch notice */}
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <p className="text-sm font-medium text-[var(--text)]">Branch-scoped access</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          You can only view and manage data belonging to your assigned branch. Contact your administrator for branch changes or elevated access.
        </p>
      </section>
    </div>
  );
}

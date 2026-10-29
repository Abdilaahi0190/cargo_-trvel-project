import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  PackageCheck,
  PanelTop,
  Printer,
  Receipt,
  TimerReset,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import {
  getDashboardOverview,
  getNotifications,
  getRecentCargo,
  getRecentPayments,
  getCargoTrends
} from '../../api/dashboard.api';
import useAuthStore from '../../store/authStore';

// ─── Data helpers ─────────────────────────────────────────────────────────────

function unwrapPayload(payload) {
  return payload?.data ?? payload ?? null;
}

function getCollection(payload) {
  const source = unwrapPayload(payload);

  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return [];
  }

  const candidates = [
    source.data,
    source.items,
    source.results,
    source.rows,
    source.records,
    source.list,
    source.customers,
    source.payments,
    source.notifications,
    source.cargo
  ];

  return candidates.find(Array.isArray) || [];
}

function getOverviewRecord(payload) {
  const source = unwrapPayload(payload);

  if (!source || typeof source !== 'object') {
    return {};
  }

  const candidates = [
    source.overview,
    source.summary,
    source.metrics,
    source.stats,
    source.dashboard,
    source.data
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return Array.isArray(source) ? {} : source;
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value || 0);
}

function formatDateTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

// ─── Animation helpers ────────────────────────────────────────────────────────

function useLiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useFadeIn(delay = 0) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return visible;
}

function FadeUp({ children, delay = 0, className = '' }) {
  const visible = useFadeIn(delay);
  return (
    <div
      className={`transition-all duration-700 ${className}`}
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(18px)' }}
    >
      {children}
    </div>
  );
}

function AnimBar({ value, colorClass }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(Math.max(Number(value) || 0, 0), 100)), 120);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="h-2 w-full rounded-full bg-[var(--surface-strong)] overflow-hidden">
      <div
        className={`h-2 rounded-full ${colorClass} transition-[width] duration-1000 ease-out`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Accent styles ────────────────────────────────────────────────────────────

const ACCENT_STYLES = {
  emerald: { bar: 'bg-emerald-500', blob: 'bg-emerald-400', ring: 'ring-emerald-500/20', glow: 'hover:shadow-emerald-500/10', border: 'hover:border-emerald-500/30' },
  rose:    { bar: 'bg-rose-500',    blob: 'bg-rose-400',    ring: 'ring-rose-500/20',    glow: 'hover:shadow-rose-500/10',    border: 'hover:border-rose-500/30' },
  sky:     { bar: 'bg-sky-500',     blob: 'bg-sky-400',     ring: 'ring-sky-500/20',     glow: 'hover:shadow-sky-500/10',     border: 'hover:border-sky-500/30' },
  cyan:    { bar: 'bg-cyan-500',    blob: 'bg-cyan-400',    ring: 'ring-cyan-500/20',    glow: 'hover:shadow-cyan-500/10',    border: 'hover:border-cyan-500/30' },
  violet:  { bar: 'bg-violet-500',  blob: 'bg-violet-400',  ring: 'ring-violet-500/20',  glow: 'hover:shadow-violet-500/10',  border: 'hover:border-violet-500/30' },
  amber:   { bar: 'bg-amber-500',   blob: 'bg-amber-400',   ring: 'ring-amber-500/20',   glow: 'hover:shadow-amber-500/10',   border: 'hover:border-amber-500/30' }
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  accent = 'emerald',
  trend,
  trendType,
  isLoading,
  hasError,
  onClick
}) {
  const isPositive = trendType === 'up';
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
  const trendClassName = isPositive
    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
    : 'bg-rose-500/10 text-rose-400 ring-rose-500/20';
  const Component = onClick ? 'button' : 'article';
  const accentStyle = ACCENT_STYLES[accent] || ACCENT_STYLES.emerald;
  const [displayed, setDisplayed] = useState('--');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!isLoading && value !== undefined && !hasError) {
      setFlash(true);
      const t = setTimeout(() => { setDisplayed(value); setFlash(false); }, 180);
      return () => clearTimeout(t);
    }
  }, [value, isLoading, hasError]);

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group relative flex h-full min-h-[132px] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-all duration-300 ${
        onClick
          ? `cursor-pointer hover:-translate-y-1 hover:shadow-xl ${accentStyle.glow} ${accentStyle.border}`
          : ''
      }`}
    >
      {/* Decorative accent glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full ${accentStyle.blob} opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]`}
      />
      {/* Accent top bar */}
      <div className={`absolute inset-x-0 top-0 h-[3px] ${accentStyle.bar} opacity-80`} />

      {isLoading ? (
        <div className="relative flex flex-1 flex-col animate-pulse pt-1">
          <div className="flex items-start justify-between gap-2">
            <div className="h-9 w-9 rounded-xl bg-[var(--surface-strong)]" />
            <div className="h-5 w-14 rounded-full bg-[var(--surface-strong)]" />
          </div>
          <div className="mt-2.5">
            <div className="h-3 w-24 rounded-full bg-[var(--surface-strong)]" />
            <div className="mt-2 h-6 w-20 rounded-full bg-[var(--surface-strong)]" />
            <div className="mt-1.5 h-3 w-28 rounded-full bg-[var(--surface-strong)]" />
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col pt-1">
          <div className="flex items-start justify-between gap-2">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-300 group-hover:scale-110 ${iconClassName} ${accentStyle.ring}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${trendClassName}`}>
              <TrendIcon className="h-3 w-3" />
              {hasError ? '--' : trend}
            </span>
          </div>

          <div className="mt-2.5 min-w-0">
            <p className="truncate text-[12px] font-medium text-[var(--text-secondary)]">{title}</p>
            <p
              className="mt-1 truncate text-[22px] font-extrabold leading-none tracking-tight text-[var(--text)] transition-all duration-200"
              style={{ opacity: flash ? 0 : 1, transform: flash ? 'scale(0.92)' : 'scale(1)' }}
              title={hasError ? undefined : String(displayed)}
            >
              {hasError ? '--' : displayed}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--muted)]">{subtitle}</p>
          </div>
        </div>
      )}
    </Component>
  );
}

// ─── OverviewPanel ────────────────────────────────────────────────────────────

function OverviewPanel({ title, subtitle, children, actionLabel, onAction }) {
  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all duration-300 hover:border-cyan-400/20 hover:shadow-md hover:shadow-cyan-500/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</p> : null}
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-400/5 hover:text-cyan-400"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const queryOptions = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 60 * 1000
};

// ─── DashboardPage ────────────────────────────────────────────────────────────

function DashboardPage() {
  const navigate = useNavigate();
  const [selectedStat, setSelectedStat] = useState(null);
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);

  const recentCargoQuery = useQuery({
    queryKey: ['dashboard-recent-cargo'],
    queryFn: async () => (await getRecentCargo()).data,
    enabled: [1, 3].includes(roleId),
    ...queryOptions
  });

  const recentPaymentsQuery = useQuery({
    queryKey: ['dashboard-recent-payments'],
    queryFn: async () => (await getRecentPayments()).data,
    enabled: [1, 2].includes(roleId),
    ...queryOptions
  });

  const overviewQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => (await getDashboardOverview()).data,
    ...queryOptions
  });

  const notificationsQuery = useQuery({
    queryKey: ['dashboard-notifications'],
    queryFn: async () => (await getNotifications()).data,
    ...queryOptions
  });

  const cargoTrendQuery = useQuery({
    queryKey: ['dashboard-cargo-trends'],
    queryFn: async () => (await getCargoTrends()).data,
    enabled: [1, 3].includes(roleId),
    ...queryOptions
  });

  useEffect(() => {
    const queries = [recentCargoQuery, recentPaymentsQuery, overviewQuery, notificationsQuery, cargoTrendQuery];
    queries.forEach((query) => {
      if (query.isError) {
        console.error('Dashboard query failed:', query.error);
      }
    });
  }, [
    recentCargoQuery.isError,
    recentCargoQuery.error,
    recentPaymentsQuery.isError,
    recentPaymentsQuery.error,
    overviewQuery.isError,
    overviewQuery.error,
    notificationsQuery.isError,
    notificationsQuery.error,
    cargoTrendQuery.isError,
    cargoTrendQuery.error
  ]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const recentCargo = useMemo(() => getCollection(recentCargoQuery.data), [recentCargoQuery.data]);
  const notifications = useMemo(() => getCollection(notificationsQuery.data), [notificationsQuery.data]);
  const cargoTrendRows = useMemo(() => getCollection(cargoTrendQuery.data), [cargoTrendQuery.data]);
  const overviewRecord = useMemo(() => getOverviewRecord(overviewQuery.data), [overviewQuery.data]);
  const loadingStats = overviewQuery.isLoading;

  // Financial data from backend overview
  const overview = useMemo(() => {
    const pick = (...values) => values.find((v) => v != null && v !== '');
    return {
      total_customers:       toNumber(pick(overviewRecord.total_customers, overviewRecord.totalCustomers, 0)),
      cargo_received_today:  toNumber(pick(overviewRecord.cargo_received_today, overviewRecord.cargoReceivedToday, 0)),
      delivered_today:       toNumber(pick(overviewRecord.delivered_today, overviewRecord.deliveredToday, 0)),
      active_shipments:      toNumber(pick(overviewRecord.active_shipments, overviewRecord.activeShipments, 0)),
      pending_orders:        toNumber(pick(overviewRecord.pending_orders, overviewRecord.pendingOrders, 0)),
      delayed_shipments:     toNumber(pick(overviewRecord.delayed_shipments, overviewRecord.delayedShipments, 0)),
      revenue_today:         toNumber(pick(overviewRecord.revenue_today, overviewRecord.revenueToday, 0)),
      revenue_this_month:    toNumber(pick(overviewRecord.revenue_this_month, overviewRecord.revenueThisMonth, 0)),
      expenses_today:        toNumber(pick(overviewRecord.expenses_today, overviewRecord.expensesToday, 0)),
      expenses_this_month:   toNumber(pick(overviewRecord.expenses_this_month, overviewRecord.expensesThisMonth, 0)),
      net_profit_this_month: toNumber(pick(overviewRecord.net_profit_this_month, overviewRecord.netProfitThisMonth, 0)),
      outstanding_balance:   toNumber(pick(overviewRecord.outstanding_balance, overviewRecord.outstandingBalance, 0))
    };
  }, [overviewRecord]);

  const dashboardDetails = overviewRecord.details || {};

  const delayedShipmentRows = useMemo(() => {
    const rows = dashboardDetails.delayed_shipments;
    return Array.isArray(rows) ? rows : [];
  }, [dashboardDetails.delayed_shipments]);

  const deliveredTodayRows = useMemo(() => {
    const rows = dashboardDetails.delivered_today;
    return Array.isArray(rows) ? rows : [];
  }, [dashboardDetails.delivered_today]);

  // Chart data grouped by month
  const chartData = useMemo(() => {
    const grouped = cargoTrendRows.reduce((accumulator, cargo) => {
      const dateValue = cargo?.created_at || cargo?.createdAt;

      if (!dateValue) {
        return accumulator;
      }

      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) {
        return accumulator;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!accumulator[key]) {
        accumulator[key] = {
          key,
          month: date.toLocaleString('en-US', { month: 'short' }),
          total: 0,
          delivered: 0
        };
      }

      accumulator[key].total += 1;

      if (normalizeStatus(cargo?.status_name || cargo?.status) === 'delivered') {
        accumulator[key].delivered += 1;
      }

      return accumulator;
    }, {});

    return Object.values(grouped).sort((left, right) => left.key.localeCompare(right.key));
  }, [cargoTrendRows]);

  // ── Stat cards ────────────────────────────────────────────────────────────

  const cargoStatsError = overviewQuery.isError && cargoTrendQuery.isError;
  const revenueStatError = overviewQuery.isError && recentPaymentsQuery.isError;

  const isNetProfitPositive = overview.net_profit_this_month >= 0;

  const statCards = [
    {
      id: 'total-customers',
      title: 'Total Customers',
      value: formatCompactNumber(overview.total_customers),
      subtitle: 'Registered customers',
      icon: Users,
      iconClassName: 'bg-violet-500/15 text-violet-400',
      accent: 'violet',
      trend: `${Number(overview.total_customers || 0)} total`,
      trendType: 'up',
      hasError: overviewQuery.isError,
      actionLabel: 'Open Customers',
      actionPath: '/customers',
      detailTitle: 'Customer base overview',
      detailText: 'Total registered customers who have shipped or received cargo through Waafi Cargo & Travel Agency.',
      detailStats: [
        { label: 'Total customers', value: formatCompactNumber(overview.total_customers) },
        { label: 'Recent cargo linked', value: String(recentCargo.length) },
        { label: 'Data source', value: 'customers table' }
      ]
    },
    {
      id: 'cargo-received-today',
      title: 'Cargo Received Today',
      value: formatCompactNumber(overview.cargo_received_today),
      subtitle: 'Arrived at office today',
      icon: PackageCheck,
      iconClassName: 'bg-emerald-500/15 text-emerald-400',
      accent: 'emerald',
      trend: `${Number(overview.cargo_received_today || 0)} received`,
      trendType: 'up',
      hasError: cargoStatsError,
      actionLabel: 'View Cargo',
      actionPath: '/cargo',
      detailTitle: 'Cargo received today',
      detailText: 'Shipments that arrived at the office today and are ready for customer collection.',
      detailStats: [
        { label: 'Received today', value: formatCompactNumber(overview.cargo_received_today) },
        { label: 'Active shipments', value: formatCompactNumber(overview.active_shipments) },
        { label: 'Status', value: 'Live count' }
      ]
    },
    {
      id: 'delivered-today',
      title: 'Delivered Today',
      value: formatCompactNumber(overview.delivered_today),
      subtitle: 'Collected by customers',
      icon: CheckCircle2,
      iconClassName: 'bg-emerald-500/15 text-emerald-400',
      accent: 'emerald',
      trend: `${Number(overview.delivered_today || 0)} delivered`,
      trendType: 'up',
      hasError: cargoStatsError,
      actionLabel: 'View Deliveries',
      actionPath: '/cargo',
      detailTitle: 'Today delivery summary',
      detailText: 'Cargo collected by customers from the office today.',
      detailStats: [
        { label: 'Delivered today', value: formatCompactNumber(overview.delivered_today) },
        { label: 'Rows returned', value: String(deliveredTodayRows.length) },
        { label: 'Status source', value: 'cargo_history table' }
      ],
      detailRows: deliveredTodayRows.map((row) => ({
        id: `delivered-${row.cargo_id}`,
        metric: row.tracking_number || `Cargo ${row.cargo_id}`,
        value: `${row.from_branch_name || 'Unknown'} to ${row.to_branch_name || 'Unknown'}`,
        status: 'Delivered',
        note: `Delivered at ${formatDateTime(row.delivered_at)}`
      }))
    },
    {
      id: 'active-shipments',
      title: 'Active Shipments',
      value: formatCompactNumber(overview.active_shipments),
      subtitle: 'Awaiting collection',
      icon: TimerReset,
      iconClassName: 'bg-sky-500/15 text-sky-400',
      accent: 'sky',
      trend: `${Number(overview.active_shipments || 0)} active`,
      trendType: 'up',
      hasError: cargoStatsError,
      actionLabel: 'Open Cargo',
      actionPath: '/cargo',
      detailTitle: 'Active shipment operations',
      detailText: 'Cargo currently at the office awaiting customer collection.',
      detailStats: [
        { label: 'Active now', value: formatCompactNumber(overview.active_shipments) },
        { label: 'Pending orders', value: formatCompactNumber(overview.pending_orders) },
        { label: 'Recent cargo rows', value: String(recentCargo.length) }
      ]
    },
    {
      id: 'pending-orders',
      title: 'Pending Orders',
      value: formatCompactNumber(overview.pending_orders),
      subtitle: 'Awaiting processing',
      icon: ClipboardList,
      iconClassName: 'bg-rose-500/15 text-rose-400',
      accent: 'rose',
      trend: `${Number(overview.pending_orders || 0)} pending`,
      trendType: 'down',
      hasError: cargoStatsError,
      actionLabel: 'Review Queue',
      actionPath: '/cargo',
      detailTitle: 'Pending processing queue',
      detailText: 'Cargo records waiting for processing or further operational action.',
      detailStats: [
        { label: 'Pending items', value: formatCompactNumber(overview.pending_orders) },
        { label: 'Delayed shipments', value: formatCompactNumber(overview.delayed_shipments) },
        { label: 'Unread alerts', value: String(getUnreadNotificationsCount(notifications)) }
      ],
      detailRows: delayedShipmentRows.map((row) => ({
        id: `delayed-${row.cargo_id}`,
        metric: row.tracking_number || `Cargo ${row.cargo_id}`,
        value: `${row.from_branch_name || 'Unknown'} to ${row.to_branch_name || 'Unknown'}`,
        status: row.status_name || 'Pending',
        note: `${Number(row.age_days || 0)} days old, created ${formatDateTime(row.created_at)}`
      }))
    },
    {
      id: 'revenue-today',
      title: 'Revenue Today',
      value: formatCurrency(overview.revenue_today),
      subtitle: 'Payments received today',
      icon: DollarSign,
      iconClassName: 'bg-amber-500/15 text-amber-400',
      accent: 'amber',
      trend: formatCurrency(overview.revenue_today),
      trendType: 'up',
      hasError: revenueStatError,
      actionLabel: 'Open Payments',
      actionPath: '/payments',
      detailTitle: 'Revenue collected today',
      detailText: 'Total payments received from customers for cargo collection today.',
      detailStats: [
        { label: 'Revenue today', value: formatCurrency(overview.revenue_today) },
        { label: 'Expenses today', value: formatCurrency(overview.expenses_today) },
        { label: 'Currency', value: 'USD' }
      ]
    },
    {
      id: 'revenue-this-month',
      title: 'Revenue This Month',
      value: formatCurrency(overview.revenue_this_month),
      subtitle: 'Month to date',
      icon: TrendingUp,
      iconClassName: 'bg-amber-500/15 text-amber-400',
      accent: 'amber',
      trend: 'MTD',
      trendType: 'up',
      hasError: revenueStatError,
      actionLabel: 'Open Payments',
      actionPath: '/payments',
      detailTitle: 'Monthly revenue performance',
      detailText: 'Total revenue collected from customers for the current calendar month.',
      detailStats: [
        { label: 'Revenue this month', value: formatCurrency(overview.revenue_this_month) },
        { label: 'Expenses this month', value: formatCurrency(overview.expenses_this_month) },
        { label: 'Net profit this month', value: formatCurrency(overview.net_profit_this_month) }
      ]
    },
    {
      id: 'net-profit-this-month',
      title: 'Net Profit This Month',
      value: formatCurrency(overview.net_profit_this_month),
      subtitle: isNetProfitPositive ? 'Profitable month' : 'Month running at loss',
      icon: isNetProfitPositive ? TrendingUp : TrendingDown,
      iconClassName: isNetProfitPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
      accent: isNetProfitPositive ? 'emerald' : 'rose',
      trend: isNetProfitPositive ? 'Profit' : 'Loss',
      trendType: isNetProfitPositive ? 'up' : 'down',
      hasError: revenueStatError,
      actionLabel: 'View Reports',
      actionPath: '/reports',
      detailTitle: 'Net profit breakdown',
      detailText: 'Net profit is calculated as revenue minus expenses for the current calendar month.',
      detailStats: [
        { label: 'Revenue this month', value: formatCurrency(overview.revenue_this_month) },
        { label: 'Expenses this month', value: formatCurrency(overview.expenses_this_month) },
        { label: 'Net profit', value: formatCurrency(overview.net_profit_this_month) }
      ]
    }
  ];

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const selectedStatRecord = selectedStat
    ? statCards.find((card) => card.id === selectedStat.id) || selectedStat
    : null;
  const printRef = useRef(null);
  const reportDate = new Date().toISOString().slice(0, 10);

  const modalTableColumns = useMemo(() => ([
    { key: 'no',     label: 'No.' },
    { key: 'metric', label: 'Metric' },
    { key: 'value',  label: 'Value' },
    { key: 'status', label: 'Status' },
    { key: 'note',   label: 'Note' }
  ]), []);

  const modalTableRows = useMemo(() => {
    if (!selectedStatRecord) {
      return [];
    }

    if (selectedStatRecord.detailRows?.length) {
      return selectedStatRecord.detailRows.map((item, index) => ({
        id: item.id || `${selectedStatRecord.id}-${index}`,
        no: index + 1,
        metric: item.metric,
        value: item.value,
        status: item.status,
        note: item.note
      }));
    }

    return (selectedStatRecord.detailStats || []).map((item, index) => ({
      id: `${selectedStatRecord.id}-${item.label}`,
      no: index + 1,
      metric: item.label,
      value: item.value,
      status: selectedStatRecord.trendType === 'up' ? 'Good' : 'Attention',
      note: selectedStatRecord.detailText
    }));
  }, [selectedStatRecord]);

  const handlePrintModal = () => {
    if (!printRef.current) {
      return;
    }

    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=700');

    if (!printWindow) {
      return;
    }

    const styles = `
      <style>
        body {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #ffffff;
          color: #0f172a;
          margin: 0;
          padding: 24px;
        }

        * { box-sizing: border-box; }

        .print-card { width: 100%; max-width: 100%; margin: 0 auto; }

        .print-card table { width: 100%; border-collapse: collapse; margin-top: 16px; }

        .print-card th,
        .print-card td {
          border: 1px solid #cbd5e1;
          padding: 12px 14px;
          text-align: left;
          vertical-align: top;
        }

        .print-card th { background: #0f172a; color: white; font-weight: 700; }

        .print-card h3,
        .print-card p,
        .print-card span,
        .print-card td { color: #0f172a; }

        .print-card .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }

        .print-card .title { margin: 0; font-size: 32px; letter-spacing: 0.24em; }
        .print-card .subtitle { margin: 10px 0 0; font-size: 14px; color: #475569; line-height: 1.6; }

        @media print {
          body { margin: 0; padding: 0; }
          .print-card { box-shadow: none; }
          .no-print { display: none !important; }
        }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head><title>Print Dashboard Report</title>${styles}</head>
        <body><div class="print-card">${printContent}</div></body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleExportModal = () => {
    if (!selectedStatRecord || modalTableRows.length === 0) {
      return;
    }

    const rows = [
      ['No.', 'Metric', 'Value', 'Status', 'Note'],
      ...modalTableRows.map((row) => [row.no, row.metric, row.value, row.status, row.note])
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedStatRecord.id || 'dashboard-report'}-${reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clock = useLiveClock();
  const clockStr = clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-full flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      <div className="flex flex-1 flex-col gap-4">

        {/* ── Page header ── */}
        <FadeUp delay={0}>
          <section className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Dashboard Overview</h1>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Branch activity, cargo flow, and financial snapshot.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Live clock */}
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-mono font-bold text-cyan-400 tabular-nums">{clockStr}</span>
                <span className="text-[10px] text-[var(--muted)]">{dateStr}</span>
              </div>
              <div className="h-8 w-px bg-[var(--border)] hidden sm:block" />
              <button
                type="button"
                onClick={() => navigate('/expenses')}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition-all duration-200 hover:border-amber-400/40 hover:bg-[var(--surface-strong)] hover:text-amber-400"
              >
                + Add Expense
              </button>
              <button
                type="button"
                onClick={() => navigate('/cargo/new')}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-400 shadow-sm transition-all duration-200 hover:bg-cyan-500/20 hover:shadow-cyan-500/10 hover:shadow-md"
              >
                + New Shipment
              </button>
            </div>
          </section>
        </FadeUp>

        {/* ── Stat cards ── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((card, i) => (
            <FadeUp key={card.id} delay={80 + i * 60} className="h-full">
              <StatCard {...card} isLoading={loadingStats} onClick={() => setSelectedStat(card)} />
            </FadeUp>
          ))}
        </section>

        {/* ── Trends + Financial Overview ── */}
        <FadeUp delay={560} className="flex flex-1">
          <section className="grid min-h-0 w-full min-w-0 flex-1 items-stretch gap-3 xl:grid-cols-[1.5fr_1fr]">
            {/* Shipment Trends chart */}
            <OverviewPanel
              title="Shipment Trends"
              subtitle="Monthly volume split between total cargo created and cargo delivered."
              actionLabel="Open Cargo"
              onAction={() => navigate('/cargo')}
            >
              {cargoTrendQuery.isLoading ? (
                <div className="flex min-h-[200px] flex-1 items-center justify-center">
                  <Spinner className="scale-125" />
                </div>
              ) : (
                <div className="min-h-[200px] w-full min-w-0 flex-1 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={280}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <defs>
                        <linearGradient id="cargoGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="deliveredGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                      <XAxis
                        dataKey="month"
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickMargin={6}
                        height={20}
                      />
                      <YAxis
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        width={24}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111827',
                          borderColor: 'rgba(255,255,255,0.08)',
                          borderRadius: '16px',
                          color: '#e2e8f0'
                        }}
                      />
                      <Area type="monotone" dataKey="total" stroke="#22d3ee" fill="url(#cargoGradient)" strokeWidth={2} />
                      <Area type="monotone" dataKey="delivered" stroke="#10b981" fill="url(#deliveredGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </OverviewPanel>

            {/* Financial Overview panel */}
            <OverviewPanel
              title="Financial Overview"
              subtitle="Revenue, expenses, and profit snapshot for today and this month."
              actionLabel="View Reports"
              onAction={() => navigate('/reports')}
            >
              <div className="flex h-full flex-col justify-between gap-3">
                {/* Revenue Today */}
                <div className="group flex items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-all duration-300 hover:border-amber-400/30 hover:shadow-md hover:shadow-amber-500/5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/20 transition-transform duration-300 group-hover:scale-110">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Revenue Today</p>
                    <p className="mt-1 truncate text-xl font-bold text-amber-400">
                      {overviewQuery.isError ? '--' : formatCurrency(overview.revenue_today)}
                    </p>
                  </div>
                </div>

                {/* Revenue This Month */}
                <div className="group flex items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-all duration-300 hover:border-amber-400/30 hover:shadow-md hover:shadow-amber-500/5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/20 transition-transform duration-300 group-hover:scale-110">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Revenue This Month</p>
                    <p className="mt-1 truncate text-xl font-bold text-amber-400">
                      {overviewQuery.isError ? '--' : formatCurrency(overview.revenue_this_month)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Expenses This Month */}
                  <div className="group rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-all duration-300 hover:border-rose-400/30 hover:shadow-md hover:shadow-rose-500/5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 ring-1 ring-inset ring-rose-500/20 transition-transform duration-300 group-hover:scale-110">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <p className="mt-3 truncate text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Expenses</p>
                    <p className="mt-1 truncate text-lg font-bold text-rose-400">
                      {overviewQuery.isError ? '--' : formatCurrency(overview.expenses_this_month)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">This month</p>
                  </div>

                  {/* Net Profit */}
                  <div className={`group rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-all duration-300 hover:shadow-md ${isNetProfitPositive ? 'hover:border-emerald-400/30 hover:shadow-emerald-500/5' : 'hover:border-rose-400/30 hover:shadow-rose-500/5'}`}>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-300 group-hover:scale-110 ${isNetProfitPositive ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' : 'bg-rose-500/15 text-rose-400 ring-rose-500/20'}`}>
                      {isNetProfitPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <p className="mt-3 truncate text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Net Profit</p>
                    <p className={`mt-1 truncate text-lg font-bold ${isNetProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {overviewQuery.isError ? '--' : formatCurrency(overview.net_profit_this_month)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">This month</p>
                  </div>
                </div>

                {/* Outstanding Balance */}
                <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-all duration-300 hover:border-sky-400/30 hover:shadow-md hover:shadow-sky-500/5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Outstanding Balance</p>
                    <p className="mt-1.5 truncate text-xl font-bold text-sky-400">
                      {overviewQuery.isError ? '--' : formatCurrency(overview.outstanding_balance)}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/20">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </OverviewPanel>
          </section>
        </FadeUp>
      </div>

      {/* ── Stat detail modal ── */}
      <Modal
        isOpen={Boolean(selectedStatRecord)}
        onClose={() => setSelectedStat(null)}
        title={selectedStatRecord?.detailTitle || selectedStatRecord?.title || 'Dashboard detail'}
        subtitle={selectedStatRecord?.subtitle || 'Performance snapshot'}
        size="xxl"
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-600"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              onClick={handleExportModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export To Excel
            </button>
            {selectedStatRecord?.actionPath ? (
              <button
                type="button"
                onClick={() => {
                  navigate(selectedStatRecord.actionPath);
                  setSelectedStat(null);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-400/15"
              >
                <PanelTop className="h-4 w-4" />
                {selectedStatRecord.actionLabel || 'Open'}
              </button>
            ) : null}
          </div>
        }
      >
        {selectedStatRecord ? (
          <div className="space-y-6">
            {(() => {
              const SelectedIcon = selectedStatRecord.icon;

              return (
                <>
                  <div
                    ref={printRef}
                    className="rounded-[30px] border border-[var(--border)] bg-white p-5 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-700/20 pb-4">
                      <div>
                        <p className="text-sm text-slate-600">Powered by [SYD] - Call 2238</p>
                        <div className="mt-4">
                          <p className="text-4xl font-semibold tracking-[0.24em] text-sky-800 sm:text-5xl">WAAFI CARGO</p>
                          <p className="mt-2 text-lg font-medium uppercase tracking-[0.34em] text-emerald-600">
                            Logistics Management Report
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`ml-auto flex h-16 w-16 items-center justify-center rounded-[22px] ${selectedStatRecord.iconClassName}`}>
                          <SelectedIcon className="h-7 w-7" />
                        </span>
                        <p className="mt-4 text-sm font-semibold text-sky-700">Print Date: {reportDate}</p>
                      </div>
                    </div>

                    <div className="py-8 text-center">
                      <h3 className="text-2xl font-semibold text-slate-900">{selectedStatRecord.title} Report</h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{selectedStatRecord.detailText}</p>
                    </div>

                    <div className="overflow-hidden rounded-[24px] border border-sky-700/30 bg-white">
                      <div className="overflow-x-auto">
                        <table className="min-w-[760px] w-full table-fixed border-collapse">
                          <colgroup>
                            <col className="w-[8%]" />
                            <col className="w-[24%]" />
                            <col className="w-[14%]" />
                            <col className="w-[16%]" />
                            <col className="w-[38%]" />
                          </colgroup>
                          <thead className="bg-sky-900 text-white">
                            <tr>
                              {modalTableColumns.map((column) => (
                                <th key={column.key} className="border border-sky-700/50 px-4 py-3 text-left text-sm font-semibold">
                                  {column.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white text-slate-800">
                            {modalTableRows.map((row) => (
                              <tr key={row.id} className="odd:bg-slate-50">
                                {modalTableColumns.map((column) => (
                                  <td
                                    key={column.key}
                                    className={`border border-sky-700/20 px-4 py-3 text-sm align-top ${
                                      column.key === 'note'
                                        ? 'whitespace-normal break-words leading-7'
                                        : 'whitespace-normal'
                                    }`}
                                  >
                                    {row[column.key]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedStat(null)}
                        className="rounded-2xl bg-slate-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default DashboardPage;

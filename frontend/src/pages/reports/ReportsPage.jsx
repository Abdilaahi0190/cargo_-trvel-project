import { useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer, FileSpreadsheet, Package, Truck, Users, UserCheck,
  TrendingUp, Wallet, AlertCircle, CheckCircle2, Clock,
  XCircle, BarChart2, DollarSign, ArrowUpDown, Building2, Route
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import api from '../../api/axios';
import { getCollection, getApiErrorMessage } from '../../api/listUtils';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import { selectFieldClass } from '../../components/modules/selectFieldClass';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'cargo',      label: 'Cargo Reports',     icon: Package },
  { id: 'shipment',   label: 'Shipment Reports',  icon: Truck },
  { id: 'customer',   label: 'Customer Reports',  icon: Users },
  { id: 'employee',   label: 'Employee Reports',  icon: UserCheck },
  { id: 'provider',   label: 'Transport Providers', icon: Building2 },
  { id: 'trips',      label: 'Trip Reports',      icon: Route },
  { id: 'financial',  label: 'Financial Reports', icon: DollarSign },
];

const PRESETS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year' },
  { label: 'Custom Range', value: 'custom' },
];

const BAR_COLORS = {
  primary:   '#0ea5e9',
  secondary: '#10b981',
  danger:    '#ef4444',
  warning:   '#f59e0b',
  purple:    '#8b5cf6',
  gray:      '#64748b',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPresetDates(preset) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) };
    case 'week': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      return { from: fmt(start), to: fmt(today) };
    }
    case 'month':
      return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
    case 'year':
      return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
    default:
      return { from: '', to: '' };
  }
}

function unwrap(payload) {
  if (!payload) return {};
  return payload?.data ?? payload;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Y-axis currency tick: compact $Xk once values reach the thousands, exact dollars below that. */
function formatAxisCurrency(v) {
  return Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;
}

function exportCsv(rows, filename) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printSection(contentHtml, title) {
  const win = window.open('', '_blank', 'width=1050,height=750');
  if (!win) return;
  win.document.write(`
    <html><head><title>${title} — Waafi Cargo</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#0f172a;padding:32px}
      .report-header{border-bottom:2px solid #0c4a6e;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
      .report-header h1{font-size:26px;font-weight:700;letter-spacing:.15em;color:#0369a1}
      .report-header h2{font-size:11px;font-weight:600;letter-spacing:.25em;text-transform:uppercase;color:#64748b;margin-top:4px}
      .meta{font-size:11px;color:#64748b;text-align:right}
      .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
      .kpi-card{border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px}
      .kpi-card .label{font-size:11px;font-weight:500;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
      .kpi-card .value{font-size:22px;font-weight:700;color:#0f172a;margin-top:4px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
      th{background:#0c4a6e;color:#fff;padding:10px 14px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      td{padding:9px 14px;border-bottom:1px solid #f1f5f9;color:#1e293b}
      tr:nth-child(even) td{background:#f8fafc}
      tfoot td{font-weight:700;background:#f1f5f9;border-top:2px solid #cbd5e1}
      h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#0369a1;margin:20px 0 10px}
      @media print{body{padding:16px}}
    </style></head>
    <body>
      <div class="report-header">
        <div>
          <h1>WAAFI CARGO &amp; TRAVEL</h1>
          <h2>${title}</h2>
        </div>
        <div class="meta">Print Date: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
      </div>
      ${contentHtml}
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
  win.close();
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, colorBg, colorText = 'text-white' }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorBg}`}>
        <Icon className={`h-4.5 w-4.5 ${colorText}`} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-base font-bold text-slate-800 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = '' }) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </article>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {label && <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-sm font-semibold text-slate-800 dark:text-slate-100" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && (p.name.toLowerCase().includes('revenue') || p.name.toLowerCase().includes('expense') || p.name.toLowerCase().includes('profit') || p.name.toLowerCase().includes('paid'))
            ? formatCurrency(p.value)
            : p.value}
        </p>
      ))}
    </div>
  );
}

function SectionCard({ title, actions, children, printRef }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div ref={printRef}>
        {children}
      </div>
    </section>
  );
}

function PrintBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
    >
      <Printer className="h-3.5 w-3.5" />
      Print
    </button>
  );
}

function CsvBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
    >
      <FileSpreadsheet className="h-3.5 w-3.5" />
      Export CSV
    </button>
  );
}

function EmptyRow({ colSpan, message = 'No data available.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
        {message}
      </td>
    </tr>
  );
}

function TableHead({ columns }) {
  return (
    <thead>
      <tr className="border-b border-slate-100 dark:border-slate-700/60">
        {columns.map((col) => (
          <th
            key={col}
            className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/10 dark:text-rose-300">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
      <Spinner />
    </div>
  );
}

// ─── TAB 1: Cargo Reports ────────────────────────────────────────────────────

function CargoTab({ params }) {
  const printRef = useRef(null);

  const cargoQuery = useQuery({
    queryKey: ['reports-cargo', params],
    queryFn: async () => (await api.get('/api/reports/cargo', { params })).data,
    staleTime: 60_000,
  });

  const destQuery = useQuery({
    queryKey: ['reports-cargo-dest', params],
    queryFn: async () => (await api.get('/api/reports/cargo/by-destination', { params })).data,
    staleTime: 60_000,
  });

  const branchQuery = useQuery({
    queryKey: ['reports-cargo-branch', params],
    queryFn: async () => (await api.get('/api/reports/cargo/by-branch', { params })).data,
    staleTime: 60_000,
  });

  const cargoRows = getCollection(cargoQuery.data);
  const destRows  = getCollection(destQuery.data);
  const branchRows = getCollection(branchQuery.data);

  // KPI aggregation from status rows
  const kpi = useMemo(() => {
    const find = (status) => safeNum(cargoRows.find((r) => String(r.status || '').toLowerCase() === status)?.count);
    const total     = cargoRows.reduce((s, r) => s + safeNum(r.count), 0);
    const delivered = find('delivered');
    const transit   = find('in_transit') || find('in transit');
    const pending   = find('pending');
    const cancelled = find('cancelled');
    return { total, delivered, transit, pending, cancelled };
  }, [cargoRows]);

  const statusChartData = cargoRows.map((r) => ({
    name: String(r.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    count: safeNum(r.count),
  }));

  const destChartData = destRows.map((r) => ({
    name: r.destination || r.dest || 'Unknown',
    revenue: safeNum(r.revenue),
  }));

  const isLoading = cargoQuery.isLoading || destQuery.isLoading || branchQuery.isLoading;
  const error = cargoQuery.isError ? getApiErrorMessage(cargoQuery.error)
    : destQuery.isError ? getApiErrorMessage(destQuery.error)
    : branchQuery.isError ? getApiErrorMessage(branchQuery.error) : null;

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Cargo Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['Branch', 'Total', 'Delivered', 'In Transit', 'Pending', 'Cancelled', 'Revenue', 'Weight'],
      ...branchRows.map((r) => [
        r.branch ?? r.branch_name, safeNum(r.total_cargo ?? r.total), safeNum(r.delivered), safeNum(r.in_transit),
        safeNum(r.pending), safeNum(r.cancelled),
        formatCurrency(r.revenue ?? r.total_revenue), r.total_weight ?? r.weight ?? '',
      ]),
    ];
    exportCsv(rows, 'cargo-report');
  }, [branchRows]);

  if (isLoading) return <LoadingBox />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={Package}     label="Total Received"  value={kpi.total.toLocaleString()}     colorBg="bg-sky-600" />
        <KpiCard icon={CheckCircle2} label="Delivered"      value={kpi.delivered.toLocaleString()}  colorBg="bg-emerald-600" />
        <KpiCard icon={Truck}        label="In Transit"     value={kpi.transit.toLocaleString()}    colorBg="bg-amber-500" />
        <KpiCard icon={Clock}        label="Pending"        value={kpi.pending.toLocaleString()}    colorBg="bg-violet-600" />
        <KpiCard icon={XCircle}      label="Cancelled"      value={kpi.cancelled.toLocaleString()}  colorBg="bg-rose-600" />
      </div>

      {/* Charts */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Cargo by Status">
          <div className="h-56">
            {statusChartData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="count" name="Count" fill={BAR_COLORS.primary} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>

        <ChartCard title="Revenue by Destination">
          <div className="h-56">
            {destChartData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={destChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="revenue" name="Revenue" fill={BAR_COLORS.secondary} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>
      </div>

      {/* Branch table */}
      <SectionCard
        title="Cargo by Branch"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <TableHead columns={['Branch', 'Total', 'Delivered', 'In Transit', 'Pending', 'Cancelled', 'Revenue', 'Weight']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {branchRows.length === 0
                ? <EmptyRow colSpan={8} />
                : branchRows.map((r, i) => (
                  <tr key={r.branch_id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.branch ?? r.branch_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.total_cargo ?? r.total).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{safeNum(r.delivered).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-amber-700 dark:text-amber-400">{safeNum(r.in_transit).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-violet-700 dark:text-violet-400">{safeNum(r.pending).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-rose-700 dark:text-rose-400">{safeNum(r.cancelled).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-sky-700 dark:text-sky-400">{formatCurrency(r.revenue ?? r.total_revenue)}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{(r.total_weight ?? r.weight) ? `${r.total_weight ?? r.weight} kg` : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 2: Shipment Reports ─────────────────────────────────────────────────

function ShipmentTab({ params }) {
  const printRef = useRef(null);

  const cargoQuery = useQuery({
    queryKey: ['reports-shipment-status', params],
    queryFn: async () => (await api.get('/api/reports/cargo', { params })).data,
    staleTime: 60_000,
  });

  const destQuery = useQuery({
    queryKey: ['reports-shipment-dest', params],
    queryFn: async () => (await api.get('/api/reports/cargo/by-destination', { params })).data,
    staleTime: 60_000,
  });

  const branchQuery = useQuery({
    queryKey: ['reports-shipment-branch', params],
    queryFn: async () => (await api.get('/api/reports/cargo/by-branch', { params })).data,
    staleTime: 60_000,
  });

  const statusRows  = getCollection(cargoQuery.data);
  const destRows    = getCollection(destQuery.data);
  const branchRows  = getCollection(branchQuery.data);

  const kpi = useMemo(() => {
    const find = (s) => safeNum(statusRows.find((r) => String(r.status || '').toLowerCase() === s)?.count);
    return {
      total:     statusRows.reduce((s, r) => s + safeNum(r.count), 0),
      delivered: find('delivered'),
      pending:   find('pending'),
      transit:   find('in_transit') || find('in transit'),
      cancelled: find('cancelled'),
    };
  }, [statusRows]);

  const destChartData = destRows.map((r) => ({
    name: r.destination || r.dest || 'Unknown',
    revenue: safeNum(r.revenue),
  }));

  const isLoading = cargoQuery.isLoading || destQuery.isLoading || branchQuery.isLoading;
  const error = cargoQuery.isError ? getApiErrorMessage(cargoQuery.error)
    : destQuery.isError ? getApiErrorMessage(destQuery.error)
    : branchQuery.isError ? getApiErrorMessage(branchQuery.error) : null;

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Shipment Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['Branch', 'Total', 'Delivered', 'In Transit', 'Pending', 'Cancelled', 'Revenue'],
      ...branchRows.map((r) => [
        r.branch ?? r.branch_name, safeNum(r.total_cargo ?? r.total), safeNum(r.delivered), safeNum(r.in_transit),
        safeNum(r.pending), safeNum(r.cancelled), formatCurrency(r.revenue ?? r.total_revenue),
      ]),
    ];
    exportCsv(rows, 'shipment-report');
  }, [branchRows]);

  if (isLoading) return <LoadingBox />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={Package}      label="Total Created"  value={kpi.total.toLocaleString()}     colorBg="bg-sky-600" />
        <KpiCard icon={CheckCircle2} label="Delivered"      value={kpi.delivered.toLocaleString()}  colorBg="bg-emerald-600" />
        <KpiCard icon={Clock}        label="Pending"        value={kpi.pending.toLocaleString()}    colorBg="bg-violet-600" />
        <KpiCard icon={Truck}        label="In Transit"     value={kpi.transit.toLocaleString()}    colorBg="bg-amber-500" />
        <KpiCard icon={XCircle}      label="Cancelled"      value={kpi.cancelled.toLocaleString()}  colorBg="bg-rose-600" />
      </div>

      {/* Destination chart */}
      <ChartCard title="Revenue by Destination">
        <div className="h-60">
          {destChartData.length === 0
            ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
            : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={destChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="revenue" name="Revenue" fill={BAR_COLORS.primary} radius={[6, 6, 0, 0]} maxBarSize={52} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </ChartCard>

      {/* Branch table */}
      <SectionCard
        title="Shipments by Branch"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <TableHead columns={['Branch', 'Total', 'Delivered', 'In Transit', 'Pending', 'Cancelled', 'Revenue']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {branchRows.length === 0
                ? <EmptyRow colSpan={7} />
                : branchRows.map((r, i) => (
                  <tr key={r.branch_id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.branch ?? r.branch_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.total_cargo ?? r.total).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{safeNum(r.delivered).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-amber-700 dark:text-amber-400">{safeNum(r.in_transit).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-violet-700 dark:text-violet-400">{safeNum(r.pending).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-rose-700 dark:text-rose-400">{safeNum(r.cancelled).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-sky-700 dark:text-sky-400">{formatCurrency(r.revenue ?? r.total_revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 3: Customer Reports ─────────────────────────────────────────────────

function CustomerTab({ params }) {
  const printRef = useRef(null);

  const custQuery = useQuery({
    queryKey: ['reports-customers', params],
    queryFn: async () => (await api.get('/api/reports/customers/stats', { params })).data,
    staleTime: 60_000,
  });

  const raw = unwrap(custQuery.data);
  const stats = raw?.stats ?? raw?.summary ?? raw ?? {};
  const topCustomers = useMemo(
    () => getCollection(raw?.top_customers ?? raw?.customers ?? custQuery.data),
    [raw, custQuery.data],
  );

  const kpi = {
    total:    safeNum(stats.total_customers ?? stats.total),
    regular:  safeNum(stats.regular_customers ?? stats.regular),
    oneTime:  safeNum(stats.one_time_customers ?? stats.one_time),
    newMonth: safeNum(stats.new_customers_this_month ?? stats.new_this_month ?? stats.new_customers),
  };

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Customer Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['#', 'Customer Name', 'Phone', 'Type', 'Shipments', 'Revenue', 'Paid'],
      ...topCustomers.map((r, i) => [
        i + 1,
        r.full_name ?? r.customer_name ?? r.name ?? '—',
        r.phone ?? r.phone_number ?? '—',
        r.customer_type ?? r.type ?? '—',
        safeNum(r.shipment_count ?? r.shipments ?? r.total_shipments),
        formatCurrency(r.revenue ?? r.total_revenue),
        formatCurrency(r.paid ?? r.amount_paid),
      ]),
    ];
    exportCsv(rows, 'customer-report');
  }, [topCustomers]);

  if (custQuery.isLoading) return <LoadingBox />;
  if (custQuery.isError) return <ErrorBanner message={getApiErrorMessage(custQuery.error)} />;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Users}        label="Total Customers"        value={kpi.total.toLocaleString()}    colorBg="bg-sky-600" />
        <KpiCard icon={UserCheck}    label="Regular Customers"      value={kpi.regular.toLocaleString()}  colorBg="bg-emerald-600" />
        <KpiCard icon={BarChart2}    label="One-Time Customers"     value={kpi.oneTime.toLocaleString()}  colorBg="bg-amber-500" />
        <KpiCard icon={TrendingUp}   label="New This Month"         value={kpi.newMonth.toLocaleString()} colorBg="bg-violet-600" />
      </div>

      {/* Top customers table */}
      <SectionCard
        title="Top Customers by Revenue"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <TableHead columns={['#', 'Customer Name', 'Phone', 'Type', 'Shipments', 'Revenue', 'Paid']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {topCustomers.length === 0
                ? <EmptyRow colSpan={7} />
                : topCustomers.map((r, i) => (
                  <tr key={r.customer_id ?? r.id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.full_name ?? r.customer_name ?? r.name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{r.phone ?? r.phone_number ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        (r.customer_type ?? r.type ?? '').toLowerCase() === 'regular'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {r.customer_type ?? r.type ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.shipment_count ?? r.shipments ?? r.total_shipments).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-sky-700 dark:text-sky-400">{formatCurrency(r.revenue ?? r.total_revenue)}</td>
                    <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{formatCurrency(r.paid ?? r.amount_paid)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 4: Employee Reports ─────────────────────────────────────────────────

function EmployeeTab({ params }) {
  const printRef = useRef(null);

  const empQuery = useQuery({
    queryKey: ['reports-employees', params],
    queryFn: async () => (await api.get('/api/reports/employees/stats', { params })).data,
    staleTime: 60_000,
  });

  const employees = getCollection(empQuery.data);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Employee Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['#', 'Employee Name', 'Role', 'Shipments Processed', 'Customers Registered', 'Revenue Generated'],
      ...employees.map((r, i) => [
        i + 1,
        r.employee_name ?? r.name ?? '—',
        r.role ?? r.role_name ?? '—',
        safeNum(r.shipments_processed ?? r.shipments),
        safeNum(r.customers_registered ?? r.customers),
        formatCurrency(r.revenue_generated ?? r.revenue),
      ]),
    ];
    exportCsv(rows, 'employee-report');
  }, [employees]);

  if (empQuery.isLoading) return <LoadingBox />;
  if (empQuery.isError) return <ErrorBanner message={getApiErrorMessage(empQuery.error)} />;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={UserCheck}  label="Total Employees"        value={employees.length.toLocaleString()}  colorBg="bg-sky-600" />
        <KpiCard icon={Package}    label="Total Shipments Handled" value={employees.reduce((s, r) => s + safeNum(r.shipments_processed ?? r.shipments), 0).toLocaleString()} colorBg="bg-emerald-600" />
        <KpiCard icon={TrendingUp} label="Total Revenue Generated" value={formatCurrency(employees.reduce((s, r) => s + safeNum(r.revenue_generated ?? r.revenue), 0))} colorBg="bg-violet-600" />
      </div>

      <SectionCard
        title="Employee Performance"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <TableHead columns={['#', 'Employee Name', 'Role', 'Shipments Processed', 'Customers Registered', 'Revenue Generated']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {employees.length === 0
                ? <EmptyRow colSpan={6} />
                : employees.map((r, i) => (
                  <tr key={r.employee_id ?? r.id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.employee_name ?? r.name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                        {r.role ?? r.role_name ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.shipments_processed ?? r.shipments).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.customers_registered ?? r.customers).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-sky-700 dark:text-sky-400">{formatCurrency(r.revenue_generated ?? r.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 5: Transport Provider Reports ──────────────────────────────────────

function ProviderTab({ params }) {
  const printRef = useRef(null);

  const revQuery = useQuery({
    queryKey: ['reports-provider-revenue', params],
    queryFn: async () => (await api.get('/api/reports/revenue/by-provider', { params })).data,
    staleTime: 60_000,
  });

  const expQuery = useQuery({
    queryKey: ['reports-provider-expenses', params],
    queryFn: async () => (await api.get('/api/reports/expenses/by-provider', { params })).data,
    staleTime: 60_000,
  });

  const revRows = getCollection(revQuery.data);
  const expRows = getCollection(expQuery.data);

  const merged = useMemo(() => {
    const map = new Map();
    revRows.forEach((r) => {
      map.set(r.provider_id, {
        provider_id: r.provider_id,
        provider_name: r.provider_name,
        entity_type: r.entity_type,
        shipments: safeNum(r.total_shipments),
        revenue: safeNum(r.revenue),
        expenses: 0,
      });
    });
    expRows.forEach((r) => {
      const existing = map.get(r.provider_id) || {
        provider_id: r.provider_id,
        provider_name: r.provider_name,
        entity_type: r.entity_type,
        shipments: 0,
        revenue: 0,
        expenses: 0,
      };
      existing.expenses = safeNum(r.expenses);
      map.set(r.provider_id, existing);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, profit: r.revenue - r.expenses }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [revRows, expRows]);

  const chartData = merged.map((r) => ({ name: r.provider_name, revenue: r.revenue, expenses: r.expenses }));

  const isLoading = revQuery.isLoading || expQuery.isLoading;
  const error = revQuery.isError ? getApiErrorMessage(revQuery.error)
    : expQuery.isError ? getApiErrorMessage(expQuery.error) : null;

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Transport Provider Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['Provider', 'Entity Type', 'Shipments', 'Revenue', 'Expenses', 'Profit'],
      ...merged.map((r) => [
        r.provider_name, r.entity_type === 'individual' ? 'Individual' : 'Company',
        safeNum(r.shipments), formatCurrency(r.revenue), formatCurrency(r.expenses), formatCurrency(r.profit),
      ]),
    ];
    exportCsv(rows, 'transport-provider-report');
  }, [merged]);

  if (isLoading) return <LoadingBox />;
  if (error) return <ErrorBanner message={error} />;

  const totalRevenue = merged.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = merged.reduce((s, r) => s + r.expenses, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard icon={TrendingUp}  label="Revenue via Providers"  value={formatCurrency(totalRevenue)}                  colorBg="bg-emerald-600" />
        <KpiCard icon={ArrowUpDown} label="Expenses to Providers"  value={formatCurrency(totalExpenses)}                 colorBg="bg-rose-600" />
        <KpiCard icon={DollarSign}  label="Net Profit"             value={formatCurrency(totalRevenue - totalExpenses)}  colorBg={(totalRevenue - totalExpenses) >= 0 ? 'bg-sky-600' : 'bg-orange-600'} />
      </div>

      <ChartCard title="Revenue & Expenses by Transport Provider">
        <div className="h-64">
          {chartData.length === 0
            ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
            : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatAxisCurrency} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue"  name="Revenue"  fill={BAR_COLORS.secondary} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill={BAR_COLORS.danger}    radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </ChartCard>

      <SectionCard
        title="Transport Provider Performance"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <TableHead columns={['Provider', 'Entity Type', 'Shipments', 'Revenue', 'Expenses', 'Profit']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {merged.length === 0
                ? <EmptyRow colSpan={6} />
                : merged.map((r, i) => (
                  <tr key={r.provider_id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.provider_name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.entity_type === 'individual'
                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {r.entity_type === 'individual' ? 'Individual' : 'Company'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.shipments).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{formatCurrency(r.revenue)}</td>
                    <td className="px-5 py-3.5 text-rose-700 dark:text-rose-400">{formatCurrency(r.expenses)}</td>
                    <td className={`px-5 py-3.5 font-semibold ${r.profit >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {formatCurrency(r.profit)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 6: Trip Reports ─────────────────────────────────────────────────────

function TripsTab({ params }) {
  const printRef = useRef(null);

  const revQuery = useQuery({
    queryKey: ['reports-trip-revenue', params],
    queryFn: async () => (await api.get('/api/reports/revenue/by-trip', { params })).data,
    staleTime: 60_000,
  });

  const expQuery = useQuery({
    queryKey: ['reports-trip-expenses', params],
    queryFn: async () => (await api.get('/api/reports/expenses/by-trip', { params })).data,
    staleTime: 60_000,
  });

  const revRows = getCollection(revQuery.data);
  const expRows = getCollection(expQuery.data);

  const merged = useMemo(() => {
    const expByTrip = new Map(expRows.map((r) => [r.trip_id, safeNum(r.expenses)]));
    return revRows.map((r) => {
      const expenses = expByTrip.get(r.trip_id) || 0;
      const revenue = safeNum(r.revenue);
      return {
        trip_id: r.trip_id,
        trip_no: r.trip_no,
        trip_date: r.trip_date,
        status: r.status,
        provider_name: r.provider_name,
        route: r.route,
        shipments: safeNum(r.total_shipments),
        revenue,
        expenses,
        profit: revenue - expenses,
      };
    });
  }, [revRows, expRows]);

  const isLoading = revQuery.isLoading || expQuery.isLoading;
  const error = revQuery.isError ? getApiErrorMessage(revQuery.error)
    : expQuery.isError ? getApiErrorMessage(expQuery.error) : null;

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Trip Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['Trip', 'Date', 'Route', 'Provider', 'Status', 'Shipments', 'Revenue', 'Expenses', 'Profit'],
      ...merged.map((r) => [
        r.trip_no, formatDate(r.trip_date), r.route, r.provider_name, r.status,
        safeNum(r.shipments), formatCurrency(r.revenue), formatCurrency(r.expenses), formatCurrency(r.profit),
      ]),
    ];
    exportCsv(rows, 'trip-report');
  }, [merged]);

  if (isLoading) return <LoadingBox />;
  if (error) return <ErrorBanner message={error} />;

  const totalRevenue = merged.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = merged.reduce((s, r) => s + r.expenses, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard icon={TrendingUp}  label="Revenue per Trip"  value={formatCurrency(totalRevenue)}                 colorBg="bg-emerald-600" />
        <KpiCard icon={ArrowUpDown} label="Expenses per Trip" value={formatCurrency(totalExpenses)}                colorBg="bg-rose-600" />
        <KpiCard icon={DollarSign}  label="Net Profit"        value={formatCurrency(totalRevenue - totalExpenses)} colorBg={(totalRevenue - totalExpenses) >= 0 ? 'bg-sky-600' : 'bg-orange-600'} />
      </div>

      <SectionCard
        title="Revenue & Expenses per Trip"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <TableHead columns={['Trip', 'Date', 'Route', 'Provider', 'Status', 'Shipments', 'Revenue', 'Expenses', 'Profit']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {merged.length === 0
                ? <EmptyRow colSpan={9} />
                : merged.map((r, i) => (
                  <tr key={r.trip_id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.trip_no ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(r.trip_date)}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{r.route ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{r.provider_name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                        {r.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.shipments).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{formatCurrency(r.revenue)}</td>
                    <td className="px-5 py-3.5 text-rose-700 dark:text-rose-400">{formatCurrency(r.expenses)}</td>
                    <td className={`px-5 py-3.5 font-semibold ${r.profit >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {formatCurrency(r.profit)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── TAB 7: Financial Reports ─────────────────────────────────────────────────

function FinancialTab({ params }) {
  const printRef = useRef(null);

  const finQuery = useQuery({
    queryKey: ['reports-financial', params],
    queryFn: async () => (await api.get('/api/reports/financial', { params })).data,
    staleTime: 60_000,
  });

  const branchFinQuery = useQuery({
    queryKey: ['reports-branch-financial', params],
    queryFn: async () => (await api.get('/api/reports/branch-financial', { params })).data,
    staleTime: 60_000,
  });

  const categoryQuery = useQuery({
    queryKey: ['reports-expenses-category', params],
    queryFn: async () => (await api.get('/api/reports/expenses/by-category', { params })).data,
    staleTime: 60_000,
  });

  const outstandingQuery = useQuery({
    queryKey: ['reports-outstanding-balances', params],
    queryFn: async () => (await api.get('/api/reports/outstanding-balances', { params })).data,
    staleTime: 60_000,
  });

  const invoiceStatusQuery = useQuery({
    queryKey: ['reports-invoices-status', params],
    queryFn: async () => (await api.get('/api/reports/invoices-status', { params })).data,
    staleTime: 60_000,
  });

  const finRaw  = unwrap(finQuery.data);
  const summary = finRaw?.summary ?? finRaw?.totals ?? finRaw ?? {};
  const monthlyTrend     = useMemo(() => getCollection(finRaw?.monthly_trend ?? finRaw?.trend ?? finRaw?.monthly ?? finQuery.data), [finRaw, finQuery.data]);
  const branchFinRows    = getCollection(branchFinQuery.data);
  const categoryRows     = getCollection(categoryQuery.data);
  const outstandingRows  = getCollection(outstandingQuery.data);
  const invoiceStatusRows = getCollection(invoiceStatusQuery.data);

  const categoryChartData = categoryRows.map((r) => ({ name: r.category, expenses: safeNum(r.expenses) }));

  const INVOICE_STATUS_COLORS = {
    'Paid': BAR_COLORS.secondary,
    'Partial': BAR_COLORS.warning,
    'Balance remaining': BAR_COLORS.danger,
  };
  const invoicePieData = invoiceStatusRows.map((r) => ({
    name: r.payment_status,
    value: safeNum(r.invoice_count),
    amount: safeNum(r.total_amount),
  }));

  const kpi = {
    revenue:     safeNum(summary.total_revenue ?? summary.revenue),
    expenses:    safeNum(summary.total_expenses ?? summary.expenses),
    profit:      safeNum(summary.gross_profit ?? summary.profit) || (safeNum(summary.total_revenue ?? summary.revenue) - safeNum(summary.total_expenses ?? summary.expenses)),
    outstanding: safeNum(summary.outstanding_balance ?? summary.outstanding),
  };

  const trendData = monthlyTrend.map((r) => ({
    month:    r.month,
    revenue:  safeNum(r.revenue),
    expenses: safeNum(r.expenses),
    profit:   safeNum(r.profit),
  }));

  const branchChartData = branchFinRows.map((r) => ({
    name:     r.branch_name ?? r.branch ?? 'Unknown',
    revenue:  safeNum(r.revenue),
    expenses: safeNum(r.expenses),
    profit:   safeNum(r.profit),
  }));

  const isLoading = finQuery.isLoading || branchFinQuery.isLoading
    || categoryQuery.isLoading || outstandingQuery.isLoading || invoiceStatusQuery.isLoading;
  const error = finQuery.isError ? getApiErrorMessage(finQuery.error)
    : branchFinQuery.isError ? getApiErrorMessage(branchFinQuery.error)
    : categoryQuery.isError ? getApiErrorMessage(categoryQuery.error)
    : outstandingQuery.isError ? getApiErrorMessage(outstandingQuery.error)
    : invoiceStatusQuery.isError ? getApiErrorMessage(invoiceStatusQuery.error) : null;

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    printSection(printRef.current.innerHTML, 'Financial Report');
  }, []);

  const handleExport = useCallback(() => {
    const rows = [
      ['Month', 'Revenue', 'Expenses', 'Profit'],
      ...trendData.map((r) => [r.month, formatCurrency(r.revenue), formatCurrency(r.expenses), formatCurrency(r.profit)]),
    ];
    exportCsv(rows, 'financial-report');
  }, [trendData]);

  if (isLoading) return <LoadingBox />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TrendingUp}  label="Total Revenue"     value={formatCurrency(kpi.revenue)}     colorBg="bg-emerald-600" />
        <KpiCard icon={ArrowUpDown} label="Total Expenses"    value={formatCurrency(kpi.expenses)}    colorBg="bg-rose-600" />
        <KpiCard icon={DollarSign}  label="Gross Profit"      value={formatCurrency(kpi.profit)}      colorBg={kpi.profit >= 0 ? 'bg-sky-600' : 'bg-orange-600'} />
        <KpiCard icon={Wallet}      label="Outstanding"       value={formatCurrency(kpi.outstanding)} colorBg="bg-amber-500" />
      </div>

      {/* Charts */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Revenue vs Expenses by Month">
          <div className="h-60">
            {trendData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No monthly data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatAxisCurrency} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue"  name="Revenue"  fill={BAR_COLORS.secondary} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="expenses" name="Expenses" fill={BAR_COLORS.danger}     radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="profit"   name="Profit"   fill={BAR_COLORS.primary}    radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>

        <ChartCard title="Branch Financial Performance">
          <div className="h-60">
            {branchChartData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No branch data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatAxisCurrency} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue"  name="Revenue"  fill={BAR_COLORS.secondary} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="expenses" name="Expenses" fill={BAR_COLORS.danger}     radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="profit"   name="Profit"   fill={BAR_COLORS.primary}    radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>
      </div>

      {/* Monthly P&L table */}
      <SectionCard
        title="Monthly P&L Breakdown"
        printRef={printRef}
        actions={<><PrintBtn onClick={handlePrint} /><CsvBtn onClick={handleExport} /></>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <TableHead columns={['Month', 'Revenue', 'Expenses', 'Gross Profit', 'Margin']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {trendData.length === 0
                ? <EmptyRow colSpan={5} />
                : trendData.map((r, i) => {
                  const margin = r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={r.month ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.month ?? '—'}</td>
                      <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400">{formatCurrency(r.revenue)}</td>
                      <td className="px-5 py-3.5 text-rose-700 dark:text-rose-400">{formatCurrency(r.expenses)}</td>
                      <td className={`px-5 py-3.5 font-semibold ${r.profit >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {formatCurrency(r.profit)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{margin}%</td>
                    </tr>
                  );
                })}
            </tbody>
            {trendData.length > 0 && (() => {
              const totRev  = trendData.reduce((s, r) => s + r.revenue, 0);
              const totExp  = trendData.reduce((s, r) => s + r.expenses, 0);
              const totProf = trendData.reduce((s, r) => s + r.profit, 0);
              const totMarg = totRev > 0 ? ((totProf / totRev) * 100).toFixed(1) : '0.0';
              return (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
                    <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Totals</td>
                    <td className="px-5 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(totRev)}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-rose-700 dark:text-rose-400">{formatCurrency(totExp)}</td>
                    <td className={`px-5 py-3 text-sm font-semibold ${totProf >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-rose-700 dark:text-rose-400'}`}>{formatCurrency(totProf)}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{totMarg}%</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </SectionCard>

      {/* Expenses by Category + Paid vs Unpaid Invoices */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Expenses by Category">
          <div className="h-60">
            {categoryChartData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="expenses" name="Expenses" fill={BAR_COLORS.danger} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>

        <ChartCard title="Paid vs Unpaid Invoices">
          <div className="h-60">
            {invoicePieData.length === 0
              ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={invoicePieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {invoicePieData.map((entry) => (
                        <Cell key={entry.name} fill={INVOICE_STATUS_COLORS[entry.name] || BAR_COLORS.gray} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, item) => [`${value} invoice(s) · ${formatCurrency(item?.payload?.amount)}`, item?.payload?.name]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
        </ChartCard>
      </div>

      {/* Outstanding balances by customer */}
      <SectionCard title="Outstanding Customer Balances">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <TableHead columns={['Customer', 'Phone', 'Type', 'Shipments', 'Outstanding Balance']} />
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
              {outstandingRows.length === 0
                ? <EmptyRow colSpan={5} message="No outstanding balances." />
                : outstandingRows.map((r, i) => (
                  <tr key={r.customer_id ?? i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.full_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{r.phone ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 capitalize">{r.customer_type ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{safeNum(r.shipment_count).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(r.outstanding_balance)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeTab,  setActiveTab]  = useState('cargo');
  const [preset,     setPreset]     = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [branchId,   setBranchId]   = useState('');

  // Branches list for the dropdown
  const branchesQuery = useQuery({
    queryKey: ['branches-for-reports'],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60_000,
  });
  const branches = getCollection(branchesQuery.data);

  // Build query params from the filter bar
  const params = useMemo(() => {
    const { from, to } = preset === 'custom'
      ? { from: customFrom, to: customTo }
      : getPresetDates(preset);
    const q = { period: preset };
    if (from) q.from = from;
    if (to)   q.to   = to;
    if (branchId) q.branch_id = branchId;
    return q;
  }, [preset, customFrom, customTo, branchId]);

  const handlePreset = useCallback((p) => {
    setPreset(p);
    if (p !== 'custom') {
      setCustomFrom('');
      setCustomTo('');
    }
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Comprehensive cargo, shipment, customer, employee, and financial analytics."
      />

      {/* ── Period Filter Bar ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePreset(p.value)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  preset === p.value
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={selectFieldClass}
                style={{ width: '160px' }}
                placeholder="From"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className={selectFieldClass}
                style={{ width: '160px' }}
                placeholder="To"
              />
            </div>
          )}

          {/* Branch selector */}
          <div className="ml-auto min-w-[180px]">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={selectFieldClass}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Tab Navigation ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === id
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Active Tab Content ─────────────────────────────────────────────── */}
      {activeTab === 'cargo'     && <CargoTab     params={params} />}
      {activeTab === 'shipment'  && <ShipmentTab  params={params} />}
      {activeTab === 'customer'  && <CustomerTab  params={params} />}
      {activeTab === 'employee'  && <EmployeeTab  params={params} />}
      {activeTab === 'provider'  && <ProviderTab  params={params} />}
      {activeTab === 'trips'     && <TripsTab     params={params} />}
      {activeTab === 'financial' && <FinancialTab params={params} />}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  Eye,
  MoreVertical,
  Plus,
  Save,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getAllCargo, updateCargo } from '../../api/cargo.api';
import Spinner from '../../components/ui/Spinner';
import useAuthStore from '../../store/authStore';
import { ROLES } from '../../config/rbac';
import {
  buildBranchTree,
  filterByBranchVisibility,
  findBranchRootId,
  getCollection,
  getMeta,
  mapBranchOptions,
  matchesPaymentStatusFilter,
  normalizeText,
  resolveBranchRoot,
  resolvePaymentStatus,
  toApiPaymentStatusFilter
} from './cargo.utils';

const DEFAULT_LIMIT = 10;

const STATUS_TABS = [
  { label: 'All Shipping', value: '' },
  { label: 'Active', value: 'Partial' },
  { label: 'Delivered', value: 'Paid' },
  { label: 'Last Mile', value: 'last_mile' },
  { label: 'Delayed', value: 'delayed' },
  { label: 'Awaiting Pickup', value: 'awaiting_pickup' }
];

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
}

function buildQueryParams(searchParams) {
  return {
    page: parsePage(searchParams.get('page')),
    limit: parseLimit(searchParams.get('limit')),
    tracking_number: searchParams.get('tracking_number') || '',
    shipment_date: searchParams.get('shipment_date') || '',
    sender_name: searchParams.get('sender_name') || '',
    receiver_name: searchParams.get('receiver_name') || '',
    payment_status: searchParams.get('payment_status') || '',
    from_branch_id: searchParams.get('from_branch_id') || '',
    to_branch_id: searchParams.get('to_branch_id') || ''
  };
}

function matchesBranch(branchValue, selectedValue) {
  return !selectedValue || Number(branchValue) === Number(selectedValue);
}

function formatShortDate(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function ShippingStatusBadge({ status }) {
  const map = {
    Paid: { label: 'Delivered', cls: 'bg-green-100 text-green-700' },
    Partial: { label: 'Last Mile', cls: 'bg-purple-100 text-purple-700' },
    'Balance remaining': { label: 'Delayed', cls: 'bg-red-100 text-red-700' },
    last_mile: { label: 'Last Mile', cls: 'bg-purple-100 text-purple-700' },
    delayed: { label: 'Delayed', cls: 'bg-red-100 text-red-700' },
    awaiting_pickup: { label: 'Awaiting Pickup', cls: 'bg-amber-100 text-amber-700' }
  };

  const entry = map[status] || { label: status || '--', cls: 'bg-slate-100 text-slate-600' };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

// ─── Three-dot Action Menu ─────────────────────────────────────────────────────
function ActionMenu({ onView, onEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onView(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" /> View
          </button>
          <button
            type="button"
            onClick={() => { onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Edit2 className="h-4 w-4" /> Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Numbered Pagination ───────────────────────────────────────────────────────
function NumberedPagination({ page, totalPages, onPageChange }) {
  const MAX = 5;
  let start = Math.max(1, page - Math.floor(MAX / 2));
  const end = Math.min(totalPages, start + MAX - 1);
  if (end - start + 1 < MAX) start = Math.max(1, end - MAX + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-3">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
            p === page
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────
function CargoEditModal({ cargo: initialCargo, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    tracking_number:              initialCargo?.tracking_number              ?? '',
    shipment_date:            initialCargo?.shipment_date            ? String(initialCargo.shipment_date).slice(0, 10) : '',
    fly_name:                 initialCargo?.fly_name                 ?? '',
    fly_awb_no:               initialCargo?.fly_awb_no              ?? '',
    weight:                   initialCargo?.weight                   ?? '',
    rate_per_kg:              initialCargo?.rate_per_kg              ?? '',
    extra_charges:            initialCargo?.extra_charges            ?? '',
    payment_received_amount:  initialCargo?.payment_received_amount  ?? '',
    pcs:                      initialCargo?.pcs                      ?? '',
    description:              initialCargo?.description              ?? '',
    mark:                     initialCargo?.mark                     ?? ''
  });

  const update = useMutation({
    mutationFn: () => updateCargo(initialCargo.cargo_id, {
      ...form,
      weight:                  form.weight                  !== '' ? Number(form.weight)                  : undefined,
      rate_per_kg:             form.rate_per_kg             !== '' ? Number(form.rate_per_kg)             : undefined,
      extra_charges:           form.extra_charges           !== '' ? Number(form.extra_charges)           : undefined,
      payment_received_amount: form.payment_received_amount !== '' ? Number(form.payment_received_amount) : undefined,
      pcs:                     form.pcs                     !== '' ? Number(form.pcs)                     : undefined
    }),
    onSuccess: () => {
      toast.success('Cargo updated');
      queryClient.invalidateQueries({ queryKey: ['cargo-list'] });
      onClose();
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to update');
    }
  });

  function field(label, key, type = 'text') {
    return (
      <label key={key} className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Shipment</h2>
            <p className="text-sm text-slate-500">{initialCargo?.tracking_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('AWB No', 'tracking_number')}
          {field('Shipment Date', 'shipment_date', 'date')}
          {field('Flight Name', 'fly_name')}
          {field('Flight AWB No', 'fly_awb_no')}
          {field('Weight (kg)', 'weight', 'number')}
          {field('Rate per kg', 'rate_per_kg', 'number')}
          {field('Extra Charges', 'extra_charges', 'number')}
          {field('Payment Received', 'payment_received_amount', 'number')}
          {field('Pieces', 'pcs', 'number')}
          {field('Mark', 'mark')}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => update.mutate()}
            disabled={update.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function CargoListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editCargo, setEditCargo] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const activeBranchId = useAuthStore((state) => state.branchId);
  const activeBranchName = useAuthStore((state) => state.branchName);
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);
  const isAdmin = roleId === ROLES.ADMIN;
  const branchRoot = useMemo(() => resolveBranchRoot(activeBranchName), [activeBranchName]);
  const filters = buildQueryParams(searchParams);
  const activeTab = filters.payment_status;

  const branchesQuery = useQuery({
    queryKey: ['cargo-list-branches'],
    queryFn: async () => {
      try {
        return (await api.get('/api/branches')).data;
      } catch {
        return (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data;
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-list', filters],
    queryFn: async () =>
      (
        await getAllCargo({
          page: filters.page,
          limit: filters.limit,
          tracking_number: filters.tracking_number || undefined,
          shipment_date: filters.shipment_date || undefined,
          sender_name: filters.sender_name || undefined,
          receiver_name: filters.receiver_name || undefined,
          payment_status: toApiPaymentStatusFilter(filters.payment_status),
          from_branch_id: filters.from_branch_id || undefined,
          to_branch_id: filters.to_branch_id || undefined
        })
      ).data,
    placeholderData: (prev) => prev
  });

  const branches = useMemo(() => mapBranchOptions(getCollection(branchesQuery.data)), [branchesQuery.data]);
  const branchLookup = useMemo(
    () => new Map(branches.map((b) => [Number(b.branch_id), b.branch_name])),
    [branches]
  );
  const dubaiRootId = useMemo(() => findBranchRootId(branches, 'dubai'), [branches]);
  const mogadishuRootId = useMemo(() => findBranchRootId(branches, 'mogadishu'), [branches]);

  const meta = getMeta(cargoQuery.data);

  const cargo = useMemo(() => {
    const rows = getCollection(cargoQuery.data);
    const visible = filterByBranchVisibility(rows, activeBranchId);

    return visible.filter((s) => {
      const shipDate = s?.shipment_date ? String(s.shipment_date).slice(0, 10) : '';
      return (
        (!filters.tracking_number || normalizeText(s?.tracking_number).includes(normalizeText(filters.tracking_number)))
        && (!filters.shipment_date || shipDate === filters.shipment_date)
        && (!filters.sender_name || normalizeText(s?.sender_name).includes(normalizeText(filters.sender_name)))
        && (!filters.receiver_name || normalizeText(s?.receiver_name).includes(normalizeText(filters.receiver_name)))
        && matchesPaymentStatusFilter(s, filters.payment_status)
        && matchesBranch(s?.from_branch_id, filters.from_branch_id)
        && matchesBranch(s?.to_branch_id, filters.to_branch_id)
      );
    });
  }, [activeBranchId, cargoQuery.data, filters]);

  const totalPages = Math.max(1, Math.ceil((meta.total || cargo.length) / filters.limit));

  function updateFilters(next) {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === '' || value == null) params.delete(key);
      else params.set(key, String(value));
    });
    if (!Object.prototype.hasOwnProperty.call(next, 'page')) params.set('page', '1');
    params.set('limit', String(filters.limit));
    setSearchParams(params);
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === cargo.length && cargo.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cargo.map((s) => s.cargo_id)));
    }
  }

  function exportCSV() {
    if (!cargo.length) { toast.error('No data to export'); return; }
    const headers = ['Tracking ID', 'Customer Name', 'Departure', 'D. Date', 'Arrival', 'A. Date', 'Product Owner', 'Weight', 'Status'];
    const rows = cargo.map((s) => [
      s.tracking_number || '',
      s.sender_name || '',
      s.from_branch_name || branchLookup.get(Number(s.from_branch_id)) || '',
      formatShortDate(s.shipment_date),
      s.to_branch_name || branchLookup.get(Number(s.to_branch_id)) || '',
      formatShortDate(s.updated_at || s.delivery_date),
      s.receiver_name || '',
      s.weight != null ? `${s.weight} kg` : '',
      resolvePaymentStatus(s) || ''
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipments.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const allSelected = cargo.length > 0 && selected.size === cargo.length;
  const isLoading = cargoQuery.isLoading || (isAdmin && branchesQuery.isLoading);

  return (
    <>
      {editCargo && <CargoEditModal cargo={editCargo} onClose={() => setEditCargo(null)} />}

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Shipping List</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exportCSV}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              Export as CSV
            </button>
            <button
              type="button"
              onClick={() => navigate('/cargo/new')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add New Shipment
            </button>
          </div>
        </div>

        {/* ── Main Card ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">

          {/* ── Tabs ── */}
          <div className="flex items-center justify-between overflow-x-auto border-b border-slate-100 px-4 dark:border-slate-800">
            <div className="flex shrink-0">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => updateFilters({ payment_status: tab.value })}
                  className={`whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-medium transition -mb-px ${
                    activeTab === tab.value
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="shrink-0 py-2 pl-4">
              <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <option>Sort by Latest</option>
                <option>Sort by Oldest</option>
              </select>
            </div>
          </div>

          {/* ── Table ── */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="w-10 px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      {[
                        'Tracking ID', 'Customer Name', 'Departure', 'D. Date',
                        'Arrival', 'A. Date', 'Product Owner', 'Weight', 'Status', 'Action'
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cargo.length > 0 ? (
                      cargo.map((shipment) => {
                        const paymentStatus = resolvePaymentStatus(shipment);
                        const isChecked = selected.has(shipment.cargo_id);
                        return (
                          <tr
                            key={shipment.cargo_id}
                            className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${isChecked ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                          >
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRow(shipment.cargo_id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            {/* Tracking ID with copy */}
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/cargo/${shipment.cargo_id}`)}
                                  className="text-sm font-medium text-slate-800 transition hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
                                >
                                  {shipment.tracking_number || '--'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(shipment.tracking_number || '');
                                    toast.success('Copied!');
                                  }}
                                  className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                                  aria-label="Copy tracking ID"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                            {/* Customer Name */}
                            <td className="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {shipment.sender_name || '--'}
                            </td>
                            {/* Departure */}
                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {shipment.from_branch_name || branchLookup.get(Number(shipment.from_branch_id)) || '--'}
                            </td>
                            {/* D. Date */}
                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {formatShortDate(shipment.shipment_date)}
                            </td>
                            {/* Arrival */}
                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {shipment.to_branch_name || branchLookup.get(Number(shipment.to_branch_id)) || '--'}
                            </td>
                            {/* A. Date */}
                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {formatShortDate(shipment.updated_at || shipment.delivery_date || shipment.arrival_date)}
                            </td>
                            {/* Product Owner */}
                            <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">
                              {shipment.receiver_name || '--'}
                            </td>
                            {/* Weight */}
                            <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-300">
                              {shipment.weight != null ? `${shipment.weight} kg` : '--'}
                            </td>
                            {/* Status */}
                            <td className="px-4 py-4">
                              <ShippingStatusBadge status={paymentStatus} />
                            </td>
                            {/* Action */}
                            <td className="px-4 py-4">
                              <ActionMenu
                                onView={() => navigate(`/cargo/${shipment.cargo_id}`)}
                                onEdit={() => setEditCargo(shipment)}
                              />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                          No records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Numbered Pagination ── */}
              <NumberedPagination
                page={meta.page || filters.page}
                totalPages={totalPages}
                onPageChange={(page) => updateFilters({ page })}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

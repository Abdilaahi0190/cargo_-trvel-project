import { useMemo, useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowRight, Box, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Edit2, MapPin, MoreHorizontal, Package, Plus, Route, Trash2,
  Truck, XCircle, Clock, FileText, Search
} from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import Spinner from '../../components/ui/Spinner';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  planned:    { label: 'Planned',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',     dot: 'bg-blue-500'    },
  ongoing:    { label: 'Ongoing',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300', dot: 'bg-amber-500'   },
  completed:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', dot: 'bg-emerald-500' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',         dot: 'bg-red-500'     },
};

function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const cfg = STATUS_CFG[key] || { label: status || 'Unknown', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── 3-dot Row Menu ────────────────────────────────────────────────────────────
function TripMenu({ trip, onEdit, onAssign, onComplete, onCancel, onDelete, isPending }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const status = String(trip.status || '').toLowerCase();
  const canManage = !['completed', 'cancelled'].includes(status);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(p => !p)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {canManage && (
            <>
              <button type="button" onClick={() => { onEdit(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                <Edit2 size={13} className="text-slate-400" />Edit Trip
              </button>
              <button type="button" onClick={() => { onAssign(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                <Package size={13} className="text-slate-400" />Assign Cargo
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button type="button" onClick={() => { onComplete(); setOpen(false); }} disabled={isPending}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                <CheckCircle2 size={13} />Mark Complete
              </button>
              <button type="button" onClick={() => { onCancel(); setOpen(false); }} disabled={isPending}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20">
                <XCircle size={13} />Cancel Trip
              </button>
            </>
          )}
          {status === 'planned' && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button type="button" onClick={() => { onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                <Trash2 size={13} />Delete Trip
              </button>
            </>
          )}
          {!canManage && status !== 'planned' && (
            <p className="px-4 py-3 text-xs text-slate-400">No actions available</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trip Form (used for both Create and Edit) ─────────────────────────────────
function TripForm({ initialValues = {}, branches, providers, onSubmit, onClose, isPending, submitLabel }) {
  // Derive initial from/to from route data if editing
  const [form, setForm] = useState({
    from_branch_id:        initialValues.from_branch_id ?? '',
    to_branch_id:          initialValues.to_branch_id   ?? '',
    transport_provider_id: initialValues.transport_provider_id ?? initialValues.provider_id ?? '',
    departure_date:        initialValues.departure_date ?? (initialValues.trip_date ? String(initialValues.trip_date).slice(0, 10) : ''),
    departure_time:        initialValues.departure_time ? String(initialValues.departure_time).slice(0, 5) : '08:00',
    arrival_time:          initialValues.arrival_time   ? String(initialValues.arrival_time).slice(0, 5)   : '18:00',
    notes:                 initialValues.notes ?? '',
  });

  function inp(key) { return e => setForm(p => ({ ...p, [key]: e.target.value })); }

  // Destinations exclude the selected origin
  const destinationBranches = branches.filter(b => String(b.branch_id) !== String(form.from_branch_id));

  // Clear to_branch_id if it equals the newly selected from_branch_id
  function handleFromChange(e) {
    const val = e.target.value;
    setForm(p => ({
      ...p,
      from_branch_id: val,
      to_branch_id: String(p.to_branch_id) === val ? '' : p.to_branch_id
    }));
  }

  const sameError = form.from_branch_id && form.to_branch_id &&
    String(form.from_branch_id) === String(form.to_branch_id);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.from_branch_id || !form.to_branch_id) {
      toast.error('Origin Branch and Destination Branch are required');
      return;
    }
    if (String(form.from_branch_id) === String(form.to_branch_id)) {
      toast.error('Origin and Destination branches must be different.');
      return;
    }
    if (!form.transport_provider_id || !form.departure_date) {
      toast.error('Provider and departure date are required');
      return;
    }
    onSubmit({
      from_branch_id:        Number(form.from_branch_id),
      to_branch_id:          Number(form.to_branch_id),
      transport_provider_id: Number(form.transport_provider_id),
      departure_date:        form.departure_date,
      departure_time:        form.departure_time || '08:00',
      arrival_time:          form.arrival_time   || '18:00',
      notes:                 form.notes.trim() || undefined,
    });
  }

  const fieldCls = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500';
  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-1">

      {/* Route: two branch selectors */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Route</p>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Origin Branch</label>
            <select required value={form.from_branch_id} onChange={handleFromChange} className={fieldCls}>
              <option value="">Select origin…</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>

          {/* Arrow divider */}
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-slate-600" />
            <ArrowRight size={14} className="flex-shrink-0 text-slate-400" />
            <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-slate-600" />
          </div>

          <div>
            <label className={labelCls}>Destination Branch</label>
            <select required value={form.to_branch_id} onChange={inp('to_branch_id')} className={fieldCls}
              disabled={!form.from_branch_id}>
              <option value="">Select destination…</option>
              {destinationBranches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error if same branch selected */}
        {sameError && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <XCircle size={12} />
            Origin and Destination branches must be different.
          </p>
        )}

        {/* Preview */}
        {form.from_branch_id && form.to_branch_id && !sameError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
            <MapPin size={12} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {branches.find(b => String(b.branch_id) === String(form.from_branch_id))?.branch_name}
              {' → '}
              {branches.find(b => String(b.branch_id) === String(form.to_branch_id))?.branch_name}
            </span>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Transport Provider</label>
        <select required value={form.transport_provider_id} onChange={inp('transport_provider_id')} className={fieldCls}>
          <option value="">Select provider…</option>
          {providers.map(p => (
            <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Departure Date</label>
        <input type="date" required value={form.departure_date} onChange={inp('departure_date')} className={fieldCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Departure Time</label>
          <input type="time" value={form.departure_time} onChange={inp('departure_time')} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Arrival Time</label>
          <input type="time" value={form.arrival_time} onChange={inp('arrival_time')} className={fieldCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <textarea rows={2} value={form.notes} onChange={inp('notes')}
          placeholder="Any notes about this trip…"
          className={`${fieldCls} resize-none`} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button type="submit" disabled={isPending || sameError}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
          {isPending ? <Spinner className="h-4 w-4" /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Slide-in Drawer ───────────────────────────────────────────────────────────
function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition">
            <XCircle size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TripsPage() {
  const queryClient = useQueryClient();
  const [page,           setPage]           = useState(1);
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [drawerMode,     setDrawerMode]     = useState(null); // 'create' | 'edit' | 'assign'
  const [activeTrip,     setActiveTrip]     = useState(null);
  const [selectedCargo,  setSelectedCargo]  = useState([]);
  const [deleteTarget,   setDeleteTarget]   = useState(null);

  const tripsQuery = useQuery({
    queryKey: ['trips-list', page, statusFilter],
    queryFn: () => api.get('/api/trips', {
      params: { page, limit: PAGE_LIMIT, status: statusFilter || undefined }
    }).then(r => r.data),
    staleTime: 30 * 1000
  });

  const branchesQuery = useQuery({
    queryKey: ['branches-all'],
    queryFn: () => api.get('/api/v1/setup/branches', { params: { limit: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000
  });

  const providersQuery = useQuery({
    queryKey: ['transport-providers'],
    queryFn: () => api.get('/api/v1/transport/providers', { params: { limit: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000
  });

  const pendingCargoQuery = useQuery({
    queryKey: ['pending-cargo-for-trips'],
    queryFn: () => api.get('/api/cargo', { params: { page: 1, limit: 200, status: 'Pending' } }).then(r => r.data),
    enabled: drawerMode === 'assign',
    staleTime: 30 * 1000
  });

  const trips        = getCollection(tripsQuery.data);
  const branches     = getCollection(branchesQuery.data);
  const providers    = getCollection(providersQuery.data);
  const pendingCargo = getCollection(pendingCargoQuery.data);
  const meta         = getMeta(tripsQuery.data);

  function refresh() { queryClient.invalidateQueries({ queryKey: ['trips-list'] }); }
  function closeDrawer() { setDrawerMode(null); setActiveTrip(null); setSelectedCargo([]); }

  const createMut = useMutation({
    mutationFn: p => api.post('/api/trips', p),
    onSuccess: () => { toast.success('Trip created'); refresh(); closeDrawer(); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to create trip'))
  });

  const editMut = useMutation({
    mutationFn: ({ id, ...p }) => api.put(`/api/trips/${id}`, p),
    onSuccess: () => { toast.success('Trip updated'); refresh(); closeDrawer(); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to update trip'))
  });

  const assignMut = useMutation({
    mutationFn: ({ tripId, cargo_ids }) => api.post(`/api/trips/${tripId}/cargo`, { cargo_ids }),
    onSuccess: () => { toast.success('Cargo assigned'); refresh(); closeDrawer(); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to assign cargo'))
  });

  const completeMut = useMutation({
    mutationFn: id => api.put(`/api/trips/${id}/complete`),
    onSuccess: () => { toast.success('Trip completed'); refresh(); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed'))
  });

  const cancelMut = useMutation({
    mutationFn: id => api.put(`/api/trips/${id}/cancel`),
    onSuccess: () => { toast.success('Trip cancelled'); refresh(); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed'))
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/api/trips/${id}`),
    onSuccess: () => { toast.success('Trip deleted'); refresh(); setDeleteTarget(null); },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to delete trip'))
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return trips;
    const q = search.toLowerCase();
    return trips.filter(t =>
      (t.trip_no || `TRP${t.trip_id}`).toLowerCase().includes(q) ||
      (t.route || '').toLowerCase().includes(q) ||
      (t.provider_name || '').toLowerCase().includes(q)
    );
  }, [trips, search]);

  // Summary counts
  const counts = useMemo(() => {
    return trips.reduce((acc, t) => {
      const s = String(t.status || 'planned').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
  }, [trips]);

  const anyPending = completeMut.isPending || cancelMut.isPending;

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Trips</h1>
          <p className="text-sm text-slate-400">Schedule routes and assign cargo shipments</p>
        </div>
        <button type="button" onClick={() => { setActiveTrip(null); setDrawerMode('create'); }}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
          <Plus size={15} />New Trip
        </button>
      </div>

      {/* Stat pills */}
      {trips.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => counts[key] ? (
            <button key={key} type="button"
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === key ? cfg.cls + ' ring-2 ring-offset-1' : cfg.cls
              }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
              {counts[key]} {cfg.label}
            </button>
          ) : null)}
          {statusFilter && (
            <button type="button" onClick={() => setStatusFilter('')}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 underline dark:text-slate-400">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">

        {/* Table toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Search size={13} className="text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search trips…"
              className="w-44 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} trip{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {tripsQuery.isLoading ? (
          <div className="flex items-center justify-center py-24"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Truck size={40} className="mb-3 text-slate-200 dark:text-slate-700" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No trips found</p>
            <p className="mt-1 text-sm text-slate-400">Create a new trip to get started</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Trip No', 'Route', 'Provider', 'Date & Time', 'Cargo', 'Status', ''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 dark:text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {filtered.map(trip => {
                    const status = String(trip.status || '').toLowerCase();
                    return (
                      <tr key={trip.trip_id} className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        {/* Trip No */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                              <Truck size={15} className="text-slate-500 dark:text-slate-400" />
                            </div>
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                              {trip.trip_no || `TRP${trip.trip_id}`}
                            </span>
                          </div>
                        </td>

                        {/* Route */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                            <MapPin size={12} className="flex-shrink-0 text-slate-400" />
                            <span className="max-w-[200px] truncate">{trip.route || '—'}</span>
                          </div>
                        </td>

                        {/* Provider */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                            <Route size={12} className="flex-shrink-0 text-slate-400" />
                            {trip.provider_name || '—'}
                          </div>
                        </td>

                        {/* Date & Time */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                            <CalendarDays size={12} className="text-slate-400" />
                            {trip.trip_date ? formatDate(trip.trip_date) : '—'}
                          </div>
                          {trip.departure_time && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                              <Clock size={10} />
                              {String(trip.departure_time).slice(0,5)}
                              {trip.arrival_time ? ` – ${String(trip.arrival_time).slice(0,5)}` : ''}
                            </div>
                          )}
                        </td>

                        {/* Cargo count */}
                        <td className="px-5 py-4">
                          <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Box size={11} />
                            {trip.cargo_count ?? 0}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <StatusBadge status={trip.status} />
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-4">
                          <TripMenu
                            trip={trip}
                            isPending={anyPending}
                            onEdit={() => { setActiveTrip(trip); setDrawerMode('edit'); }}
                            onAssign={() => { setActiveTrip(trip); setSelectedCargo([]); setDrawerMode('assign'); }}
                            onComplete={() => completeMut.mutate(trip.trip_id)}
                            onCancel={() => cancelMut.mutate(trip.trip_id)}
                            onDelete={() => setDeleteTarget(trip)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {Number(meta.pages) > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <p className="text-xs text-slate-400">
                  Page {meta.page} of {meta.pages} · {meta.total} total
                </p>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="min-w-[60px] text-center text-sm font-medium text-slate-700 dark:text-slate-200">
                    {page} / {meta.pages}
                  </span>
                  <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= Number(meta.pages)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Drawer */}
      <Drawer open={drawerMode === 'create'} onClose={closeDrawer} title="New Trip">
        <TripForm
          branches={branches}
          providers={providers}
          onSubmit={p => createMut.mutate(p)}
          onClose={closeDrawer}
          isPending={createMut.isPending}
          submitLabel="Create Trip"
        />
      </Drawer>

      {/* Edit Drawer */}
      <Drawer open={drawerMode === 'edit' && Boolean(activeTrip)} onClose={closeDrawer}
        title={`Edit ${activeTrip?.trip_no || `TRP${activeTrip?.trip_id}`}`}>
        {activeTrip && (
          <TripForm
            initialValues={activeTrip}
            branches={branches}
            providers={providers}
            onSubmit={p => editMut.mutate({ id: activeTrip.trip_id, ...p })}
            onClose={closeDrawer}
            isPending={editMut.isPending}
            submitLabel="Save Changes"
          />
        )}
      </Drawer>

      {/* Assign Cargo Drawer */}
      <Drawer open={drawerMode === 'assign' && Boolean(activeTrip)} onClose={closeDrawer}
        title={`Assign Cargo — ${activeTrip?.trip_no || `TRP${activeTrip?.trip_id}`}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Select pending cargo to assign to this trip.</p>

          {pendingCargoQuery.isLoading ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : pendingCargo.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
              <Package size={32} className="mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No pending cargo</p>
              <p className="text-xs text-slate-400">All cargo is already assigned or delivered</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{pendingCargo.length} pending items</span>
                <button type="button"
                  onClick={() => setSelectedCargo(
                    selectedCargo.length === pendingCargo.length ? [] : pendingCargo.map(c => c.cargo_id)
                  )}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                  {selectedCargo.length === pendingCargo.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {pendingCargo.map(cargo => (
                  <label key={cargo.cargo_id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                      selectedCargo.includes(cargo.cargo_id)
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-700/50 dark:bg-blue-900/20'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                    }`}>
                    <input type="checkbox"
                      checked={selectedCargo.includes(cargo.cargo_id)}
                      onChange={e => setSelectedCargo(cur =>
                        e.target.checked ? [...cur, cargo.cargo_id] : cur.filter(id => id !== cargo.cargo_id)
                      )}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {cargo.tracking_number || `Cargo #${cargo.cargo_id}`}
                      </p>
                      <p className="text-xs text-slate-400">{cargo.sender_name} → {cargo.receiver_name}</p>
                    </div>
                    <Box size={14} className="flex-shrink-0 text-slate-400" />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={closeDrawer}
              className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
              Cancel
            </button>
            <button type="button"
              onClick={() => {
                if (!selectedCargo.length) { toast.error('Select at least one cargo'); return; }
                assignMut.mutate({ tripId: activeTrip.trip_id, cargo_ids: selectedCargo });
              }}
              disabled={assignMut.isPending || !selectedCargo.length}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              {assignMut.isPending ? <Spinner className="h-4 w-4" /> : <Package size={14} />}
              Assign {selectedCargo.length > 0 ? `(${selectedCargo.length})` : ''}
            </button>
          </div>
        </div>
      </Drawer>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/20">
              <Trash2 size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Trip</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Delete <strong>{deleteTarget.trip_no || `TRP${deleteTarget.trip_id}`}</strong>? Only planned trips can be deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
                Cancel
              </button>
              <button type="button" onClick={() => deleteMut.mutate(deleteTarget.trip_id)} disabled={deleteMut.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition">
                {deleteMut.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

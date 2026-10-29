import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock,
  Coffee, Edit2, Filter, Plus, Save, Search, Trash2, X
} from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection } from '../../api/listUtils';
import Spinner from '../../components/ui/Spinner';

const DAYS = [
  { day_id: 1, name: 'Monday',    short: 'Mon' },
  { day_id: 2, name: 'Tuesday',   short: 'Tue' },
  { day_id: 3, name: 'Wednesday', short: 'Wed' },
  { day_id: 4, name: 'Thursday',  short: 'Thu' },
  { day_id: 5, name: 'Friday',    short: 'Fri' },
  { day_id: 6, name: 'Saturday',  short: 'Sat' },
  { day_id: 7, name: 'Sunday',    short: 'Sun' },
];

const EMP_COLORS = [
  'bg-pink-500/20 text-pink-400 ring-pink-500/30',
  'bg-blue-500/20 text-blue-400 ring-blue-500/30',
  'bg-violet-500/20 text-violet-400 ring-violet-500/30',
  'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
  'bg-cyan-500/20 text-cyan-400 ring-cyan-500/30',
  'bg-amber-500/20 text-amber-400 ring-amber-500/30',
  'bg-rose-500/20 text-rose-400 ring-rose-500/30',
  'bg-indigo-500/20 text-indigo-400 ring-indigo-500/30',
];

function fmtTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function calcHours(timeIn, timeOut, breakStart, breakEnd) {
  if (!timeIn || !timeOut) return null;
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let diff = mins(timeOut) - mins(timeIn);
  if (diff <= 0) return null;
  if (breakStart && breakEnd) diff -= Math.max(0, mins(breakEnd) - mins(breakStart));
  return diff > 0 ? (diff / 60).toFixed(1) : null;
}

// Get Monday of the week containing baseDate
function weekOf(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekDates(monday) {
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Cell Edit Modal ────────────────────────────────────────────────────────────
function CellModal({ employee, day, existing, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const hasExisting = Boolean(existing);

  const [enabled,    setEnabled]    = useState(hasExisting);
  const [timeIn,     setTimeIn]     = useState(fmtTime(existing?.time_in)     || '09:00');
  const [timeOut,    setTimeOut]    = useState(fmtTime(existing?.time_out)    || '17:00');
  const [breakStart, setBreakStart] = useState(fmtTime(existing?.break_start) || '');
  const [breakEnd,   setBreakEnd]   = useState(fmtTime(existing?.break_end)   || '');

  const hours = calcHours(timeIn, timeOut, breakStart, breakEnd);

  const saveMut = useMutation({
    mutationFn: () => api.post('/api/employees/schedule', {
      emp_id:      employee.employee_id,
      day_id:      day.day_id,
      time_in:     timeIn     || null,
      time_out:    timeOut    || null,
      break_start: breakStart || null,
      break_end:   breakEnd   || null
    }),
    onSuccess: () => {
      toast.success(`Saved — ${employee.full_name} · ${day.name}`);
      queryClient.invalidateQueries({ queryKey: ['all-schedules'] });
      onSaved();
    },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to save'))
  });

  const delMut = useMutation({
    mutationFn: () => api.delete(`/api/employees/${employee.employee_id}/schedule/${day.day_id}`),
    onSuccess: () => {
      toast.success(`Removed — ${employee.full_name} · ${day.name}`);
      queryClient.invalidateQueries({ queryKey: ['all-schedules'] });
      onSaved();
    },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to remove'))
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-[var(--text)]">{employee.full_name}</p>
            <p className="text-sm text-[var(--text-secondary)]">{day.name}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] transition">
            <X size={14} />
          </button>
        </div>

        {/* Enable toggle */}
        <label className="mb-4 flex cursor-pointer items-center gap-3">
          <div
            onClick={() => setEnabled(p => !p)}
            className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-[var(--border)]'}`}
          >
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-[var(--text)]">{enabled ? 'Working day' : 'Day off'}</span>
        </label>

        {enabled && (
          <div className="space-y-3">
            {/* Shift times */}
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
              <span className="text-xs text-[var(--text-secondary)] w-10">Start</span>
              <input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition" />
              <span className="text-[var(--text-secondary)]">—</span>
              <span className="text-xs text-[var(--text-secondary)] w-8">End</span>
              <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition" />
            </div>

            {/* Hours badge */}
            {hours && (
              <p className="text-xs font-semibold text-blue-400 pl-5">{hours}h shift</p>
            )}

            {/* Break */}
            <div className="flex items-center gap-2">
              <Coffee size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
              <span className="text-xs text-[var(--text-secondary)] w-10">Break</span>
              <input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition" />
              <span className="text-[var(--text-secondary)]">—</span>
              <span className="text-xs text-[var(--text-secondary)] w-8" />
              <input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition" />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          <button type="button"
            onClick={() => enabled ? saveMut.mutate() : delMut.mutate()}
            disabled={saveMut.isPending || delMut.isPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
            {(saveMut.isPending || delMut.isPending) ? <Spinner className="h-4 w-4" /> : <Save size={13} />}
            {enabled ? 'Save Schedule' : 'Remove Day'}
          </button>
          {hasExisting && enabled && (
            <button type="button" onClick={() => delMut.mutate()} disabled={delMut.isPending}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-60 transition">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Grid Cell ─────────────────────────────────────────────────────────
function ScheduleCell({ employee, day, date, slotData, colorClass, onEdit }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const hours = slotData ? calcHours(
    fmtTime(slotData.time_in), fmtTime(slotData.time_out),
    fmtTime(slotData.break_start), fmtTime(slotData.break_end)
  ) : null;

  return (
    <td className="border-b border-r border-[var(--border)] p-0 align-top" style={{ minWidth: '130px' }}>
      <div className="flex flex-col gap-1.5 p-2">
        {/* Date + context menu */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-secondary)]">{fmtDate(date)}</span>
          {slotData && (
            <div className="relative" ref={menuRef}>
              <button type="button"
                onClick={() => setMenuOpen(p => !p)}
                className="flex h-5 w-5 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition">
                <svg width="12" height="12" viewBox="0 0 4 16" fill="currentColor">
                  <circle cx="2" cy="2"  r="1.5" /><circle cx="2" cy="8"  r="1.5" /><circle cx="2" cy="14" r="1.5" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-6 z-30 min-w-[100px] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg py-1">
                  <button type="button"
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-strong)] transition">
                    <Edit2 size={12} />Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Time slot pill */}
        {slotData ? (
          <>
            <div className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${colorClass} cursor-pointer`}
              onClick={onEdit}>
              {fmtTime(slotData.time_in)} – {fmtTime(slotData.time_out)}
            </div>
            {slotData.break_start && (
              <div className="inline-flex items-center justify-center rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
                {fmtTime(slotData.break_start)} – {fmtTime(slotData.break_end)}
              </div>
            )}
            {hours && (
              <span className="text-[10px] text-[var(--text-secondary)] pl-1">{hours}h</span>
            )}
          </>
        ) : (
          <button type="button" onClick={onEdit}
            className="flex h-8 w-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-400 transition">
            <Plus size={14} />
          </button>
        )}
      </div>
    </td>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const [search,       setSearch]       = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [mondayDate,   setMondayDate]   = useState(() => weekOf(new Date()));
  const [modal,        setModal]        = useState(null); // { employee, day }

  const dates = useMemo(() => weekDates(mondayDate), [mondayDate]);

  function shiftWeek(n) {
    setMondayDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + n * 7);
      return d;
    });
  }

  // ── Data ──
  const branchesQuery = useQuery({
    queryKey: ['branches-schedule'],
    queryFn:  () => api.get('/api/v1/setup/branches', { params: { limit: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000
  });

  const employeesQuery = useQuery({
    queryKey: ['employees-schedule', branchFilter],
    queryFn:  () => api.get('/api/employees', { params: { limit: 200, branch_id: branchFilter || undefined } }).then(r => r.data),
    staleTime: 2 * 60 * 1000
  });

  const schedulesQuery = useQuery({
    queryKey: ['all-schedules', branchFilter],
    queryFn:  () => api.get('/api/employees/schedules', { params: { branch_id: branchFilter || undefined } }).then(r => r.data),
    staleTime: 30 * 1000
  });

  const branches  = getCollection(branchesQuery.data);
  const employees = getCollection(employeesQuery.data);
  const schedMap  = schedulesQuery.data?.data || {}; // { [emp_id]: { [day_id]: slot } }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e =>
      (e.full_name   || '').toLowerCase().includes(q) ||
      (e.job_title   || '').toLowerCase().includes(q) ||
      (e.branch_name || '').toLowerCase().includes(q)
    );
  }, [employees, search]);

  const isLoading = employeesQuery.isLoading || schedulesQuery.isLoading;

  const weekLabel = `${fmtDate(dates[0])} – ${fmtDate(dates[6])}`;

  return (
    <div className="min-h-screen bg-[var(--bg)] p-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15">
            <CalendarDays size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]">Work Schedules</h1>
            <p className="text-sm text-[var(--text-secondary)]">Per-employee weekly recurring schedules</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Branch */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-[var(--text-secondary)]" />
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition">
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
            <Search size={13} className="text-[var(--text-secondary)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="w-36 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-secondary)]" />
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => shiftWeek(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[120px] text-center text-sm font-medium text-[var(--text)]">{weekLabel}</span>
            <button type="button" onClick={() => shiftWeek(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition">
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => setMondayDate(weekOf(new Date()))}
              className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition">
              This week
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] py-20 text-center">
          <CalendarDays size={40} className="mb-3 text-[var(--text-secondary)]/30" />
          <p className="text-base font-semibold text-[var(--text)]">No employees found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-strong)]">
                <th className="border-r border-[var(--border)] px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]" style={{ minWidth: '180px' }}>
                  Employee
                </th>
                {DAYS.map((d, i) => (
                  <th key={d.day_id} className="border-r border-[var(--border)] px-3 py-3 text-center text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]" style={{ minWidth: '130px' }}>
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, empIdx) => {
                const colorClass = EMP_COLORS[empIdx % EMP_COLORS.length];
                const empSched   = schedMap[emp.employee_id] || {};
                const workedDays = DAYS.filter(d => empSched[d.day_id]).length;

                return (
                  <tr key={emp.employee_id} className="hover:bg-[var(--surface-strong)]/40 transition-colors">
                    {/* Employee column */}
                    <td className="border-b border-r border-[var(--border)] px-4 py-3 align-middle" style={{ minWidth: '180px' }}>
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1 ${colorClass}`}>
                          {(emp.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text)]">{emp.full_name}</p>
                          <p className="truncate text-[11px] text-[var(--text-secondary)]">
                            {emp.job_title || 'No title'}
                          </p>
                          {workedDays > 0 && (
                            <span className="text-[10px] text-blue-400">{workedDays}d/wk</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {DAYS.map((day, i) => (
                      <ScheduleCell
                        key={day.day_id}
                        employee={emp}
                        day={day}
                        date={dates[i]}
                        slotData={empSched[day.day_id] || null}
                        colorClass={colorClass}
                        onEdit={() => setModal({ employee: emp, day })}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {modal && (
        <CellModal
          employee={modal.employee}
          day={modal.day}
          existing={schedMap[modal.employee.employee_id]?.[modal.day.day_id] || null}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}

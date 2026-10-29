import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowDown, ArrowUp, CalendarCheck,
  Check, ChevronLeft, ChevronRight, Clock,
  Download, Edit2, Filter, History, MoreHorizontal,
  Save, Search, Stethoscope, Umbrella, UserCheck, UserX, X
} from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection } from '../../api/listUtils';
import Spinner from '../../components/ui/Spinner';

// ─── Constants ─────────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'present',    label: 'Present',    icon: Check,       badgeCls: 'bg-emerald-500 text-white',           dotCls: 'bg-emerald-500' },
  { value: 'late',       label: 'Late',       icon: AlertCircle, badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',  dotCls: 'bg-amber-500'   },
  { value: 'absent',     label: 'Absent',     icon: UserX,       badgeCls: 'bg-red-500 text-white',               dotCls: 'bg-red-500'     },
  { value: 'leave',      label: 'Leave',      icon: Umbrella,    badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dotCls: 'bg-blue-500'    },
  { value: 'sick_leave', label: 'Sick Leave', icon: Stethoscope, badgeCls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400', dotCls: 'bg-purple-500'  },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));

function StatusBadge({ status }) {
  const s = STATUS_MAP[status];
  if (!s) return <span className="text-sm text-slate-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.badgeCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dotCls} ${s.badgeCls.includes('text-white') ? 'bg-white/50' : ''}`} />
      {s.label}
    </span>
  );
}

function calcWorkedHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null;
  const mins = t => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
  const diff = mins(timeOut) - mins(timeIn);
  return diff > 0 ? (diff / 60).toFixed(1) : null;
}

function fmtTime12(t) {
  if (!t) return '—';
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const needsTime = s => ['present', 'late', 'overtime'].includes(s);

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconCls, title, value, sub, trend, trendUp }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconCls}`}>
          <Icon size={17} />
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</span>
      </div>
      <p className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{value ?? '—'}</p>
      {sub && (
        <div className="flex items-center gap-1.5 text-xs">
          {trend && (
            trendUp
              ? <ArrowUp size={11} className="text-emerald-500" />
              : <ArrowDown size={11} className="text-red-500" />
          )}
          {trend && (
            <span className={`font-semibold ${trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {trend}
            </span>
          )}
          <span className="text-slate-400">{sub}</span>
        </div>
      )}
    </div>
  );
}

// ─── Inline Status Selector (popover) ──────────────────────────────────────────
function StatusSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(p => !p)} className="rounded-full transition hover:opacity-80 active:scale-95">
        <StatusBadge status={value} />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-30 w-36 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {STATUSES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => { onChange(s.value); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                value === s.value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dotCls}`} />
              {s.label}
              {value === s.value && <Check size={10} className="ml-auto text-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Row Actions Menu ───────────────────────────────────────────────────────────
function RowMenu({ notes, onNotesChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(p => !p)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes</p>
          <textarea
            rows={2}
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Add a note…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          <button type="button" onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Daily Roster Tab ──────────────────────────────────────────────────────────
function DailyRosterTab() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [date,         setDate]         = useState(today);
  const [branchFilter, setBranchFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [rows,         setRows]         = useState({});
  const [dirty,        setDirty]        = useState(false);

  const branchesQuery = useQuery({
    queryKey: ['branches-for-attendance'],
    queryFn:  () => api.get('/api/v1/setup/branches', { params: { limit: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000
  });

  const rosterQuery = useQuery({
    queryKey: ['daily-roster', date, branchFilter],
    queryFn:  () => api.get('/api/employees/attendance/daily', {
      params: { date, branch_id: branchFilter || undefined }
    }).then(r => r.data),
    staleTime: 30 * 1000
  });

  const branches = getCollection(branchesQuery.data);
  const roster   = getCollection(rosterQuery.data);

  useEffect(() => {
    if (!roster.length) return;
    const initial = {};
    roster.forEach(r => {
      initial[r.employee_id] = {
        status:  r.attendance_status  || 'present',
        timeIn:  r.actual_in?.slice(0, 5)  || r.scheduled_in?.slice(0, 5)  || '',
        timeOut: r.actual_out?.slice(0, 5) || r.scheduled_out?.slice(0, 5) || '',
        notes:   r.attendance_notes   || ''
      };
    });
    setRows(initial);
    setDirty(false);
  }, [roster]);

  function update(employeeId, field, value) {
    setRows(prev => ({ ...prev, [employeeId]: { ...prev[employeeId], [field]: value } }));
    setDirty(true);
  }

  // Stats computed from current rows
  const stats = useMemo(() => {
    const statusList = roster.map(r => rows[r.employee_id]?.status || 'present');
    const present = statusList.filter(s => s === 'present' || s === 'overtime').length;
    const late    = statusList.filter(s => s === 'late').length;
    const absent  = statusList.filter(s => ['absent', 'leave', 'sick_leave'].includes(s)).length;
    const checkIns = roster
      .filter(r => {
        const s = rows[r.employee_id]?.status;
        return needsTime(s || 'present');
      })
      .map(r => rows[r.employee_id]?.timeIn)
      .filter(Boolean)
      .map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
    let avgCheckIn = null;
    if (checkIns.length) {
      const avg = checkIns.reduce((a, b) => a + b, 0) / checkIns.length;
      avgCheckIn = fmtTime12(`${Math.floor(avg / 60)}:${Math.round(avg % 60)}`);
    }
    return { present, late, absent, total: roster.length, avgCheckIn };
  }, [roster, rows]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const records = roster.map(r => {
        const local = rows[r.employee_id] || {};
        return {
          employee_id: r.employee_id,
          employee_schedule_id:  r.employee_schedule_id || null,
          day_id:      r.day_id     || null,
          time_in:     needsTime(local.status) ? (local.timeIn  || null) : null,
          time_out:    needsTime(local.status) ? (local.timeOut || null) : null,
          status:      local.status || 'present',
          notes:       local.notes  || null
        };
      });
      return api.post('/api/employees/attendance/bulk', { attendance_date: date, records });
    },
    onSuccess: res => {
      toast.success(res.data?.message || 'Attendance saved');
      queryClient.invalidateQueries({ queryKey: ['daily-roster', date, branchFilter] });
      setDirty(false);
    },
    onError: e => toast.error(getApiErrorMessage(e, 'Failed to save attendance'))
  });

  function shiftDate(n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  }

  const filtered = search
    ? roster.filter(r => r.full_name?.toLowerCase().includes(search.toLowerCase()))
    : roster;

  const savedCount = roster.filter(r => r.employee_attendance_id).length;
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-5">
      {/* Stat Cards */}
      {roster.length > 0 && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            icon={UserCheck}
            iconCls="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            title="Total Employees Present"
            value={stats.present}
            sub="of total employees"
            trend={`${stats.total > 0 ? Math.round(stats.present / stats.total * 100) : 0}%`}
            trendUp={stats.present >= stats.total / 2}
          />
          <StatCard
            icon={AlertCircle}
            iconCls="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
            title="Late Arrivals Today"
            value={stats.late}
            sub="arrived after scheduled time"
            trend={stats.late > 0 ? `${stats.late}` : null}
            trendUp={false}
          />
          <StatCard
            icon={UserX}
            iconCls="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
            title="Employees Absent"
            value={stats.absent}
            sub="absent, on leave or sick"
            trend={stats.absent > 0 ? `${stats.absent}` : null}
            trendUp={false}
          />
          <StatCard
            icon={Clock}
            iconCls="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
            title="Average Check-In Time"
            value={stats.avgCheckIn || '—'}
            sub={stats.avgCheckIn ? 'across present employees' : 'no check-in data yet'}
          />
        </div>
      )}

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        {/* Card Header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarCheck size={17} className="text-blue-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Attendance History</h2>
            {roster.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {roster.length}
              </span>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Branch filter */}
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="">Select branch</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>

            {/* Date nav */}
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => shiftDate(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                <ChevronLeft size={15} />
              </button>
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <CalendarCheck size={13} className="text-slate-400" />
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={e => setDate(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-slate-200"
                />
              </div>
              <button type="button" onClick={() => shiftDate(1)} disabled={date >= today}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
              <Search size={13} className="text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search employee"
                className="w-36 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200" />
            </div>

            {/* Save btn */}
            {roster.length > 0 && (
              <button type="button" onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || roster.length === 0}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                  dirty ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500'
                }`}>
                {saveMutation.isPending ? <Spinner className="h-4 w-4" /> : <Save size={14} />}
                {dirty ? `Save (${filtered.length})` : 'Saved'}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {rosterQuery.isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarCheck size={40} className="mb-3 text-slate-200 dark:text-slate-700" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No active employees</p>
            <p className="mt-1 text-sm text-slate-400">
              {branchFilter ? 'No active employees in this branch' : 'Select a branch to view employees'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Name', 'Branch / Schedule', 'Clock-in', 'Clock-out', 'Hours', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 dark:text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {filtered.map((row, idx) => {
                  const local    = rows[row.employee_id] || { status: 'present', timeIn: '', timeOut: '', notes: '' };
                  const showTime = needsTime(local.status);
                  const worked   = showTime ? calcWorkedHours(local.timeIn, local.timeOut) : null;
                  const initial  = (row.full_name || '?')[0].toUpperCase();
                  const colorPalette = [
                    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
                    'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
                    'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
                    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
                    'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
                  ];
                  const avatarCls = colorPalette[idx % colorPalette.length];

                  return (
                    <tr key={row.employee_id} className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarCls}`}>
                            {initial}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.full_name}</p>
                            {row.job_title && <p className="text-xs text-slate-400">{row.job_title}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Branch / Schedule */}
                      <td className="px-5 py-3.5">
                        <div className="text-sm text-slate-600 dark:text-slate-300">{row.branch_name || '—'}</div>
                        {row.scheduled_in ? (
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock size={10} />
                            {row.scheduled_in.slice(0, 5)} – {row.scheduled_out?.slice(0, 5) || '?'}
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-300 dark:text-slate-600">No schedule</span>
                        )}
                      </td>

                      {/* Clock-in */}
                      <td className="px-5 py-3.5">
                        {showTime ? (
                          <input
                            type="time"
                            value={local.timeIn}
                            onChange={e => update(row.employee_id, 'timeIn', e.target.value)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>

                      {/* Clock-out */}
                      <td className="px-5 py-3.5">
                        {showTime ? (
                          <input
                            type="time"
                            value={local.timeOut}
                            onChange={e => update(row.employee_id, 'timeOut', e.target.value)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="px-5 py-3.5 text-sm">
                        {worked
                          ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{worked}h</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>
                        }
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <StatusSelector
                          value={local.status}
                          onChange={v => update(row.employee_id, 'status', v)}
                        />
                      </td>

                      {/* 3-dot menu */}
                      <td className="px-3 py-3.5">
                        <RowMenu
                          notes={local.notes}
                          onNotesChange={v => update(row.employee_id, 'notes', v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {roster.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              {dirty
                ? <span className="font-medium text-amber-500">Unsaved changes — click Save to apply</span>
                : savedCount > 0
                  ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{savedCount}/{roster.length} records saved for {displayDate}</span>
                  : `${roster.length} employee${roster.length !== 1 ? 's' : ''} • Set status for each then save`
              }
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Quick fill:</span>
              {STATUSES.slice(0, 3).map(s => (
                <button key={s.value} type="button"
                  onClick={() => {
                    setRows(prev => {
                      const next = { ...prev };
                      roster.forEach(r => { next[r.employee_id] = { ...next[r.employee_id], status: s.value }; });
                      return next;
                    });
                    setDirty(true);
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${s.badgeCls} hover:opacity-80`}>
                  All {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab() {
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [month,         setMonth]         = useState(new Date().toISOString().slice(0, 7));
  const [editId,        setEditId]        = useState(null);
  const [editForm,      setEditForm]      = useState({});
  const queryClient = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ['employees-for-history'],
    queryFn:  () => api.get('/api/employees', { params: { limit: 200 } }).then(r => r.data),
    staleTime: 2 * 60 * 1000
  });

  const historyQuery = useQuery({
    queryKey: ['attendance-history', selectedEmpId, month],
    queryFn:  () => api.get(`/api/employees/${selectedEmpId}/attendance`, { params: { month } }).then(r => r.data),
    enabled:  Boolean(selectedEmpId),
    staleTime: 30 * 1000
  });

  const employees = getCollection(employeesQuery.data);
  const history   = getCollection(historyQuery.data);

  function startEdit(r) {
    setEditId(r.employee_attendance_id);
    setEditForm({ status: r.status, timeIn: r.time_in?.slice(0, 5) || '', timeOut: r.time_out?.slice(0, 5) || '', notes: r.notes || '' });
  }

  const updateMut = useMutation({
    mutationFn: () => api.put(`/api/employees/attendance/${editId}`, {
      status:   editForm.status,
      time_in:  needsTime(editForm.status) ? editForm.timeIn  || null : null,
      time_out: needsTime(editForm.status) ? editForm.timeOut || null : null,
      notes:    editForm.notes || null
    }),
    onSuccess: () => {
      toast.success('Record updated');
      queryClient.invalidateQueries({ queryKey: ['attendance-history', selectedEmpId, month] });
      setEditId(null);
    },
    onError: e => toast.error(getApiErrorMessage(e, 'Update failed'))
  });

  const summary = history.reduce((acc, r) => {
    acc[r.status || 'present'] = (acc[r.status || 'present'] || 0) + 1;
    return acc;
  }, {});

  const colorPalette = [
    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  ];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.full_name}</option>)}
          </select>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />

          {history.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-auto">
              {STATUSES.map(s => summary[s.value] ? (
                <span key={s.value} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.badgeCls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dotCls} ${s.badgeCls.includes('text-white') ? 'bg-white/50' : ''}`} />
                  {summary[s.value]} {s.label}
                </span>
              ) : null)}
            </div>
          )}
        </div>
      </div>

      {!selectedEmpId ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <History size={40} className="mb-3 text-slate-200 dark:text-slate-700" />
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Select an Employee</p>
          <p className="mt-1 text-sm text-slate-400">Choose an employee and month to view attendance history</p>
        </div>
      ) : historyQuery.isLoading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No attendance records</p>
          <p className="mt-1 text-sm text-slate-400">No records for {month}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Name', 'Date', 'Day', 'Clock-in', 'Clock-out', 'Hours', 'Status', 'Notes', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 dark:text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {history.map((r, idx) => {
                  const isEditing = editId === r.employee_attendance_id;
                  const worked    = calcWorkedHours(r.time_in, r.time_out);
                  const dayName   = r.day_name || new Date(r.attendance_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  const avatarCls = colorPalette[idx % colorPalette.length];
                  const empName   = r.full_name || r.employee_name || employees.find(e => String(e.employee_id) === String(selectedEmpId))?.full_name || '?';

                  return (
                    <tr key={r.employee_attendance_id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarCls}`}>
                            {empName[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{empName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {new Date(r.attendance_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">{dayName}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-200">
                        {isEditing && needsTime(editForm.status) ? (
                          <input type="time" value={editForm.timeIn}
                            onChange={e => setEditForm(f => ({ ...f, timeIn: e.target.value }))}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                        ) : fmtTime12(r.time_in?.slice(0, 5))}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-200">
                        {isEditing && needsTime(editForm.status) ? (
                          <input type="time" value={editForm.timeOut}
                            onChange={e => setEditForm(f => ({ ...f, timeOut: e.target.value }))}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                        ) : fmtTime12(r.time_out?.slice(0, 5))}
                      </td>
                      <td className="px-5 py-3.5 text-sm">
                        {worked ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{worked}h</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {isEditing ? (
                          <div className="relative" style={{ zIndex: 20 }}>
                            <StatusSelector value={editForm.status} onChange={v => setEditForm(f => ({ ...f, status: v }))} />
                          </div>
                        ) : (
                          <StatusBadge status={r.status || 'present'} />
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400 max-w-[140px]">
                        {isEditing ? (
                          <input type="text" value={editForm.notes}
                            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Notes…"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                        ) : (r.notes || '—')}
                      </td>
                      <td className="px-3 py-3.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition">
                              {updateMut.isPending ? <Spinner className="h-3 w-3" /> : <Save size={10} />}
                              Save
                            </button>
                            <button type="button" onClick={() => setEditId(null)}
                              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition dark:border-slate-700 dark:text-slate-400">
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => startEdit(r)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const [tab, setTab] = useState('roster');

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Attendance</h1>
        <p className="text-sm text-slate-400">Mark daily attendance and view employee records</p>
      </div>

      {/* Tab pills */}
      <div className="mb-5 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 w-fit">
        {[
          { id: 'roster',  label: 'Daily Roster',       icon: CalendarCheck },
          { id: 'history', label: 'Attendance History',  icon: History       },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'roster'  && <DailyRosterTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

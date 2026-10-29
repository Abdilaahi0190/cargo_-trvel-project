import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarCheck, CalendarDays, GitBranch } from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import Badge from '../../components/ui/Badge';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';

const PAGE_LIMIT = 20;
const emptyForm = { full_name: '', phone: '', email: '', job_id: '', hire_date: '', branch_id: '' };

function statusTone(status) {
  return String(status || '').toLowerCase() === 'active' ? 'active' : 'danger';
}

// ─── Searchable branch select ─────────────────────────────────────────────────
function BranchSelect({ value, onChange, branches, required, placeholder }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return branches;
    return branches.filter(b => b.branch_name.toLowerCase().includes(search.toLowerCase()));
  }, [branches, search]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        placeholder="Search branches…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className={selectFieldClass}
      />
      <select
        required={required}
        value={value}
        onChange={onChange}
        className={selectFieldClass}
      >
        <option value="">{placeholder || 'Select branch'}</option>
        {filtered.map(b => (
          <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [branchFilter, setBranchFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignBranchId, setAssignBranchId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const formOpen = createOpen || Boolean(editing);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: ['employees-list', page, branchFilter],
    queryFn: async () =>
      (await api.get('/api/employees', {
        params: { page, limit: PAGE_LIMIT, branch_id: branchFilter || undefined }
      })).data,
    staleTime: 60 * 1000
  });

  const jobsQuery = useQuery({
    queryKey: ['employee-jobs'],
    queryFn: async () => (await api.get('/api/employees/jobs')).data,
    staleTime: 5 * 60 * 1000
  });

  const branchesQuery = useQuery({
    queryKey: ['branches-for-employees'],
    queryFn: async () =>
      (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000,
    enabled: formOpen || Boolean(assignTarget) || true  // always load for filter
  });

  const employees = getCollection(query.data);
  const jobs      = getCollection(jobsQuery.data);
  const branches  = getCollection(branchesQuery.data);

  function refresh() { queryClient.invalidateQueries({ queryKey: ['employees-list'] }); }

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/employees', payload),
    onSuccess: () => {
      toast.success('Employee created');
      setCreateOpen(false);
      setForm(emptyForm);
      refresh();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to create employee'))
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload, newBranchId, empId }) => {
      await api.put(`/api/employees/${id}`, payload);
      if (newBranchId) {
        await api.post('/api/employees/branch/assign', { employee_id: empId, branch_id: newBranchId });
      }
    },
    onSuccess: () => {
      toast.success('Employee updated');
      setEditing(null);
      setForm(emptyForm);
      refresh();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to update employee'))
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/employees/${id}/status`, { status }),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'active' ? 'Activated' : 'Deactivated');
      refresh();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to update status'))
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/employees/${id}`),
    onSuccess: () => { toast.success('Employee deleted'); setDeleteTarget(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to delete employee'))
  });

  const assignMutation = useMutation({
    mutationFn: (payload) => api.post('/api/employees/branch/assign', payload),
    onSuccess: () => { toast.success('Branch assigned'); setAssignTarget(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to assign branch'))
  });

  // ─── Form helpers ────────────────────────────────────────────────────────────
  function openEdit(emp) {
    setEditing(emp);
    setForm({
      full_name: emp.full_name  || '',
      phone:     emp.phone      || '',
      email:     emp.email      || '',
      job_id:    emp.job_id     ? String(emp.job_id)    : '',
      hire_date: emp.hire_date  ? String(emp.hire_date).slice(0, 10) : '',
      branch_id: emp.branch_id  ? String(emp.branch_id) : ''
    });
  }

  function closeForm() {
    setCreateOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function submitForm(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Employee name is required'); return; }
    if (!form.job_id)            { toast.error('Job title is required');     return; }
    if (!form.branch_id)         { toast.error('Branch is required');        return; }

    const payload = {
      full_name: form.full_name.trim(),
      phone:     form.phone.trim()  || undefined,
      email:     form.email.trim()  || undefined,
      job_id:    Number(form.job_id),
      hire_date: form.hire_date     || undefined
    };

    if (editing) {
      // If branch changed, call assign endpoint after the update
      const branchChanged = Number(form.branch_id) !== Number(editing.branch_id);
      updateMutation.mutate({
        id:          editing.employee_id,
        payload,
        newBranchId: branchChanged ? Number(form.branch_id) : null,
        empId:       editing.employee_id
      });
    } else {
      createMutation.mutate({ ...payload, branch_id: Number(form.branch_id) });
    }
  }

  // ─── Table definition ────────────────────────────────────────────────────────
  const columns = useMemo(() => [
    { key: 'name',    label: 'Employee' },
    { key: 'phone',   label: 'Phone' },
    { key: 'job',     label: 'Job Title' },
    { key: 'branch',  label: 'Branch' },
    { key: 'status',  label: 'Status' },
    { key: 'actions', label: 'Actions', align: 'right', wrap: true, cellClassName: 'min-w-[280px]' }
  ], []);

  const rows = useMemo(() => employees.map((emp, i) => {
    const isActive    = String(emp.status || '').toLowerCase() === 'active';
    const hasBranch   = Boolean(emp.branch_id);
    const empId       = emp.employee_id;
    const branchLabel = emp.branch_name || 'Unassigned';

    return {
      id: `${empId}-${i}`,
      name:   emp.full_name || '--',
      phone:  emp.phone     || '--',
      job:    emp.job_title || '--',
      branch: hasBranch ? (
        <span className="font-medium text-[var(--text)]">{branchLabel}</span>
      ) : (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-500 ring-1 ring-amber-500/20">
          Unassigned
        </span>
      ),
      status: <Badge label={emp.status || 'inactive'} status={statusTone(emp.status)} />,
      actions: (
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" onClick={() => openEdit(emp)}
            className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-strong)] transition">
            Edit
          </button>
          <button
            type="button"
            onClick={() => { setAssignTarget(emp); setAssignBranchId(emp.branch_id ? String(emp.branch_id) : ''); }}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
              hasBranch
                ? 'border-[var(--border)] hover:bg-[var(--surface-strong)]'
                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <GitBranch size={11} />
            {hasBranch ? 'Change Branch' : 'Assign Branch'}
          </button>
          <button type="button" onClick={() => navigate('/schedule')}
            className="inline-flex items-center gap-1 rounded-xl border border-blue-500/30 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition">
            <CalendarDays size={11} />Schedule
          </button>
          <button type="button" onClick={() => navigate('/attendance')}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition">
            <CalendarCheck size={11} />Attendance
          </button>
          <button type="button"
            onClick={() => statusMutation.mutate({ id: empId, status: isActive ? 'inactive' : 'active' })}
            className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-strong)] transition">
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" onClick={() => setDeleteTarget(emp)}
            className="rounded-xl border border-rose-500/30 px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition">
            Delete
          </button>
        </div>
      )
    };
  }), [employees, statusMutation, navigate]);

  const meta = getMeta(query.data);

  // ─── Branch filter toolbar ────────────────────────────────────────────────────
  const filterBar = (
    <div className="flex items-center gap-2">
      <select
        value={branchFilter}
        onChange={e => { setBranchFilter(e.target.value); setPage(1); }}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-blue-500 transition"
      >
        <option value="">All Branches</option>
        {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
      </select>
      <button type="button"
        onClick={() => { setCreateOpen(true); setForm(emptyForm); }}
        className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
        + Add Employee
      </button>
    </div>
  );

  return (
    <>
      <ModuleDataPage
        title="Employees"
        subtitle="Employee directory, branch assignments, schedules and attendance"
        actions={filterBar}
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      {/* ── Create / Edit Employee ── */}
      <Modal isOpen={formOpen} onClose={closeForm} title={editing ? 'Edit Employee' : 'Add Employee'} size="sm">
        <form className="space-y-4" onSubmit={submitForm}>
          <Input label="Full Name" required value={form.full_name}
            onChange={e => setForm(c => ({ ...c, full_name: e.target.value }))} />
          <Input label="Phone" value={form.phone}
            onChange={e => setForm(c => ({ ...c, phone: e.target.value }))} />
          <Input label="Email" type="email" value={form.email}
            onChange={e => setForm(c => ({ ...c, email: e.target.value }))} />
          <label className={labelClass}>
            <span className={labelTitleClass}>Job Title <span className="text-rose-500">*</span></span>
            <select required value={form.job_id}
              onChange={e => setForm(c => ({ ...c, job_id: e.target.value }))}
              className={selectFieldClass}>
              <option value="">Select job title</option>
              {jobs.map(j => <option key={j.job_id} value={j.job_id}>{j.job_title}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className={labelTitleClass}>Branch <span className="text-rose-500">*</span></span>
            <BranchSelect
              value={form.branch_id}
              onChange={e => setForm(c => ({ ...c, branch_id: e.target.value }))}
              branches={branches}
              required
              placeholder={editing ? 'Select new branch (or keep current)' : 'Select branch'}
            />
            {editing && editing.branch_name && (
              <p className="text-[11px] text-slate-400">
                Current branch: <strong>{editing.branch_name}</strong>
                {form.branch_id && Number(form.branch_id) !== Number(editing.branch_id)
                  ? ' → will be updated'
                  : ''}
              </p>
            )}
          </div>
          <Input label="Hire Date" type="date" value={form.hire_date}
            onChange={e => setForm(c => ({ ...c, hire_date: e.target.value }))} />
          <ModalFormFooter
            onClose={closeForm}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? 'Save Changes' : 'Create Employee'}
          />
        </form>
      </Modal>

      {/* ── Assign / Change Branch ── */}
      <Modal
        isOpen={Boolean(assignTarget)}
        onClose={() => { setAssignTarget(null); setAssignBranchId(''); }}
        title={assignTarget?.branch_id ? `Change Branch — ${assignTarget?.full_name}` : `Assign Branch — ${assignTarget?.full_name}`}
        size="sm"
      >
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          if (!assignBranchId) { toast.error('Please select a branch'); return; }
          assignMutation.mutate({ employee_id: assignTarget?.employee_id, branch_id: Number(assignBranchId) });
        }}>
          {assignTarget?.branch_name && (
            <p className="text-sm text-[var(--text-secondary)]">
              Currently assigned to <strong className="text-[var(--text)]">{assignTarget.branch_name}</strong>
            </p>
          )}
          <div className="flex flex-col gap-1">
            <span className={labelTitleClass}>Select Branch <span className="text-rose-500">*</span></span>
            <BranchSelect
              value={assignBranchId}
              onChange={e => setAssignBranchId(e.target.value)}
              branches={branches}
              required
              placeholder="Search and select branch"
            />
          </div>
          <ModalFormFooter
            onClose={() => { setAssignTarget(null); setAssignBranchId(''); }}
            isSubmitting={assignMutation.isPending}
            submitLabel={assignTarget?.branch_id ? 'Change Branch' : 'Assign Branch'}
          />
        </form>
      </Modal>

      {/* ── Delete Confirm ── */}
      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.employee_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete Employee"
        confirmLabel="Delete Employee"
        message={<>Delete <strong>{deleteTarget?.full_name}</strong>? This cannot be undone.</>}
      />
    </>
  );
}

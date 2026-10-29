import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown,
  Mail, MapPin, Phone, Plus, Search, User, X
} from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const PAGE_LIMIT = 20;
const emptyForm = {
  branch_name: '',
  country: '',
  city_id: '',
  location_name: '',
  manager_name: '',
  manager_tel: '',
  banner_tel: '',
  br_email: '',
  _selectedEmployee: null
};

// ─── Shared style helpers ──────────────────────────────────────────────────────
const BASE_INPUT =
  'w-full rounded-xl border bg-[var(--surface-strong)] px-3 py-2.5 text-sm ' +
  'text-[var(--text)] placeholder:text-[var(--text-secondary)] outline-none ' +
  'transition-all duration-150 focus:ring-2';

const iCls = BASE_INPUT + ' border-[var(--border)] focus:border-blue-500 focus:ring-blue-500/20';
const iErr = BASE_INPUT + ' border-red-500 focus:border-red-400 focus:ring-red-400/20';

function inputCls(err) { return err ? iErr : iCls; }

// ─── Field wrapper ─────────────────────────────────────────────────────────────
function F({ label, required, error, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
      {error
        ? <span className="text-[11px] font-medium text-red-400">{error}</span>
        : hint && <span className="text-[11px] text-[var(--text-secondary)]">{hint}</span>}
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title, accent = 'blue' }) {
  const styles = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/30'
  };
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3 mb-4">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border ${styles[accent]}`}>
        <Icon size={13} />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
    </div>
  );
}

// ─── Searchable Manager / Employee Selector ────────────────────────────────────
function ManagerSelector({ selected, onSelect, employees, loadingEmployees, branches }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees.slice(0, 30);
    const q = search.toLowerCase();
    return employees.filter((e) =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.phone || '').includes(q) ||
      (e.email || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [employees, search]);

  const conflict = useMemo(() => {
    if (!selected) return null;
    return branches.find((b) =>
      b.manager_name &&
      b.manager_name.trim().toLowerCase() === (selected.full_name || '').trim().toLowerCase()
    ) || null;
  }, [selected, branches]);

  useEffect(() => {
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 text-[var(--text-secondary)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search employees by name or phone…"
          className={`${iCls} pl-8`}
        />

        {open && (
          <div
            className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/30"
            style={{ animation: 'fadeSlideDown 0.15s ease-out both' }}
          >
            <style>{`@keyframes fadeSlideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <div className="max-h-48 overflow-y-auto">
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-6"><Spinner /></div>
              ) : filtered.length === 0 ? (
                <div className="py-5 text-center text-xs text-[var(--text-secondary)]">
                  {search.trim() ? 'No employees found' : 'Start typing to search'}
                </div>
              ) : filtered.map((e) => (
                <button
                  key={e.employee_id}
                  type="button"
                  onClick={() => { onSelect(e); setSearch(''); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--surface-strong)] ${selected?.employee_id === e.employee_id ? 'bg-violet-500/10 text-violet-400' : 'text-[var(--text)]'}`}
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[11px] font-bold text-[var(--text)]">
                    {(e.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.full_name}</p>
                    {e.phone && <p className="text-[11px] text-[var(--text-secondary)]">{e.phone}</p>}
                  </div>
                  {e.job_title && (
                    <span className="ml-auto flex-shrink-0 rounded-md bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      {e.job_title}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div
          className={`rounded-xl border p-3 transition-all ${conflict ? 'border-amber-500/30 bg-amber-500/5' : 'border-violet-500/20 bg-violet-500/5'}`}
          style={{ animation: 'fadeSlideDown 0.2s ease-out both' }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-sm font-bold text-violet-400">
              {(selected.full_name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">{selected.full_name}</p>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {selected.phone && (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Phone size={10} />{selected.phone}
                  </span>
                )}
                {selected.job_title && (
                  <span className="text-xs text-[var(--text-secondary)]">{selected.job_title}</span>
                )}
              </div>
              {conflict && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle size={11} />
                  Already managing <strong className="font-semibold">{conflict.branch_name}</strong> — confirm to reassign
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex-shrink-0 rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition"
              title="Clear manager"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SetupPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const isCreate = modal?.mode === 'create';
  const isEdit = modal?.mode === 'edit';

  // ── Queries ───────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['setup-branches', page],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const countriesQuery = useQuery({
    queryKey: ['setup-countries'],
    queryFn: async () => (await api.get('/api/v1/setup/countries')).data,
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(modal)
  });

  const citiesQuery = useQuery({
    queryKey: ['setup-cities', form.country],
    queryFn: async () => (await api.get('/api/v1/setup/cities', { params: { country: form.country, limit: 500 } })).data,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(modal) && Boolean(form.country)
  });

  const employeesQuery = useQuery({
    queryKey: ['employees-for-manager'],
    queryFn: async () => (await api.get('/api/employees', { params: { limit: 200, page: 1 } })).data,
    staleTime: 5 * 60 * 1000,
    enabled: isCreate
  });

  const branches = getCollection(branchesQuery.data);
  const countries = useMemo(() => countriesQuery.data?.data || [], [countriesQuery.data]);
  const cities = getCollection(citiesQuery.data);
  const employees = getCollection(employeesQuery.data);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  function refreshBranches() {
    queryClient.invalidateQueries({ queryKey: ['setup-branches'] });
  }

  const createMutation = useMutation({
    mutationFn: async (p) => {
      // Step 1: create address from city_id + location_name
      const addrRes = await api.post('/api/v1/setup/addresses', {
        city_id: p.city_id,
        location_name: p.location_name
      });
      const address_id = addrRes.data?.data?.address_id;
      if (!address_id) throw new Error('Address creation failed');

      // Step 2: create branch with the new address_id
      return api.post('/api/v1/setup/branches', {
        branch_name: p.branch_name,
        address_id,
        manager_name: p.manager_name,
        manager_tel: p.manager_tel,
        banner_tel: p.banner_tel,
        br_email: p.br_email
      });
    },
    onSuccess: () => { toast.success('Branch created'); setModal(null); refreshBranches(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to create branch'))
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, p }) => api.put(`/api/v1/setup/branches/${id}`, p),
    onSuccess: () => { toast.success('Branch updated'); setModal(null); refreshBranches(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to update branch'))
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/setup/branches/${id}`),
    onSuccess: () => { toast.success('Branch deleted'); setDeleteTarget(null); refreshBranches(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to delete branch'))
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function clearErr(...keys) {
    setErrors((prev) => {
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearErr(key);
  }

  function selectManager(emp) {
    setForm((prev) => ({
      ...prev,
      _selectedEmployee: emp,
      manager_name: emp ? (emp.full_name || '') : '',
      manager_tel: emp ? (emp.phone || '') : ''
    }));
  }

  function openCreate() {
    setModal({ mode: 'create' });
    setForm(emptyForm);
    setErrors({});
  }

  function openEdit(branch) {
    setModal({ mode: 'edit', record: branch });
    setForm({
      branch_name: branch.branch_name || '',
      country: '',
      city_id: '',
      location_name: '',
      manager_name: branch.manager_name || '',
      manager_tel: branch.manager_tel || '',
      banner_tel: branch.banner_tel || '',
      br_email: branch.br_email || '',
      _selectedEmployee: null
    });
    setErrors({});
  }

  function validateForm() {
    const errs = {};
    if (!form.branch_name.trim()) errs.branch_name = 'Branch name is required';
    if (isCreate) {
      if (!form.country) errs.country = 'Country is required';
      if (!form.city_id) errs.city_id = 'City is required';
      if (!form.location_name.trim()) errs.location_name = 'Location / Area is required';
    }
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (isCreate) {
      createMutation.mutate({
        branch_name: form.branch_name.trim(),
        city_id: Number(form.city_id),
        location_name: form.location_name.trim(),
        manager_name: form.manager_name.trim() || undefined,
        manager_tel: form.manager_tel.trim() || undefined,
        banner_tel: form.banner_tel.trim() || undefined,
        br_email: form.br_email.trim() || undefined
      });
    } else {
      updateMutation.mutate({
        id: modal.record.branch_id,
        p: {
          branch_name: form.branch_name.trim(),
          manager_name: form.manager_name.trim() || undefined,
          manager_tel: form.manager_tel.trim() || undefined,
          banner_tel: form.banner_tel.trim() || undefined,
          br_email: form.br_email.trim() || undefined
        }
      });
    }
  }

  // ── Table data ────────────────────────────────────────────────────────────────
  const columns = useMemo(() => [
    { key: 'branch', label: 'Branch' },
    { key: 'manager', label: 'Manager' },
    { key: 'city', label: 'City' },
    { key: 'phone', label: 'Phone' },
    { key: 'actions', label: 'Actions', align: 'right' }
  ], []);

  const rows = useMemo(() => branches.map((b) => ({
    id: b.branch_id,
    branch: (
      <span className="flex items-center gap-2">
        <Building2 size={13} className="text-[var(--text-secondary)]" />
        <span className="font-medium">{b.branch_name || '--'}</span>
      </span>
    ),
    manager: b.manager_name ? (
      <span className="flex items-center gap-2">
        <User size={12} className="text-[var(--text-secondary)]" />
        {b.manager_name}
      </span>
    ) : <span className="text-[var(--text-secondary)]">--</span>,
    city: b.city_name ? `${b.city_name}, ${b.country}` : '--',
    phone: b.manager_tel || b.banner_tel || '--',
    actions: (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => openEdit(b)}
          className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs transition hover:bg-[var(--surface-strong)]"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleteTarget(b)}
          className="rounded-xl border border-rose-500/30 px-3 py-1.5 text-xs text-rose-400 transition hover:bg-rose-500/10"
        >
          Delete
        </button>
      </div>
    )
  })), [branches]);

  const meta = getMeta(branchesQuery.data);
  const isBusy = createMutation.isPending || updateMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <ModuleDataPage
        title="Branch Setup"
        subtitle="Branches, addresses, and setup records"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Plus size={15} /> Add Branch
          </button>
        }
        columns={columns}
        rows={rows}
        isLoading={branchesQuery.isLoading}
        errorMessage={branchesQuery.isError ? getApiErrorMessage(branchesQuery.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      {/* ── Branch Modal ── */}
      <Modal
        isOpen={Boolean(modal)}
        onClose={() => setModal(null)}
        title={isEdit ? 'Edit Branch' : 'Add Branch'}
        subtitle={isEdit ? 'Update branch details and manager' : 'Set up a new branch location'}
        size="lg"
      >
        <form id="branch-form" onSubmit={handleSubmit} className="space-y-6">

          {/* ── Section 1: Branch Details ── */}
          <div>
            <SectionHead icon={Building2} title="Branch Information" accent="blue" />
            <div className="space-y-4">

              <F label="Branch Name" required error={errors.branch_name}>
                <input
                  type="text"
                  value={form.branch_name}
                  onChange={(e) => setField('branch_name', e.target.value)}
                  placeholder="e.g. Mogadishu Central Branch"
                  className={inputCls(errors.branch_name)}
                />
              </F>

              {/* Location fields — create mode only */}
              {isCreate && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Country dropdown */}
                    <F label="Country" required error={errors.country}>
                      <div className="relative">
                        <select
                          value={form.country}
                          onChange={(e) => {
                            setField('country', e.target.value);
                            setField('city_id', '');
                            clearErr('country', 'city_id');
                          }}
                          className={inputCls(errors.country)}
                        >
                          <option value="">Select country…</option>
                          {countriesQuery.isLoading ? (
                            <option disabled>Loading…</option>
                          ) : countries.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </F>

                    {/* City dropdown — locked until country selected */}
                    <F label="City" required error={errors.city_id}>
                      <select
                        value={form.city_id}
                        onChange={(e) => { setField('city_id', e.target.value); clearErr('city_id'); }}
                        disabled={!form.country}
                        className={`${inputCls(errors.city_id)} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <option value="">
                          {form.country
                            ? citiesQuery.isLoading ? 'Loading cities…' : 'Select city…'
                            : 'Select a country first'}
                        </option>
                        {cities.map((c) => (
                          <option key={c.city_id} value={String(c.city_id)}>
                            {c.city_name}{c.state_region && c.state_region !== c.city_name ? ` — ${c.state_region}` : ''}
                          </option>
                        ))}
                      </select>
                    </F>
                  </div>

                  {/* Location / Area — free text */}
                  <F
                    label="Location / Area"
                    required
                    error={errors.location_name}
                    hint="District, neighborhood, or street address within the city"
                  >
                    <div className="relative">
                      <MapPin size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                      <input
                        type="text"
                        value={form.location_name}
                        onChange={(e) => setField('location_name', e.target.value)}
                        placeholder="e.g. Medina District, Airport Road, Industrial Zone"
                        className={`${inputCls(errors.location_name)} pl-8`}
                      />
                    </div>
                  </F>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <F label="Banner / Office Phone">
                  <div className="relative">
                    <Phone size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      type="tel"
                      value={form.banner_tel}
                      onChange={(e) => setField('banner_tel', e.target.value)}
                      placeholder="+252 61 0000000"
                      className={`${iCls} pl-8`}
                    />
                  </div>
                </F>
                <F label="Branch Email">
                  <div className="relative">
                    <Mail size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      type="email"
                      value={form.br_email}
                      onChange={(e) => setField('br_email', e.target.value)}
                      placeholder="branch@example.com"
                      className={`${iCls} pl-8`}
                    />
                  </div>
                </F>
              </div>
            </div>
          </div>

          {/* ── Section 2: Manager Assignment ── */}
          <div>
            <SectionHead icon={User} title="Assign Manager" accent="violet" />
            <div className="space-y-4">

              {isCreate ? (
                <F
                  label="Search &amp; Select Manager"
                  hint="Auto-fills name and phone from employee record"
                >
                  <ManagerSelector
                    selected={form._selectedEmployee}
                    onSelect={selectManager}
                    employees={employees}
                    loadingEmployees={employeesQuery.isLoading}
                    branches={branches}
                  />
                </F>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Manager Name">
                    <div className="relative">
                      <User size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                      <input
                        type="text"
                        value={form.manager_name}
                        onChange={(e) => setField('manager_name', e.target.value)}
                        placeholder="Manager full name"
                        className={`${iCls} pl-8`}
                      />
                    </div>
                  </F>
                  <F label="Manager Phone">
                    <div className="relative">
                      <Phone size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                      <input
                        type="tel"
                        value={form.manager_tel}
                        onChange={(e) => setField('manager_tel', e.target.value)}
                        placeholder="+252 61 0000000"
                        className={`${iCls} pl-8`}
                      />
                    </div>
                  </F>
                </div>
              )}

              {isCreate && form._selectedEmployee && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Manager Name (auto-filled)">
                    <div className="relative">
                      <User size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                      <input
                        type="text"
                        value={form.manager_name}
                        onChange={(e) => setField('manager_name', e.target.value)}
                        className={`${iCls} pl-8`}
                      />
                    </div>
                  </F>
                  <F label="Manager Phone (auto-filled)">
                    <div className="relative">
                      <Phone size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                      <input
                        type="tel"
                        value={form.manager_tel}
                        onChange={(e) => setField('manager_tel', e.target.value)}
                        className={`${iCls} pl-8`}
                      />
                    </div>
                  </F>
                </div>
              )}
            </div>
          </div>

          <ModalFormFooter
            onClose={() => setModal(null)}
            isSubmitting={isBusy}
            submitLabel={isEdit ? 'Save Changes' : 'Create Branch'}
          />
        </form>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.branch_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete Branch"
        message={<>Delete branch <strong>{deleteTarget?.branch_name}</strong>? This cannot be undone.</>}
      />
    </>
  );
}

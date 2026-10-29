import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
const PROVIDER_TYPES = ['truck', 'ship', 'plane'];
const ENTITY_TYPES = ['company', 'individual'];

function statusTone(status) {
  return String(status || '').toLowerCase() === 'active' ? 'active' : 'inactive';
}

export default function TransportPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('providers');
  const [page, setPage] = useState(1);
  const [providerModal, setProviderModal] = useState(null);
  const [routeModal, setRouteModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [providerForm, setProviderForm] = useState({ name: '', provider_type: 'truck', entity_type: 'company', phone: '', status: 'active' });
  const [routeForm, setRouteForm] = useState({ from_branch_id: '', to_branch_id: '', distance_km: '' });

  const providersQuery = useQuery({
    queryKey: ['transport-providers', page],
    queryFn: async () => (await api.get('/api/v1/transport/providers', { params: { page, limit: PAGE_LIMIT } })).data,
    enabled: tab === 'providers',
    staleTime: 60 * 1000
  });

  const routesQuery = useQuery({
    queryKey: ['transport-routes', page],
    queryFn: async () => (await api.get('/api/v1/transport/routes', { params: { page, limit: PAGE_LIMIT } })).data,
    enabled: tab === 'routes',
    staleTime: 60 * 1000
  });

  const branchesQuery = useQuery({
    queryKey: ['branches-for-transport'],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000
  });

  const providers = getCollection(providersQuery.data);
  const routes = getCollection(routesQuery.data);
  const branches = getCollection(branchesQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: tab === 'providers' ? ['transport-providers'] : ['transport-routes'] });
  }

  const createProvider = useMutation({
    mutationFn: (p) => api.post('/api/v1/transport/providers', p),
    onSuccess: () => { toast.success('Provider created'); setProviderModal(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to create provider'))
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, p }) => api.put(`/api/v1/transport/providers/${id}`, p),
    onSuccess: () => { toast.success('Provider updated'); setProviderModal(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to update provider'))
  });

  const deleteProvider = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/transport/providers/${id}`),
    onSuccess: () => { toast.success('Provider deleted'); setDeleteTarget(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to delete provider'))
  });

  const createRoute = useMutation({
    mutationFn: (p) => api.post('/api/v1/transport/routes', p),
    onSuccess: () => { toast.success('Route created'); setRouteModal(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to create route'))
  });

  const updateRoute = useMutation({
    mutationFn: ({ id, p }) => api.put(`/api/v1/transport/routes/${id}`, p),
    onSuccess: () => { toast.success('Route updated'); setRouteModal(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to update route'))
  });

  const deleteRoute = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/transport/routes/${id}`),
    onSuccess: () => { toast.success('Route deleted'); setDeleteTarget(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to delete route'))
  });

  const providerColumns = useMemo(() => [
    { key: 'name', label: 'Name' },
    { key: 'entity', label: 'Entity' },
    { key: 'type', label: 'Type' },
    { key: 'phone', label: 'Contact' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions', align: 'right' }
  ], []);

  const routeColumns = useMemo(() => [
    { key: 'origin', label: 'Origin' },
    { key: 'destination', label: 'Destination' },
    { key: 'distance', label: 'Distance (km)' },
    { key: 'actions', label: 'Actions', align: 'right' }
  ], []);

  const providerRows = useMemo(() => providers.map((p) => ({
    id: p.provider_id,
    name: p.name,
    entity: <Badge label={p.entity_type === 'individual' ? 'Individual' : 'Company'} status={p.entity_type === 'individual' ? 'inactive' : 'active'} />,
    type: p.provider_type || '--',
    phone: p.phone || '--',
    status: <Badge label={p.status || 'active'} status={statusTone(p.status)} />,
    actions: (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setProviderModal({ mode: 'edit', record: p }); setProviderForm({ name: p.name || '', provider_type: p.provider_type || 'truck', entity_type: p.entity_type || 'company', phone: p.phone || '', status: p.status || 'active' }); }} className="rounded-xl border px-3 py-1.5 text-xs dark:border-slate-700">Edit</button>
        <button type="button" onClick={() => setDeleteTarget({ type: 'provider', record: p })} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/50">Delete</button>
      </div>
    )
  })), [providers]);

  const routeRows = useMemo(() => routes.map((r) => ({
    id: r.route_id,
    origin: r.from_branch_name || '--',
    destination: r.to_branch_name || '--',
    distance: r.distance_km ?? '--',
    actions: (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setRouteModal({ mode: 'edit', record: r }); setRouteForm({ from_branch_id: String(r.from_branch_id || ''), to_branch_id: String(r.to_branch_id || ''), distance_km: String(r.distance_km || '') }); }} className="rounded-xl border px-3 py-1.5 text-xs dark:border-slate-700">Edit</button>
        <button type="button" onClick={() => setDeleteTarget({ type: 'route', record: r })} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/50">Delete</button>
      </div>
    )
  })), [routes]);

  const isProviders = tab === 'providers';
  const query = isProviders ? providersQuery : routesQuery;
  const meta = getMeta(query.data);

  return (
    <>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => { setTab('providers'); setPage(1); }} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === 'providers' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'border dark:border-slate-700'}`}>Providers</button>
        <button type="button" onClick={() => { setTab('routes'); setPage(1); }} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === 'routes' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'border dark:border-slate-700'}`}>Routes</button>
      </div>

      <ModuleDataPage
        title={isProviders ? 'Transport Providers' : 'Routes'}
        subtitle={isProviders ? 'Third-party transport providers' : 'Branch-to-branch routes'}
        actions={(
          <button type="button" onClick={() => {
            if (isProviders) {
              setProviderModal({ mode: 'create' });
              setProviderForm({ name: '', provider_type: 'truck', entity_type: 'company', phone: '', status: 'active' });
            } else {
              setRouteModal({ mode: 'create' });
              setRouteForm({ from_branch_id: '', to_branch_id: '', distance_km: '' });
            }
          }} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
            {isProviders ? '+ Add Provider' : '+ Add Route'}
          </button>
        )}
        columns={isProviders ? providerColumns : routeColumns}
        rows={isProviders ? providerRows : routeRows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || (isProviders ? providerRows.length : routeRows.length)}
        onPageChange={setPage}
      />

      <Modal isOpen={Boolean(providerModal)} onClose={() => setProviderModal(null)} title={providerModal?.mode === 'edit' ? 'Edit Provider' : 'Add Provider'} size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!providerForm.name.trim()) { toast.error('Name is required'); return; }
          const payload = { name: providerForm.name.trim(), provider_type: providerForm.provider_type, entity_type: providerForm.entity_type, phone: providerForm.phone.trim() || undefined, status: providerForm.status };
          if (providerModal?.mode === 'edit') updateProvider.mutate({ id: providerModal.record.provider_id, p: payload });
          else createProvider.mutate(payload);
        }}>
          <Input label="Name" required value={providerForm.name} onChange={(e) => setProviderForm((c) => ({ ...c, name: e.target.value }))} />
          <label className={labelClass}><span className={labelTitleClass}>Entity Type</span>
            <select value={providerForm.entity_type} onChange={(e) => setProviderForm((c) => ({ ...c, entity_type: e.target.value }))} className={selectFieldClass}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t === 'individual' ? 'Individual' : 'Company'}</option>)}
            </select>
          </label>
          <label className={labelClass}><span className={labelTitleClass}>Mode</span>
            <select value={providerForm.provider_type} onChange={(e) => setProviderForm((c) => ({ ...c, provider_type: e.target.value }))} className={selectFieldClass}>
              {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <Input label="Phone" value={providerForm.phone} onChange={(e) => setProviderForm((c) => ({ ...c, phone: e.target.value }))} />
          {providerModal?.mode === 'edit' ? (
            <label className={labelClass}><span className={labelTitleClass}>Status</span>
              <select value={providerForm.status} onChange={(e) => setProviderForm((c) => ({ ...c, status: e.target.value }))} className={selectFieldClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          ) : null}
          <ModalFormFooter onClose={() => setProviderModal(null)} isSubmitting={createProvider.isPending || updateProvider.isPending} submitLabel={providerModal?.mode === 'edit' ? 'Save' : 'Create'} />
        </form>
      </Modal>

      <Modal isOpen={Boolean(routeModal)} onClose={() => setRouteModal(null)} title={routeModal?.mode === 'edit' ? 'Edit Route' : 'Add Route'} size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (routeModal?.mode === 'edit') {
            if (!routeForm.distance_km) { toast.error('Distance is required'); return; }
            updateRoute.mutate({ id: routeModal.record.route_id, p: { distance_km: Number(routeForm.distance_km) } });
            return;
          }
          if (!routeForm.from_branch_id || !routeForm.to_branch_id || !routeForm.distance_km) { toast.error('All fields are required'); return; }
          createRoute.mutate({ from_branch_id: Number(routeForm.from_branch_id), to_branch_id: Number(routeForm.to_branch_id), distance_km: Number(routeForm.distance_km) });
        }}>
          {routeModal?.mode === 'create' ? (
            <>
              <label className={labelClass}><span className={labelTitleClass}>Origin Branch</span>
                <select required value={routeForm.from_branch_id} onChange={(e) => setRouteForm((c) => ({ ...c, from_branch_id: e.target.value }))} className={selectFieldClass}>
                  <option value="">Select branch</option>
                  {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                </select>
              </label>
              <label className={labelClass}><span className={labelTitleClass}>Destination Branch</span>
                <select required value={routeForm.to_branch_id} onChange={(e) => setRouteForm((c) => ({ ...c, to_branch_id: e.target.value }))} className={selectFieldClass}>
                  <option value="">Select branch</option>
                  {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <Input label="Distance (km)" type="number" min="0" step="0.1" required value={routeForm.distance_km} onChange={(e) => setRouteForm((c) => ({ ...c, distance_km: e.target.value }))} />
          <ModalFormFooter onClose={() => setRouteModal(null)} isSubmitting={createRoute.isPending || updateRoute.isPending} submitLabel={routeModal?.mode === 'edit' ? 'Save' : 'Create'} />
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'provider') deleteProvider.mutate(deleteTarget.record.provider_id);
          else deleteRoute.mutate(deleteTarget.record.route_id);
        }}
        isSubmitting={deleteProvider.isPending || deleteRoute.isPending}
        title="Confirm Delete"
        message={<>Delete this {deleteTarget?.type === 'provider' ? 'provider' : 'route'}?</>}
      />
    </>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

function disputeStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'resolved') return 'success';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'open') return 'danger';
  return 'inactive';
}

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveDispute, setResolveDispute] = useState(null);
  const [viewDispute, setViewDispute] = useState(null);
  const [createForm, setCreateForm] = useState({ cargo_id: '', dispute_type_id: '', description: '' });
  const [resolveForm, setResolveForm] = useState({ resolution: '', refund_amount: '' });

  const query = useQuery({
    queryKey: ['disputes-list', page],
    queryFn: async () => (await api.get('/api/v1/disputes', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const typesQuery = useQuery({
    queryKey: ['dispute-types'],
    queryFn: async () => (await api.get('/api/v1/disputes/types')).data,
    staleTime: 5 * 60 * 1000
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-for-disputes'],
    queryFn: async () => (await api.get('/api/cargo', { params: { page: 1, limit: 200 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const disputes = getCollection(query.data);
  const types = getCollection(typesQuery.data);
  const cargoList = getCollection(cargoQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['disputes-list'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/disputes', payload),
    onSuccess: () => {
      toast.success('Dispute created successfully');
      setCreateOpen(false);
      setCreateForm({ cargo_id: '', dispute_type_id: '', description: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to create dispute'))
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/v1/disputes/${id}/resolve`, payload),
    onSuccess: () => {
      toast.success('Dispute resolved successfully');
      setResolveDispute(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to resolve dispute'))
  });

  const columns = useMemo(
    () => [
      { key: 'tracking_number', label: 'Tracking No' },
      { key: 'type', label: 'Type' },
      { key: 'customer', label: 'Customer' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Created' },
      { key: 'actions', label: 'Actions', align: 'right' }
    ],
    []
  );

  const rows = useMemo(() => {
    return disputes.map((dispute) => ({
      id: dispute.dispute_id,
      tracking_number: dispute.tracking_number || '--',
      type: dispute.dispute_type || '--',
      customer: dispute.customer_name || '--',
      status: <Badge label={dispute.status || 'open'} status={disputeStatusTone(dispute.status)} />,
      date: formatDate(dispute.created_at),
      actions: (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setViewDispute(dispute)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700">View</button>
          {String(dispute.status || '').toLowerCase() !== 'resolved' ? (
            <button
              type="button"
              onClick={() => {
                setResolveDispute(dispute);
                setResolveForm({ resolution: '', refund_amount: '' });
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
            >
              Resolve
            </button>
          ) : null}
        </div>
      )
    }));
  }, [disputes]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Disputes"
        subtitle="Customer disputes and resolutions"
        actions={(
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            + Create Dispute
          </button>
        )}
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Dispute" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!createForm.cargo_id || !createForm.dispute_type_id || !createForm.description.trim()) {
              toast.error('Cargo, type, and description are required');
              return;
            }
            createMutation.mutate({
              cargo_id: Number(createForm.cargo_id),
              dispute_type_id: Number(createForm.dispute_type_id),
              description: createForm.description.trim()
            });
          }}
        >
          <label className={labelClass}>
            <span className={labelTitleClass}>Cargo</span>
            <select
              required
              value={createForm.cargo_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, cargo_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select cargo</option>
              {cargoList.map((cargo) => (
                <option key={cargo.cargo_id} value={cargo.cargo_id}>
                  {cargo.tracking_number || `Cargo #${cargo.cargo_id}`}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Dispute Type</span>
            <select
              required
              value={createForm.dispute_type_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, dispute_type_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select type</option>
              {types.map((type) => (
                <option key={type.dispute_type_id} value={type.dispute_type_id}>{type.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Description</span>
            <textarea
              required
              value={createForm.description}
              onChange={(e) => setCreateForm((c) => ({ ...c, description: e.target.value }))}
              rows={4}
              className={selectFieldClass}
            />
          </label>
          <ModalFormFooter onClose={() => setCreateOpen(false)} isSubmitting={createMutation.isPending} submitLabel="Create Dispute" />
        </form>
      </Modal>

      <Modal isOpen={Boolean(resolveDispute)} onClose={() => setResolveDispute(null)} title="Resolve Dispute" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!resolveForm.resolution.trim()) {
              toast.error('Resolution is required');
              return;
            }
            resolveMutation.mutate({
              id: resolveDispute.dispute_id,
              payload: {
                resolution: resolveForm.resolution.trim(),
                refund_amount: resolveForm.refund_amount ? Number(resolveForm.refund_amount) : undefined
              }
            });
          }}
        >
          <label className={labelClass}>
            <span className={labelTitleClass}>Resolution</span>
            <textarea
              required
              value={resolveForm.resolution}
              onChange={(e) => setResolveForm((c) => ({ ...c, resolution: e.target.value }))}
              rows={4}
              className={selectFieldClass}
            />
          </label>
          <Input
            label="Refund Amount"
            type="number"
            min="0"
            step="0.01"
            value={resolveForm.refund_amount}
            onChange={(e) => setResolveForm((c) => ({ ...c, refund_amount: e.target.value }))}
          />
          <ModalFormFooter onClose={() => setResolveDispute(null)} isSubmitting={resolveMutation.isPending} submitLabel="Resolve" />
        </form>
      </Modal>

      <Modal isOpen={Boolean(viewDispute)} onClose={() => setViewDispute(null)} title="Dispute Detail" size="lg">
        {viewDispute ? (
          <div className="space-y-3 text-sm">
            <p><strong>Tracking:</strong> {viewDispute.tracking_number || '--'}</p>
            <p><strong>Customer:</strong> {viewDispute.customer_name || '--'}</p>
            <p><strong>Type:</strong> {viewDispute.dispute_type || viewDispute.type_name || '--'}</p>
            <p><strong>Status:</strong> {viewDispute.status || '--'}</p>
            <p><strong>Description:</strong> {viewDispute.description || '--'}</p>
            <p><strong>Resolution:</strong> {viewDispute.resolution || '--'}</p>
            <p><strong>Created:</strong> {formatDate(viewDispute.created_at)}</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

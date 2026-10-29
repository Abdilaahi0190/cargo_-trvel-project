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
import { formatCurrency } from '../../utils/formatCurrency';

const PAGE_LIMIT = 20;

function policyStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return 'success';
  if (normalized === 'claimed') return 'pending';
  if (normalized === 'expired') return 'danger';
  return 'inactive';
}

export default function InsurancePage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [claimPolicy, setClaimPolicy] = useState(null);
  const [createForm, setCreateForm] = useState({
    cargo_id: '',
    provider_id: '',
    policy_number: '',
    insured_value: '',
    premium_paid: '0',
    start_date: '',
    end_date: ''
  });
  const [claimForm, setClaimForm] = useState({ claim_amount: '', claim_notes: '' });

  const query = useQuery({
    queryKey: ['insurance-policies', page],
    queryFn: async () => (await api.get('/api/v1/insurance', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-for-insurance'],
    queryFn: async () => (await api.get('/api/cargo', { params: { page: 1, limit: 200 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const providersQuery = useQuery({
    queryKey: ['insurance-providers'],
    queryFn: async () => (await api.get('/api/v1/insurance/providers')).data,
    staleTime: 5 * 60 * 1000
  });

  const policies = getCollection(query.data);
  const cargoList = getCollection(cargoQuery.data);
  const providers = getCollection(providersQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['insurance-policies'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/insurance', payload),
    onSuccess: () => {
      toast.success('Policy created successfully');
      setCreateOpen(false);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to create policy'))
  });

  const claimMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/v1/insurance/${id}/claim`, payload),
    onSuccess: () => {
      toast.success('Claim filed successfully');
      setClaimPolicy(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to file claim'))
  });

  const columns = useMemo(
    () => [
      { key: 'tracking_number', label: 'Tracking No' },
      { key: 'policy_number', label: 'Policy Number' },
      { key: 'coverage', label: 'Coverage Amount' },
      { key: 'status', label: 'Status' },
      { key: 'actions', label: 'Actions', align: 'right' }
    ],
    []
  );

  const rows = useMemo(() => {
    return policies.map((policy) => {
      const status = policy.policy_status || policy.claim_status || 'active';
      const canClaim = String(status).toLowerCase() === 'active';

      return {
        id: policy.insurance_id,
        tracking_number: policy.tracking_number || '--',
        policy_number: policy.policy_number || '--',
        coverage: formatCurrency(policy.insured_value),
        status: <Badge label={status} status={policyStatusTone(status)} />,
        actions: canClaim ? (
          <button
            type="button"
            onClick={() => {
              setClaimPolicy(policy);
              setClaimForm({ claim_amount: '', claim_notes: '' });
            }}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            File Claim
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      };
    });
  }, [policies]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Cargo Insurance"
        subtitle="Cargo insurance policies and claim status"
        actions={(
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            + Add Policy
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

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add Policy" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!createForm.cargo_id || !createForm.provider_id || !createForm.insured_value) {
              toast.error('Cargo, provider, and insured value are required');
              return;
            }
            const notes = [
              createForm.start_date ? `Start: ${createForm.start_date}` : null,
              createForm.end_date ? `End: ${createForm.end_date}` : null
            ].filter(Boolean).join(' | ');
            createMutation.mutate({
              cargo_id: Number(createForm.cargo_id),
              provider_id: Number(createForm.provider_id),
              policy_number: createForm.policy_number.trim() || undefined,
              insured_value: Number(createForm.insured_value),
              premium_paid: Number(createForm.premium_paid || 0),
              notes: notes || undefined
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
            <span className={labelTitleClass}>Provider</span>
            <select
              required
              value={createForm.provider_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, provider_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select provider</option>
              {providers.map((provider) => (
                <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>
              ))}
            </select>
          </label>
          <Input
            label="Policy Number"
            value={createForm.policy_number}
            onChange={(e) => setCreateForm((c) => ({ ...c, policy_number: e.target.value }))}
          />
          <Input
            label="Insured Value"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={createForm.insured_value}
            onChange={(e) => setCreateForm((c) => ({ ...c, insured_value: e.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Start Date"
              type="date"
              value={createForm.start_date}
              onChange={(e) => setCreateForm((c) => ({ ...c, start_date: e.target.value }))}
            />
            <Input
              label="End Date"
              type="date"
              value={createForm.end_date}
              onChange={(e) => setCreateForm((c) => ({ ...c, end_date: e.target.value }))}
            />
          </div>
          <ModalFormFooter onClose={() => setCreateOpen(false)} isSubmitting={createMutation.isPending} submitLabel="Add Policy" />
        </form>
      </Modal>

      <Modal isOpen={Boolean(claimPolicy)} onClose={() => setClaimPolicy(null)} title="File Claim" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!claimForm.claim_amount) {
              toast.error('Claim amount is required');
              return;
            }
            claimMutation.mutate({
              id: claimPolicy.insurance_id,
              payload: {
                claim_amount: Number(claimForm.claim_amount),
                claim_notes: claimForm.claim_notes.trim() || undefined
              }
            });
          }}
        >
          <Input
            label="Claim Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={claimForm.claim_amount}
            onChange={(e) => setClaimForm((c) => ({ ...c, claim_amount: e.target.value }))}
          />
          <label className={labelClass}>
            <span className={labelTitleClass}>Claim Notes</span>
            <textarea
              value={claimForm.claim_notes}
              onChange={(e) => setClaimForm((c) => ({ ...c, claim_notes: e.target.value }))}
              rows={3}
              className={selectFieldClass}
            />
          </label>
          <ModalFormFooter onClose={() => setClaimPolicy(null)} isSubmitting={claimMutation.isPending} submitLabel="File Claim" />
        </form>
      </Modal>
    </>
  );
}

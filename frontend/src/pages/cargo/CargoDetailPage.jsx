import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage } from '../../api/listUtils';
import { getCargoById } from '../../api/cargo.api';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import useAuthStore from '../../store/authStore';
import {
  fieldLabel,
  formatCurrency,
  formatDate,
  findBranchRootId,
  getCollection,
  mapBranchOptions,
  paymentStatusClass,
  resolveBranchRoot,
  resolveCreatedByBranchName,
  resolveDescription,
  resolveFlightName,
  resolvePaymentReceivedAmount,
  resolvePaymentStatus
} from './cargo.utils';

function Section({ title, children }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DetailCell({ label, value, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value || '--'}</dd>
    </div>
  );
}

const STATUS_OPTIONS = ['Pending', 'Picked Up', 'In Transit', 'Delivered', 'Cancelled'];

export default function CargoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeBranchName = useAuthStore((state) => state.branchName);
  const branchId = useAuthStore((state) => state.branchId);
  const uBrId = useAuthStore((state) => state.uBrId);
  const [statusName, setStatusName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const branchRoot = useMemo(() => resolveBranchRoot(activeBranchName), [activeBranchName]);

  const cargoQuery = useQuery({
    queryKey: ['cargo-detail', id],
    queryFn: async () => (await getCargoById(id)).data,
    enabled: Boolean(id)
  });

  const branchesQuery = useQuery({
    queryKey: ['cargo-detail-branches'],
    queryFn: async () => {
      try {
        return (await api.get('/api/branches')).data;
      } catch {
        return (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data;
      }
    },
    staleTime: 5 * 60 * 1000
  });

  const cargo = cargoQuery.data?.data || {};

  const statusMutation = useMutation({
    mutationFn: (payload) => api.put(`/api/cargo/${id}/status`, payload),
    onSuccess: () => {
      toast.success('Cargo status updated');
      queryClient.invalidateQueries({ queryKey: ['cargo-detail', id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to update status'))
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/cargo/${id}`),
    onSuccess: () => {
      toast.success('Cargo deleted');
      navigate('/cargo');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete cargo'))
  });
  const branches = useMemo(() => mapBranchOptions(getCollection(branchesQuery.data)), [branchesQuery.data]);
  const branchLookup = useMemo(
    () => new Map(branches.map((branch) => [Number(branch.branch_id), branch.branch_name])),
    [branches]
  );
  const dubaiRootId = useMemo(() => findBranchRootId(branches, 'dubai'), [branches]);
  const mogadishuRootId = useMemo(() => findBranchRootId(branches, 'mogadishu'), [branches]);

  const createdByBranchName = useMemo(
    () => resolveCreatedByBranchName(cargo, branchLookup, activeBranchName),
    [activeBranchName, branchLookup, cargo]
  );
  const paymentStatus = resolvePaymentStatus(cargo);

  if (cargoQuery.isLoading || branchesQuery.isLoading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cargo Details"
        subtitle={`Branch root: ${branchRoot}${dubaiRootId || mogadishuRootId ? '' : ' (branch roots unresolved)'}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/cargo')} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
              Back to List
            </button>
            <button type="button" onClick={() => setDeleteOpen(true)} className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/50">
              Delete
            </button>
          </div>
        )}
      />

      <Section title="Shipment Info">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DetailCell label="AWB No" value={cargo?.tracking_number} />
          <DetailCell label="Shipment Date" value={formatDate(cargo?.shipment_date)} />
          <DetailCell label="Flight Name" value={resolveFlightName(cargo)} />
          <DetailCell
            label="Transport Provider"
            value={cargo?.transport_provider_name
              ? `${cargo.transport_provider_name} (${cargo.transport_provider_entity_type === 'individual' ? 'Individual' : 'Company'})`
              : 'Not assigned yet'}
          />
          <DetailCell label="Origin Branch" value={cargo?.from_branch_name || branchLookup.get(Number(cargo?.from_branch_id)) || '--'} />
          <DetailCell label="Destination Branch" value={cargo?.to_branch_name || branchLookup.get(Number(cargo?.to_branch_id)) || '--'} />
          <DetailCell label="Created By Branch" value={createdByBranchName} />
        </dl>
      </Section>

      <Section title="Parties">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailCell label="Shipper Name" value={cargo?.sender_name} />
          <DetailCell label="Receiver Name" value={cargo?.receiver_name} />
        </dl>
      </Section>

      <Section title="Cargo Metrics">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DetailCell label="Pieces" value={cargo?.pcs != null ? String(cargo.pcs) : '--'} />
          <DetailCell label={fieldLabel('weight', branchRoot)} value={cargo?.weight != null ? String(cargo.weight) : '--'} />
          <DetailCell label={fieldLabel('rate_per_kg', branchRoot)} value={cargo?.rate_per_kg != null ? formatCurrency(cargo?.rate_per_kg, branchRoot) : '--'} />
          <DetailCell label="Rate" value={cargo?.price != null ? formatCurrency(cargo?.price, branchRoot) : '--'} />
          <DetailCell label="Extra Charges" value={formatCurrency(cargo?.extra_charges, branchRoot)} />
          <DetailCell label="Description" value={resolveDescription(cargo)} className="xl:col-span-2" />
          <DetailCell label="Mark" value={cargo?.mark || '--'} />
        </dl>
      </Section>

      <Section title="Update Status">
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const nextStatus = statusName || cargo?.status_name || cargo?.status;
            if (!nextStatus || !branchId || !uBrId) {
              toast.error('Status and branch context are required');
              return;
            }
            statusMutation.mutate({
              status_name: nextStatus,
              branch_id: Number(branchId),
              user_branch_id: Number(uBrId)
            });
          }}
        >
          <label className={`${labelClass} flex-1`}>
            <span className={labelTitleClass}>Status</span>
            <select
              value={statusName || cargo?.status_name || cargo?.status || ''}
              onChange={(e) => setStatusName(e.target.value)}
              className={selectFieldClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={statusMutation.isPending}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            {statusMutation.isPending ? 'Saving...' : 'Update Status'}
          </button>
        </form>
      </Section>

      <Section title="Payment Summary">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-slate-900 px-5 py-4 text-white">
            <dt className="text-sm text-slate-300">{fieldLabel('total_mgq', branchRoot)}</dt>
            <dd className="mt-2 text-2xl font-semibold">{formatCurrency(cargo?.total_amount, branchRoot)}</dd>
          </div>
          <div className="rounded-3xl bg-slate-50 px-5 py-4 dark:bg-slate-800">
            <dt className="text-sm text-slate-500 dark:text-slate-400">{fieldLabel('balance_mgq', branchRoot)}</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(cargo?.balance_mgq, branchRoot)}</dd>
          </div>
          <DetailCell label={fieldLabel('payment_received_amount', branchRoot)} value={formatCurrency(resolvePaymentReceivedAmount(cargo), branchRoot)} />
          <div>
            <dt className="text-sm text-slate-500 dark:text-slate-400">Payment Status</dt>
            <dd className="mt-2">
              <span className={paymentStatusClass(paymentStatus)}>{paymentStatus}</span>
            </dd>
          </div>
        </dl>
      </Section>

      <ConfirmDeleteModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isSubmitting={deleteMutation.isPending}
        title="Delete Cargo"
        message={<>Delete cargo <strong>{cargo?.tracking_number}</strong>?</>}
      />
    </div>
  );
}

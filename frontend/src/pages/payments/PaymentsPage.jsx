import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ cargo_id: '', account_id: '', amount: '', payment_type: 'cash' });

  const query = useQuery({
    queryKey: ['payments-list', page],
    queryFn: async () => (await api.get('/api/payments', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-for-payments'],
    queryFn: async () => (await api.get('/api/cargo', { params: { page: 1, limit: 200 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts-for-payments'],
    queryFn: async () => (await api.get('/api/accounts', { params: { limit: 100 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const payments = getCollection(query.data);
  const cargoList = getCollection(cargoQuery.data);
  const accounts = getCollection(accountsQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['payments-list'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/payments', payload),
    onSuccess: () => { toast.success('Payment recorded'); setCreateOpen(false); setForm({ cargo_id: '', account_id: '', amount: '', payment_type: 'cash' }); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to record payment'))
  });

  const columns = useMemo(() => [
    { key: 'tracking', label: 'Tracking' },
    { key: 'account', label: 'Account' },
    { key: 'amount', label: 'Amount' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Date' }
  ], []);

  const rows = useMemo(() => payments.map((p) => ({
    id: p.payment_id,
    tracking: p.tracking_number || p.cargo_id || '--',
    account: p.account_name || p.name || '--',
    amount: formatCurrency(p.amount),
    type: p.payment_type || '--',
    date: formatDate(p.created_at)
  })), [payments]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Payments"
        subtitle="Cargo payments and account activity"
        actions={<button type="button" onClick={() => setCreateOpen(true)} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">+ Record Payment</button>}
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Record Payment" size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!form.cargo_id || !form.account_id || !form.amount) { toast.error('All fields are required'); return; }
          createMutation.mutate({ cargo_id: Number(form.cargo_id), account_id: Number(form.account_id), amount: Number(form.amount), payment_type: form.payment_type });
        }}>
          <label className={labelClass}><span className={labelTitleClass}>Cargo</span>
            <select required value={form.cargo_id} onChange={(e) => setForm((c) => ({ ...c, cargo_id: e.target.value }))} className={selectFieldClass}>
              <option value="">Select cargo</option>
              {cargoList.map((c) => <option key={c.cargo_id} value={c.cargo_id}>{c.tracking_number || `Cargo #${c.cargo_id}`}</option>)}
            </select>
          </label>
          <label className={labelClass}><span className={labelTitleClass}>Account</span>
            <select required value={form.account_id} onChange={(e) => setForm((c) => ({ ...c, account_id: e.target.value }))} className={selectFieldClass}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
          </label>
          <Input label="Amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} />
          <label className={labelClass}><span className={labelTitleClass}>Payment Type</span>
            <select value={form.payment_type} onChange={(e) => setForm((c) => ({ ...c, payment_type: e.target.value }))} className={selectFieldClass}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <ModalFormFooter onClose={() => setCreateOpen(false)} isSubmitting={createMutation.isPending} submitLabel="Record Payment" />
        </form>
      </Modal>
    </>
  );
}

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
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

function expenseStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'success';
  if (normalized === 'pending') return 'pending';
  return 'inactive';
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [payExpense, setPayExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [createForm, setCreateForm] = useState({ expense_type_id: '', amount: '', description: '', trip_id: '', transport_provider_id: '' });
  const [payForm, setPayForm] = useState({ amount: '', payment_type: 'cash', account_id: '', description: '' });

  const query = useQuery({
    queryKey: ['expenses-list', page],
    queryFn: async () => (await api.get('/api/expenses', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const typesQuery = useQuery({
    queryKey: ['expense-types'],
    queryFn: async () => (await api.get('/api/v1/expense-types')).data,
    staleTime: 5 * 60 * 1000
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts-for-expenses'],
    queryFn: async () => (await api.get('/api/accounts', { params: { limit: 100 } })).data,
    enabled: Boolean(payExpense),
    staleTime: 60 * 1000
  });

  const tripsQuery = useQuery({
    queryKey: ['trips-for-expenses'],
    queryFn: async () => (await api.get('/api/trips', { params: { limit: 100 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const providersQuery = useQuery({
    queryKey: ['providers-for-expenses'],
    queryFn: async () => (await api.get('/api/v1/transport/providers', { params: { limit: 200 } })).data,
    enabled: createOpen,
    staleTime: 60 * 1000
  });

  const expenses = getCollection(query.data);
  const types = getCollection(typesQuery.data);
  const accounts = getCollection(accountsQuery.data);
  const trips = getCollection(tripsQuery.data);
  const providers = getCollection(providersQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/expenses', payload),
    onSuccess: () => {
      toast.success('Expense created successfully');
      setCreateOpen(false);
      setCreateForm({ expense_type_id: '', amount: '', description: '', trip_id: '', transport_provider_id: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to create expense'))
  });

  const payMutation = useMutation({
    mutationFn: (payload) => api.post('/api/expense-payments', payload),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      setPayExpense(null);
      setPayForm({ amount: '', payment_type: 'cash', account_id: '', description: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to record payment'))
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/expenses/${id}`),
    onSuccess: () => {
      toast.success('Expense deleted');
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete expense'))
  });

  const columns = useMemo(
    () => [
      { key: 'type', label: 'Type' },
      { key: 'amount', label: 'Amount' },
      { key: 'linked', label: 'Trip / Provider' },
      { key: 'status', label: 'Status' },
      { key: 'branch', label: 'Branch' },
      { key: 'date', label: 'Date' },
      { key: 'actions', label: 'Actions', align: 'right' }
    ],
    []
  );

  const rows = useMemo(() => {
    return expenses.map((expense) => ({
      id: expense.expense_charge_id,
      type: expense.expense_type_name || '--',
      amount: formatCurrency(expense.amount),
      linked: expense.trip_no || expense.transport_provider_name
        ? [expense.trip_no, expense.transport_provider_name].filter(Boolean).join(' · ')
        : '--',
      status: <Badge label={expense.status || 'pending'} status={expenseStatusTone(expense.status)} />,
      branch: expense.branch_name || '--',
      date: expense.charge_month ? formatDate(expense.charge_month) : formatDate(expense.created_at),
      actions: String(expense.status || '').toLowerCase() === 'pending' ? (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPayExpense(expense);
              setPayForm({ amount: String(expense.amount || ''), payment_type: 'cash', account_id: '', description: '' });
            }}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            Record Payment
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(expense)}
            className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-900/50"
          >
            Delete
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      )
    }));
  }, [expenses]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Expenses"
        subtitle="Expense charges and payments"
        actions={(
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            + Create Expense
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

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Expense" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!createForm.expense_type_id || !createForm.amount) {
              toast.error('Type and amount are required');
              return;
            }
            createMutation.mutate({
              expense_type_id: Number(createForm.expense_type_id),
              amount: Number(createForm.amount),
              description: createForm.description.trim() || undefined,
              trip_id: createForm.trip_id ? Number(createForm.trip_id) : undefined,
              transport_provider_id: createForm.transport_provider_id ? Number(createForm.transport_provider_id) : undefined
            });
          }}
        >
          <label className={labelClass}>
            <span className={labelTitleClass}>Expense Type</span>
            <select
              required
              value={createForm.expense_type_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, expense_type_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select type</option>
              {types.map((type) => (
                <option key={type.expense_type_id} value={type.expense_type_id}>{type.name}</option>
              ))}
            </select>
          </label>
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={createForm.amount}
            onChange={(e) => setCreateForm((c) => ({ ...c, amount: e.target.value }))}
          />
          <label className={labelClass}>
            <span className={labelTitleClass}>Link to Trip (optional)</span>
            <select
              value={createForm.trip_id}
              onChange={(e) => {
                const tripId = e.target.value;
                const trip = trips.find((t) => String(t.trip_id) === tripId);
                setCreateForm((c) => ({
                  ...c,
                  trip_id: tripId,
                  transport_provider_id: trip?.provider_id ? String(trip.provider_id) : c.transport_provider_id
                }));
              }}
              className={selectFieldClass}
            >
              <option value="">Not linked to a trip</option>
              {trips.map((trip) => (
                <option key={trip.trip_id} value={trip.trip_id}>{trip.trip_no} — {trip.route} ({trip.provider_name})</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Transport Provider being paid (optional)</span>
            <select
              value={createForm.transport_provider_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, transport_provider_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">No provider</option>
              {providers.map((provider) => (
                <option key={provider.provider_id} value={provider.provider_id}>
                  {provider.name} ({provider.entity_type === 'individual' ? 'Individual' : 'Company'})
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Description</span>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((c) => ({ ...c, description: e.target.value }))}
              rows={3}
              className={selectFieldClass}
            />
          </label>
          <ModalFormFooter onClose={() => setCreateOpen(false)} isSubmitting={createMutation.isPending} submitLabel="Create Expense" />
        </form>
      </Modal>

      <Modal isOpen={Boolean(payExpense)} onClose={() => setPayExpense(null)} title="Record Payment" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!payForm.amount || !payForm.account_id) {
              toast.error('Amount and account are required');
              return;
            }
            payMutation.mutate({
              expense_charge_id: payExpense.expense_charge_id,
              amount: Number(payForm.amount),
              payment_type: payForm.payment_type,
              account_id: Number(payForm.account_id),
              description: payForm.description.trim() || undefined
            });
          }}
        >
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={payForm.amount}
            onChange={(e) => setPayForm((c) => ({ ...c, amount: e.target.value }))}
          />
          <label className={labelClass}>
            <span className={labelTitleClass}>Payment Type</span>
            <select
              value={payForm.payment_type}
              onChange={(e) => setPayForm((c) => ({ ...c, payment_type: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Account</span>
            <select
              required
              value={payForm.account_id}
              onChange={(e) => setPayForm((c) => ({ ...c, account_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.account_id} value={account.account_id}>
                  {account.name} ({formatCurrency(account.balance)})
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>Description (optional)</span>
            <textarea
              placeholder="e.g. Salary payment for June"
              value={payForm.description}
              onChange={(e) => setPayForm((c) => ({ ...c, description: e.target.value }))}
              rows={3}
              className={selectFieldClass}
            />
          </label>
          <ModalFormFooter onClose={() => setPayExpense(null)} isSubmitting={payMutation.isPending} submitLabel="Record Payment" />
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.expense_charge_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete Expense"
        message="Delete this pending expense charge?"
      />
    </>
  );
}

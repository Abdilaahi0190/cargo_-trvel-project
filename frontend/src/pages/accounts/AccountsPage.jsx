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
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { formatCurrency } from '../../utils/formatCurrency';

const PAGE_LIMIT = 20;

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [movement, setMovement] = useState(null);
  const [createForm, setCreateForm] = useState({ account_name: '', currency: 'USD', branch_id: '' });
  const [transferForm, setTransferForm] = useState({ from_account_id: '', to_account_id: '', amount: '' });
  const [movementForm, setMovementForm] = useState({ amount: '', notes: '' });

  const query = useQuery({
    queryKey: ['accounts-list', page],
    queryFn: async () => (await api.get('/api/accounts', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const branchesQuery = useQuery({
    queryKey: ['branches-for-accounts'],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000
  });

  const accounts = getCollection(query.data);
  const branches = getCollection(branchesQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['accounts-list'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/accounts', payload),
    onSuccess: () => {
      toast.success('Account created successfully');
      setCreateOpen(false);
      setCreateForm({ account_name: '', currency: 'USD', branch_id: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to create account'))
  });

  const transferMutation = useMutation({
    mutationFn: (payload) => api.post('/api/accounts/transfer', payload),
    onSuccess: () => {
      toast.success('Transfer completed successfully');
      setTransferOpen(false);
      setTransferForm({ from_account_id: '', to_account_id: '', amount: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to transfer funds'))
  });

  const movementMutation = useMutation({
    mutationFn: ({ accountId, type, payload }) => api.post(`/api/accounts/${accountId}/${type}`, payload),
    onSuccess: (_data, variables) => {
      toast.success(variables.type === 'deposit' ? 'Deposit recorded' : 'Withdrawal recorded');
      setMovement(null);
      setMovementForm({ amount: '', notes: '' });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to process transaction'))
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId) => api.delete(`/api/accounts/${accountId}`),
    onSuccess: () => {
      toast.success('Account deleted');
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete account'))
  });

  const columns = useMemo(
    () => [
      { key: 'branch', label: 'Branch' },
      { key: 'name', label: 'Account Name' },
      { key: 'balance', label: 'Balance' },
      { key: 'currency', label: 'Currency' },
      { key: 'actions', label: 'Actions', align: 'right', wrap: true, cellClassName: 'min-w-[220px]' }
    ],
    []
  );

  const rows = useMemo(() => {
    return accounts.map((account) => ({
      id: account.account_id,
      branch: account.branch_name || account.branch_id || '--',
      name: account.name || '--',
      balance: formatCurrency(account.balance),
      currency: account.institution_type || 'USD',
      actions: (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setMovement({ account, type: 'deposit' });
              setMovementForm({ amount: '', notes: '' });
            }}
            className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              setMovement({ account, type: 'withdraw' });
              setMovementForm({ amount: '', notes: '' });
            }}
            className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700"
          >
            Withdraw
          </button>
          {Number(account.balance) === 0 ? (
            <button
              type="button"
              onClick={() => setDeleteTarget(account)}
              className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700"
            >
              Delete
            </button>
          ) : null}
        </div>
      )
    }));
  }, [accounts]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Accounts"
        subtitle="Branch accounts and balances"
        actions={(
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              + Create Account
            </button>
          </div>
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

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Account" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!createForm.account_name || !createForm.branch_id) {
              toast.error('Account name and branch are required');
              return;
            }
            createMutation.mutate({
              account_name: createForm.account_name.trim(),
              currency: createForm.currency.trim(),
              branch_id: Number(createForm.branch_id),
              initial_balance: 0
            });
          }}
        >
          <Input
            label="Account Name"
            required
            value={createForm.account_name}
            onChange={(e) => setCreateForm((c) => ({ ...c, account_name: e.target.value }))}
          />
          <Input
            label="Currency"
            value={createForm.currency}
            onChange={(e) => setCreateForm((c) => ({ ...c, currency: e.target.value }))}
          />
          <label className={labelClass}>
            <span className={labelTitleClass}>Branch</span>
            <select
              required
              value={createForm.branch_id}
              onChange={(e) => setCreateForm((c) => ({ ...c, branch_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
              ))}
            </select>
          </label>
          <ModalFormFooter onClose={() => setCreateOpen(false)} isSubmitting={createMutation.isPending} submitLabel="Create Account" />
        </form>
      </Modal>

      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Funds" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!transferForm.from_account_id || !transferForm.to_account_id || !transferForm.amount) {
              toast.error('All transfer fields are required');
              return;
            }
            transferMutation.mutate({
              from_account_id: Number(transferForm.from_account_id),
              to_account_id: Number(transferForm.to_account_id),
              amount: Number(transferForm.amount)
            });
          }}
        >
          <label className={labelClass}>
            <span className={labelTitleClass}>From Account</span>
            <select
              required
              value={transferForm.from_account_id}
              onChange={(e) => setTransferForm((c) => ({ ...c, from_account_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.account_id} value={account.account_id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTitleClass}>To Account</span>
            <select
              required
              value={transferForm.to_account_id}
              onChange={(e) => setTransferForm((c) => ({ ...c, to_account_id: e.target.value }))}
              className={selectFieldClass}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.account_id} value={account.account_id}>{account.name}</option>
              ))}
            </select>
          </label>
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={transferForm.amount}
            onChange={(e) => setTransferForm((c) => ({ ...c, amount: e.target.value }))}
          />
          <ModalFormFooter onClose={() => setTransferOpen(false)} isSubmitting={transferMutation.isPending} submitLabel="Transfer" />
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(movement)}
        onClose={() => setMovement(null)}
        title={movement?.type === 'deposit' ? 'Deposit' : 'Withdraw'}
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!movementForm.amount) {
              toast.error('Amount is required');
              return;
            }
            movementMutation.mutate({
              accountId: movement.account.account_id,
              type: movement.type,
              payload: {
                amount: Number(movementForm.amount),
                notes: movementForm.notes.trim() || undefined
              }
            });
          }}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Account: <strong>{movement?.account?.name}</strong>
          </p>
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={movementForm.amount}
            onChange={(e) => setMovementForm((c) => ({ ...c, amount: e.target.value }))}
          />
          <label className={labelClass}>
            <span className={labelTitleClass}>Notes</span>
            <textarea
              value={movementForm.notes}
              onChange={(e) => setMovementForm((c) => ({ ...c, notes: e.target.value }))}
              rows={3}
              className={selectFieldClass}
            />
          </label>
          <ModalFormFooter
            onClose={() => setMovement(null)}
            isSubmitting={movementMutation.isPending}
            submitLabel={movement?.type === 'deposit' ? 'Deposit' : 'Withdraw'}
          />
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.account_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete Account"
        message={<>Delete account <strong>{deleteTarget?.name}</strong>? Balance must be zero.</>}
      />
    </>
  );
}

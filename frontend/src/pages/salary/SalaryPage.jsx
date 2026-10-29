import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Calculator, TrendingUp } from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'success';
  if (s === 'pending') return 'pending';
  return 'inactive';
}

// ─── Salary Breakdown Preview ──────────────────────────────────────────────────
function SalaryBreakdown({ base, overtime_hours, overtime_rate, bonus, penalty, taxBrackets }) {
  const overtimePay = Number(overtime_hours || 0) * Number(overtime_rate || 0);
  const gross = Number(base || 0) + Number(bonus || 0) + overtimePay - Number(penalty || 0);
  const bracket = taxBrackets.find((b) => gross >= Number(b.min_amount) && gross <= Number(b.max_amount));
  const taxRate = bracket ? Number(bracket.tax_rate) : 0;
  const taxAmount = (gross * taxRate) / 100;
  const net = gross - taxAmount;

  const Row = ({ label, value, color, bold }) => (
    <div className={`flex items-center justify-between py-1 text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={color || 'text-[var(--text)]'}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 space-y-0.5">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
        <Calculator size={11} />Salary Preview
      </p>
      <Row label="Base Salary" value={base || 0} />
      {overtimePay > 0 && <Row label={`Overtime (${overtime_hours}h × ${formatCurrency(overtime_rate)})`} value={overtimePay} color="text-blue-400" />}
      {Number(bonus) > 0 && <Row label="Bonus" value={bonus} color="text-emerald-400" />}
      {Number(penalty) > 0 && <Row label="Penalty" value={-Math.abs(penalty)} color="text-red-400" />}
      <div className="my-1.5 border-t border-[var(--border)]" />
      <Row label="Gross" value={gross} bold />
      {taxRate > 0 && <Row label={`Income Tax (${taxRate}%)`} value={-taxAmount} color="text-amber-400" />}
      <div className="my-1.5 border-t border-[var(--border)]" />
      <Row label="Net Salary" value={net} color="text-emerald-400" bold />
      {bracket && (
        <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
          Tax bracket: ${bracket.min_amount} – ${bracket.max_amount} @ {bracket.tax_rate}%
        </p>
      )}
    </div>
  );
}

// ─── Adjustment Modal ──────────────────────────────────────────────────────────
function AdjustmentModal({ charge, onClose }) {
  const queryClient = useQueryClient();

  const taxQuery = useQuery({
    queryKey: ['salary-tax-brackets'],
    queryFn: async () => (await api.get('/api/salary/tax-brackets')).data,
    staleTime: 10 * 60 * 1000
  });

  const taxBrackets = getCollection(taxQuery.data);
  const monthKey = charge?.salary_month ? String(charge.salary_month).slice(0, 7) : '';

  const adjQuery = useQuery({
    queryKey: ['salary-adjustments', charge?.employee_branch_id, monthKey],
    queryFn: async () => (await api.get(`/api/salary/adjustments/${charge.employee_branch_id}`)).data,
    enabled: Boolean(charge?.employee_branch_id),
    staleTime: 30 * 1000
  });

  const existingAdj = useMemo(() => {
    const list = getCollection(adjQuery.data);
    return list.find((a) => String(a.month).slice(0, 7) === monthKey) || null;
  }, [adjQuery.data, monthKey]);

  const [form, setForm] = useState({ overtime_hours: '', overtime_rate: '', bonus: '', penalty: '', notes: '' });

  // Populate form when existing adjustment loads
  useEffect(() => {
    if (existingAdj) {
      setForm({
        overtime_hours: String(existingAdj.overtime_hours || ''),
        overtime_rate:  String(existingAdj.overtime_rate  || ''),
        bonus:          String(existingAdj.bonus          || ''),
        penalty:        String(existingAdj.penalty        || ''),
        notes:          existingAdj.notes || ''
      });
    }
  }, [existingAdj?.adjustment_id]);

  const saveMutation = useMutation({
    mutationFn: (payload) => api.post('/api/salary/adjustments', payload),
    onSuccess: () => {
      toast.success('Adjustments saved');
      queryClient.invalidateQueries({ queryKey: ['salary-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['salary-charges'] });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to save adjustments'))
  });

  function handleSave(e) {
    e.preventDefault();
    saveMutation.mutate({
      employee_branch_id: charge.employee_branch_id,
      month:              monthKey,
      overtime_hours:     Number(form.overtime_hours) || 0,
      overtime_rate:      Number(form.overtime_rate)  || 0,
      bonus:              Number(form.bonus)           || 0,
      penalty:            Number(form.penalty)         || 0,
      notes:              form.notes.trim() || undefined
    });
  }

  const F = ({ label, field, placeholder, step }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{label}</label>
      <input
        type="number"
        min="0"
        step={step || '0.01'}
        value={form[field]}
        onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
        placeholder={placeholder || '0.00'}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-secondary)] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
      />
    </div>
  );

  return (
    <Modal
      isOpen={Boolean(charge)}
      onClose={onClose}
      title={`Adjust Salary — ${charge?.full_name}`}
      subtitle={`Month: ${monthKey} · Base: ${formatCurrency(charge?.salary_amount)}`}
      size="lg"
    >
      {adjQuery.isLoading ? (
        <div className="flex items-center justify-center py-10"><Spinner /></div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <F label="Overtime Hours" field="overtime_hours" placeholder="0" step="0.5" />
            <F label="Overtime Rate (per hour)" field="overtime_rate" placeholder="0.00" />
            <F label="Bonus" field="bonus" placeholder="0.00" />
            <F label="Penalty / Deduction" field="penalty" placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional notes about this adjustment…"
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-secondary)] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
            />
          </div>

          {/* Live salary breakdown */}
          <SalaryBreakdown
            base={charge?.salary_amount}
            overtime_hours={form.overtime_hours}
            overtime_rate={form.overtime_rate}
            bonus={form.bonus}
            penalty={form.penalty}
            taxBrackets={taxBrackets}
          />

          <ModalFormFooter onClose={onClose} isSubmitting={saveMutation.isPending} submitLabel="Save Adjustments" />
        </form>
      )}
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SalaryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [payCharge, setPayCharge] = useState(null);
  const [adjustCharge, setAdjustCharge] = useState(null);
  const [monthYear, setMonthYear] = useState(() => new Date().toISOString().slice(0, 7));
  const [payForm, setPayForm] = useState({ amount: '', account_id: '' });

  const query = useQuery({
    queryKey: ['salary-charges', page],
    queryFn: async () => (await api.get('/api/salary/charges', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts-for-salary'],
    queryFn: async () => (await api.get('/api/accounts', { params: { limit: 100 } })).data,
    enabled: Boolean(payCharge),
    staleTime: 60 * 1000
  });

  const charges = getCollection(query.data);
  const accounts = getCollection(accountsQuery.data);

  function refresh() { queryClient.invalidateQueries({ queryKey: ['salary-charges'] }); }

  const generateMutation = useMutation({
    mutationFn: (payload) => api.post('/api/salary/generate', payload),
    onSuccess: () => { toast.success('Salary charges generated'); setGenerateOpen(false); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to generate salary'))
  });

  const payMutation = useMutation({
    mutationFn: ({ id, payload }) => api.post(`/api/salary/charges/${id}/pay`, payload),
    onSuccess: () => { toast.success('Salary paid'); setPayCharge(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to pay salary'))
  });

  const columns = useMemo(() => [
    { key: 'employee', label: 'Employee' },
    { key: 'month',    label: 'Month' },
    { key: 'base',     label: 'Base' },
    { key: 'gross',    label: 'Gross Net' },
    { key: 'status',   label: 'Status' },
    { key: 'actions',  label: 'Actions', align: 'right' }
  ], []);

  const rows = useMemo(() => charges.map((row) => {
    const pending = String(row.status || '').toLowerCase() === 'pending';
    const hasAdj = Number(row.bonus || 0) > 0 || Number(row.overtime_hours || 0) > 0 || Number(row.penalty || 0) > 0;
    return {
      id:       row.salary_charge_id,
      employee: row.full_name || `Employee #${row.employee_branch_id}`,
      month:    row.salary_month ? formatDate(row.salary_month) : '--',
      base:     formatCurrency(row.salary_amount),
      gross:    (
        <span className={hasAdj ? 'font-semibold text-emerald-400' : ''}>
          {formatCurrency(row.gross_net || row.salary_amount)}
          {hasAdj && <span className="ml-1 text-[10px] text-[var(--text-secondary)]">(adj)</span>}
        </span>
      ),
      status:   <Badge label={row.status || 'pending'} status={statusTone(row.status)} />,
      actions:  (
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setAdjustCharge(row)}
            className="inline-flex items-center gap-1 rounded-xl border border-violet-500/30 px-2.5 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/10 transition"
          >
            <TrendingUp size={11} />Adjust
          </button>
          {pending && (
            <button
              type="button"
              onClick={() => { setPayCharge(row); setPayForm({ amount: String(row.gross_net || row.salary_amount || ''), account_id: '' }); }}
              className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-strong)] transition"
            >
              Pay
            </button>
          )}
        </div>
      )
    };
  }), [charges]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Salary"
        subtitle="Salary charges, adjustments, and payments"
        actions={
          <button type="button" onClick={() => setGenerateOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
            Generate Monthly Salary
          </button>
        }
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      {/* Generate */}
      <Modal isOpen={generateOpen} onClose={() => setGenerateOpen(false)} title="Generate Salary" size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!monthYear) { toast.error('Month is required'); return; }
          generateMutation.mutate({ month_year: `${monthYear}-01` });
        }}>
          <Input label="Month" type="month" required value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
          <ModalFormFooter onClose={() => setGenerateOpen(false)} isSubmitting={generateMutation.isPending} submitLabel="Generate" />
        </form>
      </Modal>

      {/* Pay Salary */}
      <Modal isOpen={Boolean(payCharge)} onClose={() => setPayCharge(null)} title="Pay Salary" size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!payForm.amount || !payForm.account_id) { toast.error('Amount and account are required'); return; }
          payMutation.mutate({ id: payCharge.salary_charge_id, payload: { amount: Number(payForm.amount), account_id: Number(payForm.account_id) } });
        }}>
          <p className="text-sm text-[var(--text-secondary)]">
            Paying salary for <strong className="text-[var(--text)]">{payCharge?.full_name}</strong>
            {payCharge?.salary_month ? ` · ${formatDate(payCharge.salary_month)}` : ''}
          </p>
          <Input label="Amount" type="number" min="0.01" step="0.01" required value={payForm.amount}
            onChange={(e) => setPayForm((c) => ({ ...c, amount: e.target.value }))} />
          <label className={labelClass}>
            <span className={labelTitleClass}>Account</span>
            <select required value={payForm.account_id} onChange={(e) => setPayForm((c) => ({ ...c, account_id: e.target.value }))} className={selectFieldClass}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} ({formatCurrency(a.balance)})</option>)}
            </select>
          </label>
          <ModalFormFooter onClose={() => setPayCharge(null)} isSubmitting={payMutation.isPending} submitLabel="Record Payment" />
        </form>
      </Modal>

      {/* Adjustment Modal */}
      {adjustCharge && (
        <AdjustmentModal charge={adjustCharge} onClose={() => setAdjustCharge(null)} />
      )}
    </>
  );
}

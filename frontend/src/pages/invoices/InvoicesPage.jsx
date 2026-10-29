import { useMemo, useState, useRef } from 'react';
import { Printer } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import { labelClass, labelTitleClass, selectFieldClass } from '../../components/modules/selectFieldClass';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'success';
  if (s === 'overdue') return 'danger';
  if (s === 'cancelled') return 'inactive';
  return 'pending';
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [cargoId, setCargoId] = useState('');

  const query = useQuery({
    queryKey: ['invoices-list', page],
    queryFn: async () => (await api.get('/api/v1/invoices', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-for-invoices'],
    queryFn: async () => (await api.get('/api/cargo', { params: { page: 1, limit: 200 } })).data,
    enabled: generateOpen,
    staleTime: 60 * 1000
  });

  const invoices = getCollection(query.data);
  const cargoList = getCollection(cargoQuery.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['invoices-list'] });
  }

  const generateMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/invoices', payload),
    onSuccess: () => { toast.success('Invoice generated'); setGenerateOpen(false); setCargoId(''); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to generate invoice'))
  });

  const columns = useMemo(() => [
    { key: 'invoice_no', label: 'Invoice No' },
    { key: 'tracking', label: 'Tracking' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: 'Actions', align: 'right' }
  ], []);

  const rows = useMemo(() => invoices.map((inv) => ({
    id: inv.invoice_id,
    invoice_no: inv.invoice_number || `INV-${inv.invoice_id}`,
    tracking: inv.tracking_number || '--',
    amount: formatCurrency(inv.total_amount),
    status: <Badge label={inv.status || 'unpaid'} status={statusTone(inv.status)} />,
    date: inv.issue_date ? formatDate(inv.issue_date) : formatDate(inv.created_at),
    actions: (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setViewInvoice(inv)} className="rounded-xl border px-3 py-1.5 text-xs dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">View Invoice</button>
      </div>
    )
  })), [invoices]);

  const meta = getMeta(query.data);
  const printRef = useRef(null);

  const handlePrintModal = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    const styles = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; }
        .no-print { display: none !important; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        tfoot td, thead th { padding: 10px 16px; }
        tbody td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        thead tr { background: #0c4a6e; color: white; }
        tfoot tr:last-child { background: #0c4a6e; color: white; }
        tfoot tr:not(:last-child) { background: #f0f9ff; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head><title>Print Invoice</title>${styles}</head>
        <body><div class="print-card">${printContent}</div></body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <>
      <ModuleDataPage
        title="Invoices"
        subtitle="Cargo invoices and payment status"
        actions={<button type="button" onClick={() => setGenerateOpen(true)} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">+ Generate Invoice</button>}
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      <Modal isOpen={generateOpen} onClose={() => setGenerateOpen(false)} title="Generate Invoice" size="sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!cargoId) { toast.error('Cargo is required'); return; }
          generateMutation.mutate({ cargo_id: Number(cargoId) });
        }}>
          <label className={labelClass}>
            <span className={labelTitleClass}>Cargo</span>
            <select required value={cargoId} onChange={(e) => setCargoId(e.target.value)} className={selectFieldClass}>
              <option value="">Select cargo</option>
              {cargoList.map((c) => <option key={c.cargo_id} value={c.cargo_id}>{c.tracking_number || `Cargo #${c.cargo_id}`}</option>)}
            </select>
          </label>
          <ModalFormFooter onClose={() => setGenerateOpen(false)} isSubmitting={generateMutation.isPending} submitLabel="Generate" />
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(viewInvoice)}
        onClose={() => setViewInvoice(null)}
        title="Invoice Detail"
        size="xxl"
        headerActions={
          <button
            type="button"
            onClick={handlePrintModal}
            className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-600"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        }
      >
        {viewInvoice ? (
          <div ref={printRef} className="bg-white text-slate-900">

            {/* ── Brand Header ─────────────────────────────────────────────── */}
            <div className="bg-sky-900 px-8 py-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold tracking-[0.2em]">WAAFI CARGO</p>
                  <p className="mt-1 text-sm tracking-widest text-sky-200 uppercase">Logistics & Freight</p>
                  <p className="mt-3 text-xs text-sky-300">Powered by Waafi — Call 2238</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tracking-widest text-sky-200 uppercase">Invoice</p>
                  <p className="mt-2 text-sm text-sky-100">
                    <span className="font-medium">Invoice No:</span>{' '}
                    {viewInvoice.invoice_number || `INV-${viewInvoice.invoice_id}`}
                  </p>
                  <p className="mt-1 text-sm text-sky-100">
                    <span className="font-medium">Issue Date:</span>{' '}
                    {viewInvoice.issue_date ? formatDate(viewInvoice.issue_date) : new Date().toISOString().slice(0, 10)}
                  </p>
                  <p className="mt-1 text-sm text-sky-100">
                    <span className="font-medium">Due Date:</span>{' '}
                    {viewInvoice.due_date ? formatDate(viewInvoice.due_date) : '--'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Tracking & Status Bar ────────────────────────────────────── */}
            <div className="border-b border-slate-200 bg-slate-50 px-8 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Tracking No</p>
                    <p className="mt-0.5 text-base font-bold text-slate-800">{viewInvoice.tracking_number || '--'}</p>
                  </div>
                  {viewInvoice.cargo_id && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Cargo ID</p>
                      <p className="mt-0.5 text-base font-bold text-slate-800">#{viewInvoice.cargo_id}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Status:</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider
                    ${String(viewInvoice.status).toLowerCase() === 'paid'
                      ? 'bg-emerald-100 text-emerald-700'
                      : String(viewInvoice.status).toLowerCase() === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {viewInvoice.status || 'unpaid'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Line Items Table ─────────────────────────────────────────── */}
            <div className="px-8 py-6">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-sky-900 text-white">
                    <th className="px-4 py-3 text-left font-semibold rounded-tl-lg" style={{width:'6%'}}>#</th>
                    <th className="px-4 py-3 text-left font-semibold" style={{width:'40%'}}>Description</th>
                    <th className="px-4 py-3 text-right font-semibold" style={{width:'18%'}}>Subtotal</th>
                    <th className="px-4 py-3 text-right font-semibold" style={{width:'18%'}}>Tax</th>
                    <th className="px-4 py-3 text-right font-semibold rounded-tr-lg" style={{width:'18%'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-4 text-slate-500">1</td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      Cargo Delivery Service
                      {viewInvoice.tracking_number && (
                        <p className="mt-0.5 text-xs text-slate-400">AWB: {viewInvoice.tracking_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-700">{formatCurrency(viewInvoice.subtotal)}</td>
                    <td className="px-4 py-4 text-right text-slate-700">{formatCurrency(viewInvoice.tax_amount)}</td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">{formatCurrency(viewInvoice.total_amount)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-sky-50">
                    <td colSpan="3" />
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Subtotal</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatCurrency(viewInvoice.subtotal)}</td>
                  </tr>
                  <tr className="bg-sky-50">
                    <td colSpan="3" />
                    <td className="px-4 py-2 text-right text-sm text-slate-500">Tax</td>
                    <td className="px-4 py-2 text-right text-sm text-slate-700">{formatCurrency(viewInvoice.tax_amount)}</td>
                  </tr>
                  <tr className="border-t-2 border-sky-900 bg-sky-900 text-white">
                    <td colSpan="3" />
                    <td className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">Total Due</td>
                    <td className="px-4 py-3 text-right text-base font-bold">{formatCurrency(viewInvoice.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <div className="border-t border-slate-200 bg-slate-50 px-8 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Thank you for choosing Waafi Cargo. For inquiries call <span className="font-semibold text-slate-600">2238</span>.
                </p>
                <p className="text-xs text-slate-400">Print Date: {new Date().toISOString().slice(0, 10)}</p>
              </div>
            </div>

            {/* ── Close button (hidden on print) ───────────────────────────── */}
            <div className="flex justify-end px-8 py-4 no-print">
              <button
                type="button"
                onClick={() => setViewInvoice(null)}
                className="rounded-2xl bg-slate-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

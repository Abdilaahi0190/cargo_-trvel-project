import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Package, Users, CreditCard, Info,
  Plane, MapPin, Hash, Scale, DollarSign, Calculator,
  Plus, Trash2, Receipt
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { createCargo } from '../../api/cargo.api';
import { getProviders } from '../../api/transport.api';
import Spinner from '../../components/ui/Spinner';
import useAuthStore from '../../store/authStore';
import { ROLES } from '../../config/rbac';
import {
  buildBranchTree, findBranchRootId, getCollection,
  mapBranchOptions, mapCustomerOptions
} from './cargo.utils';

const todayISO = () => new Date().toISOString().slice(0, 10);

function calcPrice(pcs, weight, rate) {
  const p = Number(pcs || 0), w = Number(weight || 0), r = Number(rate || 0);
  return [p, w, r].every(Number.isFinite) ? +(p * w * r).toFixed(2) : 0;
}

// ─── Suggested charge names ───────────────────────────────────────────────────
const CHARGE_SUGGESTIONS = [
  'Airport Collection Fee',
  'Customs Charges',
  'Handling Fee',
  'Documentation Fee',
  'Warehouse Fee',
  'Delivery Assistance',
  'Port Charges',
  'Inspection Fee',
  'Storage Fee',
  'Other'
];

// ─── Base input class factory ─────────────────────────────────────────────────
const iBase =
  'w-full rounded-lg border bg-white px-3 py-[7px] text-sm text-slate-900 outline-none ' +
  'transition-all duration-150 placeholder:text-slate-400 focus:ring-2 ' +
  'dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const icls = (err) =>
  iBase +
  (err
    ? ' border-red-400 focus:border-red-400 focus:ring-red-400/20 dark:border-red-500'
    : ' border-slate-200 focus:border-blue-500 focus:ring-blue-500/15 dark:border-slate-700 dark:focus:border-blue-400');

const scls = (err) => icls(err) + ' cursor-pointer';

function F({ label, hint, required, error, children, span }) {
  return (
    <div className={`flex flex-col gap-[3px]${span ? ` ${span}` : ''}`}>
      <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error
        ? <span className="text-[11px] font-medium text-red-500 leading-tight">{error}</span>
        : hint && <span className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{hint}</span>
      }
    </div>
  );
}

function IconWrap({ icon: Icon, children, badge }) {
  return (
    <div className="relative">
      {Icon && <Icon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />}
      <div className={Icon ? 'pl-[26px]' : ''}>{children}</div>
      {badge && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold uppercase text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 pointer-events-none">
          {badge}
        </span>
      )}
    </div>
  );
}

const SEC_COLORS = {
  blue:    'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  violet:  'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  amber:   'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  rose:    'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-800',
};

function SecHead({ step, icon: Icon, color, title, sub }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border ${SEC_COLORS[color]}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Step {step}
          </span>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{title}</h3>
        </div>
        {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function BranchSel({ value, onChange, branchesByRoot, required, disabled, error }) {
  return (
    <select value={value} onChange={onChange} required={required} disabled={disabled} className={scls(!!error)}>
      <option value="">— Select —</option>
      {branchesByRoot.dubai.length > 0 && (
        <optgroup label="Dubai">
          {branchesByRoot.dubai.map(b => (
            <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
          ))}
        </optgroup>
      )}
      {branchesByRoot.mogadishu.length > 0 && (
        <optgroup label="Mogadishu">
          {branchesByRoot.mogadishu.map(b => (
            <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function CustSel({ value, onChange, customers, excludeId, required, error }) {
  const opts = excludeId
    ? customers.filter(c => String(c.customer_id) !== String(excludeId))
    : customers;
  return (
    <select value={value} onChange={onChange} required={required} className={scls(!!error)}>
      <option value="">— Select customer —</option>
      {opts.map(c => (
        <option key={c.customer_id} value={c.customer_id}>
          {c.full_name}{c.phone ? ` · ${c.phone}` : ''}
        </option>
      ))}
    </select>
  );
}

function Stat({ label, value, accent, highlight }) {
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${
      highlight
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-500/10'
        : accent
        ? 'border-blue-200 bg-blue-50 dark:border-blue-700/50 dark:bg-blue-500/10'
        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
    }`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums leading-tight ${
        highlight ? 'text-emerald-700 dark:text-emerald-400'
        : accent ? 'text-blue-700 dark:text-blue-400'
        : 'text-slate-800 dark:text-slate-200'
      }`}>
        ${Number(value || 0).toFixed(2)}
      </p>
    </div>
  );
}

const Divider = () => <div className="border-t border-slate-100 dark:border-slate-800" />;

// ─── Flexible Charge Row ─────────────────────────────────────────────────────
function ChargeRow({ charge, index, onChange, onRemove }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Charge Name</label>
          <div className="mt-1 flex gap-1">
            <input
              list={`charge-suggestions-${index}`}
              type="text"
              value={charge.charge_name}
              onChange={(e) => onChange(index, 'charge_name', e.target.value)}
              placeholder="e.g. Airport Collection Fee"
              className={icls(false) + ' flex-1'}
            />
            <datalist id={`charge-suggestions-${index}`}>
              {CHARGE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="hidden sm:flex items-center justify-center pt-5">
          <div className="h-px w-4 bg-slate-300 dark:bg-slate-600" />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Amount ($)</label>
          <div className="mt-1 relative">
            <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="number"
              min="0"
              step="0.01"
              value={charge.amount}
              onChange={(e) => onChange(index, 'amount', e.target.value)}
              placeholder="0.00"
              className={icls(false) + ' pl-[26px]'}
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Note (optional)</label>
          <input
            type="text"
            value={charge.note}
            onChange={(e) => onChange(index, 'note', e.target.value)}
            placeholder="Additional details about this charge"
            className={icls(false) + ' mt-1'}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-400 transition hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/20"
        title="Remove charge"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function CargoCreatePage() {
  const navigate = useNavigate();
  const activeBranchId = useAuthStore(s => s.branchId);
  const userRoleId = useAuthStore(s => s.user?.role_id);
  const isAdmin = userRoleId === ROLES.ADMIN;
  const [customerSearch, setCustomerSearch] = useState('');
  const [errors, setErrors] = useState({});
  const [receiverMode, setReceiverMode] = useState('customer');

  const [form, setForm] = useState({
    tracking_number: '',
    shipment_date: todayISO(),
    fly_name: '',
    fly_awb_no: '',
    sender_id: '',
    receiver_id: '',
    receiver_name: '',
    receiver_phone: '',
    receiver_address: '',
    receiver_city: '',
    receiver_country: '',
    from_branch_id: activeBranchId ? String(activeBranchId) : '',
    to_branch_id: '',
    description: '',
    mark: '',
    pcs: '1',
    weight: '',
    rate_per_kg: '',
    price: '',
    payment_received_amount: '0',
    rate_type: '',
    transport_provider_id: '',
  });

  // Flexible itemized charges (replaces single extra_charges field)
  const [charges, setCharges] = useState([]);

  const branchesQ = useQuery({
    queryKey: ['cargo-create-branches'],
    queryFn: async () => {
      try { return (await api.get('/api/branches')).data; }
      catch { return (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const customersQ = useQuery({
    queryKey: ['cargo-create-customers', customerSearch],
    queryFn: async () =>
      (await api.get('/api/customers', { params: { search: customerSearch || undefined, limit: 200 } })).data,
    staleTime: 30 * 1000,
  });

  const providersQ = useQuery({
    queryKey: ['cargo-create-providers'],
    queryFn: async () => (await getProviders({ limit: 200 })).data,
    staleTime: 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: async (payload) => {
      // 1. Create the cargo
      const cargoRes = await createCargo(payload);
      const newCargoId = cargoRes?.data?.data?.cargo_id;

      // 2. Add itemized charges if any
      if (newCargoId && charges.length > 0) {
        const validCharges = charges.filter(
          (ch) => ch.charge_name.trim() && Number(ch.amount) > 0
        );
        await Promise.all(
          validCharges.map((ch) =>
            api.post(`/api/cargo/${newCargoId}/charges`, {
              charge_name: ch.charge_name.trim(),
              amount: Number(ch.amount),
              note: ch.note.trim() || null
            })
          )
        );
      }

      return cargoRes;
    },
    onSuccess: (res) => {
      const id = res?.data?.data?.cargo_id;
      toast.success('Shipment created successfully');
      navigate(id ? `/cargo/${id}` : '/cargo');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to create shipment');
    },
  });

  const branches      = useMemo(() => mapBranchOptions(getCollection(branchesQ.data)), [branchesQ.data]);
  const customers     = useMemo(() => mapCustomerOptions(getCollection(customersQ.data)), [customersQ.data]);
  const providers     = useMemo(() => getCollection(providersQ.data), [providersQ.data]);
  const dubaiRootId   = useMemo(() => findBranchRootId(branches, 'dubai'), [branches]);
  const mogaRootId    = useMemo(() => findBranchRootId(branches, 'mogadishu'), [branches]);
  const branchesByRoot = useMemo(
    () => buildBranchTree(branches, dubaiRootId, mogaRootId),
    [branches, dubaiRootId, mogaRootId]
  );

  const senderCustomerType = useMemo(() => {
    if (!form.sender_id) return null;
    const raw = getCollection(customersQ.data);
    const found = raw.find(c => String(c.customer_id) === String(form.sender_id));
    return found?.customer_type || null;
  }, [form.sender_id, customersQ.data]);

  const isRegularSender = senderCustomerType === 'regular';
  const basePrice   = Number(form.price || 0);
  const autoDiscount = isRegularSender ? Number((basePrice * 0.20).toFixed(2)) : 0;
  const discountedPrice = Math.max(0, basePrice - autoDiscount);
  const totalCharges = charges.reduce((sum, ch) => sum + Number(ch.amount || 0), 0);
  const totalAmount = discountedPrice + totalCharges;
  const balanceDue  = Math.max(0, totalAmount - Number(form.payment_received_amount || 0));

  function clearErr(...keys) {
    if (keys.some(k => errors[k])) {
      setErrors(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
    }
  }

  function update(key, value) {
    clearErr(key);
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (['pcs', 'weight', 'rate_per_kg'].includes(key)) {
        next.price = String(calcPrice(
          key === 'pcs'        ? value : prev.pcs,
          key === 'weight'     ? value : prev.weight,
          key === 'rate_per_kg'? value : prev.rate_per_kg,
        ));
      }
      return next;
    });
  }

  // ─── Charge helpers ──────────────────────────────────────────────────────────
  function addCharge() {
    setCharges(prev => [...prev, { charge_name: '', amount: '', note: '' }]);
  }

  function updateCharge(index, field, value) {
    setCharges(prev => prev.map((ch, i) => i === index ? { ...ch, [field]: value } : ch));
  }

  function removeCharge(index) {
    setCharges(prev => prev.filter((_, i) => i !== index));
  }

  function validate() {
    const e = {};
    if (!form.sender_id) e.sender_id = 'Select a sender';
    if (receiverMode === 'customer') {
      if (!form.receiver_id) e.receiver_id = 'Select a receiver';
      if (form.sender_id && form.receiver_id && form.sender_id === form.receiver_id) {
        e.sender_id   = 'Must differ from receiver';
        e.receiver_id = 'Must differ from sender';
      }
    } else {
      if (!form.receiver_name.trim()) e.receiver_name = 'Receiver name is required';
    }
    if (!form.from_branch_id) e.from_branch_id = 'Select origin branch';
    if (!form.to_branch_id)   e.to_branch_id   = 'Select destination branch';
    if (form.from_branch_id && form.to_branch_id &&
        Number(form.from_branch_id) === Number(form.to_branch_id)) {
      e.to_branch_id = 'Must differ from origin';
    }
    const w = Number(form.weight);
    if (!form.weight || !Number.isFinite(w) || w <= 0) e.weight = 'Enter a valid weight';
    const p = Number(form.pcs);
    if (!Number.isInteger(p) || p < 1)                 e.pcs    = 'Minimum 1 piece';
    if (form.tracking_number.trim() && !/^[A-Za-z0-9]+$/.test(form.tracking_number.trim())) {
      e.tracking_number = 'Alphanumeric only';
    }
    // Validate charges
    charges.forEach((ch, i) => {
      if (ch.charge_name.trim() && Number(ch.amount) < 0) {
        e[`charge_amount_${i}`] = 'Amount must be positive';
      }
    });
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error('Please fix the highlighted fields');
      return;
    }

    // Compute total extra_charges from itemized list for backward compat
    const totalExtraCharges = charges.reduce((sum, ch) => sum + Number(ch.amount || 0), 0);

    const payload = {
      tracking_number:             form.tracking_number.trim() || undefined,
      shipment_date:           form.shipment_date,
      fly_name:                form.fly_name.trim() || undefined,
      fly_awb_no:              form.fly_awb_no.trim() || undefined,
      sender_id:               Number(form.sender_id),
      from_branch_id:             Number(form.from_branch_id),
      to_branch_id:               Number(form.to_branch_id),
      description:             form.description.trim() || undefined,
      mark:                    form.mark.trim() || undefined,
      pcs:                     Number(form.pcs),
      weight:                  Number(form.weight),
      rate_per_kg:             Number(form.rate_per_kg || 0),
      price:                   Number(form.price || 0),
      extra_charges:           totalExtraCharges,
      payment_received_amount: Number(form.payment_received_amount || 0),
      rate_type:               form.rate_type.trim() || undefined,
      transport_provider_id:   form.transport_provider_id ? Number(form.transport_provider_id) : undefined,
    };

    if (receiverMode === 'customer') {
      payload.receiver_id = Number(form.receiver_id);
    } else {
      payload.receiver_name    = form.receiver_name.trim();
      payload.receiver_phone   = form.receiver_phone.trim() || undefined;
      payload.receiver_address = form.receiver_address.trim() || undefined;
      payload.receiver_city    = form.receiver_city.trim() || undefined;
      payload.receiver_country = form.receiver_country.trim() || undefined;
    }

    createMut.mutate(payload);
  }

  const loading = branchesQ.isLoading || customersQ.isLoading;

  return (
    <div className="mx-auto max-w-5xl">

      {/* ── Page header ── */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/cargo')}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={15} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">New Shipment</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Fill in the details below to register a new cargo shipment
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/cargo')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            form="cargo-form"
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {createMut.isPending ? <Spinner size="sm" /> : <Package size={13} />}
            <span>{createMut.isPending ? 'Creating…' : 'Create Shipment'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <Spinner />
        </div>
      ) : (
        <form id="cargo-form" onSubmit={handleSubmit} noValidate>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">

            {/* ════ STEP 1 · Route & Flight Details ════ */}
            <div className="px-5 pt-5 pb-4">
              <SecHead step={1} icon={MapPin} color="blue" title="Route & Flight Details" sub="Where is this shipment going?" />

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                <F label="Tracking No" hint="Leave blank to auto-generate" error={errors.tracking_number}>
                  <IconWrap icon={Hash}>
                    <input
                      type="text"
                      value={form.tracking_number}
                      onChange={e => update('tracking_number', e.target.value)}
                      placeholder="Auto-generate"
                      className={icls(!!errors.tracking_number)}
                    />
                  </IconWrap>
                </F>

                <F label="Shipment Date" required error={errors.shipment_date}>
                  <input
                    type="date"
                    value={form.shipment_date}
                    onChange={e => update('shipment_date', e.target.value)}
                    required
                    className={icls(!!errors.shipment_date)}
                  />
                </F>

                <F label="Rate Type" hint="Pricing method for this shipment">
                  <select
                    value={form.rate_type}
                    onChange={e => update('rate_type', e.target.value)}
                    className={scls(false)}
                  >
                    <option value="">— Optional —</option>
                    <option value="F020F">F020F</option>
                    <option value="WAAFI">WAAFI</option>
                    <option value="KQ">KQ</option>
                  </select>
                </F>

                <F label="Origin Branch" required error={errors.from_branch_id}>
                  <BranchSel
                    value={form.from_branch_id}
                    onChange={e => update('from_branch_id', e.target.value)}
                    branchesByRoot={branchesByRoot}
                    required
                    disabled={!isAdmin && !!activeBranchId}
                    error={errors.from_branch_id}
                  />
                </F>

                <F label="Destination Branch" required error={errors.to_branch_id}>
                  <BranchSel
                    value={form.to_branch_id}
                    onChange={e => update('to_branch_id', e.target.value)}
                    branchesByRoot={branchesByRoot}
                    required
                    error={errors.to_branch_id}
                  />
                </F>

                <F label="Flight / Carrier Name" hint="Airline or shipping carrier">
                  <IconWrap icon={Plane}>
                    <input
                      type="text"
                      value={form.fly_name}
                      onChange={e => update('fly_name', e.target.value)}
                      placeholder="e.g. Ethiopian Airlines"
                      className={icls(false)}
                    />
                  </IconWrap>
                </F>

                <F label="Flight AWB No" hint="Air waybill number (optional)">
                  <input
                    type="text"
                    value={form.fly_awb_no}
                    onChange={e => update('fly_awb_no', e.target.value)}
                    placeholder="Optional"
                    className={icls(false)}
                  />
                </F>

                <F label="Transport Provider" hint="Third-party company or individual carrying this shipment (optional)">
                  <select
                    value={form.transport_provider_id}
                    onChange={e => update('transport_provider_id', e.target.value)}
                    className={scls(false)}
                  >
                    <option value="">— Not assigned yet —</option>
                    {providers.map(p => (
                      <option key={p.provider_id} value={p.provider_id}>
                        {p.name} ({p.entity_type === 'individual' ? 'Individual' : 'Company'})
                      </option>
                    ))}
                  </select>
                </F>
              </div>
            </div>

            <Divider />

            {/* ════ STEP 2 · Sender & Receiver ════ */}
            <div className="px-5 pt-4 pb-4">
              <SecHead step={2} icon={Users} color="violet" title="Sender & Receiver" sub="Sender must be a registered customer. Receiver can be a customer or manual entry." />

              <div className="mb-3">
                <div className="relative">
                  <svg
                    className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                  </svg>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Search customers by name or phone number…"
                    className={icls(false) + ' pl-8'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <F label="Sender" required hint="Registered customer handing over cargo" error={errors.sender_id}>
                    <CustSel
                      value={form.sender_id}
                      onChange={e => {
                        const v = e.target.value;
                        update('sender_id', v);
                        if (v && v === form.receiver_id) update('receiver_id', '');
                      }}
                      customers={customers}
                      excludeId={form.receiver_id}
                      required
                      error={errors.sender_id}
                    />
                  </F>
                  {isRegularSender && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Regular customer — 20% discount will be applied automatically
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setReceiverMode('customer'); clearErr('receiver_name'); }}
                      className={`rounded-lg border px-3 py-1 text-[11px] font-semibold transition ${
                        receiverMode === 'customer'
                          ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      Search Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReceiverMode('manual'); clearErr('receiver_id'); }}
                      className={`rounded-lg border px-3 py-1 text-[11px] font-semibold transition ${
                        receiverMode === 'manual'
                          ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      Manual Entry
                    </button>
                  </div>

                  {receiverMode === 'customer' ? (
                    <F label="Receiver" required hint="Customer collecting cargo at destination" error={errors.receiver_id}>
                      <CustSel
                        value={form.receiver_id}
                        onChange={e => {
                          const v = e.target.value;
                          update('receiver_id', v);
                          if (v && v === form.sender_id) update('sender_id', '');
                        }}
                        customers={customers}
                        excludeId={form.sender_id}
                        required
                        error={errors.receiver_id}
                      />
                    </F>
                  ) : (
                    <div className="space-y-2">
                      <F label="Receiver Full Name" required error={errors.receiver_name}>
                        <input
                          type="text"
                          value={form.receiver_name}
                          onChange={e => update('receiver_name', e.target.value)}
                          placeholder="Full name"
                          className={icls(!!errors.receiver_name)}
                        />
                      </F>
                      <div className="grid grid-cols-2 gap-2">
                        <F label="Phone">
                          <input type="tel" value={form.receiver_phone} onChange={e => update('receiver_phone', e.target.value)} placeholder="Optional" className={icls(false)} />
                        </F>
                        <F label="City">
                          <input type="text" value={form.receiver_city} onChange={e => update('receiver_city', e.target.value)} placeholder="Optional" className={icls(false)} />
                        </F>
                        <F label="Country">
                          <input type="text" value={form.receiver_country} onChange={e => update('receiver_country', e.target.value)} placeholder="Optional" className={icls(false)} />
                        </F>
                        <F label="Address">
                          <input type="text" value={form.receiver_address} onChange={e => update('receiver_address', e.target.value)} placeholder="Optional" className={icls(false)} />
                        </F>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {customers.length === 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400">
                  <Info size={13} className="mt-px flex-shrink-0" />
                  <span>No customers found. Go to <strong>Customers</strong> to register them first.</span>
                </div>
              )}
            </div>

            <Divider />

            {/* ════ STEP 3 · Cargo Details ════ */}
            <div className="px-5 pt-4 pb-4">
              <SecHead step={3} icon={Package} color="emerald" title="Cargo Details" sub="Describe what is being shipped" />

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <F label="Description" hint="Contents of the shipment">
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => update('description', e.target.value)}
                    placeholder="e.g. Electronics, Clothing…"
                    className={icls(false)}
                  />
                </F>

                <F label="Mark / Label" hint="Box label or reference mark">
                  <input
                    type="text"
                    value={form.mark}
                    onChange={e => update('mark', e.target.value)}
                    placeholder="Optional"
                    className={icls(false)}
                  />
                </F>

                <F label="Number of Pieces" required hint="Total piece / box count" error={errors.pcs}>
                  <IconWrap icon={Hash}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.pcs}
                      onChange={e => update('pcs', e.target.value)}
                      required
                      className={icls(!!errors.pcs)}
                    />
                  </IconWrap>
                </F>

                <F label="Gross Weight (kg)" required error={errors.weight}>
                  <IconWrap icon={Scale}>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.weight}
                      onChange={e => update('weight', e.target.value)}
                      placeholder="0.00"
                      required
                      className={icls(!!errors.weight)}
                    />
                  </IconWrap>
                </F>

                <F label="Rate per kg ($)" hint="Price charged per kilogram">
                  <IconWrap icon={DollarSign}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.rate_per_kg}
                      onChange={e => update('rate_per_kg', e.target.value)}
                      placeholder="0.00"
                      className={icls(false)}
                    />
                  </IconWrap>
                </F>

                <F label="Calculated Price ($)" hint="Auto: pieces × weight × rate">
                  <IconWrap icon={Calculator} badge="Auto">
                    <input
                      type="number"
                      value={form.price}
                      readOnly
                      className={
                        icls(false) +
                        ' cursor-default bg-slate-50 pr-10 font-semibold text-blue-700 dark:bg-slate-700/50 dark:text-blue-400'
                      }
                    />
                  </IconWrap>
                </F>
              </div>
            </div>

            <Divider />

            {/* ════ STEP 4 · Additional Charges ════ */}
            <div className="px-5 pt-4 pb-4">
              <SecHead step={4} icon={Receipt} color="rose" title="Additional Charges" sub="Add airport, customs, handling, or any other fees for this customer" />

              <div className="space-y-2">
                {charges.length === 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/30">
                    <Receipt size={14} className="flex-shrink-0" />
                    <span>No additional charges added. Click the button below to add airport fees, customs, handling, or other costs.</span>
                  </div>
                )}

                {charges.map((charge, index) => (
                  <ChargeRow
                    key={index}
                    charge={charge}
                    index={index}
                    onChange={updateCharge}
                    onRemove={removeCharge}
                  />
                ))}

                <button
                  type="button"
                  onClick={addCharge}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 py-2.5 text-xs font-semibold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  <Plus size={13} />
                  Add Charge
                </button>
              </div>
            </div>

            <Divider />

            {/* ════ STEP 5 · Payment Summary ════ */}
            <div className="px-5 pt-4 pb-5">
              <SecHead step={5} icon={CreditCard} color="amber" title="Payment Summary" sub="Record any payment collected now. Remaining balance can be paid later." />

              <div className="mb-3">
                <F label="Amount Received Now ($)" hint="Cash collected from sender at time of shipment">
                  <IconWrap icon={DollarSign}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.payment_received_amount}
                      onChange={e => update('payment_received_amount', e.target.value)}
                      className={icls(false)}
                    />
                  </IconWrap>
                </F>
              </div>

              {isRegularSender && autoDiscount > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400">
                  <Info size={13} className="mt-px flex-shrink-0" />
                  <span>
                    Regular customer discount: <strong>-${autoDiscount.toFixed(2)}</strong> (20% off base price ${basePrice.toFixed(2)}) → Net price <strong>${discountedPrice.toFixed(2)}</strong>
                  </span>
                </div>
              )}

              {/* Invoice breakdown */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30">
                <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Invoice Breakdown</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  <div className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Freight Charge ({form.pcs || 0} pcs × {form.weight || 0} kg × ${form.rate_per_kg || 0})</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">${basePrice.toFixed(2)}</span>
                  </div>
                  {isRegularSender && autoDiscount > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-emerald-600 dark:text-emerald-400">Regular Customer Discount (20%)</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">-${autoDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {charges.map((ch, i) => ch.charge_name && (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-slate-600 dark:text-slate-300">
                        {ch.charge_name || `Charge ${i + 1}`}
                        {ch.note && <span className="ml-1 text-xs text-slate-400">({ch.note})</span>}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">${Number(ch.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-slate-100 px-4 py-2.5 text-sm dark:bg-slate-700/30">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Grand Total</span>
                    <span className="font-bold text-slate-900 dark:text-white">${totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Amount Received Now</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">-${Number(form.payment_received_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    balanceDue > 0
                      ? 'bg-amber-50 dark:bg-amber-900/10'
                      : 'bg-emerald-50 dark:bg-emerald-900/10'
                  }`}>
                    <span className={`font-bold ${balanceDue > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {balanceDue > 0 ? 'Balance Due' : 'Fully Paid'}
                    </span>
                    <span className={`font-bold text-lg ${balanceDue > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      ${balanceDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {Object.keys(errors).length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              <Info size={13} className="mt-px flex-shrink-0" />
              <span>
                {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''} need
                {Object.keys(errors).length === 1 ? 's' : ''} attention — highlighted above.
              </span>
            </div>
          )}

        </form>
      )}
    </div>
  );
}

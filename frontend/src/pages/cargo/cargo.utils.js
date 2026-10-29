export function unwrapPayload(payload) {
  return payload?.data ?? payload ?? null;
}

export function getCollection(payload) {
  const source = unwrapPayload(payload);

  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return [];
  }

  return [source.data, source.items, source.results, source.rows, source.records, source.list].find(Array.isArray) || [];
}

export function getMeta(payload) {
  const source = unwrapPayload(payload);
  return source?.meta ?? payload?.meta ?? {};
}

export function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeStatus(status) {
  return normalizeText(status).replace(/[\s-]+/g, '_');
}

export function formatStatusLabel(status) {
  return String(status || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveBranchRoot(value) {
  const text = normalizeText(value);

  if (text.includes('dubai')) {
    return 'dubai';
  }

  if (text.includes('mogadishu')) {
    return 'mogadishu';
  }

  return 'dubai';
}

export function formatDate(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function formatWeight(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)} kg` : '--';
}

export function formatPhone(value) {
  return value || '--';
}

export function getValue(source, keys, fallback = '--') {
  for (const key of keys) {
    const value = source?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

export function formatCurrency(amount, branch) {
  const number = Number(amount);

  if (!Number.isFinite(number)) {
    return '--';
  }

  return `$${number.toFixed(2)}`;
}

const PAYMENT_STATUS_VALUES = ['Paid', 'Partial', 'Balance remaining'];

export const PAYMENT_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Balance remaining', label: 'Balance remaining' }
];

/** Map UI / legacy filter values to API query param (title-case). */
export function toApiPaymentStatusFilter(value) {
  if (!value) {
    return undefined;
  }

  const legacyMap = {
    paid: 'Paid',
    partial: 'Partial',
    unpaid: 'Balance remaining',
    'balance remaining': 'Balance remaining',
    'balance_remaining': 'Balance remaining'
  };

  const trimmed = String(value).trim();

  if (PAYMENT_STATUS_VALUES.includes(trimmed)) {
    return trimmed;
  }

  return legacyMap[normalizeText(trimmed)] || trimmed;
}

export function paymentStatusClass(status) {
  const classes = {
    Paid: 'bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium',
    Partial: 'bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-xs font-medium',
    'Balance remaining': 'bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium'
  };

  return classes[status] ?? 'bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs';
}

export function getStatusTone(status) {
  switch (normalizeStatus(status)) {
    case 'delivered':
    case 'paid':
      return 'success';
    case 'in_transit':
      return 'active';
    case 'pending':
    case 'partial':
      return 'pending';
    case 'delayed':
      return 'warning';
    case 'returned':
    case 'cancelled':
    case 'unpaid':
      return 'danger';
    default:
      return 'inactive';
  }
}

export function getStatusDotClass(status) {
  switch (normalizeStatus(status)) {
    case 'delivered':
    case 'paid':
      return 'bg-emerald-500';
    case 'in_transit':
      return 'bg-sky-500';
    case 'pending':
    case 'partial':
      return 'bg-amber-500';
    case 'delayed':
      return 'bg-orange-500';
    case 'returned':
    case 'cancelled':
    case 'unpaid':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}

export function fieldLabel(fieldKey, branchRoot) {
  const isDubai = branchRoot === 'dubai';
  const labelMap = {
    weight: ['Gross Weight (kg)', 'MGQ Weight'],
    rate_per_kg: ['Volume Weight (kg)', 'Chargeable Weight'],
    total_mgq: ['Total Amount (AED)', 'Total MGQ'],
    payment_received_amount: ['Payment Received', 'Amount Paid'],
    balance_mgq: ['Balance (AED)', 'Balance MGQ']
  };

  return labelMap[fieldKey]?.[isDubai ? 0 : 1] ?? fieldKey;
}

export function mapBranchOptions(branches) {
  return branches.map((branch) => ({
    branch_id: Number(branch?.branch_id ?? branch?.branch_id ?? branch?.id),
    branch_name: branch?.branch_name ?? branch?.name ?? `Branch ${branch?.branch_id ?? branch?.branch_id ?? branch?.id}`,
    address_id: branch?.address_id ?? null,
    city_id: branch?.city_id ?? null,
    city_name: branch?.city_name ?? '',
    parent_id: branch?.parent_id ?? null
  }));
}

export function mapCustomerOptions(customers) {
  return customers.map((customer) => ({
    customer_id: Number(customer?.customer_id ?? customer?.id),
    full_name: customer?.full_name ?? customer?.name ?? `Customer ${customer?.customer_id ?? customer?.id}`,
    phone: customer?.phone ?? ''
  }));
}

export function findBranchRootId(branches, rootName) {
  const normalizedRoot = normalizeText(rootName);
  const directMatch = branches.find((branch) => normalizeText(branch.branch_name) === normalizedRoot);

  if (directMatch) {
    return directMatch.branch_id;
  }

  const partialMatch = branches.find((branch) => normalizeText(branch.branch_name).includes(normalizedRoot));
  return partialMatch?.branch_id ?? null;
}

export function buildBranchTree(branches, dubaiRootId, mogadishuRootId) {
  const normalizedBranches = mapBranchOptions(branches);
  const dubaiRoot = normalizedBranches.find((branch) => branch.branch_id === dubaiRootId) || null;
  const mogadishuRoot = normalizedBranches.find((branch) => branch.branch_id === mogadishuRootId) || null;
  const dubaiCityId = dubaiRoot?.city_id ?? null;
  const mogadishuCityId = mogadishuRoot?.city_id ?? null;

  const dubai = normalizedBranches.filter((branch) => (
    branch.branch_id === dubaiRootId
    || branch.parent_id === dubaiRootId
    || (dubaiCityId != null && Number(branch.city_id) === Number(dubaiCityId))
    || normalizeText(branch.city_name).includes('dubai')
    || normalizeText(branch.branch_name).includes('dubai')
  ));

  const mogadishu = normalizedBranches.filter((branch) => (
    branch.branch_id === mogadishuRootId
    || branch.parent_id === mogadishuRootId
    || (mogadishuCityId != null && Number(branch.city_id) === Number(mogadishuCityId))
    || normalizeText(branch.city_name).includes('mogadishu')
    || normalizeText(branch.branch_name).includes('mogadishu')
  ));

  return {
    dubai: dedupeBranches(dubai),
    mogadishu: dedupeBranches(mogadishu)
  };
}

function dedupeBranches(branches) {
  const seen = new Set();

  return branches.filter((branch) => {
    const key = Number(branch.branch_id);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function filterByBranchVisibility(shipments, userBrId) {
  return shipments.filter((shipment) =>
    Number(shipment?.from_branch_id) === Number(userBrId)
    || Number(shipment?.to_branch_id) === Number(userBrId)
  );
}

export function resolvePaymentReceivedAmount(shipment) {
  return getValue(shipment, ['payment_received_amount', 'paid_origin'], null);
}

export function resolveFlightName(shipment) {
  return getValue(shipment, ['fly_name', 'fly_awb_no'], '--');
}

export function resolveDescription(shipment) {
  return getValue(shipment, ['description', 'mark'], '--');
}

export function resolvePaymentStatus(shipment) {
  const status = String(shipment?.payment_status || '').trim();

  if (PAYMENT_STATUS_VALUES.includes(status)) {
    return status;
  }

  return status || 'Balance remaining';
}

export function matchesPaymentStatusFilter(shipment, filterValue) {
  if (!filterValue) {
    return true;
  }

  return resolvePaymentStatus(shipment) === toApiPaymentStatusFilter(filterValue);
}

export function resolveCreatedByBranchName(shipment, branchLookup, currentBranchName) {
  const direct = branchLookup.get(Number(shipment?.user_branch_id));

  if (direct) {
    return direct;
  }

  if (Number(shipment?.from_branch_id) === Number(shipment?.to_branch_id)) {
    return shipment?.from_branch_name || currentBranchName || '--';
  }

  return shipment?.from_branch_name || currentBranchName || '--';
}

export function estimateDeliveryDate(source, timeline = []) {
  const explicitValue =
    source?.estimated_delivery ||
    source?.estimated_delivery_date ||
    source?.expected_delivery ||
    source?.expected_delivery_date ||
    source?.eta ||
    source?.eta_date;

  if (explicitValue) {
    return explicitValue;
  }

  const latestDateValue = timeline[0]?.update_time || source?.updated_at || source?.created_at;
  const baseDate = new Date(latestDateValue);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const status = normalizeStatus(source?.status_name || timeline[0]?.status_name);
  const daysToAdd = {
    delivered: 0,
    returned: 0,
    cancelled: 0,
    in_transit: 2,
    delayed: 4,
    pending: 3
  };

  baseDate.setDate(baseDate.getDate() + (daysToAdd[status] ?? 3));
  return baseDate.toISOString();
}

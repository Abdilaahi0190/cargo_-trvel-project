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

export function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function formatStatusLabel(value) {
  return String(value || 'inactive')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getBadgeStatus(value) {
  return normalizeStatus(value) === 'active' ? 'active' : 'danger';
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

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

export function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'CU';
}

export function resolveCustomerState(customer) {
  return normalizeStatus(customer?.state || 'active');
}

export function buildAddressMap(addresses) {
  return new Map(
    addresses.map((address) => [
      Number(address?.address_id),
      {
        ...address,
        cityLabel: address?.city_name || 'Unknown city',
        addressLabel: address?.location_name || address?.description || 'No address'
      }
    ])
  );
}

export function buildCityMap(cities) {
  return new Map(
    cities.map((city) => [
      Number(city?.city_id),
      {
        ...city,
        label: city?.city_name || `City ${city?.city_id}`
      }
    ])
  );
}

export function enrichCustomers(customers, addressMap) {
  return customers.map((customer) => {
    const address = addressMap.get(Number(customer?.address_id));

    return {
      ...customer,
      customer_id: Number(customer?.customer_id),
      state: resolveCustomerState(customer),
      city_name: address?.cityLabel || 'Unknown city',
      address_name: address?.addressLabel || 'No address'
    };
  });
}

export function buildCustomerCargo(cargoRows, customerId, branchMap) {
  return cargoRows
    .filter((item) => Number(item?.sender_id) === Number(customerId) || Number(item?.receiver_id) === Number(customerId))
    .map((item) => ({
      ...item,
      type: Number(item?.sender_id) === Number(customerId) ? 'sender' : 'receiver',
      fromLabel: branchMap.get(Number(item?.from_branch_id)) || `Branch ${item?.from_branch_id ?? '--'}`,
      toLabel: branchMap.get(Number(item?.to_branch_id)) || `Branch ${item?.to_branch_id ?? '--'}`
    }))
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime());
}

export function getCurrentMonthCount(customers) {
  const now = new Date();

  return customers.filter((customer) => {
    const createdAt = new Date(customer?.created_at);

    return !Number.isNaN(createdAt.getTime())
      && createdAt.getMonth() === now.getMonth()
      && createdAt.getFullYear() === now.getFullYear();
  }).length;
}

export function paginateRows(rows, page, limit) {
  const offset = (page - 1) * limit;
  return rows.slice(offset, offset + limit);
}

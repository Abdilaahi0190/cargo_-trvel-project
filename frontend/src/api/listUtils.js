export function getCollection(payload) {
  const source = payload?.data ?? payload;

  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return [];
  }

  return [source.data, source.rows, source.items, source.results, source.records].find(Array.isArray) || [];
}

export function getMeta(payload) {
  if (payload?.meta) {
    return payload.meta;
  }

  const source = payload?.data;

  if (source && typeof source === 'object' && !Array.isArray(source) && source.meta) {
    return source.meta;
  }

  if (typeof payload?.total === 'number') {
    return { total: payload.total };
  }

  return {};
}

export function getApiErrorMessage(error, fallback = 'Unable to load records') {
  const data = error?.response?.data;

  // If the server returned field-level errors, show them all as a readable string
  if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    const msgs = Object.values(data.errors).filter(Boolean);
    if (msgs.length) return msgs.join(' · ');
  }

  // Legacy array format: [{ field, message }, ...]
  if (Array.isArray(data?.errors)) {
    const msgs = data.errors.map(e => e.message).filter(Boolean);
    if (msgs.length) return msgs.join(' · ');
  }

  return data?.message || error?.message || fallback;
}

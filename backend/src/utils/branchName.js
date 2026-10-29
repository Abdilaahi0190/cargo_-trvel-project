/**
 * City-based branch naming: {city_slug}_main branch
 * e.g. Mogadishu → mogadishu_main branch, Nairobi → nairobi_main branch
 */
const CITY_BRANCH_SLUG = {
  mogadishu: 'mogadishu',
  mogadisho: 'mogadishu',
  nairobi: 'nairobi',
  dubai: 'dubai'
};

function slugifyCity(cityName) {
  const normalized = String(cityName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'unknown';
  }

  return CITY_BRANCH_SLUG[normalized] || normalized;
}

function branchNameFromCity(cityName) {
  return `${slugifyCity(cityName)}_main branch`;
}

/** Legacy Waafi-style names → city-based names */
const LEGACY_BRANCH_NAMES = {
  'Waafi Main Branch': 'mogadishu_main branch',
  'Waafi Nairobi Branch': 'nairobi_main branch',
  'Waafi Dubai Liaison': 'dubai_main branch'
};

module.exports = {
  slugifyCity,
  branchNameFromCity,
  LEGACY_BRANCH_NAMES,
  BRANCH_NAME_MOGADISHU: 'mogadishu_main branch',
  BRANCH_NAME_NAIROBI: 'nairobi_main branch',
  BRANCH_NAME_DUBAI: 'dubai_main branch'
};

const db = require('../../config/db');

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return { page, limit, offset: (page - 1) * limit };
};

const listProviders = async (userId) => {
  const result = await db.queryWithUser('SELECT * FROM insurance_providers ORDER BY name', [], userId);
  return result.rows;
};

const listPolicies = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM cargo_insurance ci
     JOIN cargo c ON c.cargo_id = ci.cargo_id
     WHERE c.deleted = FALSE`,
    [],
    userId
  );
  const result = await db.queryWithUser(
    `SELECT ci.insurance_id,
            ci.cargo_id,
            ci.policy_number,
            ci.insured_value,
            ci.premium_paid,
            ci.claim_status,
            ci.claim_amount,
            ci.notes,
            ci.created_at,
            c.tracking_number,
            ip.name AS provider_name,
            CASE
              WHEN ci.claim_status IN ('filed', 'approved', 'paid') THEN 'claimed'
              WHEN ci.created_at < CURRENT_TIMESTAMP - INTERVAL '365 days' THEN 'expired'
              ELSE 'active'
            END AS policy_status
     FROM cargo_insurance ci
     JOIN cargo c ON c.cargo_id = ci.cargo_id
     JOIN insurance_providers ip ON ip.provider_id = ci.provider_id
     WHERE c.deleted = FALSE
     ORDER BY ci.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
    userId
  );

  return {
    rows: result.rows,
    meta: {
      page,
      limit,
      total: Number(countResult.rows[0].total),
      pages: Math.ceil(Number(countResult.rows[0].total) / limit)
    }
  };
};

const createProvider = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO insurance_providers (name, contact_phone, rate_percent)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.name, payload.contact_phone || null, payload.rate_percent || null],
    userId
  );

  return result.rows[0];
};

const getForCargo = async (cargoId, userId) => {
  const result = await db.queryWithUser(
    `SELECT ci.*, ip.name AS provider_name, ip.contact_phone, ip.rate_percent
     FROM cargo_insurance ci
     JOIN insurance_providers ip ON ip.provider_id = ci.provider_id
     WHERE ci.cargo_id = $1`,
    [cargoId],
    userId
  );

  return result.rows;
};

const createPolicy = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO cargo_insurance (cargo_id, provider_id, policy_number, insured_value, premium_paid, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      payload.cargo_id,
      payload.provider_id,
      payload.policy_number || null,
      payload.insured_value,
      payload.premium_paid,
      payload.notes || null
    ],
    userId
  );

  return result.rows[0];
};

const fileClaim = async (insuranceId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE cargo_insurance
     SET claim_status = 'filed',
         claim_amount = $1,
         claim_date = COALESCE($2::date, CURRENT_DATE),
         notes = COALESCE($3, notes)
     WHERE insurance_id = $4
     RETURNING *`,
    [
      payload.claim_amount,
      payload.claim_date || null,
      payload.claim_notes || payload.notes || null,
      insuranceId
    ],
    userId
  );

  return result.rows[0] || null;
};

const updateClaimStatus = async (insuranceId, status, userId) => {
  const result = await db.queryWithUser(
    `UPDATE cargo_insurance
     SET claim_status = $1
     WHERE insurance_id = $2
     RETURNING *`,
    [status, insuranceId],
    userId
  );

  return result.rows[0] || null;
};

module.exports = {
  listProviders,
  listPolicies,
  createProvider,
  getForCargo,
  createPolicy,
  fileClaim,
  updateClaimStatus
};

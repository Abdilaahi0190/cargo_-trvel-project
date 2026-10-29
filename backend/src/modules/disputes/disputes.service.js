const db = require('../../config/db');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  error.statusCode = 404;
  return error;
};

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return { page, limit, offset: (page - 1) * limit };
};

const listTypes = async (userId) => {
  const result = await db.queryWithUser('SELECT * FROM dispute_types ORDER BY name', [], userId);
  return result.rows;
};

const listDisputes = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = [];

  if (queryParams.status) {
    values.push(queryParams.status);
    filters.push(`d.status = $${values.length}`);
  }

  if (queryParams.customer_id) {
    values.push(Number(queryParams.customer_id));
    filters.push(`d.customer_id = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM disputes d
     JOIN cargo c ON c.cargo_id = d.cargo_id
     JOIN customers cu ON cu.customer_id = d.customer_id
     JOIN dispute_types dt ON dt.dispute_type_id = d.dispute_type_id
     ${whereClause}`,
    values,
    userId
  );
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT d.*, c.tracking_number, cu.full_name AS customer_name, dt.name AS dispute_type
     FROM disputes d
     JOIN cargo c ON c.cargo_id = d.cargo_id
     JOIN customers cu ON cu.customer_id = d.customer_id
     JOIN dispute_types dt ON dt.dispute_type_id = d.dispute_type_id
     ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getDispute = async (disputeId, userId) => {
  const result = await db.queryWithUser(
    `SELECT d.*, c.tracking_number, cu.full_name AS customer_name, dt.name AS dispute_type, ru.full_name AS resolved_by_name
     FROM disputes d
     JOIN cargo c ON c.cargo_id = d.cargo_id
     JOIN customers cu ON cu.customer_id = d.customer_id
     JOIN dispute_types dt ON dt.dispute_type_id = d.dispute_type_id
     LEFT JOIN users ru ON ru.user_id = d.resolved_by
     WHERE d.dispute_id = $1`,
    [disputeId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Dispute not found');
  }

  return result.rows[0];
};

const createDispute = async (payload, userId) => {
  const cargoResult = await db.queryWithUser(
    `SELECT sender_id
     FROM cargo
     WHERE cargo_id = $1
       AND deleted = FALSE`,
    [payload.cargo_id],
    userId
  );

  if (!cargoResult.rows.length) {
    throw createNotFound('Cargo not found');
  }

  const result = await db.queryWithUser(
    `INSERT INTO disputes (cargo_id, customer_id, dispute_type_id, description, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING *`,
    [
      payload.cargo_id,
      cargoResult.rows[0].sender_id,
      payload.dispute_type_id,
      payload.description
    ],
    userId
  );

  return result.rows[0];
};

const resolveDispute = async (disputeId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE disputes
     SET resolution = $1,
         refund_amount = $2,
         status = 'resolved',
         resolved_by = $3,
         updated_at = NOW()
     WHERE dispute_id = $4
     RETURNING *`,
    [payload.resolution, payload.refund_amount ?? null, userId, disputeId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Dispute not found');
  }

  return result.rows[0];
};

module.exports = {
  listTypes,
  listDisputes,
  getDispute,
  createDispute,
  resolveDispute
};

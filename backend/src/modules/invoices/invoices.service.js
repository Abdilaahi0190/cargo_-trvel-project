const db = require('../../config/db');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return { page, limit, offset: (page - 1) * limit };
};

const listInvoices = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = [];

  if (queryParams.status) {
    values.push(queryParams.status);
    filters.push(`i.status = $${values.length}`);
  }

  if (queryParams.cargo_id) {
    values.push(Number(queryParams.cargo_id));
    filters.push(`i.cargo_id = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM invoices i
     JOIN cargo c ON c.cargo_id = i.cargo_id
     ${whereClause}`,
    values,
    userId
  );
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT i.*, c.tracking_number
     FROM invoices i
     JOIN cargo c ON c.cargo_id = i.cargo_id
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getInvoice = async (invoiceId, userId) => {
  const result = await db.queryWithUser(
    `SELECT i.*, c.tracking_number, s.full_name AS sender_name, r.full_name AS receiver_name
     FROM invoices i
     JOIN cargo c ON c.cargo_id = i.cargo_id
     JOIN customers s ON s.customer_id = c.sender_id
     JOIN customers r ON r.customer_id = c.receiver_id
     WHERE i.invoice_id = $1`,
    [invoiceId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Invoice not found');
  }

  return result.rows[0];
};

const updateStatus = async (invoiceId, status, userId) => {
  const result = await db.queryWithUser(
    `UPDATE invoices
     SET status = $1
     WHERE invoice_id = $2
     RETURNING *`,
    [status, invoiceId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Invoice not found');
  }

  return result.rows[0];
};

const generateInvoice = async (cargoId, userId) => {
  const existing = await db.queryWithUser(
    `SELECT i.*
     FROM invoices i
     JOIN cargo c ON c.cargo_id = i.cargo_id
     WHERE i.cargo_id = $1
       AND c.deleted = FALSE`,
    [cargoId],
    userId
  );

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const cargoResult = await db.queryWithUser(
    `SELECT cargo_id, price, extra_charges
     FROM cargo
     WHERE cargo_id = $1
       AND deleted = FALSE`,
    [cargoId],
    userId
  );

  if (!cargoResult.rows.length) {
    throw createNotFound('Cargo not found');
  }

  const cargo = cargoResult.rows[0];
  const subtotal = Number(cargo.price || 0) + Number(cargo.extra_charges || 0);
  const result = await db.queryWithUser(
    `INSERT INTO invoices (cargo_id, due_date, subtotal, total_amount)
     VALUES ($1, CURRENT_DATE + INTERVAL '30 days', $2, $2)
     RETURNING *`,
    [cargoId, subtotal],
    userId
  );

  return result.rows[0];
};

module.exports = {
  listInvoices,
  getInvoice,
  updateStatus,
  generateInvoice
};

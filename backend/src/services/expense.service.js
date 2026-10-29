const db = require('../config/db');

const getPagination = (page, limit) => {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 20;

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit
  };
};

const listBadged = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams.page, queryParams.limit);
  const countResult = await db.queryWithUser(
    'SELECT COUNT(*) AS total FROM expense_badges',
    [],
    userId
  );
  const result = await db.queryWithUser(
    `SELECT eb.*, et.name AS expense_type_name, u.full_name AS user_name
     FROM expense_badges eb
     JOIN expense_types et ON et.expense_type_id = eb.expense_type_id
     LEFT JOIN users u ON u.user_id = eb.user_id
     ORDER BY eb.created_at DESC
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

const createBadged = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO expense_badges (expense_type_id, amount, user_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.expense_type_id, payload.amount, payload.user_id || null],
    userId
  );

  return result.rows[0];
};

const listChargedBadged = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams.page, queryParams.limit);
  const values = [];
  const filters = ['ecb.deleted = FALSE'];

  if (queryParams.user_branch_id) {
    values.push(Number(queryParams.user_branch_id));
    filters.push(`ecb.user_branch_id = $${values.length}`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM expense_charged_badges ecb
     ${whereClause}`,
    values,
    userId
  );

  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT ecb.*, eb.amount, eb.user_id, et.name AS expense_type_name
     FROM expense_charged_badges ecb
     JOIN expense_badges eb ON eb.expense_badge_id = ecb.expense_badge_id
     JOIN expense_types et ON et.expense_type_id = eb.expense_type_id
     ${whereClause}
     ORDER BY ecb.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
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

const createChargedBadged = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO expense_charged_badges (expense_badge_id, charge_month, description, user_branch_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [payload.expense_badge_id, payload.charge_month, payload.description || null, payload.user_branch_id],
    userId
  );

  return result.rows[0];
};

module.exports = {
  listBadged,
  createBadged,
  listChargedBadged,
  createChargedBadged
};

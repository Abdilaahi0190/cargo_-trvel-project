const db = require('../config/db');
const {
  cargoFinancialSQL,
  totalAmountSql,
  balanceAmountSql
} = require('../utils/cargoFinancials');

const queryReq = (req, sql, params) => {
  if (req.dbClient) {
    return req.dbClient.query(sql, params);
  }

  return db.queryWithUser(sql, params, req.user.user_id);
};

const totalPaidSql = `((${totalAmountSql}) + COALESCE(c.extra_charges, 0) - (${balanceAmountSql}))`;

const getAll = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    // Customers are GLOBAL — not branch-scoped
    const values = [];
    const filters = ['c.deleted = FALSE'];

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(c.full_name ILIKE $${values.length} OR c.phone ILIKE $${values.length})`);
    }

    if (req.query.city) {
      values.push(String(req.query.city).trim());
      filters.push(`ci.city_name = $${values.length}`);
    }

    if (req.query.customer_type) {
      values.push(String(req.query.customer_type).trim());
      filters.push(`c.customer_type = $${values.length}`);
    }

    const fromClause = `
      FROM customers c
      LEFT JOIN addresses addr ON c.address_id = addr.address_id
      LEFT JOIN cities ci ON addr.city_id = ci.city_id
      LEFT JOIN user_branches ub ON c.user_branch_id = ub.user_branch_id
      LEFT JOIN branches b ON ub.branch_id = b.branch_id
    `;
    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const countResult = await db.queryWithUser(
      `SELECT COUNT(*) AS total
       ${fromClause}
       ${whereClause}`,
      values,
      req.user.user_id
    );

    const summaryResult = await db.queryWithUser(
      `SELECT
         COALESCE(SUM(CASE WHEN c.deleted = FALSE THEN 1 ELSE 0 END), 0) AS total_customers,
         COALESCE(SUM(CASE WHEN c.deleted = FALSE THEN 1 ELSE 0 END), 0) AS active_customers,
         COALESCE(SUM(CASE WHEN c.deleted = TRUE THEN 1 ELSE 0 END), 0) AS inactive_customers,
         COALESCE(SUM(
           CASE
             WHEN c.deleted = FALSE
               AND DATE_TRUNC('month', c.created_at) = DATE_TRUNC('month', NOW())
             THEN 1
             ELSE 0
           END
         ), 0) AS new_this_month
       FROM customers c
       WHERE c.deleted = FALSE`,
      [],
      req.user.user_id
    );

    values.push(limit, offset);
    const result = await db.queryWithUser(
      `SELECT c.customer_id, c.full_name, c.phone, c.customer_type, c.created_at, c.updated_at, c.deleted, c.address_id, c.user_branch_id,
              addr.location_name, ci.city_name, b.branch_name AS registered_branch
       ${fromClause}
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
      req.user.user_id
    );

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        page,
        limit,
        total: Number(countResult.rows[0].total),
        pages: Math.ceil(Number(countResult.rows[0].total) / limit),
        summary: {
          total_customers: Number(summaryResult.rows[0].total_customers),
          active_customers: Number(summaryResult.rows[0].active_customers),
          inactive_customers: Number(summaryResult.rows[0].inactive_customers),
          new_this_month: Number(summaryResult.rows[0].new_this_month)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT c.customer_id, c.full_name, c.phone, c.customer_type, c.created_at, c.updated_at, c.deleted, c.address_id, c.user_branch_id,
              addr.location_name AS address_location, ci.city_name,
              ub.branch_id, b.branch_name AS registered_branch
       FROM customers c
       LEFT JOIN addresses addr ON c.address_id = addr.address_id
       LEFT JOIN cities ci ON addr.city_id = ci.city_id
       LEFT JOIN user_branches ub ON c.user_branch_id = ub.user_branch_id
       LEFT JOIN branches b ON ub.branch_id = b.branch_id
       WHERE c.customer_id = $1
         AND c.deleted = FALSE
       LIMIT 1`,
      [Number(req.params.id)],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Customer retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const getCargo = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const customerId = Number(req.params.id);
    const values = [customerId, req.branchId];
    const filters = [
      'c.deleted = FALSE',
      '(c.sender_id = $1 OR c.receiver_id = $1)',
      '(c.from_branch_id = $2 OR c.to_branch_id = $2)'
    ];

    if (req.query.status) {
      values.push(String(req.query.status).trim());
      filters.push(`cs.status_name = $${values.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const fromClause = `
      FROM cargo c
      JOIN customers s ON c.sender_id = s.customer_id
      LEFT JOIN customers r ON c.receiver_id = r.customer_id
      JOIN branches fb ON c.from_branch_id = fb.branch_id
      JOIN branches tb ON c.to_branch_id = tb.branch_id
      JOIN cargo_status cs ON cs.status_id = c.current_status_id
      ${whereClause}
    `;

    const countResult = await queryReq(
      req,
      `SELECT COUNT(*) AS total ${fromClause}`,
      values
    );

    values.push(limit, offset);
    const result = await queryReq(
      req,
      `SELECT c.cargo_id, c.tracking_number, c.sender_id, c.receiver_id,
              CASE WHEN c.sender_id = $1 THEN 'sender' ELSE 'receiver' END AS customer_role,
              s.full_name AS sender,
              COALESCE(r.full_name, c.receiver_name_manual) AS receiver,
              s.full_name AS sender_name, s.phone AS sender_phone,
              COALESCE(r.full_name, c.receiver_name_manual) AS receiver_name,
              COALESCE(r.phone, c.receiver_phone_manual) AS receiver_phone,
              c.from_branch_id, fb.branch_name AS from_branch_name,
              c.to_branch_id, tb.branch_name AS to_branch_name,
              c.weight, c.price, c.current_status_id, c.user_branch_id,
              c.created_at, c.updated_at, c.shipment_date,
              c.rate_type, c.rate_per_kg, c.extra_charges, c.paid_origin,
              c.payment_received_amount, c.fly_name, c.fly_awb_no, c.mark, c.pcs, c.description,
              ${cargoFinancialSQL},
              ${totalPaidSql} AS total_paid,
              cs.status_name
       ${fromClause}
       ORDER BY COALESCE(c.shipment_date, c.created_at) DESC, c.cargo_id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        page,
        limit,
        total: Number(countResult.rows[0].total),
        pages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `INSERT INTO customers (full_name, phone, address_id, customer_type, user_branch_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING customer_id`,
      [req.body.full_name, req.body.phone, req.body.address_id || null, req.body.customer_type || 'regular', req.uBrId, req.user.user_id],
      req.user.user_id
    );

    const freshResult = await db.queryWithUser(
      `SELECT c.customer_id, c.full_name, c.phone, c.customer_type, c.created_at, c.updated_at, c.deleted, c.address_id, c.user_branch_id,
              addr.location_name, ci.city_name
       FROM customers c
       LEFT JOIN addresses addr ON c.address_id = addr.address_id
       LEFT JOIN cities ci ON addr.city_id = ci.city_id
       WHERE c.customer_id = $1
         AND c.deleted = FALSE
       LIMIT 1`,
      [result.rows[0].customer_id],
      req.user.user_id
    );

    return res.status(201).json({ success: true, data: freshResult.rows[0], message: 'Customer created successfully' });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    await db.queryWithUser(
      `UPDATE customers
       SET full_name     = COALESCE($2, full_name),
           phone         = COALESCE($3, phone),
           address_id        = COALESCE($4, address_id),
           customer_type = COALESCE($5, customer_type),
           updated_at    = CURRENT_TIMESTAMP,
           updated_by    = $6
       WHERE customer_id = $1
         AND deleted = FALSE`,
      [Number(req.params.id), req.body.full_name || null, req.body.phone || null, req.body.address_id || null, req.body.customer_type || null, req.user.user_id],
      req.user.user_id
    );

    const freshResult = await db.queryWithUser(
      `SELECT c.customer_id, c.full_name, c.phone, c.customer_type, c.created_at, c.updated_at, c.deleted, c.address_id, c.user_branch_id,
              addr.location_name, ci.city_name
       FROM customers c
       LEFT JOIN addresses addr ON c.address_id = addr.address_id
       LEFT JOIN cities ci ON addr.city_id = ci.city_id
       WHERE c.customer_id = $1
         AND c.deleted = FALSE
       LIMIT 1`,
      [Number(req.params.id)],
      req.user.user_id
    );

    return res.json({ success: true, data: freshResult.rows[0], message: 'Customer updated successfully' });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await db.queryWithUser(
      `UPDATE customers
       SET deleted    = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $2
       WHERE customer_id = $1
         AND deleted = FALSE`,
      [Number(req.params.id), req.user.user_id],
      req.user.user_id
    );

    return res.json({ success: true, data: { customer_id: Number(req.params.id) }, message: 'Customer deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getOne,
  getCargo,
  create,
  update,
  remove
};


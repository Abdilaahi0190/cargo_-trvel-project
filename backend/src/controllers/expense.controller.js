const db = require('../config/db');
const expenseService = require('../services/expense.service');

const getTypes = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      'SELECT * FROM expense_types ORDER BY name',
      [],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Expense types retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const getAll = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const values = [req.uBrId];
    const filters = ['ec.deleted = FALSE', 'ec.user_branch_id = $1'];

    if (req.query.trip_id) {
      values.push(Number(req.query.trip_id));
      filters.push(`ec.trip_id = $${values.length}`);
    }
    if (req.query.transport_provider_id) {
      values.push(Number(req.query.transport_provider_id));
      filters.push(`ec.transport_provider_id = $${values.length}`);
    }
    if (req.query.cargo_id) {
      values.push(Number(req.query.cargo_id));
      filters.push(`ec.cargo_id = $${values.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;

    const countResult = await db.queryWithUser(
      `SELECT COUNT(*) AS total
       FROM expense_charges ec
       JOIN expense_types et ON et.expense_type_id = ec.expense_type_id
       ${whereClause}`,
      values,
      req.user.user_id
    );

    values.push(limit, offset);
    const result = await db.queryWithUser(
      `SELECT ec.*, et.name AS expense_type_name, b.branch_name,
              CASE WHEN ec.trip_id IS NOT NULL THEN concat('TRP', ec.trip_id) END AS trip_no,
              tp.name AS transport_provider_name,
              c.tracking_number AS cargo_tracking_number
       FROM expense_charges ec
       JOIN expense_types et ON et.expense_type_id = ec.expense_type_id
       JOIN user_branches ub ON ub.user_branch_id = ec.user_branch_id
       JOIN branches b ON b.branch_id = ub.branch_id
       LEFT JOIN transport_providers tp ON tp.provider_id = ec.transport_provider_id
       LEFT JOIN cargo c ON c.cargo_id = ec.cargo_id
       ${whereClause}
       ORDER BY ec.created_at DESC
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
        pages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const expTypeId = req.body.expense_type_id || req.body.expense_type_id;
    const chargeMonth = req.body.charge_month
      || `${new Date().toISOString().slice(0, 7)}-01`;
    const result = await db.queryWithUser(
      `INSERT INTO expense_charges
         (expense_type_id, amount, charge_month, description, user_branch_id, created_by,
          trip_id, transport_provider_id, cargo_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        expTypeId,
        req.body.amount,
        chargeMonth,
        req.body.description || null,
        req.body.user_branch_id || req.uBrId,
        req.user.user_id,
        req.body.trip_id || null,
        req.body.transport_provider_id || null,
        req.body.cargo_id || null
      ],
      req.user.user_id
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Expense created successfully' });
  } catch (error) {
    return next(error);
  }
};

const payExpense = async (expChargeId, amount, accountId, description, uBrId, userId) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await db.setUserContext(client, userId);

    const charge = await client.query(
      'SELECT * FROM expense_charges WHERE expense_charge_id = $1 AND deleted = FALSE FOR UPDATE',
      [expChargeId]
    );
    if (!charge.rows.length) {
      const e = new Error('Expense not found'); e.statusCode = 404; throw e;
    }

    const payResult = await client.query(
      `INSERT INTO expense_payments (expense_charge_id, amount, account_id, description, user_branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING expense_payment_id`,
      [expChargeId, amount, accountId, description, uBrId]
    );

    await client.query(
      `UPDATE expense_charges
       SET status = 'paid', updated_by = $2
       WHERE expense_charge_id = $1`,
      [expChargeId, userId]
    );

    await client.query(
      'UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2',
      [amount, accountId]
    );

    await client.query('COMMIT');
    return payResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    try { await db.clearUserContext(client); } catch {}
    client.release();
  }
};

const pay = async (req, res, next) => {
  try {
    const data = await payExpense(
      Number(req.params.id),
      req.body.amount,
      req.body.account_id,
      req.body.description || null,
      req.uBrId,
      req.user.user_id
    );
    return res.json({ success: true, data, message: 'Expense paid successfully' });
  } catch (error) {
    if (error.statusCode === 404) return res.status(404).json({ success: false, message: error.message });
    return next(error);
  }
};

const recordPayment = async (req, res, next) => {
  try {
    const description = req.body.description
      || (req.body.payment_type ? `Payment type: ${req.body.payment_type}` : null);
    const data = await payExpense(
      Number(req.body.expense_charge_id),
      req.body.amount,
      req.body.account_id,
      description,
      req.uBrId,
      req.user.user_id
    );
    return res.json({ success: true, data, message: 'Expense payment recorded successfully' });
  } catch (error) {
    if (error.statusCode === 404) return res.status(404).json({ success: false, message: error.message });
    return next(error);
  }
};

const listBadged = async (req, res, next) => {
  try {
    const data = await expenseService.listBadged(req.query, req.user.user_id);
    return res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    return next(error);
  }
};

const createBadged = async (req, res, next) => {
  try {
    const data = await expenseService.createBadged(req.body, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Badged expense created successfully' });
  } catch (error) {
    return next(error);
  }
};

const listChargedBadged = async (req, res, next) => {
  try {
    const query = { ...req.query };
    if (!query.user_branch_id && req.uBrId) {
      query.user_branch_id = req.uBrId;
    }
    const data = await expenseService.listChargedBadged(query, req.user.user_id);
    return res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    return next(error);
  }
};

const createChargedBadged = async (req, res, next) => {
  try {
    const data = await expenseService.createChargedBadged({ ...req.body, user_branch_id: req.uBrId }, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Charged badged expense created successfully' });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const expenseId = Number(req.params.id);
    const existing = await db.queryWithUser(
      `SELECT status
       FROM expense_charges
       WHERE expense_charge_id = $1
         AND user_branch_id = $2
         AND deleted = FALSE`,
      [expenseId, req.uBrId],
      req.user.user_id
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    if (String(existing.rows[0].status).toLowerCase() !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending expenses can be deleted' });
    }

    const result = await db.queryWithUser(
      `UPDATE expense_charges
       SET deleted = TRUE
       WHERE expense_charge_id = $1
         AND user_branch_id = $2
       RETURNING expense_charge_id`,
      [expenseId, req.uBrId],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Expense deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getTypes,
  getAll,
  create,
  pay,
  recordPayment,
  remove,
  listBadged,
  createBadged,
  listChargedBadged,
  createChargedBadged
};

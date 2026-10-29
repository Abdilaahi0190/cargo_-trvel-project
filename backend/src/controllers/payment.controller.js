const db = require('../config/db');

const queryReq = (req, sql, params) => {
  if (req.dbClient) {
    return req.dbClient.query(sql, params);
  }

  return db.queryWithUser(sql, params, req.user.user_id);
};

const withTransaction = async (req, fn) => {
  if (req.dbClient) {
    await req.dbClient.query('BEGIN');

    try {
      const result = await fn(req.dbClient);
      await req.dbClient.query('COMMIT');
      return result;
    } catch (error) {
      await req.dbClient.query('ROLLBACK');
      throw error;
    }
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await db.setUserContext(client, req.user.user_id);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    try {
      await db.clearUserContext(client);
    } catch {
      // ignore cleanup failures
    }
    client.release();
  }
};

const getAll = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const values = [req.branchId];

    const countResult = await queryReq(
      req,
      `SELECT COUNT(*) AS total
       FROM payments p
       JOIN cargo c ON c.cargo_id = p.cargo_id
       WHERE p.deleted = FALSE
         AND (c.from_branch_id = $1 OR c.to_branch_id = $1)`,
      values
    );

    values.push(limit, offset);
    const result = await queryReq(
      req,
      `SELECT p.payment_id, p.cargo_id, p.account_id, p.amount, p.payment_type,
              p.user_branch_id, p.created_at, p.deleted,
              c.tracking_number, c.from_branch_id, c.to_branch_id
       FROM payments p
       JOIN cargo c ON c.cargo_id = p.cargo_id
       WHERE p.deleted = FALSE
         AND (c.from_branch_id = $1 OR c.to_branch_id = $1)
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
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
    const result = await withTransaction(req, async (client) => {
      const cargoAccess = await client.query(
        `SELECT cargo_id
         FROM cargo
         WHERE cargo_id = $1
           AND (from_branch_id = $2 OR to_branch_id = $2)
           AND deleted = FALSE`,
        [req.body.cargo_id, req.branchId]
      );

      if (!cargoAccess.rows.length) {
        const notFound = new Error('Cargo not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      const accountAccess = await client.query(
        `SELECT account_id
         FROM accounts
         WHERE account_id = $1
           AND branch_id = $2
           AND deleted = FALSE`,
        [req.body.account_id, req.branchId]
      );

      if (!accountAccess.rows.length) {
        const notFound = new Error('Account not found for this branch');
        notFound.statusCode = 404;
        throw notFound;
      }

      const payResult = await client.query(
        `INSERT INTO payments (cargo_id, account_id, amount, payment_type, user_branch_id)
         VALUES ($1, $2, $3, $4::payment_type_enum, $5)
         RETURNING payment_id`,
        [req.body.cargo_id, req.body.account_id, req.body.amount, req.body.payment_type, req.uBrId]
      );

      await client.query(
        'UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2',
        [req.body.amount, req.body.account_id]
      );

      await client.query(
        `UPDATE cargo
         SET payment_received_amount = payment_received_amount + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE cargo_id = $2`,
        [req.body.amount, req.body.cargo_id]
      );

      return payResult;
    });

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Payment created successfully'
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    return next(error);
  }
};

const getByCargoId = async (req, res, next) => {
  try {
    const cargoAccess = await queryReq(
      req,
      `SELECT cargo_id
       FROM cargo
       WHERE cargo_id = $1
         AND (from_branch_id = $2 OR to_branch_id = $2)
         AND deleted = FALSE`,
      [Number(req.params.cargo_id), req.branchId]
    );

    if (!cargoAccess.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const result = await queryReq(
      req,
      `SELECT payment_id, cargo_id, account_id, amount, payment_type, user_branch_id, created_at
       FROM payments
       WHERE cargo_id = $1
         AND deleted = FALSE
       ORDER BY created_at DESC`,
      [Number(req.params.cargo_id)]
    );

    return res.json({ success: true, data: result.rows, message: 'Payments retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  create,
  getByCargoId
};

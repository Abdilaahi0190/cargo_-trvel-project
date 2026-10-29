const db = require('../config/db');

const queryReq = (req, sql, params) => {
  if (req.dbClient) {
    return req.dbClient.query(sql, params);
  }

  return db.queryWithUser(sql, params, req.user.user_id);
};

const getAll = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const countResult = await queryReq(
      req,
      `SELECT COUNT(*) AS total
       FROM accounts
       WHERE branch_id = $1
         AND deleted = FALSE`,
      [req.branchId]
    );
    const result = await queryReq(
      req,
      `SELECT a.account_id, a.name, a.institution_type, a.balance, a.branch_id,
              b.branch_name
       FROM accounts a
       JOIN branches b ON b.branch_id = a.branch_id
       WHERE a.branch_id = $1
         AND a.deleted = FALSE
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.branchId, limit, offset]
    );

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        total: Number(countResult.rows[0].total),
        page,
        limit,
        pages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const result = await queryReq(
      req,
      `SELECT account_id, name, institution_type, balance, branch_id, user_branch_id, created_at, updated_at, deleted
       FROM accounts
       WHERE account_id = $1
         AND branch_id = $2
         AND deleted = FALSE`,
      [Number(req.params.id), req.branchId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Account retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `INSERT INTO accounts (name, institution_type, balance, branch_id, user_branch_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING account_id, name, institution_type, balance, branch_id`,
      [
        req.body.name || req.body.account_name,
        req.body.institution_type || req.body.currency || null,
        req.body.initial_balance ?? 0,
        req.body.branch_id || req.branchId,
        req.uBrId,
        req.user.user_id
      ],
      req.user.user_id
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Account created successfully' });
  } catch (error) {
    return next(error);
  }
};

const transfer = async (req, res, next) => {
  const fromAcc = req.body.from_acc || req.body.from_account_id;
  const toAcc   = req.body.to_acc   || req.body.to_account_id;

  if (Number(fromAcc) === Number(toAcc)) {
    return res.status(400).json({ success: false, message: 'Source and destination accounts must be different' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await db.setUserContext(client, req.user.user_id);

    const srcResult = await client.query(
      'SELECT balance FROM accounts WHERE account_id = $1 AND deleted = FALSE FOR UPDATE',
      [fromAcc]
    );

    if (!srcResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Source account not found' });
    }

    if (Number(srcResult.rows[0].balance) < Number(req.body.amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient account balance' });
    }

    await client.query(
      'UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2',
      [req.body.amount, fromAcc]
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2',
      [req.body.amount, toAcc]
    );

    const trResult = await client.query(
      `INSERT INTO account_transfers (from_account_id, to_account_id, amount, reason, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING account_transfer_id`,
      [fromAcc, toAcc, req.body.amount, req.body.reasons || req.body.notes || null, req.user.user_id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, data: trResult.rows[0], message: 'Account transfer completed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    try { await db.clearUserContext(client); } catch {}
    client.release();
  }
};

const deposit = async (req, res, next) => {
  try {
    const accountId = Number(req.params.id);
    const notes = req.body.notes || req.body.description || null;
    const result = await queryReq(
      req,
      `UPDATE accounts
       SET balance = balance + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE account_id = $2
         AND branch_id = $3
         AND deleted = FALSE
       RETURNING account_id, name, balance`,
      [req.body.amount, accountId, req.branchId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    await db.queryWithUser(
      `INSERT INTO system_logs(user_id, action, table_name, record_id, description)
       VALUES ($1, 'DEPOSIT', 'accounts', $2, $3)`,
      [req.user.user_id, accountId, notes || `Deposit ${req.body.amount}`],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Deposit recorded successfully' });
  } catch (error) {
    return next(error);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const accountId = Number(req.params.id);
    const notes = req.body.notes || req.body.description || null;
    const balanceResult = await queryReq(
      req,
      `SELECT balance FROM accounts WHERE account_id = $1 AND branch_id = $2 AND deleted = FALSE`,
      [accountId, req.branchId]
    );

    if (!balanceResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (Number(balanceResult.rows[0].balance) < Number(req.body.amount)) {
      const error = new Error('Insufficient account balance');
      error.status = 400;
      error.statusCode = 400;
      return next(error);
    }

    const result = await queryReq(
      req,
      `UPDATE accounts
       SET balance = balance - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE account_id = $2
         AND branch_id = $3
         AND deleted = FALSE
       RETURNING account_id, name, balance`,
      [req.body.amount, accountId, req.branchId]
    );

    await db.queryWithUser(
      `INSERT INTO system_logs(user_id, action, table_name, record_id, description)
       VALUES ($1, 'WITHDRAW', 'accounts', $2, $3)`,
      [req.user.user_id, accountId, notes || `Withdraw ${req.body.amount}`],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Withdrawal recorded successfully' });
  } catch (error) {
    return next(error);
  }
};

const recalculate = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT account_id, name, balance
       FROM accounts
       WHERE account_id = $1
         AND branch_id = $2
         AND deleted = FALSE`,
      [Number(req.params.id), req.branchId],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0] || null, message: 'Account balance recalculated successfully' });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const accountId = Number(req.params.id);
    const existing = await queryReq(
      req,
      `SELECT balance
       FROM accounts
       WHERE account_id = $1
         AND branch_id = $2
         AND deleted = FALSE`,
      [accountId, req.branchId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (Number(existing.rows[0].balance) !== 0) {
      return res.status(400).json({ success: false, message: 'Account balance must be zero before deletion' });
    }

    const result = await queryReq(
      req,
      `UPDATE accounts
       SET deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE account_id = $1
         AND branch_id = $2
       RETURNING account_id`,
      [accountId, req.branchId]
    );

    return res.json({ success: true, data: result.rows[0], message: 'Account deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  transfer,
  deposit,
  withdraw,
  recalculate,
  remove
};

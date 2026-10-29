const db = require('../config/db');

const queryReq = (req, sql, params) => {
  if (req.dbClient) return req.dbClient.query(sql, params);
  return db.queryWithUser(sql, params, req.user.user_id);
};

// Verify the requesting user's branch can access this cargo
const checkAccess = async (req, cargoId) => {
  const result = await queryReq(
    req,
    `SELECT cargo_id FROM cargo
     WHERE cargo_id = $1 AND (from_branch_id = $2 OR to_branch_id = $2) AND deleted = FALSE`,
    [cargoId, req.branchId]
  );

  return result.rows.length > 0;
};

const list = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);

    if (!(await checkAccess(req, cargoId))) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const result = await queryReq(
      req,
      `SELECT cc.charge_id, cc.cargo_id, cc.charge_name, cc.amount, cc.note,
              cc.created_at, cc.updated_at,
              u.full_name AS created_by_name
       FROM cargo_charges cc
       LEFT JOIN users u ON u.user_id = cc.created_by
       WHERE cc.cargo_id = $1 AND cc.deleted = FALSE
       ORDER BY cc.charge_id ASC`,
      [cargoId]
    );

    return res.json({ success: true, data: result.rows, message: 'Charges retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);

    if (!(await checkAccess(req, cargoId))) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const { charge_name, amount, note } = req.body;

    if (!charge_name || !String(charge_name).trim()) {
      return res.status(422).json({ success: false, message: 'charge_name is required' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return res.status(422).json({ success: false, message: 'amount must be a non-negative number' });
    }

    const result = await queryReq(
      req,
      `INSERT INTO cargo_charges (cargo_id, charge_name, amount, note, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING charge_id, cargo_id, charge_name, amount, note, created_at`,
      [cargoId, String(charge_name).trim(), parsedAmount, note || null, req.user.user_id]
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Charge added successfully' });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);
    const chargeId = Number(req.params.chargeId);

    if (!(await checkAccess(req, cargoId))) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const { charge_name, amount, note } = req.body;
    const parsedAmount = amount !== undefined ? Number(amount) : undefined;

    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      return res.status(422).json({ success: false, message: 'amount must be a non-negative number' });
    }

    const result = await queryReq(
      req,
      `UPDATE cargo_charges
       SET charge_name = COALESCE($1, charge_name),
           amount      = COALESCE($2, amount),
           note        = COALESCE($3, note),
           updated_at  = CURRENT_TIMESTAMP,
           updated_by  = $4
       WHERE charge_id = $5 AND cargo_id = $6 AND deleted = FALSE
       RETURNING charge_id, cargo_id, charge_name, amount, note, updated_at`,
      [
        charge_name ? String(charge_name).trim() : null,
        parsedAmount ?? null,
        note !== undefined ? note : null,
        req.user.user_id,
        chargeId,
        cargoId
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Charge not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Charge updated successfully' });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);
    const chargeId = Number(req.params.chargeId);

    if (!(await checkAccess(req, cargoId))) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const result = await queryReq(
      req,
      `UPDATE cargo_charges
       SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP, updated_by = $3
       WHERE charge_id = $1 AND cargo_id = $2 AND deleted = FALSE
       RETURNING charge_id`,
      [chargeId, cargoId, req.user.user_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Charge not found' });
    }

    return res.json({ success: true, data: { charge_id: chargeId }, message: 'Charge removed successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, create, update, remove };

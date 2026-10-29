const db = require('../config/db');

/**
 * Ledger payments for cargo alias `c` (embed in larger queries).
 */
const ledgerPaymentsSql = `(
  SELECT COALESCE(SUM(p.amount), 0)
  FROM payments p
  WHERE p.cargo_id = c.cargo_id
    AND p.deleted = FALSE
)`;

const totalAmountSql = `COALESCE(
  NULLIF(c.price, 0),
  c.pcs * c.weight * c.rate_per_kg,
  0
)`;

// Sum of itemized charges from cargo_charges table (preferred) with extra_charges as fallback
const itemizedChargesSql = `COALESCE((
  SELECT SUM(cc.amount)
  FROM cargo_charges cc
  WHERE cc.cargo_id = c.cargo_id
    AND cc.deleted = FALSE
), c.extra_charges, 0)`;

const balanceAmountSql = `(
  ${totalAmountSql}
  + ${itemizedChargesSql}
  - COALESCE(c.paid_origin, 0)
  - COALESCE(c.payment_received_amount, 0)
  - ${ledgerPaymentsSql}
)`;

const paymentStatusSql = `CASE
  WHEN ${balanceAmountSql} <= 0 THEN 'Paid'
  WHEN ${balanceAmountSql} > 0
    AND (
      COALESCE(c.payment_received_amount, 0) > 0
      OR ${ledgerPaymentsSql} > 0
    ) THEN 'Partial'
  ELSE 'Balance remaining'
END`;

/** SELECT-list fragment for use with `FROM cargo c` */
const cargoFinancialSQL = `
  ${totalAmountSql} AS total_amount,
  ${balanceAmountSql} AS balance_mgq,
  ${paymentStatusSql} AS payment_status`;

/**
 * @param {number} cargoId
 * @param {import('pg').PoolClient|import('pg').Pool} [client] - transaction client or pool; defaults to pool
 * @returns {Promise<{ total_amount: string, balance_mgq: string, payment_status: string }|null>}
 */
const getCargoFinancials = async (cargoId, client) => {
  const runner = client || db.pool;
  const result = await runner.query(
    `SELECT
       ${cargoFinancialSQL}
     FROM cargo c
     WHERE c.cargo_id = $1
       AND c.deleted = FALSE`,
    [cargoId]
  );

  if (!result.rows.length) {
    return null;
  }

  return result.rows[0];
};

module.exports = {
  ledgerPaymentsSql,
  totalAmountSql,
  balanceAmountSql,
  paymentStatusSql,
  cargoFinancialSQL,
  /** @deprecated use cargoFinancialSQL */
  cargoFinancialSelect: cargoFinancialSQL,
  /** @deprecated alias of totalAmountSql */
  freightAmountSql: totalAmountSql,
  getCargoFinancials
};

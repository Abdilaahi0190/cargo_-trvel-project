const db = require('../config/db');
const { balanceAmountSql, paymentStatusSql } = require('../utils/cargoFinancials');

// ─── Date range helper ────────────────────────────────────────────────────────
// Accepts: today | this_week | this_month | this_year | custom (with from/to)
function buildDateFilter(query, alias = 'c') {
  const { period, from, to, branch_id } = query;
  const filters = [`${alias}.deleted = FALSE`];
  const values = [];

  const dateCol = `${alias}.created_at`;

  if (period === 'today') {
    filters.push(`DATE(${dateCol}) = CURRENT_DATE`);
  } else if (period === 'this_week') {
    filters.push(`DATE_TRUNC('week', ${dateCol}) = DATE_TRUNC('week', CURRENT_DATE)`);
  } else if (period === 'this_month') {
    filters.push(`DATE_TRUNC('month', ${dateCol}) = DATE_TRUNC('month', CURRENT_DATE)`);
  } else if (period === 'this_year') {
    filters.push(`DATE_PART('year', ${dateCol}) = DATE_PART('year', CURRENT_DATE)`);
  } else {
    if (from) {
      values.push(from);
      filters.push(`DATE(${dateCol}) >= $${values.length}::date`);
    }
    if (to) {
      values.push(to);
      filters.push(`DATE(${dateCol}) <= $${values.length}::date`);
    }
  }

  if (branch_id) {
    values.push(Number(branch_id));
    filters.push(`(${alias}.from_branch_id = $${values.length} OR ${alias}.to_branch_id = $${values.length})`);
  }

  return { filters, values };
}

// ─── 1. Revenue report ────────────────────────────────────────────────────────
const revenueReport = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['p.deleted = FALSE'];

    if (req.query.branch_id) {
      values.push(Number(req.query.branch_id));
      filters.push(`c.from_branch_id = $${values.length}`);
    }
    if (req.query.from) {
      values.push(req.query.from);
      filters.push(`DATE(p.created_at) >= $${values.length}::date`);
    }
    if (req.query.to) {
      values.push(req.query.to);
      filters.push(`DATE(p.created_at) <= $${values.length}::date`);
    }
    if (req.query.period === 'today') filters.push(`DATE(p.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', p.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', p.created_at) = DATE_PART('year', CURRENT_DATE)`);

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await db.queryWithUser(
      `SELECT to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS month,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM payments p
       JOIN cargo c ON c.cargo_id = p.cargo_id
       ${where}
       GROUP BY 1 ORDER BY 1`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Revenue report retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 2. Cargo by status ───────────────────────────────────────────────────────
const cargoReport = async (req, res, next) => {
  try {
    const { filters, values } = buildDateFilter(req.query);
    const result = await db.queryWithUser(
      `SELECT cs.status_name AS status, COUNT(*)::INT AS count
       FROM cargo c
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       WHERE ${filters.join(' AND ')}
       GROUP BY cs.status_name ORDER BY count DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo report retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 3. Branch summary ────────────────────────────────────────────────────────
const branchSummary = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT b.branch_id AS branch_id, b.branch_name,
              COALESCE(cs.total_cargo, 0) AS total_cargo,
              COALESCE(rv.total_revenue, 0) AS total_revenue,
              COALESCE(ac.total_balance, 0) AS total_balance
       FROM branches b
       LEFT JOIN (
         SELECT from_branch_id AS branch_id, COUNT(*)::INT AS total_cargo
         FROM cargo WHERE deleted = FALSE GROUP BY from_branch_id
       ) cs ON cs.branch_id = b.branch_id
       LEFT JOIN (
         SELECT c.from_branch_id AS branch_id, COALESCE(SUM(p.amount), 0) AS total_revenue
         FROM payments p JOIN cargo c ON c.cargo_id = p.cargo_id
         WHERE p.deleted = FALSE GROUP BY c.from_branch_id
       ) rv ON rv.branch_id = b.branch_id
       LEFT JOIN (
         SELECT branch_id AS branch_id, COALESCE(SUM(balance), 0) AS total_balance
         FROM accounts WHERE deleted = FALSE GROUP BY branch_id
       ) ac ON ac.branch_id = b.branch_id
       WHERE b.deleted = FALSE ORDER BY b.branch_name`,
      [],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Branch summary retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 4. Cargo by destination ──────────────────────────────────────────────────
const cargoByDestination = async (req, res, next) => {
  try {
    const { filters, values } = buildDateFilter(req.query);
    const result = await db.queryWithUser(
      `SELECT tb.branch_name AS destination,
              COUNT(c.cargo_id)::INT AS total_cargo,
              COALESCE(SUM(c.weight), 0) AS total_weight,
              COALESCE(SUM(c.pcs), 0) AS total_pieces,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Delivered')::INT AS delivered,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'In Transit')::INT AS in_transit,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Pending')::INT AS pending,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM cargo c
       JOIN branches tb ON tb.branch_id = c.to_branch_id
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
       WHERE ${filters.join(' AND ')}
       GROUP BY tb.branch_name ORDER BY total_cargo DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo by destination retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 5. Cargo by customer (top senders) ──────────────────────────────────────
const cargoByCustomer = async (req, res, next) => {
  try {
    const { filters, values } = buildDateFilter(req.query);
    const result = await db.queryWithUser(
      `SELECT cust.customer_id, cust.full_name, cust.phone, cust.customer_type,
              COUNT(c.cargo_id)::INT AS total_shipments,
              COALESCE(SUM(c.weight), 0) AS total_weight,
              COALESCE(SUM(c.pcs), 0) AS total_pieces,
              COALESCE(SUM(c.price), 0) AS total_billed,
              COALESCE(SUM(p.amount), 0) AS total_paid
       FROM customers cust
       JOIN cargo c ON c.sender_id = cust.customer_id
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
       WHERE ${filters.join(' AND ')} AND cust.deleted = FALSE
       GROUP BY cust.customer_id, cust.full_name, cust.phone, cust.customer_type
       ORDER BY total_shipments DESC, total_paid DESC
       LIMIT ${req.query.limit ? Number(req.query.limit) : 50}`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo by customer retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 6. Cargo by employee ─────────────────────────────────────────────────────
const cargoByEmployee = async (req, res, next) => {
  try {
    const { filters, values } = buildDateFilter(req.query);
    const result = await db.queryWithUser(
      `SELECT u.user_id, u.full_name AS employee_name, u.username,
              COUNT(c.cargo_id)::INT AS total_shipments,
              COALESCE(SUM(c.weight), 0) AS total_weight,
              COALESCE(SUM(p.amount), 0) AS total_revenue
       FROM users u
       JOIN cargo c ON c.created_by = u.user_id
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
       WHERE ${filters.join(' AND ')} AND u.deleted = FALSE
       GROUP BY u.user_id, u.full_name, u.username
       ORDER BY total_shipments DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo by employee retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 7. Cargo by branch (origin) ─────────────────────────────────────────────
const cargoByBranch = async (req, res, next) => {
  try {
    const { filters, values } = buildDateFilter(req.query);
    const result = await db.queryWithUser(
      `SELECT fb.branch_name AS branch,
              COUNT(c.cargo_id)::INT AS total_cargo,
              COALESCE(SUM(c.weight), 0) AS total_weight,
              COALESCE(SUM(c.pcs), 0) AS total_pieces,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Delivered')::INT AS delivered,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'In Transit')::INT AS in_transit,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Pending')::INT AS pending,
              COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Cancelled')::INT AS cancelled,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM cargo c
       JOIN branches fb ON fb.branch_id = c.from_branch_id
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
       WHERE ${filters.join(' AND ')}
       GROUP BY fb.branch_name ORDER BY total_cargo DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo by branch retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 8. Customer stats ────────────────────────────────────────────────────────
const customerStats = async (req, res, next) => {
  try {
    const periodFilter = req.query.period === 'today'
      ? `DATE(c.created_at) = CURRENT_DATE`
      : req.query.period === 'this_week'
      ? `DATE_TRUNC('week', c.created_at) = DATE_TRUNC('week', CURRENT_DATE)`
      : req.query.period === 'this_month'
      ? `DATE_TRUNC('month', c.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
      : req.query.period === 'this_year'
      ? `DATE_PART('year', c.created_at) = DATE_PART('year', CURRENT_DATE)`
      : null;

    const fromFilter = req.query.from ? `DATE(c.created_at) >= '${req.query.from}'::date` : null;
    const toFilter = req.query.to ? `DATE(c.created_at) <= '${req.query.to}'::date` : null;
    const dateFilters = [periodFilter, fromFilter, toFilter].filter(Boolean).join(' AND ');

    const result = await db.queryWithUser(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE deleted = FALSE) AS total_customers,
         (SELECT COUNT(*) FROM customers WHERE customer_type = 'regular' AND deleted = FALSE) AS regular_customers,
         (SELECT COUNT(*) FROM customers WHERE customer_type = 'one_time' AND deleted = FALSE) AS one_time_customers,
         (SELECT COUNT(*) FROM customers
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND deleted = FALSE
         ) AS new_customers_this_month`,
      [],
      req.user.user_id
    );

    // Top customers by revenue
    const topValues = [];
    const topFilters = ['c.deleted = FALSE', 'p.deleted = FALSE'];
    if (dateFilters) topFilters.push(dateFilters);
    if (req.query.branch_id) {
      topValues.push(Number(req.query.branch_id));
      topFilters.push(`c.from_branch_id = $${topValues.length}`);
    }

    const topResult = await db.queryWithUser(
      `SELECT cust.customer_id, cust.full_name, cust.phone, cust.customer_type,
              COUNT(DISTINCT c.cargo_id)::INT AS shipment_count,
              COALESCE(SUM(p.amount), 0) AS total_revenue
       FROM customers cust
       JOIN cargo c ON c.sender_id = cust.customer_id
       JOIN payments p ON p.cargo_id = c.cargo_id
       WHERE ${topFilters.join(' AND ')} AND cust.deleted = FALSE
       GROUP BY cust.customer_id, cust.full_name, cust.phone, cust.customer_type
       ORDER BY total_revenue DESC LIMIT 10`,
      topValues,
      req.user.user_id
    );

    return res.json({
      success: true,
      data: {
        summary: result.rows[0],
        top_customers: topResult.rows
      },
      message: 'Customer statistics retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ─── 9. Employee stats ────────────────────────────────────────────────────────
const employeeStats = async (req, res, next) => {
  try {
    const values = [];
    const cargoFilters = ['c.deleted = FALSE'];

    if (req.query.period === 'today') cargoFilters.push(`DATE(c.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') cargoFilters.push(`DATE_TRUNC('week', c.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') cargoFilters.push(`DATE_TRUNC('month', c.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') cargoFilters.push(`DATE_PART('year', c.created_at) = DATE_PART('year', CURRENT_DATE)`);

    if (req.query.from) {
      values.push(req.query.from);
      cargoFilters.push(`DATE(c.created_at) >= $${values.length}::date`);
    }
    if (req.query.to) {
      values.push(req.query.to);
      cargoFilters.push(`DATE(c.created_at) <= $${values.length}::date`);
    }
    if (req.query.branch_id) {
      values.push(Number(req.query.branch_id));
      cargoFilters.push(`c.from_branch_id = $${values.length}`);
    }

    const result = await db.queryWithUser(
      `SELECT u.user_id, u.full_name AS employee_name, u.username,
              r.role_name,
              COUNT(DISTINCT c.cargo_id)::INT AS shipments_processed,
              COUNT(DISTINCT cust.customer_id)::INT AS customers_registered,
              COALESCE(SUM(p.amount), 0) AS revenue_generated
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN cargo c ON c.created_by = u.user_id AND ${cargoFilters.join(' AND ')}
       LEFT JOIN customers cust ON cust.created_by = u.user_id AND cust.deleted = FALSE
       LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
       WHERE u.deleted = FALSE
       GROUP BY u.user_id, u.full_name, u.username, r.role_name
       ORDER BY shipments_processed DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Employee statistics retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 10. Financial P&L report ─────────────────────────────────────────────────
const financialReport = async (req, res, next) => {
  try {
    const values = [];
    const payFilters = ['p.deleted = FALSE'];
    const expFilters = ['ec.deleted = FALSE'];

    const applyPeriod = (filtersArr) => {
      if (req.query.period === 'today') filtersArr.push(`DATE(created_at) = CURRENT_DATE`);
      else if (req.query.period === 'this_week') filtersArr.push(`DATE_TRUNC('week', created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
      else if (req.query.period === 'this_month') filtersArr.push(`DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
      else if (req.query.period === 'this_year') filtersArr.push(`DATE_PART('year', created_at) = DATE_PART('year', CURRENT_DATE)`);
    };

    if (req.query.from) {
      values.push(req.query.from);
      payFilters.push(`DATE(p.created_at) >= $${values.length}::date`);
      expFilters.push(`DATE(ec.created_at) >= $${values.length}::date`);
    }
    if (req.query.to) {
      values.push(req.query.to);
      payFilters.push(`DATE(p.created_at) <= $${values.length}::date`);
      expFilters.push(`DATE(ec.created_at) <= $${values.length}::date`);
    }

    applyPeriod(payFilters);
    applyPeriod(expFilters);

    const [revenueRes, expenseRes, outstandingRes, monthlyRes] = await Promise.all([
      db.queryWithUser(
        `SELECT COALESCE(SUM(p.amount), 0) AS total_revenue,
                COUNT(*)::INT AS payment_count
         FROM payments p WHERE ${payFilters.join(' AND ')}`,
        values,
        req.user.user_id
      ),
      db.queryWithUser(
        `SELECT COALESCE(SUM(ec.amount), 0) AS total_expenses,
                COUNT(*)::INT AS expense_count
         FROM expense_charges ec WHERE ${expFilters.join(' AND ')}`,
        values,
        req.user.user_id
      ),
      db.queryWithUser(
        `SELECT COALESCE(SUM(
           COALESCE(c.price,0) + COALESCE(c.extra_charges,0)
           - COALESCE(c.paid_origin,0) - COALESCE(c.payment_received_amount,0)
           - (SELECT COALESCE(SUM(p2.amount),0) FROM payments p2 WHERE p2.cargo_id = c.cargo_id AND p2.deleted = FALSE)
         ), 0) AS outstanding_balance
         FROM cargo c
         JOIN cargo_status cs ON cs.status_id = c.current_status_id
         WHERE cs.status_name NOT IN ('Delivered','Cancelled') AND c.deleted = FALSE`,
        [],
        req.user.user_id
      ),
      db.queryWithUser(
        `WITH monthly_revenue AS (
           SELECT date_trunc('month', p.created_at) AS month_start,
                  COALESCE(SUM(p.amount), 0) AS revenue
           FROM payments p
           WHERE p.deleted = FALSE
           GROUP BY date_trunc('month', p.created_at)
         ),
         monthly_expenses AS (
           SELECT date_trunc('month', ec2.created_at) AS month_start,
                  COALESCE(SUM(ec2.amount), 0) AS expenses
           FROM expense_charges ec2
           WHERE ec2.deleted = FALSE
           GROUP BY date_trunc('month', ec2.created_at)
         )
         SELECT to_char(mr.month_start, 'YYYY-MM') AS month,
                mr.revenue,
                COALESCE(me.expenses, 0) AS expenses
         FROM monthly_revenue mr
         LEFT JOIN monthly_expenses me ON me.month_start = mr.month_start
         ORDER BY mr.month_start LIMIT 12`,
        [],
        req.user.user_id
      )
    ]);

    const totalRevenue = Number(revenueRes.rows[0]?.total_revenue || 0);
    const totalExpenses = Number(expenseRes.rows[0]?.total_expenses || 0);

    return res.json({
      success: true,
      data: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        gross_profit: totalRevenue - totalExpenses,
        net_profit: totalRevenue - totalExpenses,
        payment_count: Number(revenueRes.rows[0]?.payment_count || 0),
        expense_count: Number(expenseRes.rows[0]?.expense_count || 0),
        outstanding_balance: Number(outstandingRes.rows[0]?.outstanding_balance || 0),
        monthly_trend: monthlyRes.rows.map((r) => ({
          month: r.month,
          revenue: Number(r.revenue || 0),
          expenses: Number(r.expenses || 0),
          profit: Number(r.revenue || 0) - Number(r.expenses || 0)
        }))
      },
      message: 'Financial report retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ─── 11. Cargo inventory (by mark/category) ───────────────────────────────────
const cargoInventory = async (req, res, next) => {
  try {
    const values = [];
    const branchFilter = req.query.branch_id
      ? (() => { values.push(Number(req.query.branch_id)); return `AND (c.from_branch_id = $${values.length} OR c.to_branch_id = $${values.length})`; })()
      : '';

    const result = await db.queryWithUser(
      `SELECT
         COALESCE(NULLIF(TRIM(c.mark), ''), NULLIF(TRIM(c.description), ''), 'Uncategorized') AS category,
         COUNT(c.cargo_id)::INT AS total_shipments,
         COALESCE(SUM(c.pcs), 0) AS total_pieces_received,
         COALESCE(SUM(CASE WHEN cs.status_name = 'Delivered' THEN c.pcs ELSE 0 END), 0) AS pieces_delivered,
         COALESCE(SUM(CASE WHEN cs.status_name NOT IN ('Delivered','Cancelled','Damaged','Lost') THEN c.pcs ELSE 0 END), 0) AS pieces_remaining,
         COALESCE(SUM(CASE WHEN cs.status_name = 'Damaged' THEN c.pcs ELSE 0 END), 0) AS pieces_damaged,
         COALESCE(SUM(CASE WHEN cs.status_name = 'Lost' THEN c.pcs ELSE 0 END), 0) AS pieces_lost,
         COALESCE(SUM(CASE WHEN cs.status_name = 'Cancelled' THEN c.pcs ELSE 0 END), 0) AS pieces_cancelled,
         COALESCE(SUM(CASE WHEN cs.status_name = 'In Transit' THEN c.pcs ELSE 0 END), 0) AS pieces_in_transit,
         COALESCE(SUM(c.weight), 0) AS total_weight_received,
         COALESCE(SUM(CASE WHEN cs.status_name = 'Delivered' THEN c.weight ELSE 0 END), 0) AS weight_delivered,
         COALESCE(SUM(CASE WHEN cs.status_name NOT IN ('Delivered','Cancelled') THEN c.weight ELSE 0 END), 0) AS weight_remaining
       FROM cargo c
       JOIN cargo_status cs ON cs.status_id = c.current_status_id
       WHERE c.deleted = FALSE ${branchFilter}
       GROUP BY 1
       ORDER BY total_pieces_received DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo inventory retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 12. Comprehensive summary (for quick report filters) ─────────────────────
const comprehensiveSummary = async (req, res, next) => {
  try {
    const { filters: cf, values: cv } = buildDateFilter(req.query);

    const payFilters = ['p.deleted = FALSE'];
    const payValues = [];

    if (req.query.period === 'today') payFilters.push(`DATE(p.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') payFilters.push(`DATE_TRUNC('week', p.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') payFilters.push(`DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') payFilters.push(`DATE_PART('year', p.created_at) = DATE_PART('year', CURRENT_DATE)`);
    if (req.query.from) { payValues.push(req.query.from); payFilters.push(`DATE(p.created_at) >= $${payValues.length}::date`); }
    if (req.query.to) { payValues.push(req.query.to); payFilters.push(`DATE(p.created_at) <= $${payValues.length}::date`); }
    if (req.query.branch_id) { payValues.push(Number(req.query.branch_id)); payFilters.push(`c.from_branch_id = $${payValues.length}`); }

    const [cargoStats, revenueStats] = await Promise.all([
      db.queryWithUser(
        `SELECT
           COUNT(*)::INT AS total_cargo,
           COUNT(*) FILTER (WHERE cs.status_name = 'Delivered')::INT AS delivered,
           COUNT(*) FILTER (WHERE cs.status_name = 'In Transit')::INT AS in_transit,
           COUNT(*) FILTER (WHERE cs.status_name = 'Pending')::INT AS pending,
           COUNT(*) FILTER (WHERE cs.status_name = 'Cancelled')::INT AS cancelled,
           COALESCE(SUM(c.weight), 0) AS total_weight,
           COALESCE(SUM(c.pcs), 0) AS total_pieces
         FROM cargo c
         JOIN cargo_status cs ON cs.status_id = c.current_status_id
         WHERE ${cf.join(' AND ')}`,
        cv,
        req.user.user_id
      ),
      db.queryWithUser(
        `SELECT COALESCE(SUM(p.amount), 0) AS total_revenue
         FROM payments p
         LEFT JOIN cargo c ON c.cargo_id = p.cargo_id
         WHERE ${payFilters.join(' AND ')}`,
        payValues,
        req.user.user_id
      )
    ]);

    return res.json({
      success: true,
      data: {
        ...cargoStats.rows[0],
        total_revenue: Number(revenueStats.rows[0]?.total_revenue || 0)
      },
      message: 'Summary retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ─── 13. Branch financial breakdown ──────────────────────────────────────────
const branchFinancial = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT b.branch_id, b.branch_name,
              COALESCE(rv.revenue, 0) AS revenue,
              COALESCE(ex.expenses, 0) AS expenses,
              COALESCE(rv.revenue, 0) - COALESCE(ex.expenses, 0) AS profit,
              COALESCE(cargo_cnt.total, 0) AS total_cargo
       FROM branches b
       LEFT JOIN (
         SELECT c.from_branch_id AS branch_id, SUM(p.amount) AS revenue
         FROM payments p JOIN cargo c ON c.cargo_id = p.cargo_id
         WHERE p.deleted = FALSE GROUP BY c.from_branch_id
       ) rv ON rv.branch_id = b.branch_id
       LEFT JOIN (
         SELECT ub.branch_id, SUM(ec.amount) AS expenses
         FROM expense_charges ec JOIN user_branches ub ON ub.user_branch_id = ec.user_branch_id
         WHERE ec.deleted = FALSE GROUP BY ub.branch_id
       ) ex ON ex.branch_id = b.branch_id
       LEFT JOIN (
         SELECT from_branch_id AS branch_id, COUNT(*)::INT AS total
         FROM cargo WHERE deleted = FALSE GROUP BY from_branch_id
       ) cargo_cnt ON cargo_cnt.branch_id = b.branch_id
       WHERE b.deleted = FALSE
       ORDER BY revenue DESC NULLS LAST`,
      [],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Branch financial report retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── Legacy endpoints (kept for backward compat) ──────────────────────────────
const dailyRevenue = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      'SELECT * FROM fn_daily_revenue($1::date)',
      [req.query.date || null],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Daily revenue retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const branchProfit = async (req, res, next) => {
  try {
    const branchId = Number(req.query.branch_id);

    if (!req.query.branch_id || !Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid branch_id is required' });
    }

    const result = await db.queryWithUser(
      'SELECT fn_branch_profit($1, $2::date) AS profit',
      [branchId, req.query.month || null],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Branch profit retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const mvDailyRevenue = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT * FROM mv_daily_revenue
       WHERE ($1::date IS NULL OR day = $1::date)
       ORDER BY day DESC, branch_name`,
      [req.query.date || null],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Daily revenue MV retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const mvMonthlyProfit = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT * FROM mv_monthly_branch_profit
       WHERE ($1::date IS NULL OR month = date_trunc('month', $1::date))
       ORDER BY month DESC, branch_name`,
      [req.query.month || null],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Monthly profit MV retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const refreshMviews = async (req, res, next) => {
  try {
    await db.queryWithUser('SELECT refresh_reporting_mviews()', [], req.user.user_id);
    return res.json({ success: true, data: null, message: 'Reporting materialized views refreshed successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 14. Revenue by trip ──────────────────────────────────────────────────────
const revenueByTrip = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['t.deleted = FALSE'];

    if (req.query.branch_id) {
      values.push(Number(req.query.branch_id));
      filters.push(`(r.from_branch_id = $${values.length} OR r.to_branch_id = $${values.length})`);
    }
    if (req.query.from) { values.push(req.query.from); filters.push(`t.trip_date >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`t.trip_date <= $${values.length}::date`); }
    if (req.query.period === 'today') filters.push(`t.trip_date = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', t.trip_date) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', t.trip_date) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', t.trip_date) = DATE_PART('year', CURRENT_DATE)`);

    const result = await db.queryWithUser(
      `SELECT t.trip_id,
              concat('TRP', t.trip_id) AS trip_no,
              t.trip_date,
              t.status,
              tp.name AS provider_name,
              concat(fb.branch_name, ' -> ', tb.branch_name) AS route,
              COUNT(DISTINCT tc.cargo_id)::INT AS total_shipments,
              COALESCE(SUM(pay.amount), 0) AS revenue
       FROM trips t
       JOIN routes r ON r.route_id = t.route_id
       JOIN branches fb ON fb.branch_id = r.from_branch_id
       JOIN branches tb ON tb.branch_id = r.to_branch_id
       JOIN transport_providers tp ON tp.provider_id = t.provider_id
       LEFT JOIN trip_cargo tc ON tc.trip_id = t.trip_id AND tc.deleted = FALSE
       LEFT JOIN payments pay ON pay.cargo_id = tc.cargo_id AND pay.deleted = FALSE
       WHERE ${filters.join(' AND ')}
       GROUP BY t.trip_id, t.trip_date, t.status, tp.name, fb.branch_name, tb.branch_name
       ORDER BY t.trip_date DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Revenue by trip retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 15. Revenue by transport provider ───────────────────────────────────────
const revenueByProvider = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['p.deleted = FALSE', 'c.deleted = FALSE'];

    if (req.query.from) { values.push(req.query.from); filters.push(`DATE(p.created_at) >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`DATE(p.created_at) <= $${values.length}::date`); }
    if (req.query.period === 'today') filters.push(`DATE(p.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', p.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', p.created_at) = DATE_PART('year', CURRENT_DATE)`);
    if (req.query.branch_id) { values.push(Number(req.query.branch_id)); filters.push(`c.from_branch_id = $${values.length}`); }

    const result = await db.queryWithUser(
      `SELECT tp.provider_id, tp.name AS provider_name, tp.entity_type,
              COUNT(DISTINCT c.cargo_id)::INT AS total_shipments,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM payments p
       JOIN cargo c ON c.cargo_id = p.cargo_id
       LEFT JOIN trip_cargo tc ON tc.cargo_id = c.cargo_id AND tc.deleted = FALSE
       LEFT JOIN trips t ON t.trip_id = tc.trip_id
       JOIN transport_providers tp ON tp.provider_id = COALESCE(c.transport_provider_id, t.provider_id)
       WHERE ${filters.join(' AND ')}
       GROUP BY tp.provider_id, tp.name, tp.entity_type
       ORDER BY revenue DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Revenue by transport provider retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 16. Expenses by trip ─────────────────────────────────────────────────────
const expensesByTrip = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['ec.deleted = FALSE', 'ec.trip_id IS NOT NULL'];

    if (req.query.from) { values.push(req.query.from); filters.push(`DATE(ec.created_at) >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`DATE(ec.created_at) <= $${values.length}::date`); }
    if (req.query.period === 'today') filters.push(`DATE(ec.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', ec.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', ec.created_at) = DATE_PART('year', CURRENT_DATE)`);

    const result = await db.queryWithUser(
      `SELECT t.trip_id,
              concat('TRP', t.trip_id) AS trip_no,
              t.trip_date,
              tp.name AS provider_name,
              COUNT(ec.expense_charge_id)::INT AS expense_count,
              COALESCE(SUM(ec.amount), 0) AS expenses
       FROM expense_charges ec
       JOIN trips t ON t.trip_id = ec.trip_id
       JOIN transport_providers tp ON tp.provider_id = t.provider_id
       WHERE ${filters.join(' AND ')}
       GROUP BY t.trip_id, t.trip_date, tp.name
       ORDER BY t.trip_date DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Expenses by trip retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 17. Expenses by transport provider ──────────────────────────────────────
const expensesByProvider = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['ec.deleted = FALSE', 'ec.transport_provider_id IS NOT NULL'];

    if (req.query.from) { values.push(req.query.from); filters.push(`DATE(ec.created_at) >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`DATE(ec.created_at) <= $${values.length}::date`); }
    if (req.query.period === 'today') filters.push(`DATE(ec.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', ec.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', ec.created_at) = DATE_PART('year', CURRENT_DATE)`);

    const result = await db.queryWithUser(
      `SELECT tp.provider_id, tp.name AS provider_name, tp.entity_type,
              COUNT(ec.expense_charge_id)::INT AS expense_count,
              COALESCE(SUM(ec.amount), 0) AS expenses
       FROM expense_charges ec
       JOIN transport_providers tp ON tp.provider_id = ec.transport_provider_id
       WHERE ${filters.join(' AND ')}
       GROUP BY tp.provider_id, tp.name, tp.entity_type
       ORDER BY expenses DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Expenses by transport provider retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 18. Expenses by category ────────────────────────────────────────────────
const expensesByCategory = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['ec.deleted = FALSE'];

    if (req.query.from) { values.push(req.query.from); filters.push(`DATE(ec.created_at) >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`DATE(ec.created_at) <= $${values.length}::date`); }
    if (req.query.period === 'today') filters.push(`DATE(ec.created_at) = CURRENT_DATE`);
    else if (req.query.period === 'this_week') filters.push(`DATE_TRUNC('week', ec.created_at) = DATE_TRUNC('week', CURRENT_DATE)`);
    else if (req.query.period === 'this_month') filters.push(`DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE)`);
    else if (req.query.period === 'this_year') filters.push(`DATE_PART('year', ec.created_at) = DATE_PART('year', CURRENT_DATE)`);
    if (req.query.branch_id) { values.push(Number(req.query.branch_id)); filters.push(`ub.branch_id = $${values.length}`); }

    const result = await db.queryWithUser(
      `SELECT et.expense_type_id, et.name AS category,
              COUNT(ec.expense_charge_id)::INT AS expense_count,
              COALESCE(SUM(ec.amount), 0) AS expenses
       FROM expense_charges ec
       JOIN expense_types et ON et.expense_type_id = ec.expense_type_id
       JOIN user_branches ub ON ub.user_branch_id = ec.user_branch_id
       WHERE ${filters.join(' AND ')}
       GROUP BY et.expense_type_id, et.name
       ORDER BY expenses DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Expenses by category retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 19. Outstanding balances per customer ───────────────────────────────────
const outstandingBalances = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['c.deleted = FALSE'];

    if (req.query.branch_id) { values.push(Number(req.query.branch_id)); filters.push(`c.from_branch_id = $${values.length}`); }

    const result = await db.queryWithUser(
      `SELECT cust.customer_id, cust.full_name, cust.phone, cust.customer_type,
              COUNT(c.cargo_id)::INT AS shipment_count,
              COALESCE(SUM(${balanceAmountSql}), 0) AS outstanding_balance
       FROM cargo c
       JOIN customers cust ON cust.customer_id = c.sender_id
       WHERE ${filters.join(' AND ')} AND cust.deleted = FALSE
       GROUP BY cust.customer_id, cust.full_name, cust.phone, cust.customer_type
       HAVING COALESCE(SUM(${balanceAmountSql}), 0) > 0
       ORDER BY outstanding_balance DESC`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Outstanding balances retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── 20. Paid vs unpaid invoices ─────────────────────────────────────────────
const invoicesStatus = async (req, res, next) => {
  try {
    const values = [];
    const filters = ['c.deleted = FALSE'];

    if (req.query.branch_id) { values.push(Number(req.query.branch_id)); filters.push(`c.from_branch_id = $${values.length}`); }
    if (req.query.from) { values.push(req.query.from); filters.push(`DATE(inv.issue_date) >= $${values.length}::date`); }
    if (req.query.to) { values.push(req.query.to); filters.push(`DATE(inv.issue_date) <= $${values.length}::date`); }

    const result = await db.queryWithUser(
      `SELECT ${paymentStatusSql} AS payment_status,
              COUNT(inv.invoice_id)::INT AS invoice_count,
              COALESCE(SUM(inv.total_amount), 0) AS total_amount
       FROM invoices inv
       JOIN cargo c ON c.cargo_id = inv.cargo_id
       WHERE ${filters.join(' AND ')}
       GROUP BY ${paymentStatusSql}
       ORDER BY payment_status`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows, message: 'Invoice payment status retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  // New comprehensive endpoints
  comprehensiveSummary,
  cargoByDestination,
  cargoByCustomer,
  cargoByEmployee,
  cargoByBranch,
  customerStats,
  employeeStats,
  financialReport,
  cargoInventory,
  branchFinancial,
  // Transport-provider / trip / category / customer / invoice breakdowns
  revenueByTrip,
  revenueByProvider,
  expensesByTrip,
  expensesByProvider,
  expensesByCategory,
  outstandingBalances,
  invoicesStatus,
  // Original endpoints
  revenueReport,
  cargoReport,
  branchSummary,
  dailyRevenue,
  branchProfit,
  mvDailyRevenue,
  mvMonthlyProfit,
  refreshMviews
};

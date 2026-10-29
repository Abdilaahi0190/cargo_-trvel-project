const db = require('../config/db');

const getOverview = async (req, res, next) => {
  try {
    const [mainResult, branchLoadResult, deliveredTodayResult, delayedResult, topCustomersResult, bestBranchesResult] =
      await Promise.all([
        // Main KPIs
        db.queryWithUser(
          `SELECT
             (SELECT COUNT(*) FROM cargo c
              JOIN cargo_status cs ON cs.status_id = c.current_status_id
              WHERE cs.status_name = 'In Transit' AND c.deleted = FALSE
             ) AS active_shipments,

             (SELECT COUNT(*) FROM cargo c
              JOIN cargo_history ch ON c.cargo_id = ch.cargo_id
              JOIN cargo_status cs ON ch.status_id = cs.status_id
              WHERE cs.status_name = 'Delivered' AND DATE(ch.created_at) = CURRENT_DATE AND c.deleted = FALSE
             ) AS delivered_today,

             (SELECT COUNT(*) FROM cargo c
              JOIN cargo_status cs ON cs.status_id = c.current_status_id
              WHERE cs.status_name = 'Pending' AND c.deleted = FALSE
             ) AS pending_orders,

             (SELECT COUNT(*) FROM cargo c
              WHERE DATE(c.created_at) = CURRENT_DATE AND c.deleted = FALSE
             ) AS cargo_received_today,

             (SELECT COUNT(*) FROM cargo c
              JOIN cargo_status cs ON cs.status_id = c.current_status_id
              WHERE cs.status_name = 'Delayed' AND c.deleted = FALSE
             ) AS delayed_shipments,

             (SELECT COUNT(DISTINCT customer_id) FROM customers WHERE deleted = FALSE) AS total_customers,

             (SELECT COALESCE(SUM(p.amount), 0)
              FROM payments p WHERE DATE(p.created_at) = CURRENT_DATE AND p.deleted = FALSE
             ) AS revenue_today,

             (SELECT COALESCE(SUM(p.amount), 0)
              FROM payments p
              WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE) AND p.deleted = FALSE
             ) AS revenue_this_month,

             (SELECT COALESCE(SUM(ec.amount), 0)
              FROM expense_charges ec WHERE DATE(ec.created_at) = CURRENT_DATE AND ec.deleted = FALSE
             ) AS expenses_today,

             (SELECT COALESCE(SUM(ec.amount), 0)
              FROM expense_charges ec
              WHERE DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE) AND ec.deleted = FALSE
             ) AS expenses_this_month,

             (SELECT COALESCE(SUM(p.amount), 0) - COALESCE(
               (SELECT SUM(ec.amount) FROM expense_charges ec
                WHERE DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE) AND ec.deleted = FALSE), 0)
              FROM payments p
              WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE) AND p.deleted = FALSE
             ) AS net_profit_this_month,

             (SELECT COALESCE(SUM(
               COALESCE(c.price, 0) + COALESCE(c.extra_charges, 0)
               - COALESCE(c.paid_origin, 0) - COALESCE(c.payment_received_amount, 0)
               - (SELECT COALESCE(SUM(p2.amount),0) FROM payments p2 WHERE p2.cargo_id = c.cargo_id AND p2.deleted = FALSE)
             ), 0)
              FROM cargo c
              JOIN cargo_status cs ON cs.status_id = c.current_status_id
              WHERE cs.status_name NOT IN ('Delivered','Cancelled') AND c.deleted = FALSE
             ) AS outstanding_balance`,
          [],
          req.user.user_id
        ),

        // Branch load
        db.queryWithUser(
          `SELECT b.branch_id, b.branch_name,
             COUNT(c.cargo_id) FILTER (WHERE cs.status_name NOT IN ('Delivered','Cancelled')) AS active_shipments,
             COUNT(c.cargo_id) FILTER (WHERE cs.status_name = 'Delivered') AS delivered_shipments,
             COALESCE(SUM(CASE WHEN cs.status_name NOT IN ('Delivered','Cancelled') THEN COALESCE(c.weight,0) ELSE 0 END), 0) AS active_weight_kg
           FROM branches b
           LEFT JOIN cargo c ON (c.from_branch_id = b.branch_id OR c.to_branch_id = b.branch_id) AND c.deleted = FALSE
           LEFT JOIN cargo_status cs ON cs.status_id = c.current_status_id
           WHERE b.deleted = FALSE
           GROUP BY b.branch_id, b.branch_name
           ORDER BY active_weight_kg DESC, b.branch_name
           LIMIT 10`,
          [],
          req.user.user_id
        ),

        // Delivered today
        db.queryWithUser(
          `SELECT c.cargo_id, c.tracking_number, c.weight,
                  fb.branch_name AS from_branch_name, tb.branch_name AS to_branch_name,
                  MAX(ch.created_at) AS delivered_at
           FROM cargo c
           JOIN cargo_history ch ON ch.cargo_id = c.cargo_id
           JOIN cargo_status cs ON cs.status_id = ch.status_id
           JOIN branches fb ON fb.branch_id = c.from_branch_id
           JOIN branches tb ON tb.branch_id = c.to_branch_id
           WHERE cs.status_name = 'Delivered' AND DATE(ch.created_at) = CURRENT_DATE AND c.deleted = FALSE
           GROUP BY c.cargo_id, c.tracking_number, c.weight, fb.branch_name, tb.branch_name
           ORDER BY delivered_at DESC LIMIT 25`,
          [],
          req.user.user_id
        ),

        // Delayed shipments
        db.queryWithUser(
          `SELECT c.cargo_id, c.tracking_number, c.created_at, c.weight,
                  cs.status_name, fb.branch_name AS from_branch_name, tb.branch_name AS to_branch_name,
                  EXTRACT(DAY FROM NOW() - c.created_at)::INT AS age_days
           FROM cargo c
           JOIN cargo_status cs ON cs.status_id = c.current_status_id
           JOIN branches fb ON fb.branch_id = c.from_branch_id
           JOIN branches tb ON tb.branch_id = c.to_branch_id
           WHERE cs.status_name = 'Delayed' AND c.deleted = FALSE
           ORDER BY c.created_at ASC LIMIT 25`,
          [],
          req.user.user_id
        ),

        // Top customers by revenue (this month)
        db.queryWithUser(
          `SELECT cust.customer_id, cust.full_name, cust.phone,
                  COUNT(DISTINCT c.cargo_id) AS total_shipments,
                  COALESCE(SUM(p.amount), 0) AS total_paid
           FROM customers cust
           JOIN cargo c ON c.sender_id = cust.customer_id AND c.deleted = FALSE
           LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
             AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)
           WHERE cust.deleted = FALSE
           GROUP BY cust.customer_id, cust.full_name, cust.phone
           ORDER BY total_paid DESC, total_shipments DESC
           LIMIT 5`,
          [],
          req.user.user_id
        ),

        // Best performing branches (this month)
        db.queryWithUser(
          `SELECT b.branch_id, b.branch_name,
                  COUNT(DISTINCT c.cargo_id) AS shipments_this_month,
                  COALESCE(SUM(p.amount), 0) AS revenue_this_month,
                  COALESCE(SUM(ec.amount), 0) AS expenses_this_month
           FROM branches b
           LEFT JOIN cargo c ON c.from_branch_id = b.branch_id AND c.deleted = FALSE
             AND DATE_TRUNC('month', c.created_at) = DATE_TRUNC('month', CURRENT_DATE)
           LEFT JOIN payments p ON p.cargo_id = c.cargo_id AND p.deleted = FALSE
             AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)
           LEFT JOIN user_branches ub ON ub.branch_id = b.branch_id AND ub.deleted = FALSE
           LEFT JOIN expense_charges ec ON ec.user_branch_id = ub.user_branch_id AND ec.deleted = FALSE
             AND DATE_TRUNC('month', ec.created_at) = DATE_TRUNC('month', CURRENT_DATE)
           WHERE b.deleted = FALSE
           GROUP BY b.branch_id, b.branch_name
           ORDER BY revenue_this_month DESC
           LIMIT 5`,
          [],
          req.user.user_id
        )
      ]);

    const row = mainResult.rows[0];
    const branchRows = branchLoadResult.rows.map((r) => ({
      branch_id: Number(r.branch_id),
      branch_name: r.branch_name,
      active_shipments: Number(r.active_shipments || 0),
      delivered_shipments: Number(r.delivered_shipments || 0),
      active_weight_kg: Number(r.active_weight_kg || 0)
    }));

    return res.json({
      success: true,
      data: {
        // Cargo stats
        active_shipments: Number(row.active_shipments || 0),
        delivered_today: Number(row.delivered_today || 0),
        pending_orders: Number(row.pending_orders || 0),
        cargo_received_today: Number(row.cargo_received_today || 0),
        delayed_shipments: Number(row.delayed_shipments || 0),
        total_customers: Number(row.total_customers || 0),
        // Financial stats
        revenue_today: Number(row.revenue_today || 0),
        revenue_this_month: Number(row.revenue_this_month || 0),
        expenses_today: Number(row.expenses_today || 0),
        expenses_this_month: Number(row.expenses_this_month || 0),
        net_profit_this_month: Number(row.net_profit_this_month || 0),
        outstanding_balance: Number(row.outstanding_balance || 0),
        // Branch load
        warehouse_active_weight_kg: branchRows.reduce((s, r) => s + r.active_weight_kg, 0),
        warehouse_active_branches: branchRows.filter((r) => r.active_shipments > 0).length,
        warehouse_total_branches: branchRows.length,
        details: {
          warehouse_load: branchRows,
          delivered_today: deliveredTodayResult.rows.map((r) => ({
            cargo_id: Number(r.cargo_id),
            tracking_number: r.tracking_number,
            from_branch_name: r.from_branch_name,
            to_branch_name: r.to_branch_name,
            weight: Number(r.weight || 0),
            delivered_at: r.delivered_at
          })),
          delayed_shipments: delayedResult.rows.map((r) => ({
            cargo_id: Number(r.cargo_id),
            tracking_number: r.tracking_number,
            from_branch_name: r.from_branch_name,
            to_branch_name: r.to_branch_name,
            status_name: r.status_name,
            weight: Number(r.weight || 0),
            age_days: Number(r.age_days || 0),
            created_at: r.created_at
          })),
          top_customers: topCustomersResult.rows.map((r) => ({
            customer_id: Number(r.customer_id),
            full_name: r.full_name,
            phone: r.phone,
            total_shipments: Number(r.total_shipments || 0),
            total_paid: Number(r.total_paid || 0)
          })),
          best_branches: bestBranchesResult.rows.map((r) => ({
            branch_id: Number(r.branch_id),
            branch_name: r.branch_name,
            shipments_this_month: Number(r.shipments_this_month || 0),
            revenue_this_month: Number(r.revenue_this_month || 0),
            expenses_this_month: Number(r.expenses_this_month || 0),
            profit_this_month: Number(r.revenue_this_month || 0) - Number(r.expenses_this_month || 0)
          }))
        }
      },
      message: 'Dashboard overview retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getOverview };

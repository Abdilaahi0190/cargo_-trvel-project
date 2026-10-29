const db = require('../config/db');

const generate = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `INSERT INTO salary_charges
         (employee_branch_id, salary_month, salary_amount, user_branch_id, created_by, updated_by)
       SELECT eb.employee_branch_id,
              $1::date,
              COALESCE(eb.salary_amount, 0),
              $2,
              $3,
              $3
       FROM   employee_branches eb
       WHERE  eb.user_branch_id = $2
         AND  eb.status  = 'active'
         AND  eb.deleted = FALSE
       ON CONFLICT (employee_branch_id, salary_month) DO NOTHING
       RETURNING salary_charge_id`,
      [req.body.month_year, req.uBrId, req.user.user_id],
      req.user.user_id
    );

    return res.status(201).json({
      success: true,
      data:    { generated_count: result.rowCount },
      message: 'Salary generated successfully'
    });
  } catch (error) {
    return next(error);
  }
};

const getCharges = async (req, res, next) => {
  try {
    const page   = Number(req.query.page)  > 0 ? Number(req.query.page)  : 1;
    const limit  = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const values = [req.uBrId];

    const countResult = await db.queryWithUser(
      `SELECT COUNT(*) AS total
       FROM salary_charges sc
       JOIN employee_branches eb ON eb.employee_branch_id = sc.employee_branch_id
       JOIN employees e ON e.employee_id = eb.employee_id
       WHERE sc.deleted = FALSE
         AND sc.user_branch_id = $1`,
      values,
      req.user.user_id
    );

    values.push(limit, offset);
    const result = await db.queryWithUser(
      `SELECT sc.*,
              e.full_name,
              eb.employee_branch_id,
              COALESCE(sa.overtime_hours, 0) AS overtime_hours,
              COALESCE(sa.overtime_rate,  0) AS overtime_rate,
              COALESCE(sa.bonus,          0) AS bonus,
              COALESCE(sa.penalty,        0) AS penalty,
              COALESCE(sa.notes,          '') AS adjustment_notes,
              ROUND(
                sc.salary_amount
                  + COALESCE(sa.bonus, 0)
                  + (COALESCE(sa.overtime_hours, 0) * COALESCE(sa.overtime_rate, 0))
                  - COALESCE(sa.penalty, 0)
              , 2) AS gross_net
       FROM salary_charges sc
       JOIN employee_branches eb ON eb.employee_branch_id = sc.employee_branch_id
       JOIN employees e ON e.employee_id = eb.employee_id
       LEFT JOIN salary_adjustments sa
              ON sa.employee_branch_id = sc.employee_branch_id
             AND sa.month = sc.salary_month
       WHERE sc.deleted = FALSE
         AND sc.user_branch_id = $1
       ORDER BY sc.salary_month DESC, sc.created_at DESC
       LIMIT $2 OFFSET $3`,
      values,
      req.user.user_id
    );

    return res.json({
      success: true,
      data:    result.rows,
      meta:    {
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

const pay = async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await db.setUserContext(client, req.user.user_id);

    const charge = await client.query(
      `SELECT * FROM salary_charges
       WHERE salary_charge_id = $1 AND user_branch_id = $2 AND deleted = FALSE FOR UPDATE`,
      [Number(req.params.id), req.uBrId]
    );

    if (!charge.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Salary charge not found' });
    }

    const payResult = await client.query(
      `INSERT INTO salary_payments (salary_charge_id, amount, account_id, description, user_branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING salary_payment_id`,
      [Number(req.params.id), req.body.amount, req.body.account_id, req.body.description || null, req.uBrId]
    );

    await client.query(
      `UPDATE salary_charges
       SET status = 'paid', updated_at = CURRENT_TIMESTAMP, updated_by = $2
       WHERE salary_charge_id = $1`,
      [Number(req.params.id), req.user.user_id]
    );

    await client.query(
      'UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2',
      [req.body.amount, req.body.account_id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, data: payResult.rows[0], message: 'Salary paid successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    try { await db.clearUserContext(client); } catch {}
    client.release();
  }
};

// Calculate net salary for an employee-month, joining salary_adjustments + salary_tax_brackets
const calculate = async (req, res, next) => {
  try {
    if (!req.body.month || !/^\d{4}-\d{2}(-\d{2})?$/.test(req.body.month)) {
      return res.status(400).json({ success: false, message: 'A valid month (YYYY-MM or YYYY-MM-DD) is required' });
    }

    const result = await db.queryWithUser(
      `SELECT sc.salary_charge_id,
              sc.salary_amount,
              sc.commission,
              sc.decrease,
              sc.status,
              sc.salary_month,
              COALESCE(sa.overtime_hours, 0) AS overtime_hours,
              COALESCE(sa.overtime_rate,  0) AS overtime_rate,
              COALESCE(sa.bonus,          0) AS bonus,
              COALESCE(sa.penalty,        0) AS penalty,
              ROUND(
                sc.salary_amount
                  + COALESCE(sa.bonus,    0)
                  + (COALESCE(sa.overtime_hours, 0) * COALESCE(sa.overtime_rate, 0))
                  - COALESCE(sa.penalty,  0)
              , 2) AS gross_net,
              COALESCE(stb.tax_rate, 0) AS tax_rate,
              ROUND(
                (sc.salary_amount
                  + COALESCE(sa.bonus,    0)
                  + (COALESCE(sa.overtime_hours, 0) * COALESCE(sa.overtime_rate, 0))
                  - COALESCE(sa.penalty,  0)
                ) * COALESCE(stb.tax_rate, 0) / 100
              , 2) AS tax_amount,
              ROUND(
                (sc.salary_amount
                  + COALESCE(sa.bonus,    0)
                  + (COALESCE(sa.overtime_hours, 0) * COALESCE(sa.overtime_rate, 0))
                  - COALESCE(sa.penalty,  0)
                ) * (1 - COALESCE(stb.tax_rate, 0) / 100)
              , 2) AS net_salary
       FROM  salary_charges sc
       LEFT  JOIN salary_adjustments sa
             ON  sa.employee_branch_id = sc.employee_branch_id
             AND sa.month = sc.salary_month
       LEFT  JOIN salary_tax_brackets stb
             ON  (sc.salary_amount
                   + COALESCE(sa.bonus, 0)
                   + (COALESCE(sa.overtime_hours,0) * COALESCE(sa.overtime_rate,0))
                   - COALESCE(sa.penalty,0)
                 ) BETWEEN stb.min_amount AND stb.max_amount
       WHERE sc.employee_branch_id = $1
         AND sc.salary_month = $2::date
         AND sc.deleted = FALSE
       LIMIT 1`,
      [Number(req.params.employee_branch_id), req.body.month],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    return next(error);
  }
};

// Upsert adjustment (overtime, bonus, penalty) for employee-month
const upsertAdjustment = async (req, res, next) => {
  try {
    const { employee_branch_id, month, overtime_hours, overtime_rate, bonus, penalty, notes } = req.body;

    const result = await db.queryWithUser(
      `INSERT INTO salary_adjustments
         (employee_branch_id, month, overtime_hours, overtime_rate, bonus, penalty, notes)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)
       ON CONFLICT (employee_branch_id, month) DO UPDATE SET
         overtime_hours = EXCLUDED.overtime_hours,
         overtime_rate  = EXCLUDED.overtime_rate,
         bonus          = EXCLUDED.bonus,
         penalty        = EXCLUDED.penalty,
         notes          = EXCLUDED.notes
       RETURNING *`,
      [
        Number(employee_branch_id),
        `${month}-01`,
        Number(overtime_hours) || 0,
        Number(overtime_rate)  || 0,
        Number(bonus)          || 0,
        Number(penalty)        || 0,
        notes || null
      ],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Adjustment saved' });
  } catch (error) {
    return next(error);
  }
};

// List adjustments for a specific employee_branch
const getAdjustments = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT sa.*,
              sc.salary_amount,
              ROUND(
                sc.salary_amount + sa.bonus
                  + (sa.overtime_hours * sa.overtime_rate) - sa.penalty
              , 2) AS gross_net,
              e.full_name
       FROM   salary_adjustments sa
       JOIN   employee_branches eb ON eb.employee_branch_id = sa.employee_branch_id
       JOIN   employees e        ON e.employee_id = eb.employee_id
       LEFT   JOIN salary_charges sc
              ON  sc.employee_branch_id = sa.employee_branch_id
              AND sc.salary_month       = sa.month
       WHERE  sa.employee_branch_id = $1
       ORDER  BY sa.month DESC`,
      [Number(req.params.employee_branch_id)],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

// Return tax brackets for frontend salary preview
const getTaxBrackets = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `SELECT bracket_id, min_amount, max_amount, tax_rate
       FROM salary_tax_brackets
       ORDER BY min_amount`,
      [],
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

// Attendance-based payroll summary for one employee + month.
// Returns expected vs actual metrics so the PayrollPage can display breakdowns.
const attendanceSummary = async (req, res, next) => {
  try {
    const employeeId = Number(req.query.employee_id);
    const month      = req.query.month; // YYYY-MM

    if (!employeeId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'employee_id and month (YYYY-MM) are required' });
    }

    const monthStart = `${month}-01`;
    const branchId   = req.query.branch_id ? Number(req.query.branch_id) : null;

    // 1. Employee info + branch salary
    const empResult = await db.queryWithUser(
      `SELECT e.employee_id, e.full_name,
              eb.employee_branch_id, eb.salary_amount, eb.salary_type_id,
              st.type_name AS salary_type
       FROM employees e
       INNER JOIN (
         SELECT DISTINCT ON (employee_id)
           employee_id, employee_branch_id, branch_id, salary_amount, salary_type_id,
           effective_from
         FROM employee_branches
         WHERE deleted = FALSE AND status = 'active'
         ORDER BY employee_id, effective_from DESC, created_at DESC
       ) eb ON eb.employee_id = e.employee_id
       LEFT JOIN salary_types st ON st.salary_type_id = eb.salary_type_id
       WHERE e.employee_id = $1 AND e.deleted = FALSE`,
      [employeeId],
      req.user.user_id
    );

    if (!empResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const emp = empResult.rows[0];

    // 2. Employee schedule: which days do they work?
    const schedResult = await db.queryWithUser(
      `SELECT es.day_id, es.time_in, es.time_out, es.break_start, es.break_end,
              d.day_of_week
       FROM employee_schedules es
       JOIN days d ON d.day_id = es.day_id
       WHERE es.employee_id = $1
       ORDER BY d.day_of_week`,
      [employeeId],
      req.user.user_id
    );
    const scheduledDays = new Set(schedResult.rows.map(r => r.day_of_week)); // 1=Mon…7=Sun

    // 3. Count expected working days in the month
    // Iterate all days in the month and count those matching schedule
    const [year, mo] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mo, 0).getDate();
    let expectedDays = 0;
    const scheduledDaysList = schedResult.rows;

    for (let d = 1; d <= daysInMonth; d++) {
      // JS getDay(): 0=Sun…6=Sat; convert to 1=Mon…7=Sun
      const jsDay = new Date(year, mo - 1, d).getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      if (scheduledDays.has(isoDay)) expectedDays++;
    }

    // 4. Attendance records for the month
    const attResult = await db.queryWithUser(
      `SELECT ea.attendance_date, ea.time_in, ea.time_out, ea.status
       FROM employee_attendance ea
       WHERE ea.employee_id = $1
         AND DATE_TRUNC('month', ea.attendance_date) = DATE_TRUNC('month', $2::date)
       ORDER BY ea.attendance_date`,
      [employeeId, monthStart],
      req.user.user_id
    );
    const attRecords = attResult.rows;

    // 5. Aggregate counts
    let presentDays   = 0;
    let lateDays      = 0;
    let absentDays    = 0;
    let leaveDays     = 0;
    let sickLeaveDays = 0;
    let totalMinutesWorked = 0;
    let overtimeHours = 0;

    const toMins = (t) => {
      if (!t) return 0;
      const str = typeof t === 'string' ? t : String(t);
      const clean = str.slice(0, 5);
      const [h, m] = clean.split(':').map(Number);
      return h * 60 + m;
    };

    for (const r of attRecords) {
      const status = r.status || 'present';
      if (status === 'present')    presentDays++;
      else if (status === 'late')  { presentDays++; lateDays++; }
      else if (status === 'absent') absentDays++;
      else if (status === 'leave')  leaveDays++;
      else if (status === 'sick_leave') sickLeaveDays++;
      else if (status === 'overtime')   { presentDays++; overtimeHours += 2; }

      if (r.time_in && r.time_out) {
        const mins = toMins(r.time_out) - toMins(r.time_in);
        if (mins > 0) totalMinutesWorked += mins;
      }
    }

    // Employees with no attendance records on expected days count as absent
    const recordedExpectedDays = attRecords.filter(r => {
      const jsDay = new Date(r.attendance_date).getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return scheduledDays.has(isoDay);
    }).length;
    const impliedAbsent = Math.max(0, expectedDays - recordedExpectedDays);

    // 6. Salary calculation
    const monthlySalary  = Number(emp.salary_amount) || 0;
    const dailyRate      = expectedDays > 0 ? monthlySalary / expectedDays : 0;
    const totalAbsent    = absentDays + impliedAbsent; // recorded + unrecorded
    const absenceDeduct  = Math.round(dailyRate * totalAbsent * 100) / 100;
    const netPayable     = Math.max(0, monthlySalary - absenceDeduct);
    const totalHoursWorked = (totalMinutesWorked / 60).toFixed(1);

    return res.json({
      success: true,
      data: {
        employee_id:       emp.employee_id,
        full_name:         emp.full_name,
        employee_branch_id: emp.employee_branch_id,
        month,
        monthly_salary:    monthlySalary,
        salary_type:       emp.salary_type,
        schedule: {
          working_days:    scheduledDaysList.map(s => ({ day_id: s.day_id, day_of_week: s.day_of_week, time_in: s.time_in, time_out: s.time_out })),
          total_work_days_per_week: scheduledDays.size
        },
        attendance: {
          expected_days:      expectedDays,
          present_days:       presentDays,
          late_days:          lateDays,
          absent_days:        absentDays + impliedAbsent,
          leave_days:         leaveDays,
          sick_leave_days:    sickLeaveDays,
          overtime_hours:     overtimeHours,
          total_hours_worked: Number(totalHoursWorked)
        },
        payroll: {
          daily_rate:       Math.round(dailyRate * 100) / 100,
          absence_deduction: absenceDeduct,
          net_payable:       netPayable
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { generate, getCharges, pay, calculate, upsertAdjustment, getAdjustments, getTaxBrackets, attendanceSummary };

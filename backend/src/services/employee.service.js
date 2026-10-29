const db = require('../config/db');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const getPagination = (queryParams) => {
  const page  = Number(queryParams.page)  > 0 ? Number(queryParams.page)  : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;
  return { page, limit, offset: (page - 1) * limit };
};

// Split a "Full Name" string into first_name / last_name.
// For single-word names (common) the same word is used for both.
function splitFullName(fullName) {
  const trimmed = (fullName || '').trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) {
    return { firstName: trimmed || 'Unknown', lastName: trimmed || 'Unknown' };
  }
  return {
    firstName: trimmed.slice(0, idx).trim()      || 'Unknown',
    lastName:  trimmed.slice(idx + 1).trim()     || 'Unknown'
  };
}

// Returns the latest active employee_branch row per employee.
// After migration 001 effective_from exists; tiebreak on created_at for rows
// that were backfilled with the same effective_from date.
// Includes all branch-level columns that any query downstream might need.
const LATEST_BRANCH_SUBQUERY = `
  SELECT DISTINCT ON (employee_id)
    employee_id,
    employee_branch_id,
    branch_id,
    shift_id,
    salary_amount,
    salary_type_id,
    effective_from,
    effective_to
  FROM employee_branches
  WHERE deleted = FALSE
    AND status   = 'active'
  ORDER BY employee_id, effective_from DESC, created_at DESC
`;

// ─── Employee CRUD ─────────────────────────────────────────────────────────────

const listEmployees = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values  = [];
  const filters = ['e.deleted = FALSE'];

  if (queryParams.status) {
    values.push(queryParams.status);
    filters.push(`e.status = $${values.length}`);
  }

  if (queryParams.job_id) {
    values.push(Number(queryParams.job_id));
    filters.push(`e.job_id = $${values.length}`);
  }

  if (queryParams.branch_id) {
    values.push(Number(queryParams.branch_id));
    filters.push(`latest_eb.branch_id = $${values.length}`);
  }

  if (queryParams.search) {
    values.push(`%${queryParams.search}%`);
    filters.push(`(e.full_name ILIKE $${values.length} OR e.phone ILIKE $${values.length})`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const countResult = await db.queryWithUser(
    `SELECT COUNT(DISTINCT e.employee_id) AS total
     FROM employees e
     LEFT JOIN (${LATEST_BRANCH_SUBQUERY}) latest_eb ON latest_eb.employee_id = e.employee_id
     LEFT JOIN jobs j ON j.job_id = e.job_id
     ${whereClause}`,
    values,
    userId
  );

  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT
       e.employee_id,
       e.full_name,
       e.phone,
       e.email,
       e.job_id,
       e.hire_date,
       e.status,
       e.created_at,
       j.job_title,
       latest_eb.branch_id,
       latest_eb.employee_branch_id,
       b.branch_name
     FROM employees e
     LEFT JOIN (${LATEST_BRANCH_SUBQUERY}) latest_eb ON latest_eb.employee_id = e.employee_id
     LEFT JOIN branches b ON b.branch_id = latest_eb.branch_id
     LEFT JOIN jobs j ON j.job_id = e.job_id
     ${whereClause}
     ORDER BY e.full_name, e.created_at DESC
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

const getEmployee = async (employeeId, userId) => {
  const result = await db.queryWithUser(
    `SELECT
       e.employee_id,
       e.full_name,
       e.first_name,
       e.last_name,
       e.phone,
       e.email,
       e.job_id,
       e.base_salary,
       e.hire_date,
       e.status,
       j.job_title,
       eb.employee_branch_id,
       eb.branch_id,
       eb.shift_id,
       eb.salary_amount,
       eb.salary_type_id,
       eb.effective_from,
       b.branch_name,
       s.shift_name,
       st.type_name AS salary_type
     FROM employees e
     LEFT JOIN jobs j         ON j.job_id      = e.job_id
     LEFT JOIN (${LATEST_BRANCH_SUBQUERY}) eb
                               ON eb.employee_id = e.employee_id
     LEFT JOIN branches b        ON b.branch_id        = eb.branch_id
     LEFT JOIN shifts s         ON s.shift_id        = eb.shift_id
     LEFT JOIN salary_types st  ON st.salary_type_id    = eb.salary_type_id
     WHERE e.employee_id = $1
       AND e.deleted = FALSE
     LIMIT 1`,
    [employeeId],
    userId
  );

  if (!result.rows.length) throw createNotFound('Employee not found');
  return result.rows[0];
};

// createEmployee is handled as a transaction in the controller
// (it inserts into employees AND employee_branch atomically).

const updateEmployee = async (employeeId, payload, userId) => {
  // full_name is GENERATED from first_name + last_name after migration 001.
  // We update the component columns; the DB recomputes full_name automatically.
  const { firstName, lastName } = payload.full_name
    ? splitFullName(payload.full_name)
    : { firstName: null, lastName: null };

  const result = await db.queryWithUser(
    `UPDATE employees
     SET first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         phone      = COALESCE($3, phone),
         email      = COALESCE($4, email),
         job_id     = COALESCE($5, job_id),
         base_salary = COALESCE($6, base_salary),
         status     = COALESCE($7, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $8
       AND deleted = FALSE
     RETURNING *`,
    [
      firstName,
      lastName,
      payload.phone  ?? null,
      payload.email  ?? null,
      payload.job_id ?? null,
      payload.amount ?? null,
      payload.status ?? null,
      employeeId
    ],
    userId
  );

  if (!result.rows.length) throw createNotFound('Employee not found');
  return result.rows[0];
};

const deleteEmployee = async (employeeId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE employees
     SET deleted    = TRUE,
         status     = 'inactive',
         updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $1
       AND deleted = FALSE
     RETURNING employee_id`,
    [employeeId],
    userId
  );

  if (!result.rows.length) throw createNotFound('Employee not found');
  return result.rows[0];
};

// Deactivate the current branch assignment and create a new one.
// effective_to / effective_from columns exist after migration 001.
const assignBranch = async (payload, uBrId, userId) => {
  await db.queryWithUser(
    `UPDATE employee_branches
     SET effective_to = CURRENT_DATE,
         status       = 'inactive',
         updated_at   = CURRENT_TIMESTAMP
     WHERE employee_id  = $1
       AND status       = 'active'
       AND deleted      = FALSE
       AND effective_to IS NULL`,
    [payload.employee_id],
    userId
  );

  const result = await db.queryWithUser(
    `INSERT INTO employee_branches
       (employee_id, branch_id, shift_id, salary_amount, salary_type_id, effective_from, user_branch_id)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)
     RETURNING *`,
    [
      payload.employee_id,
      payload.branch_id,
      payload.shift_id    || null,
      payload.salary   || null,
      payload.salary_type_id || null,
      uBrId
    ],
    userId
  );

  return result.rows[0];
};

// ─── Schedule ──────────────────────────────────────────────────────────────────

const setSchedule = async (payload, uBrId, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO employee_schedules
       (employee_id, day_id, time_in, time_out, break_start, break_end, user_branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (employee_id, day_id) DO UPDATE SET
       time_in     = EXCLUDED.time_in,
       time_out    = EXCLUDED.time_out,
       break_start = EXCLUDED.break_start,
       break_end   = EXCLUDED.break_end,
       updated_at  = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      payload.emp_id,
      payload.day_id,
      payload.time_in     || null,
      payload.time_out    || null,
      payload.break_start || null,
      payload.break_end   || null,
      uBrId
    ],
    userId
  );

  return result.rows[0] || null;
};

const deleteScheduleDay = async (emp_id, day_id, userId) => {
  const result = await db.queryWithUser(
    `DELETE FROM employee_schedules
     WHERE employee_id = $1 AND day_id = $2
     RETURNING employee_schedule_id`,
    [emp_id, day_id],
    userId
  );
  return result.rows[0] || null;
};

const getSchedule = async (employeeId, userId) => {
  const result = await db.queryWithUser(
    `SELECT es.*, d.day_name, d.day_of_week
     FROM employee_schedules es
     JOIN days d ON d.day_id = es.day_id
     WHERE es.employee_id = $1
     ORDER BY d.day_of_week`,
    [employeeId],
    userId
  );
  return result.rows;
};

// ─── Attendance ────────────────────────────────────────────────────────────────

// Upsert one attendance record. Keyed on (employee_id, attendance_date) after migration 005.
const markAttendance = async (payload, uBrId, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO employee_attendance
       (employee_id, employee_schedule_id, day_id, attendance_date, time_in, time_out, status, notes, user_branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
       employee_schedule_id  = EXCLUDED.employee_schedule_id,
       time_in     = EXCLUDED.time_in,
       time_out    = EXCLUDED.time_out,
       status      = EXCLUDED.status,
       notes       = EXCLUDED.notes,
       updated_at  = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      payload.employee_id,
      payload.employee_schedule_id   || null,
      payload.day_id       || null,
      payload.attendance_date,
      payload.time_in      || null,
      payload.time_out     || null,
      payload.status       || 'present',
      payload.notes        || null,
      uBrId
    ],
    userId
  );
  return result.rows[0];
};

// Bulk upsert — saves all employees' attendance for a date in one transaction.
const bulkMarkAttendance = async ({ attendance_date, records }, uBrId, userId) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const rec of records) {
      const r = await client.query(
        `INSERT INTO employee_attendance
           (employee_id, employee_schedule_id, day_id, attendance_date, time_in, time_out, status, notes, user_branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
           employee_schedule_id  = EXCLUDED.employee_schedule_id,
           time_in     = EXCLUDED.time_in,
           time_out    = EXCLUDED.time_out,
           status      = EXCLUDED.status,
           notes       = EXCLUDED.notes,
           updated_at  = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          rec.employee_id,
          rec.employee_schedule_id   || null,
          rec.day_id       || null,
          attendance_date,
          rec.time_in      || null,
          rec.time_out     || null,
          rec.status       || 'present',
          rec.notes        || null,
          uBrId
        ]
      );
      if (r.rows[0]) results.push(r.rows[0]);
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updateAttendance = async (employee_attendance_id, { time_in, time_out, status, notes }, userId) => {
  const result = await db.queryWithUser(
    `UPDATE employee_attendance
     SET time_in    = COALESCE($1, time_in),
         time_out   = COALESCE($2, time_out),
         status     = COALESCE($3, status),
         notes      = COALESCE($4, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE employee_attendance_id = $5
     RETURNING *`,
    [time_in || null, time_out || null, status || null, notes ?? null, employee_attendance_id],
    userId
  );

  if (!result.rows.length) {
    const err = new Error('Attendance record not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
};

// Monthly attendance history for one employee — uses employee_id directly (migration 005)
const getAttendance = async (employeeId, month, userId) => {
  const values = [employeeId];
  let monthClause = '';

  if (month) {
    values.push(`${month}-01`);
    monthClause = `AND DATE_TRUNC('month', ea.attendance_date) = DATE_TRUNC('month', $${values.length}::date)`;
  }

  const result = await db.queryWithUser(
    `SELECT
       ea.employee_attendance_id,
       ea.attendance_date,
       ea.time_in,
       ea.time_out,
       ea.status,
       ea.notes,
       ea.created_at,
       ea.updated_at,
       COALESCE(d.name,
         to_char(ea.attendance_date, 'Day')
       ) AS day_name
     FROM employee_attendance ea
     LEFT JOIN employee_schedules es ON es.employee_schedule_id = ea.employee_schedule_id
     LEFT JOIN days d               ON d.day_id      = es.day_id
     WHERE ea.employee_id = $1
     ${monthClause}
     ORDER BY ea.attendance_date DESC`,
    values,
    userId
  );

  return result.rows;
};

// Daily roster: ALL active employees for the branch (not just scheduled ones).
// LEFT JOIN schedule for that weekday so we can show shift info when it exists.
// LEFT JOIN attendance so we can show what was already recorded.
const getDailyRoster = async (date, branchId, userId) => {
  const values = [date];
  let branchFilter = '';

  if (branchId) {
    values.push(branchId);
    branchFilter = `AND latest_eb.branch_id = $${values.length}`;
  }

  // Compute the day_of_week (1=Mon…7=Sun) for the requested date.
  // PostgreSQL EXTRACT(DOW) returns 0=Sun; we convert that to 7.
  const result = await db.queryWithUser(
    `WITH target_dow AS (
       SELECT CASE WHEN EXTRACT(DOW FROM $1::date) = 0 THEN 7
                   ELSE EXTRACT(DOW FROM $1::date)::int END AS dow
     )
     SELECT
       e.employee_id,
       e.full_name,
       e.phone,
       j.job_title,
       latest_eb.branch_id,
       b.branch_name,
       -- Schedule for this employee on this weekday (may be NULL)
       es.employee_schedule_id,
       es.day_id,
       es.time_in          AS scheduled_in,
       es.time_out         AS scheduled_out,
       es.break_start,
       es.break_end,
       -- Existing attendance record for this date (may be NULL)
       ea.employee_attendance_id,
       ea.time_in          AS actual_in,
       ea.time_out         AS actual_out,
       ea.status           AS attendance_status,
       ea.notes            AS attendance_notes
     FROM employees e
     CROSS JOIN target_dow td
     INNER JOIN (${LATEST_BRANCH_SUBQUERY}) latest_eb
                               ON latest_eb.employee_id = e.employee_id
     LEFT JOIN branches b        ON b.branch_id             = latest_eb.branch_id
     LEFT JOIN jobs j          ON j.job_id            = e.job_id
     -- Schedule is optional: only join for the matching weekday
     LEFT JOIN employee_schedules es
           ON  es.employee_id = e.employee_id
           AND es.day_id = td.dow
     -- Attendance for the specific date
     LEFT JOIN employee_attendance ea
           ON  ea.employee_id    = e.employee_id
           AND ea.attendance_date = $1::date
     WHERE e.deleted = FALSE
       AND e.status  = 'active'
     ${branchFilter}
     ORDER BY b.branch_name NULLS LAST, e.full_name`,
    values,
    userId
  );

  return result.rows;
};

// All schedules for every employee in a branch — returned as { [employee_id]: [rows] }
const getAllSchedules = async (branchId, userId) => {
  const values = [];
  let branchFilter = '';

  if (branchId) {
    values.push(branchId);
    branchFilter = `AND latest_eb.branch_id = $${values.length}`;
  }

  const result = await db.queryWithUser(
    `SELECT
       es.employee_schedule_id, es.employee_id, es.day_id,
       es.time_in, es.time_out, es.break_start, es.break_end,
       d.day_name, d.day_of_week
     FROM employee_schedules es
     JOIN days d ON d.day_id = es.day_id
     LEFT JOIN (${LATEST_BRANCH_SUBQUERY}) latest_eb ON latest_eb.employee_id = es.employee_id
     WHERE 1=1 ${branchFilter}
     ORDER BY es.employee_id, d.day_of_week`,
    values,
    userId
  );

  const grouped = {};
  result.rows.forEach(r => {
    if (!grouped[r.employee_id]) grouped[r.employee_id] = {};
    grouped[r.employee_id][r.day_id] = r;
  });
  return grouped;
};

// ─── Jobs ──────────────────────────────────────────────────────────────────────

const listJobs = async (userId) => {
  const result = await db.queryWithUser(
    `SELECT job_id, job_code, job_title, description, min_salary, max_salary
     FROM jobs
     WHERE deleted = FALSE
     ORDER BY job_title`,
    [],
    userId
  );
  return result.rows;
};

const createJob = async (jobTitle, uBrId, userId) => {
  // Auto-generate a unique job_code (schema requires NOT NULL UNIQUE)
  const abbr   = (jobTitle || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'JOB';
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  const jobCode = `${abbr}-${suffix}`;

  const result = await db.queryWithUser(
    `INSERT INTO jobs (job_title, job_code, user_branch_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [jobTitle, jobCode, uBrId],
    userId
  );
  return result.rows[0];
};

module.exports = {
  splitFullName,
  getAllSchedules,       // exported for use in the controller
  listEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  assignBranch,
  setSchedule,
  deleteScheduleDay,
  getSchedule,
  markAttendance,
  bulkMarkAttendance,
  updateAttendance,
  getAttendance,
  getDailyRoster,
  listJobs,
  createJob
};

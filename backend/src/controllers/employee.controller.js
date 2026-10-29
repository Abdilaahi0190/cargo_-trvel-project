const db              = require('../config/db');
const employeeService = require('../services/employee.service');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

// ─── Employee CRUD ─────────────────────────────────────────────────────────────

const listEmployees = async (req, res, next) => {
  try {
    const data = await employeeService.listEmployees(req.query, req.user.user_id);
    return res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    return next(error);
  }
};

const getEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.getEmployee(Number(req.params.id), req.user.user_id);
    return res.json({ success: true, data: employee });
  } catch (error) {
    return next(error);
  }
};

// Creates an employee + their initial branch assignment in a single transaction.
// The employees table stores first_name and last_name separately (full_name is GENERATED).
// The frontend sends full_name — we split it here.
const createEmployee = async (req, res, next) => {
  const payload  = req.body;
  const branchId = payload.branch_id || req.branchId;
  const uBrId    = payload.user_branch_id   || req.uBrId;

  const { firstName, lastName } = employeeService.splitFullName(payload.full_name);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const empResult = await client.query(
      `INSERT INTO employees
         (first_name, last_name, phone, email, job_id, base_salary, employee_type_id, hire_date, status, user_branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'active'), $10)
       RETURNING employee_id`,
      [
        firstName,
        lastName,
        payload.phone     || null,
        payload.email     || null,
        payload.job_id,
        payload.amount    || null,
        payload.employee_type_id  || null,
        payload.hire_date || null,
        payload.status    || null,
        uBrId
      ]
    );

    const employeeId = empResult.rows[0].employee_id;

    // Create the initial branch assignment (effective_from defaults to CURRENT_DATE)
    await client.query(
      `INSERT INTO employee_branches
         (employee_id, branch_id, shift_id, salary_amount, salary_type_id, effective_from, user_branch_id)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)`,
      [
        employeeId,
        branchId,
        payload.shift_id    || null,
        payload.salary   || null,
        payload.salary_type_id || null,
        uBrId
      ]
    );

    await client.query('COMMIT');

    const employee = await employeeService.getEmployee(employeeId, req.user.user_id);
    return res.status(201).json({ success: true, data: employee, message: 'Employee created successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const employeeId = Number(req.params.id);
    const employee   = await employeeService.updateEmployee(employeeId, req.body, req.user.user_id);
    return res.json({ success: true, data: employee, message: 'Employee updated successfully' });
  } catch (error) {
    return next(error);
  }
};

const updateEmployeeStatus = async (req, res, next) => {
  try {
    const employeeId = Number(req.params.id);
    const { status } = req.body;

    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'" });
    }

    const result = await db.queryWithUser(
      `UPDATE employees
       SET status     = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $2
         AND deleted = FALSE
       RETURNING employee_id, status`,
      [status, employeeId],
      req.user.user_id
    );

    if (!result.rows.length) throw createNotFound('Employee not found');
    return res.json({ success: true, data: result.rows[0], message: 'Status updated' });
  } catch (error) {
    return next(error);
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const data = await employeeService.deleteEmployee(Number(req.params.id), req.user.user_id);
    return res.json({ success: true, data, message: 'Employee deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

const assignBranch = async (req, res, next) => {
  try {
    const data = await employeeService.assignBranch(req.body, req.uBrId, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Branch assigned successfully' });
  } catch (error) {
    return next(error);
  }
};

// ─── Schedule ──────────────────────────────────────────────────────────────────

const getAllSchedules = async (req, res, next) => {
  try {
    const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
    const data = await employeeService.getAllSchedules(branchId, req.user.user_id);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const setSchedule = async (req, res, next) => {
  try {
    const data = await employeeService.setSchedule(req.body, req.uBrId, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Schedule saved successfully' });
  } catch (error) {
    return next(error);
  }
};

const getSchedule = async (req, res, next) => {
  try {
    const data = await employeeService.getSchedule(Number(req.params.id), req.user.user_id);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteScheduleDay = async (req, res, next) => {
  try {
    const emp_id = Number(req.params.emp_id);
    const day_id = Number(req.params.day_id);
    const data   = await employeeService.deleteScheduleDay(emp_id, day_id, req.user.user_id);
    return res.json({ success: true, data, message: 'Schedule day removed' });
  } catch (error) {
    return next(error);
  }
};

// ─── Attendance ────────────────────────────────────────────────────────────────

const markAttendance = async (req, res, next) => {
  try {
    const data = await employeeService.markAttendance(req.body, req.uBrId, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Attendance marked successfully' });
  } catch (error) {
    return next(error);
  }
};

const bulkMarkAttendance = async (req, res, next) => {
  try {
    const data = await employeeService.bulkMarkAttendance(req.body, req.uBrId, req.user.user_id);
    return res.status(201).json({ success: true, data, message: `Attendance saved for ${data.length} employees` });
  } catch (error) {
    return next(error);
  }
};

const updateAttendance = async (req, res, next) => {
  try {
    const employee_attendance_id = Number(req.params.id);
    const { time_in, time_out, status, notes } = req.body;
    const data = await employeeService.updateAttendance(
      employee_attendance_id,
      { time_in, time_out, status, notes },
      req.user.user_id
    );
    return res.json({ success: true, data, message: 'Attendance updated successfully' });
  } catch (error) {
    return next(error);
  }
};

const getAttendance = async (req, res, next) => {
  try {
    const data = await employeeService.getAttendance(
      Number(req.params.id),
      req.query.month,
      req.user.user_id
    );
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const getDailyRoster = async (req, res, next) => {
  try {
    const date     = req.query.date      || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
    const data     = await employeeService.getDailyRoster(date, branchId, req.user.user_id);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

// ─── Jobs ──────────────────────────────────────────────────────────────────────

const listJobs = async (req, res, next) => {
  try {
    const data = await employeeService.listJobs(req.user.user_id);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const createJob = async (req, res, next) => {
  try {
    const data = await employeeService.createJob(req.body.job_title, req.uBrId, req.user.user_id);
    return res.status(201).json({ success: true, data, message: 'Job created successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  deleteEmployee,
  assignBranch,
  getAllSchedules,
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

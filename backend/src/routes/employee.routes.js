const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const employeeCtrl = require('../controllers/employee.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

const attachUBRId = (req, res, next) => {
  if (req.uBrId && req.body.user_branch_id === undefined) {
    req.body.user_branch_id = req.uBrId;
  }
  next();
};
const updateEmployeeSchema = schemas.createEmployee.fork(['full_name', 'job_id', 'user_branch_id'], (schema) => schema.optional()).min(1);

router.get('/jobs',              checkPrivilege('hr.manage'),    employeeCtrl.listJobs);
router.get('/schedules',         checkPrivilege('hr.manage'),    employeeCtrl.getAllSchedules);
router.get('/attendance/daily',  checkPrivilege('hr.manage'),    employeeCtrl.getDailyRoster);
router.get('/',                 checkPrivilege('employees.view'), employeeCtrl.listEmployees);
router.get('/:id/schedule',     checkPrivilege('hr.manage'),    employeeCtrl.getSchedule);
router.get('/:id/attendance',   checkPrivilege('hr.manage'),    employeeCtrl.getAttendance);
router.get('/:id',              checkPrivilege('hr.manage'),    employeeCtrl.getEmployee);

router.post('/jobs', checkPrivilege('hr.manage'), validate(schemas.createJob), employeeCtrl.createJob);
router.post('/branch/assign', checkPrivilege('hr.manage'), validate(schemas.assignBranch), employeeCtrl.assignBranch);
router.post('/schedule', checkPrivilege('hr.manage'), validate(schemas.setSchedule), employeeCtrl.setSchedule);
router.post('/attendance',      checkPrivilege('hr.manage'), validate(schemas.markAttendance),     employeeCtrl.markAttendance);
router.post('/attendance/bulk', checkPrivilege('hr.manage'), validate(schemas.bulkMarkAttendance), employeeCtrl.bulkMarkAttendance);
router.post('/', checkPrivilege('hr.manage'), attachUBRId, validate(schemas.createEmployee), employeeCtrl.createEmployee);
router.put('/attendance/:id', checkPrivilege('hr.manage'), employeeCtrl.updateAttendance);
router.put('/:id', checkPrivilege('hr.manage'), attachUBRId, validate(updateEmployeeSchema), employeeCtrl.updateEmployee);
router.delete('/:emp_id/schedule/:day_id', checkPrivilege('hr.manage'), employeeCtrl.deleteScheduleDay);
router.patch('/:id/status', checkPrivilege('hr.manage'), employeeCtrl.updateEmployeeStatus);

router.delete('/:id', requireRole(1), employeeCtrl.deleteEmployee);

module.exports = router;

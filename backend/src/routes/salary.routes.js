const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const validate = require('../middleware/validate');
const { generateSchema, paySchema, adjustmentSchema } = require('../validators/salary.validator');
const salaryCtrl = require('../controllers/salary.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

router.get('/charges',                              checkPrivilege('salary.view'),   salaryCtrl.getCharges);
router.get('/tax-brackets',                         checkPrivilege('salary.view'),   salaryCtrl.getTaxBrackets);
router.get('/attendance-summary',                   checkPrivilege('salary.manage'), salaryCtrl.attendanceSummary);
router.get('/adjustments/:employee_branch_id',      checkPrivilege('salary.manage'), salaryCtrl.getAdjustments);

router.post('/generate',                            checkPrivilege('salary.manage'), validate(generateSchema),   salaryCtrl.generate);
router.post('/calculate/:employee_branch_id',       checkPrivilege('salary.manage'),                            salaryCtrl.calculate);
router.post('/adjustments',                         checkPrivilege('salary.manage'), validate(adjustmentSchema), salaryCtrl.upsertAdjustment);
router.post('/charges/:id/pay',                     checkPrivilege('salary.manage'), validate(paySchema),        salaryCtrl.pay);

module.exports = router;

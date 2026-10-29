const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { expensePaymentSchema } = require('../validators/expense.validator');
const expenseCtrl = require('../controllers/expense.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

// Create expense payment: Admin, Finance
router.post('/', requireRole(1, 2), validate(expensePaymentSchema), expenseCtrl.recordPayment);

module.exports = router;

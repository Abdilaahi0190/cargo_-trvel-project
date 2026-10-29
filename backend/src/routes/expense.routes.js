const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { createSchema, paySchema } = require('../validators/expense.validator');
const expenseCtrl = require('../controllers/expense.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

// Expenses: Admin only
router.get('/types',          requireRole(1), expenseCtrl.getTypes);
router.get('/',               requireRole(1), expenseCtrl.getAll);
router.post('/',              requireRole(1), validate(createSchema), expenseCtrl.create);
router.put('/:id/pay',        requireRole(1), validate(paySchema), expenseCtrl.pay);
router.get('/badged',         requireRole(1), expenseCtrl.listBadged);
router.post('/badged',        requireRole(1), expenseCtrl.createBadged);
router.get('/badged/charged', requireRole(1), expenseCtrl.listChargedBadged);
router.post('/badged/charged',requireRole(1), expenseCtrl.createChargedBadged);
router.delete('/:id',         requireRole(1), expenseCtrl.remove);

module.exports = router;

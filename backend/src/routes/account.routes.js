const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { createSchema, transferSchema, movementSchema } = require('../validators/account.validator');
const accountCtrl = require('../controllers/account.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

// Accounts: Admin only
router.get('/',              requireRole(1), accountCtrl.getAll);
router.get('/:id',           requireRole(1), accountCtrl.getOne);
router.post('/',             requireRole(1), validate(createSchema), accountCtrl.create);
router.post('/transfer',     requireRole(1), validate(transferSchema), accountCtrl.transfer);
router.post('/:id/deposit',  requireRole(1), validate(movementSchema), accountCtrl.deposit);
router.post('/:id/withdraw', requireRole(1), validate(movementSchema), accountCtrl.withdraw);
router.post('/:id/recalculate', requireRole(1), accountCtrl.recalculate);
router.delete('/:id',        requireRole(1), accountCtrl.remove);

module.exports = router;

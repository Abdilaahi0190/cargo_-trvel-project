const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { createCustomer, updateCustomer } = require('../validators/schemas');
const customerCtrl = require('../controllers/customer.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

const attachUBRId = (req, res, next) => {
  if (req.uBrId && req.body.user_branch_id === undefined) {
    req.body.user_branch_id = req.uBrId;
  }
  next();
};

router.get('/', checkPrivilege('customers.view'), customerCtrl.getAll);
router.get('/:id', checkPrivilege('customers.view'), customerCtrl.getOne);
router.get('/:id/cargo', checkPrivilege('tracking.view'), customerCtrl.getCargo);

router.post('/', checkPrivilege('customers.manage'), attachUBRId, validate(createCustomer), customerCtrl.create);
router.put('/:id', checkPrivilege('customers.manage'), attachUBRId, validate(updateCustomer), customerCtrl.update);

// Delete customer: Admin only
router.delete('/:id', requireRole(1), customerCtrl.remove);

module.exports = router;

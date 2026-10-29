const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const validate = require('../middleware/validate');
const { processPayment } = require('../validators/schemas');
const paymentCtrl = require('../controllers/payment.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

const attachUBRId = (req, res, next) => {
  if (req.uBrId && req.body.user_branch_id === undefined) {
    req.body.user_branch_id = req.uBrId;
  }
  next();
};

router.get('/',                   checkPrivilege('payments.view'),   paymentCtrl.getAll);
router.get('/cargo/:cargo_id',    checkPrivilege('payments.view'),   paymentCtrl.getByCargoId);
router.post('/',                  checkPrivilege('payments.create'), attachUBRId, validate(processPayment), paymentCtrl.create);

module.exports = router;
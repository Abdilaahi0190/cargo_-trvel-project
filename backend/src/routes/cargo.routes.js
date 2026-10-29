const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const validate = require('../middleware/validate');
const { createCargo, updateCargoStatus } = require('../validators/schemas');
const cargoCtrl = require('../controllers/cargo.controller');
const chargesCtrl = require('../controllers/cargoCharges.controller');

// Public — no auth needed
router.get('/track/:tracking_number', cargoCtrl.trackByNumber);

// All routes below require authentication
router.use(authenticate, requireBranchAccess, setBranchContext);

const attachCargoContext = (req, res, next) => {
  if (req.uBrId && req.body.user_branch_id === undefined) {
    req.body.user_branch_id = req.uBrId;
  }
  if (req.branchId && req.body.branch_id === undefined) {
    req.body.branch_id = req.branchId;
  }
  next();
};

router.get('/',             checkPrivilege('shipments.view'),    cargoCtrl.getAll);
router.get('/:id',          checkPrivilege('shipments.view'),    cargoCtrl.getOne);
router.get('/:id/timeline', checkPrivilege('tracking.view'),   cargoCtrl.getTimeline);
router.get('/:id/items',    checkPrivilege('shipments.view'),    cargoCtrl.getItems);
router.post('/',            checkPrivilege('shipments.create'),  attachCargoContext, validate(createCargo), cargoCtrl.create);
router.put('/:id',          checkPrivilege('shipments.create'),  attachCargoContext, cargoCtrl.update);
router.put('/:id/status',   checkPrivilege('shipments.create'),  attachCargoContext, validate(updateCargoStatus), cargoCtrl.updateStatus);
router.delete('/:id',       checkPrivilege('shipments.delete'),  cargoCtrl.remove);

// ── Flexible per-cargo charges (itemized: airport, customs, handling, etc.)
router.get('/:id/charges',                 checkPrivilege('shipments.view'),   chargesCtrl.list);
router.post('/:id/charges',                checkPrivilege('shipments.create'), chargesCtrl.create);
router.put('/:id/charges/:chargeId',       checkPrivilege('shipments.create'), chargesCtrl.update);
router.delete('/:id/charges/:chargeId',    checkPrivilege('shipments.create'), chargesCtrl.remove);

module.exports = router;
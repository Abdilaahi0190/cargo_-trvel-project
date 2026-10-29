const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const {
  createSchema,
  updateSchema,
  updateStatusSchema,
  bulkAssignSchema,
  assignCargoIdsSchema
} = require('../validators/trip.validator');
const tripCtrl = require('../controllers/trip.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

router.get('/',             requireRole(1, 2), tripCtrl.getAll);
router.get('/:id',          requireRole(1, 2), tripCtrl.getOne);
router.post('/',            requireRole(1, 2), validate(createSchema), tripCtrl.create);
router.put('/:id',          requireRole(1, 2), validate(updateSchema), tripCtrl.update);
router.put('/:id/status',   requireRole(1, 2), validate(updateStatusSchema), tripCtrl.updateStatus);
router.post('/:id/cargo',   requireRole(1, 2), validate(assignCargoIdsSchema), tripCtrl.bulkAssignCargo);
router.post('/:id/bulk-cargo', requireRole(1, 2), validate(bulkAssignSchema), tripCtrl.bulkAssignCargo);
router.post('/:id/complete',requireRole(1, 2), tripCtrl.complete);
router.put('/:id/complete', requireRole(1, 2), tripCtrl.complete);
router.put('/:id/cancel',   requireRole(1, 2), tripCtrl.cancel);
router.delete('/:id',       requireRole(1),    tripCtrl.remove);

module.exports = router;

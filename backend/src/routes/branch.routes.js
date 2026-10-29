const router = require('express').Router();
const { authenticate, requireRole, requireBranchParamAccess } = require('../middleware/auth');
const branchCtrl = require('../controllers/branch.controller');

router.get('/', authenticate, requireRole(1, 2), branchCtrl.getAll);
router.get('/:id', authenticate, requireBranchParamAccess('id'), branchCtrl.getOne);
router.post('/', authenticate, requireRole(1), branchCtrl.create);
router.put('/:id', authenticate, requireRole(1), branchCtrl.update);
router.delete('/:id', authenticate, requireRole(1), branchCtrl.softDelete);

module.exports = router;

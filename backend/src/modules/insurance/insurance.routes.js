const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const controller = require('./insurance.controller');

// View insurance: Admin, Finance, Operations
router.get('/providers', authenticate, requireRole(1, 2, 3), controller.listProviders);
router.get('/', authenticate, requireRole(1, 2, 3), controller.listPolicies);
router.get('/cargo/:cargo_id', authenticate, requireRole(1, 2, 3), controller.getForCargo);

// Manage setup (providers): Admin only
router.post('/providers', authenticate, requireRole(1), controller.createProvider);

// Manage policies and claims: Admin, Finance
router.post('/', authenticate, requireRole(1, 2), controller.createPolicy);
router.post('/:id/claim', authenticate, requireRole(1, 2), controller.fileClaim);
router.put('/:id/claim', authenticate, requireRole(1, 2), controller.fileClaim);
router.patch('/:id/claim/status', authenticate, requireRole(1, 2), controller.updateClaimStatus);

module.exports = router;

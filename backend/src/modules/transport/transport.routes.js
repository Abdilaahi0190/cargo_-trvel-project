const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const controller = require('./transport.controller');

// View transport providers and routes: Admin, Finance, Operations
router.get('/providers', authenticate, requireRole(1, 2, 3), controller.listProviders);
router.get('/providers/:id', authenticate, requireRole(1, 2, 3), controller.getProvider);
router.get('/routes', authenticate, requireRole(1, 2, 3), controller.listRoutes);
router.get('/routes/:id', authenticate, requireRole(1, 2, 3), controller.getRoute);

// Create / edit providers: Admin, Operations
router.post('/providers', authenticate, requireRole(1, 3), controller.createProvider);
router.put('/providers/:id', authenticate, requireRole(1, 3), controller.updateProvider);

// Create / edit routes: Admin only
router.post('/routes', authenticate, requireBranchAccess, setBranchContext, requireRole(1), controller.createRoute);
router.put('/routes/:id', authenticate, requireRole(1), controller.updateRoute);

// Delete provider and route: Admin only
router.delete('/providers/:id', authenticate, requireRole(1), controller.deleteProvider);
router.delete('/routes/:id', authenticate, requireRole(1), controller.deleteRoute);

module.exports = router;

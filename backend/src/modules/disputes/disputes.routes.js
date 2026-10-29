const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const { createDisputeSchema, resolveDisputeSchema } = require('../../validators/schemas');
const controller = require('./disputes.controller');

// View disputes: Admin, Finance, Operations, Customer
router.get('/types', authenticate, requireRole(1, 2, 3, 5), controller.listTypes);
router.get('/', authenticate, requireRole(1, 2, 3, 5), controller.listDisputes);
router.get('/:id', authenticate, requireRole(1, 2, 3, 5), controller.getDispute);

// Create dispute: Admin, Finance, Operations, Customer
router.post(
  '/',
  authenticate,
  requireRole(1, 2, 3, 5),
  validate(createDisputeSchema),
  controller.createDispute
);

// Resolve dispute: Admin, Finance
router.put(
  '/:id/resolve',
  authenticate,
  requireRole(1, 2),
  validate(resolveDisputeSchema),
  controller.resolveDispute
);

module.exports = router;

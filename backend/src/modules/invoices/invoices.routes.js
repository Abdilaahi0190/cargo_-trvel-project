const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const checkPrivilege = require('../../middleware/privilege');
const controller = require('./invoices.controller');

router.get('/', authenticate, checkPrivilege('invoices.view'), controller.listInvoices);
router.get('/:id', authenticate, checkPrivilege('invoices.view'), controller.getInvoice);
router.post('/', authenticate, checkPrivilege('invoices.create'), controller.generateInvoice);
router.patch('/:id/status', authenticate, checkPrivilege('invoices.create'), controller.updateStatus);

module.exports = router;

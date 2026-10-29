const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const checkPrivilege = require('../../middleware/privilege');
const controller = require('./notifications.controller');

router.get('/', authenticate, checkPrivilege('dashboard.view'), controller.listForUser);
router.patch('/:id/read', authenticate, checkPrivilege('dashboard.view'), controller.markRead);
router.delete('/:id', authenticate, checkPrivilege('dashboard.view'), controller.deleteNotification);

module.exports = router;

const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const dashboardCtrl = require('../controllers/dashboard.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

// Dashboard overview: Admin, Finance, Operations, HR
router.get('/overview', checkPrivilege('dashboard.view'), dashboardCtrl.getOverview);

module.exports = router;

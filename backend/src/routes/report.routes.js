const router = require('express').Router();
const { authenticate, requireBranchAccess, setBranchContext } = require('../middleware/auth');
const checkPrivilege = require('../middleware/privilege');
const requireRole = require('../middleware/requireRole');
const reportCtrl = require('../controllers/report.controller');

router.use(authenticate, requireBranchAccess, setBranchContext);

// ── Comprehensive reports (all support ?period=today|this_week|this_month|this_year, ?from=, ?to=, ?branch_id=)
router.get('/summary',            checkPrivilege('reports.view'), reportCtrl.comprehensiveSummary);
router.get('/cargo/by-destination', checkPrivilege('reports.view'), reportCtrl.cargoByDestination);
router.get('/cargo/by-customer',    checkPrivilege('reports.view'), reportCtrl.cargoByCustomer);
router.get('/cargo/by-employee',    checkPrivilege('reports.view'), reportCtrl.cargoByEmployee);
router.get('/cargo/by-branch',      checkPrivilege('reports.view'), reportCtrl.cargoByBranch);
router.get('/customers/stats',      checkPrivilege('reports.view'), reportCtrl.customerStats);
router.get('/employees/stats',      checkPrivilege('reports.view'), reportCtrl.employeeStats);
router.get('/financial',            checkPrivilege('reports.view'), reportCtrl.financialReport);
router.get('/inventory',            checkPrivilege('reports.view'), reportCtrl.cargoInventory);
router.get('/branch-financial',     checkPrivilege('reports.view'), reportCtrl.branchFinancial);

// ── Transport provider / trip / category / customer / invoice breakdowns
router.get('/revenue/by-trip',      checkPrivilege('reports.view'), reportCtrl.revenueByTrip);
router.get('/revenue/by-provider',  checkPrivilege('reports.view'), reportCtrl.revenueByProvider);
router.get('/expenses/by-trip',     checkPrivilege('reports.view'), reportCtrl.expensesByTrip);
router.get('/expenses/by-provider', checkPrivilege('reports.view'), reportCtrl.expensesByProvider);
router.get('/expenses/by-category', checkPrivilege('reports.view'), reportCtrl.expensesByCategory);
router.get('/outstanding-balances', checkPrivilege('reports.view'), reportCtrl.outstandingBalances);
router.get('/invoices-status',      checkPrivilege('reports.view'), reportCtrl.invoicesStatus);

// ── Legacy / original endpoints
router.get('/revenue',             checkPrivilege('reports.view'), reportCtrl.revenueReport);
router.get('/cargo',               checkPrivilege('reports.view'), reportCtrl.cargoReport);
router.get('/branch-summary',      checkPrivilege('reports.view'), reportCtrl.branchSummary);
router.get('/daily-revenue',       checkPrivilege('reports.view'), reportCtrl.dailyRevenue);
router.get('/branch-profit',       checkPrivilege('reports.view'), reportCtrl.branchProfit);
router.get('/mv/daily-revenue',    checkPrivilege('reports.view'), reportCtrl.mvDailyRevenue);
router.get('/mv/monthly-profit',   checkPrivilege('reports.view'), reportCtrl.mvMonthlyProfit);
router.post('/refresh-mviews',     requireRole(1), reportCtrl.refreshMviews);

module.exports = router;

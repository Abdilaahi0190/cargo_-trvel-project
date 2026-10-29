const router = require('express').Router();

const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { login } = require('../validators/schemas');
const authCtrl = require('../controllers/auth.controller');


router.post('/login', validate(login), authCtrl.login);
router.post('/logout', authenticate, authCtrl.logout);
router.get('/me', authenticate, authCtrl.me);
router.post('/refresh', authenticate, authCtrl.refreshToken);

module.exports = router;

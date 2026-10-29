const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const checkPrivilege = require('../../middleware/privilege');
const validate = require('../../middleware/validate');
const schemas = require('../../validators/schemas');
const controller = require('./users.controller');
const updateUserSchema = schemas.createUser.fork(['name', 'username', 'password', 'role_id'], (schema) => schema.optional()).min(1);

router.get('/roles', authenticate, controller.listRoles);
router.get('/', authenticate, checkPrivilege('users.manage'), controller.listUsers);
router.post('/', authenticate, checkPrivilege('users.manage'), validate(schemas.createUser), controller.createUser);
router.get('/:id', authenticate, checkPrivilege('users.manage'), controller.getUser);
router.put('/:id', authenticate, checkPrivilege('users.manage'), validate(updateUserSchema), controller.updateUser);
router.patch('/:id/state', authenticate, checkPrivilege('users.manage'), validate(schemas.updateUserState), controller.patchUserState);
router.patch('/:id/password', authenticate, checkPrivilege('users.manage'), validate(schemas.resetUserPassword), controller.resetPassword);
router.delete('/:id', authenticate, checkPrivilege('users.manage'), controller.deleteUser);
router.post('/branch/assign', authenticate, checkPrivilege('users.manage'), validate(schemas.assignUserBranch), controller.assignUserBranch);
router.delete('/branch/:user_branch_id', authenticate, checkPrivilege('users.manage'), controller.revokeUserBranch);

module.exports = router;

const service = require('./users.service');

const listRoles = async (req, res, next) => {
  try {
    const data = await service.listRoles(req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const data = await service.listUsers(req.query, req.user);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const getUser = async (req, res, next) => {
  try {
    const data = await service.getUser(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const data = await service.createUser(req.body, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const data = await service.updateUser(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const patchUserState = async (req, res, next) => {
  try {
    const data = await service.patchUserState(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const data = await service.resetPassword(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const data = await service.deleteUser(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const assignUserBranch = async (req, res, next) => {
  try {
    const data = await service.assignUserBranch(req.body, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const revokeUserBranch = async (req, res, next) => {
  try {
    const data = await service.revokeUserBranch(Number(req.params.user_branch_id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listRoles,
  listUsers,
  getUser,
  createUser,
  updateUser,
  patchUserState,
  resetPassword,
  deleteUser,
  assignUserBranch,
  revokeUserBranch
};

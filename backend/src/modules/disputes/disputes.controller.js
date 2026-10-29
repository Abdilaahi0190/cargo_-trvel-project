const service = require('./disputes.service');

const listTypes = async (req, res, next) => {
  try {
    const data = await service.listTypes(req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listDisputes = async (req, res, next) => {
  try {
    const data = await service.listDisputes(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const getDispute = async (req, res, next) => {
  try {
    const data = await service.getDispute(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createDispute = async (req, res, next) => {
  try {
    const data = await service.createDispute(req.body, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const resolveDispute = async (req, res, next) => {
  try {
    const data = await service.resolveDispute(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listTypes,
  listDisputes,
  getDispute,
  createDispute,
  resolveDispute
};

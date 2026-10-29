const service = require('./insurance.service');

const listProviders = async (req, res, next) => {
  try {
    const data = await service.listProviders(req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listPolicies = async (req, res, next) => {
  try {
    const data = await service.listPolicies(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const createProvider = async (req, res, next) => {
  try {
    const data = await service.createProvider(req.body, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getForCargo = async (req, res, next) => {
  try {
    const data = await service.getForCargo(Number(req.params.cargo_id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createPolicy = async (req, res, next) => {
  try {
    const data = await service.createPolicy(req.body, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const fileClaim = async (req, res, next) => {
  try {
    const data = await service.fileClaim(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateClaimStatus = async (req, res, next) => {
  try {
    const data = await service.updateClaimStatus(Number(req.params.id), req.body.claim_status, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProviders,
  listPolicies,
  createProvider,
  getForCargo,
  createPolicy,
  fileClaim,
  updateClaimStatus
};

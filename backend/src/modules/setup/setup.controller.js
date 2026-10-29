const service = require('./setup.service');

const listCountries = async (req, res, next) => {
  try {
    const data = await service.listCountries(req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listCities = async (req, res, next) => {
  try {
    const data = await service.listCities(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const createCity = async (req, res, next) => {
  try {
    const data = await service.createCity(req.body, req.user.user_id);
    res.status(201).json({ success: true, data, message: 'City created successfully' });
  } catch (error) {
    next(error);
  }
};

const updateCity = async (req, res, next) => {
  try {
    const data = await service.updateCity(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data, message: 'City updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteCity = async (req, res, next) => {
  try {
    const data = await service.deleteCity(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data, message: 'City deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const listAddresses = async (req, res, next) => {
  try {
    const data = await service.listAddresses(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const createAddress = async (req, res, next) => {
  try {
    const data = await service.createAddress(req.body, req.user.user_id);
    res.status(201).json({ success: true, data, message: 'Address created successfully' });
  } catch (error) {
    next(error);
  }
};

const listBranches = async (req, res, next) => {
  try {
    const data = await service.listBranches(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const getBranch = async (req, res, next) => {
  try {
    const data = await service.getBranch(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data, message: 'Branch retrieved successfully' });
  } catch (error) {
    next(error);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const data = await service.createBranch(req.body, req.user.user_id);
    res.status(201).json({ success: true, data, message: 'Branch created successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const data = await service.updateBranch(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data, message: 'Branch updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteBranch = async (req, res, next) => {
  try {
    const data = await service.deleteBranch(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data, message: 'Branch deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBranchImages = async (req, res, next) => {
  try {
    const data = await service.updateBranchImages(Number(req.params.id), {
      banner_img: req.files?.banner_img?.[0]?.filename,
      logo_img: req.files?.logo_img?.[0]?.filename
    }, req.user.user_id);
    res.json({ success: true, data, message: 'Branch images updated successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCountries,
  listCities,
  createCity,
  updateCity,
  deleteCity,
  listAddresses,
  createAddress,
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  updateBranchImages
};

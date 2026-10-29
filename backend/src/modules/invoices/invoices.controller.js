const service = require('./invoices.service');

const listInvoices = async (req, res, next) => {
  try {
    const data = await service.listInvoices(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const getInvoice = async (req, res, next) => {
  try {
    const data = await service.getInvoice(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const data = await service.updateStatus(Number(req.params.id), req.body.status, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const generateInvoice = async (req, res, next) => {
  try {
    const data = await service.generateInvoice(Number(req.body.cargo_id), req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listInvoices,
  getInvoice,
  updateStatus,
  generateInvoice
};

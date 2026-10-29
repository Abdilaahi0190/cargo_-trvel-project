const db = require('../../config/db');
const service = require('./transport.service');

const listProviders = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 25;
    const offset = (page - 1) * limit;

    const countResult = await db.query(
      'SELECT COUNT(*)::int AS total FROM transport_providers WHERE deleted = FALSE'
    );

    const result = await db.query(
      `SELECT provider_id, name, provider_type, entity_type, phone, status, created_at
       FROM transport_providers
       WHERE deleted = FALSE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ success: true, data: result.rows, total: countResult.rows[0].total });
  } catch (err) {
    next(err);
  }
};

const getProvider = async (req, res, next) => {
  try {
    const data = await service.getProvider(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createProvider = async (req, res, next) => {
  try {
    const { name, provider_type, entity_type, phone, status } = req.body;
    if (!name) return res.status(422).json({ success: false, message: 'Name is required' });

    const result = await db.query(
      `INSERT INTO transport_providers (name, provider_type, entity_type, phone, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING provider_id, name, provider_type, entity_type, phone, status`,
      [name, provider_type || 'truck', entity_type || 'company', phone || null, status || 'active']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const updateProvider = async (req, res, next) => {
  try {
    const data = await service.updateProvider(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteProvider = async (req, res, next) => {
  try {
    const data = await service.deleteProvider(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listRoutes = async (req, res, next) => {
  try {
    const data = await service.listRoutes(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const getRoute = async (req, res, next) => {
  try {
    const data = await service.getRoute(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createRoute = async (req, res, next) => {
  try {
    const data = await service.createRoute(req.body, req.uBrId, req.user.user_id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateRoute = async (req, res, next) => {
  try {
    const data = await service.updateRoute(Number(req.params.id), req.body, req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteRoute = async (req, res, next) => {
  try {
    const data = await service.deleteRoute(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  listRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute
};
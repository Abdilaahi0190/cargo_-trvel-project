const db = require('../../config/db');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return { page, limit, offset: (page - 1) * limit };
};

const listProviders = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = ['deleted = FALSE'];

  if (queryParams.status) {
    values.push(queryParams.status);
    filters.push(`status = $${values.length}`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await db.queryWithUser(`SELECT COUNT(*) AS total FROM transport_providers ${whereClause}`, values, userId);
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT provider_id,
            name,
            provider_type,
            entity_type,
            phone,
            status,
            deleted,
            created_at
     FROM transport_providers
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getProvider = async (providerId, userId) => {
  const result = await db.queryWithUser(
    `SELECT provider_id,
            name,
            provider_type,
            entity_type,
            phone,
            status,
            deleted,
            created_at
     FROM transport_providers
     WHERE provider_id = $1
       AND deleted = FALSE`,
    [providerId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Transport provider not found');
  }

  return result.rows[0];
};

const createProvider = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO transport_providers (name, provider_type, entity_type, phone, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING provider_id,
               name,
               provider_type,
               entity_type,
               phone,
               status,
               deleted,
               created_at`,
    [
      payload.name,
      payload.provider_type,
      payload.entity_type || 'company',
      payload.phone || null,
      payload.status || 'active'
    ],
    userId
  );

  return result.rows[0];
};

const updateProvider = async (providerId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE transport_providers
     SET name = COALESCE($1, name),
         provider_type = COALESCE($2, provider_type),
         entity_type = COALESCE($3, entity_type),
         phone = COALESCE($4, phone),
         status = COALESCE($5, status)
     WHERE provider_id = $6
       AND deleted = FALSE
     RETURNING provider_id,
               name,
               provider_type,
               entity_type,
               phone,
               status,
               deleted,
               created_at`,
    [payload.name ?? null, payload.provider_type ?? null, payload.entity_type ?? null, payload.phone ?? null, payload.status ?? null, providerId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Transport provider not found');
  }

  return result.rows[0];
};

const deleteProvider = async (providerId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE transport_providers
     SET deleted = TRUE
     WHERE provider_id = $1
       AND deleted = FALSE
     RETURNING provider_id`,
    [providerId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Transport provider not found');
  }

  return result.rows[0];
};

const listRoutes = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const countResult = await db.queryWithUser(
    'SELECT COUNT(*) AS total FROM routes WHERE deleted = FALSE AND from_branch_id <> to_branch_id',
    [], userId
  );
  const result = await db.queryWithUser(
    `SELECT r.*, fb.branch_name AS from_branch_name, tb.branch_name AS to_branch_name
     FROM routes r
     JOIN branches fb ON fb.branch_id = r.from_branch_id
     JOIN branches tb ON tb.branch_id = r.to_branch_id
     WHERE r.deleted = FALSE
       AND r.from_branch_id <> r.to_branch_id
     ORDER BY fb.branch_name, tb.branch_name
     LIMIT $1 OFFSET $2`,
    [limit, offset],
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getRoute = async (routeId, userId) => {
  const result = await db.queryWithUser(
    `SELECT r.*, fb.branch_name AS from_branch_name, tb.branch_name AS to_branch_name
     FROM routes r
     JOIN branches fb ON fb.branch_id = r.from_branch_id
     JOIN branches tb ON tb.branch_id = r.to_branch_id
     WHERE r.route_id = $1
       AND r.deleted = FALSE`,
    [routeId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Route not found');
  }

  return result.rows[0];
};

const createRoute = async (payload, uBrId, userId) => {
  if (Number(payload.from_branch_id) === Number(payload.to_branch_id)) {
    const err = new Error('Origin and Destination branches must be different.');
    err.status = 422;
    throw err;
  }

  const result = await db.queryWithUser(
    `INSERT INTO routes (from_branch_id, to_branch_id, distance_km, user_branch_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [payload.from_branch_id, payload.to_branch_id, payload.distance_km || null, uBrId],
    userId
  );

  return result.rows[0];
};

const updateRoute = async (routeId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE routes
     SET distance_km = COALESCE($1, distance_km)
     WHERE route_id = $2
       AND deleted = FALSE
     RETURNING *`,
    [payload.distance_km ?? null, routeId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Route not found');
  }

  return result.rows[0];
};

const deleteRoute = async (routeId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE routes
     SET deleted = TRUE
     WHERE route_id = $1
       AND deleted = FALSE
     RETURNING route_id`,
    [routeId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Route not found');
  }

  return result.rows[0];
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

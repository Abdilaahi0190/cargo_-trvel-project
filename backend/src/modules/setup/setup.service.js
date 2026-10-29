const db = require('../../config/db');

const createNotFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
};

const listCountries = async (userId) => {
  const result = await db.queryWithUser(
    `SELECT DISTINCT country FROM cities WHERE deleted = FALSE AND country IS NOT NULL ORDER BY country`,
    [],
    userId
  );
  return result.rows.map((r) => r.country);
};

const listCities = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = ['deleted = FALSE'];

  if (queryParams.country) {
    values.push(queryParams.country);
    filters.push(`country = $${values.length}`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await db.queryWithUser(`SELECT COUNT(*) AS total FROM cities ${whereClause}`, values, userId);
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT * FROM cities ${whereClause} ORDER BY city_name LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const createCity = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO cities (city_name, state_region, country)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.city_name, payload.state_region || null, payload.country || 'Somalia'],
    userId
  );

  return result.rows[0];
};

const updateCity = async (cityId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE cities
     SET city_name = COALESCE($1, city_name),
         state_region = COALESCE($2, state_region),
         country = COALESCE($3, country),
         updated_at = CURRENT_TIMESTAMP
     WHERE city_id = $4
       AND deleted = FALSE
     RETURNING *`,
    [payload.city_name ?? null, payload.state_region ?? null, payload.country ?? null, cityId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('City not found');
  }

  return result.rows[0];
};

const deleteCity = async (cityId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE cities
     SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE city_id = $1
       AND deleted = FALSE
     RETURNING city_id`,
    [cityId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('City not found');
  }

  return result.rows[0];
};

const listAddresses = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = ['a.deleted = FALSE', 'c.deleted = FALSE'];

  if (queryParams.city_id) {
    values.push(Number(queryParams.city_id));
    filters.push(`a.city_id = $${values.length}`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM addresses a
     JOIN cities c ON c.city_id = a.city_id
     ${whereClause}`,
    values,
    userId
  );
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT a.*, c.city_name, c.state_region, c.country
     FROM addresses a
     JOIN cities c ON c.city_id = a.city_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const createAddress = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO addresses (city_id, location_name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.city_id, payload.location_name || null, payload.description || null],
    userId
  );

  return result.rows[0];
};

const listBranches = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const countResult = await db.queryWithUser('SELECT COUNT(*) AS total FROM branches WHERE deleted = FALSE', [], userId);
  const result = await db.queryWithUser(
    `SELECT b.*, a.location_name, a.description AS address_description, c.city_id, c.city_name, c.state_region, c.country
     FROM branches b
     JOIN addresses a ON a.address_id = b.address_id
     JOIN cities c ON c.city_id = a.city_id
     WHERE b.deleted = FALSE
       AND a.deleted = FALSE
       AND c.deleted = FALSE
     ORDER BY b.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getBranch = async (branchId, userId) => {
  const result = await db.queryWithUser(
    `SELECT b.*, a.address_id, a.location_name, a.description AS address_description,
            c.city_id, c.city_name, c.state_region, c.country
     FROM branches b
     JOIN addresses a ON a.address_id = b.address_id
     JOIN cities c ON c.city_id = a.city_id
     WHERE b.branch_id = $1
       AND b.deleted = FALSE
       AND a.deleted = FALSE
       AND c.deleted = FALSE`,
    [branchId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Branch not found');
  }

  return result.rows[0];
};

const createBranch = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO branches (branch_name, manager_name, manager_tel, banner_tel, address_id, br_email, fg_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      payload.branch_name,
      payload.manager_name || null,
      payload.manager_tel || null,
      payload.banner_tel || null,
      payload.address_id,
      payload.br_email || null,
      payload.fg_message || null
    ],
    userId
  );

  return result.rows[0];
};

const updateBranch = async (branchId, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE branches
     SET branch_name = COALESCE($1, branch_name),
         manager_name = COALESCE($2, manager_name),
         manager_tel = COALESCE($3, manager_tel),
         banner_tel = COALESCE($4, banner_tel),
         address_id = COALESCE($5, address_id),
         br_email = COALESCE($6, br_email),
         fg_message = COALESCE($7, fg_message),
         updated_at = CURRENT_TIMESTAMP
     WHERE branch_id = $8
       AND deleted = FALSE
     RETURNING *`,
    [
      payload.branch_name ?? null,
      payload.manager_name ?? null,
      payload.manager_tel ?? null,
      payload.banner_tel ?? null,
      payload.address_id ?? null,
      payload.br_email ?? null,
      payload.fg_message ?? null,
      branchId
    ],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Branch not found');
  }

  return result.rows[0];
};

const deleteBranch = async (branchId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE branches
     SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE branch_id = $1
       AND deleted = FALSE
     RETURNING branch_id`,
    [branchId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Branch not found');
  }

  return result.rows[0];
};

const updateBranchImages = async (branchId, images, userId) => {
  const result = await db.queryWithUser(
    `UPDATE branches
     SET banner_img = COALESCE($1, banner_img),
         logo_img = COALESCE($2, logo_img),
         updated_at = CURRENT_TIMESTAMP
     WHERE branch_id = $3
       AND deleted = FALSE
     RETURNING *`,
    [images.banner_img || null, images.logo_img || null, branchId],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('Branch not found');
  }

  return result.rows[0];
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

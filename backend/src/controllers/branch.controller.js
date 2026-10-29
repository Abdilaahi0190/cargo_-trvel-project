const db = require('../config/db');

const getPagination = (req) => {
  const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
  const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
};

const branchSelect = `
  SELECT b.branch_id, b.branch_name, b.manager_name, b.manager_tel, b.banner_tel, b.br_email,
         b.fg_message, b.banner_img, b.logo_img, b.created_at, b.updated_at,
         a.address_id, a.location_name, a.description AS address_description,
         c.city_id, c.city_name, c.state_region, c.country
  FROM branches b
  JOIN addresses a ON a.address_id = b.address_id
  JOIN cities c ON c.city_id = a.city_id
  WHERE b.deleted = FALSE
`;

const getAll = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const countResult = await db.queryWithUser('SELECT COUNT(*) AS total FROM branches WHERE deleted = FALSE', [], req.user.user_id);
    const result = await db.queryWithUser(
      `${branchSelect}
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
      req.user.user_id
    );

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        page,
        limit,
        total: Number(countResult.rows[0].total),
        pages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `${branchSelect} AND b.branch_id = $1`,
      [Number(req.params.id)],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Branch retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const upsertCityAndAddress = async (payload, userId) => {
  const cityName = payload.city_name || payload.city || payload.cityName;
  const stateRegion = payload.state_region || null;
  const country = payload.country || 'Somalia';
  const locationName = payload.location_name || payload.address || payload.location || null;
  const description = payload.description || payload.address_description || null;

  const cityResult = await db.queryWithUser(
    `INSERT INTO cities (city_name, state_region, country)
     VALUES ($1, $2, $3)
     ON CONFLICT (city_name, state_region, country)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING city_id`,
    [cityName, stateRegion, country],
    userId
  );

  const addressResult = await db.queryWithUser(
    `INSERT INTO addresses (city_id, location_name, description)
     VALUES ($1, $2, $3)
     RETURNING address_id`,
    [cityResult.rows[0].city_id, locationName, description],
    userId
  );

  return addressResult.rows[0].address_id;
};

const create = async (req, res, next) => {
  try {
    const addressId = await upsertCityAndAddress(req.body, req.user.user_id);
    const result = await db.queryWithUser(
      `INSERT INTO branches
       (branch_name, manager_name, manager_tel, banner_tel, address_id, br_email, fg_message, banner_img, logo_img)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.body.branch_name || req.body.name,
        req.body.manager_name || null,
        req.body.manager_tel || null,
        req.body.banner_tel || null,
        addressId,
        req.body.br_email || null,
        req.body.fg_message || null,
        req.body.banner_img || null,
        req.body.logo_img || null
      ],
      req.user.user_id
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Branch created successfully' });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const branchId = Number(req.params.id);
    const updates = [];
    const values = [];
    const fieldMap = {
      branch_name: req.body.branch_name || req.body.name,
      manager_name: req.body.manager_name,
      manager_tel: req.body.manager_tel,
      banner_tel: req.body.banner_tel,
      br_email: req.body.br_email,
      fg_message: req.body.fg_message,
      banner_img: req.body.banner_img,
      logo_img: req.body.logo_img
    };

    Object.entries(fieldMap).forEach(([column, value]) => {
      if (value !== undefined) {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      }
    });

    if (req.body.city_name || req.body.city || req.body.cityName || req.body.address || req.body.location_name) {
      const addressId = await upsertCityAndAddress(req.body, req.user.user_id);
      values.push(addressId);
      updates.push(`address_id = $${values.length}`);
    }

    if (!updates.length) {
      const existing = await db.queryWithUser('SELECT * FROM branches WHERE branch_id = $1 AND deleted = FALSE', [branchId], req.user.user_id);
      return res.json({ success: true, data: existing.rows[0] || null, message: 'Branch retrieved successfully' });
    }

    values.push(branchId);
    const result = await db.queryWithUser(
      `UPDATE branches
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = $${values.length}
         AND deleted = FALSE
       RETURNING *`,
      values,
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Branch updated successfully' });
  } catch (error) {
    return next(error);
  }
};

const softDelete = async (req, res, next) => {
  try {
    const result = await db.queryWithUser(
      `UPDATE branches
       SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = $1
         AND deleted = FALSE
       RETURNING *`,
      [Number(req.params.id)],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Branch deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  softDelete
};

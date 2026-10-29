const bcrypt = require('bcryptjs');
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

const listUsers = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [];
  const filters = ['u.deleted = FALSE'];

  if (queryParams.role_id) {
    values.push(Number(queryParams.role_id));
    filters.push(`u.role_id = $${values.length}`);
  }

  if (queryParams.state) {
    values.push(queryParams.state);
    filters.push(`u.state = $${values.length}`);
  }
  // Branch scoping: non-admin users only see their assigned branches
  if (userId && userId.role_id && userId.role_id !== 1) {
    values.push(userId.branch_ids);
    filters.push(`u.user_id IN (SELECT ub.user_id FROM user_branches ub WHERE ub.branch_id = ANY($${values.length}) AND ub.deleted = FALSE)`);
  }
  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     ${whereClause}`,
    values,
    userId
  );
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT u.user_id, u.full_name, u.username, u.phone, u.role_id, u.state, u.created_at, r.role_name,
            COALESCE(
              (
                SELECT string_agg(DISTINCT b.branch_name, ', ' ORDER BY b.branch_name)
                FROM user_branches ub
                JOIN branches b ON b.branch_id = ub.branch_id
                WHERE ub.user_id = u.user_id
                  AND ub.deleted = FALSE
                  AND ub.state = 'active'
              ),
              ''
            ) AS branch_names
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const getUser = async (userIdToFetch, userId) => {
  const result = await db.queryWithUser(
    `SELECT u.user_id, u.full_name, u.username, u.phone, u.role_id, u.state, r.role_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'user_branch_id', ub.user_branch_id,
                  'branch_id', ub.branch_id,
                  'branch_name', b.branch_name,
                  'state', ub.state
                )
              ) FILTER (WHERE ub.user_branch_id IS NOT NULL),
              '[]'::json
            ) AS branches
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     LEFT JOIN user_branches ub ON ub.user_id = u.user_id AND ub.deleted = FALSE
     LEFT JOIN branches b ON b.branch_id = ub.branch_id
     WHERE u.user_id = $1
       AND u.deleted = FALSE
     GROUP BY u.user_id, r.role_name`,
    [userIdToFetch],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('User not found');
  }

  return result.rows[0];
};

const createUser = async (payload, userId) => {
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const result = await db.queryWithUser(
    `INSERT INTO users (full_name, username, password_hash, phone, role_id, state)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING user_id, full_name, username, phone, role_id, state, created_at`,
    [
      payload.name,
      payload.username,
      passwordHash,
      payload.phone || null,
      payload.role_id,
      payload.state || 'active'
    ],
    userId
  );

  return result.rows[0];
};

const updateUser = async (userIdToUpdate, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         role_id = COALESCE($3, role_id),
         state = COALESCE($4, state),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $5
       AND deleted = FALSE
     RETURNING user_id, full_name, username, phone, role_id, state, updated_at`,
    [payload.name ?? null, payload.phone ?? null, payload.role_id ?? null, payload.state ?? null, userIdToUpdate],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('User not found');
  }

  return result.rows[0];
};

const patchUserState = async (userIdToUpdate, payload, userId) => {
  const result = await db.queryWithUser(
    `UPDATE users
     SET state = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2
       AND deleted = FALSE
     RETURNING user_id, full_name, username, phone, role_id, state, updated_at`,
    [payload.state, userIdToUpdate],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('User not found');
  }

  return result.rows[0];
};

const resetPassword = async (userIdToUpdate, payload, userId) => {
  const passwordHash = await bcrypt.hash(payload.new_password, 10);
  const result = await db.queryWithUser(
    `UPDATE users
     SET password_hash = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2
       AND deleted = FALSE
     RETURNING user_id, full_name, username`,
    [passwordHash, userIdToUpdate],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('User not found');
  }

  return result.rows[0];
};

const deleteUser = async (userIdToDelete, userId) => {
  const result = await db.queryWithUser(
    `UPDATE users
     SET deleted = TRUE, state = 'inactive', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
       AND deleted = FALSE
     RETURNING user_id`,
    [userIdToDelete],
    userId
  );

  if (!result.rows.length) {
    throw createNotFound('User not found');
  }

  return result.rows[0];
};

const assignUserBranch = async (payload, userId) => {
  const result = await db.queryWithUser(
    `INSERT INTO user_branches (user_id, branch_id, state, deleted)
     VALUES ($1, $2, 'active', FALSE)
     ON CONFLICT (user_id, branch_id)
     DO UPDATE SET state = 'active', deleted = FALSE
     RETURNING *`,
    [payload.user_id, payload.branch_id],
    userId
  );

  return result.rows[0];
};

const revokeUserBranch = async (uBrId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE user_branches
     SET deleted = TRUE, state = 'inactive'
     WHERE user_branch_id = $1
     RETURNING user_branch_id, user_id, branch_id`,
    [uBrId],
    userId
  );

  if (!result.rows.length) {
    const err = new Error('Branch assignment not found');
    err.status = 404;
    throw err;
  }

  return result.rows[0];
};

const listRoles = async (userId) => {
  const result = await db.queryWithUser(
    `SELECT *
     FROM roles
     WHERE deleted = FALSE
       AND role_id IN (1, 2)
     ORDER BY role_id`,
    [],
    userId
  );

  return result.rows;
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  patchUserState,
  resetPassword,
  deleteUser,
  assignUserBranch,
  revokeUserBranch,
  listRoles
};

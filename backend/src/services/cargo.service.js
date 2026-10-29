import db from '../config/db.js';

const buildCargoListQuery = ({ status, from_branch_id, to_branch_id, date_from, date_to, searchBranch }) => {
  const conditions = ['deleted=FALSE'];
  const values = [];
  let idx = 1;

  if (status) {
    conditions.push(`status_name=$${idx++}`);
    values.push(status);
  }
  if (from_branch_id) {
    conditions.push(`from_branch_id=$${idx++}`);
    values.push(from_branch_id);
  }
  if (to_branch_id) {
    conditions.push(`to_branch_id=$${idx++}`);
    values.push(to_branch_id);
  }
  if (date_from) {
    conditions.push(`created_at >= $${idx++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`created_at <= $${idx++}`);
    values.push(date_to);
  }
  if (searchBranch) {
    conditions.push(`(CAST(from_branch_id AS TEXT)=$${idx} OR CAST(to_branch_id AS TEXT)=$${idx})`);
    values.push(searchBranch);
    idx += 1;
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
};

const listCargo = async (queryParams, userId) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;
  const offset = (page - 1) * limit;
  const { where, values } = buildCargoListQuery({
    status: queryParams.status,
    from_branch_id: queryParams.from_branch_id,
    to_branch_id: queryParams.to_branch_id,
    date_from: queryParams.date_from,
    date_to: queryParams.date_to
  });

  const countResult = await db.queryWithUser(`SELECT COUNT(*) AS total FROM cargo ${where}`, values, userId);
  const total = Number(countResult.rows[0].total);

  const data = await db.queryWithUser(
    `SELECT * FROM cargo ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
    userId
  );

  return {
    rows: data.rows,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

export default { listCargo, buildCargoListQuery };

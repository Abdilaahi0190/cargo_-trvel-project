const db = require('../../config/db');

const getPagination = (queryParams) => {
  const page = Number(queryParams.page) > 0 ? Number(queryParams.page) : 1;
  const limit = Number(queryParams.limit) > 0 ? Number(queryParams.limit) : 20;

  return { page, limit, offset: (page - 1) * limit };
};

const listForUser = async (queryParams, userId) => {
  const { page, limit, offset } = getPagination(queryParams);
  const values = [userId];
  let sentClause = '';

  if (queryParams.sent !== undefined) {
    values.push(queryParams.sent === 'true');
    sentClause = `AND sent = $${values.length}`;
  }

  const countResult = await db.queryWithUser(
    `SELECT COUNT(*) AS total
     FROM notifications
     WHERE user_id = $1
     ${sentClause}`,
    values,
    userId
  );
  values.push(limit, offset);
  const result = await db.queryWithUser(
    `SELECT *
     FROM notifications
     WHERE user_id = $1
     ${sentClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
    userId
  );

  return { rows: result.rows, meta: { page, limit, total: Number(countResult.rows[0].total), pages: Math.ceil(Number(countResult.rows[0].total) / limit) } };
};

const markRead = async (notificationId, userId) => {
  const result = await db.queryWithUser(
    `UPDATE notifications
     SET sent = TRUE, sent_at = NOW()
     WHERE notification_id = $1
       AND user_id = $2
     RETURNING *`,
    [notificationId, userId],
    userId
  );

  return result.rows[0] || null;
};

const deleteNotification = async (notificationId, userId) => {
  const result = await db.queryWithUser(
    `DELETE FROM notifications
     WHERE notification_id = $1
       AND user_id = $2
     RETURNING notification_id`,
    [notificationId, userId],
    userId
  );

  return result.rows[0] || null;
};

module.exports = {
  listForUser,
  markRead,
  deleteNotification
};

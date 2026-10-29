const service = require('./notifications.service');

const listForUser = async (req, res, next) => {
  try {
    const data = await service.listForUser(req.query, req.user.user_id);
    res.json({ success: true, data: data.rows, meta: data.meta });
  } catch (error) {
    next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const data = await service.markRead(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const data = await service.deleteNotification(Number(req.params.id), req.user.user_id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listForUser,
  markRead,
  deleteNotification
};

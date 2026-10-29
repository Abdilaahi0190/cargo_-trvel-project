const db = require('../config/db');

const apiLogger = (req, res, next) => {
  const startedAt = Date.now();
  const originalEnd = res.end.bind(res);

  res.end = (...args) => {
    originalEnd(...args);

    const durationMs = Date.now() - startedAt;
    db.pool.connect()
      .then((client) => client.query(
        `INSERT INTO api_logs (user_id, endpoint, method, response_status, ip_address, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user?.user_id || null,
          req.originalUrl,
          req.method,
          res.statusCode,
          req.ip || null,
          durationMs
        ]
      ).finally(() => client.release()))
      .catch(() => {});
  };

  next();
};

module.exports = apiLogger;

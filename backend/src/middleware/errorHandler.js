const isNotFoundMessage = (message) => (
  typeof message === 'string' && /not found|already deleted|missing/i.test(message)
);

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const isProduction = process.env.NODE_ENV === 'production';

  // Always log — never stay silent on unexpected errors
  // eslint-disable-next-line no-console
  console.error('[API Error]', {
    method: req.method,
    url: req.originalUrl,
    pgCode: err.code,
    pgDetail: err.detail,
    message: err.message,
    stack: err.stack
  });

  if (err.isJoi) {
    return res.status(422).json({
      errors: err.details.map((detail) => ({
        field: detail.path.join('.') || 'body',
        message: detail.message
      }))
    });
  }

  if (err.statusCode === 404 || err.status === 404 || isNotFoundMessage(err.message)) {
    return res.status(404).json({ message: 'Not found' });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      message: err.detail || 'Duplicate record'
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      message: err.detail || 'Related record not found'
    });
  }

  if (err.code === '23514') {
    return res.status(422).json({
      message: err.detail || 'Check constraint violation'
    });
  }

  // PostgreSQL: relation (table/view) does not exist — migration likely not applied
  if (err.code === '42P01') {
    const tableMatch = err.message && err.message.match(/relation "([^"]+)"/);
    const tableName = tableMatch ? tableMatch[1] : 'unknown';
    return res.status(500).json({
      message: isProduction
        ? 'Internal server error'
        : `Database table "${tableName}" does not exist — run pending migrations.`,
      ...(isProduction ? {} : { code: err.code })
    });
  }

  // PostgreSQL: column does not exist — schema mismatch
  if (err.code === '42703') {
    return res.status(500).json({
      message: isProduction
        ? 'Internal server error'
        : `Database column error — schema mismatch: ${err.message}`,
      ...(isProduction ? {} : { code: err.code })
    });
  }

  if (err.message && err.message.includes('Insufficient')) {
    return res.status(402).json({ message: err.message });
  }

  const status = Number(err.statusCode || err.status) || 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;

  if (safeStatus !== 500) {
    return res.status(safeStatus).json({
      message: isProduction ? 'Internal server error' : (err.message || 'Internal server error')
    });
  }

  return res.status(500).json({
    message: isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
    ...(isProduction ? {} : { code: err.code, detail: err.detail })
  });
};

module.exports = errorHandler;

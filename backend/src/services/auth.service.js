const crypto = require('crypto');
const db = require('../config/db');
const { signToken, verifyToken } = require('../config/jwt');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const parseJwtExpiryToDate = () => {
  const raw = process.env.JWT_EXPIRES_IN || '8h';
  const match = String(raw).match(/^(\d+)([smhd])?$/i);

  if (!match) {
    return new Date(Date.now() + (8 * 60 * 60 * 1000));
  }

  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return new Date(Date.now() + (amount * multipliers[unit]));
};

const refreshToken = async (token, requestMeta = {}) => {
  const payload = verifyToken(token);

  await db.query(
    'DELETE FROM user_sessions WHERE token_hash = $1',
    [hashToken(token)]
  );

  const newToken = signToken({
    user_id: payload.user_id,
    username: payload.username,
    role_id: payload.role_id,
    name: payload.name,
    user_branch_id: payload.user_branch_id,
    branch_id: payload.branch_id,
    branches: payload.branches
  });

  await db.query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      payload.user_id,
      hashToken(newToken),
      parseJwtExpiryToDate(),
      requestMeta.ip || null,
      requestMeta.userAgent || null
    ]
  );

  return {
    token: newToken,
    user: {
      user_id: payload.user_id,
      username: payload.username,
      role_id: payload.role_id,
      name: payload.name,
      user_branch_id: payload.user_branch_id,
      branch_id: payload.branch_id,
      branches: payload.branches
    }
  };
};

module.exports = {
  refreshToken
};

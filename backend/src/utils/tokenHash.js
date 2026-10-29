const crypto = require('crypto');

/**
 * SHA-256 hex digest of a JWT or session token (stored in user_sessions.token_hash).
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { hashToken };

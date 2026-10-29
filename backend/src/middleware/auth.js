const db = require('../config/db');
const { verifyToken } = require('../config/jwt');
const { hashToken } = require('../utils/tokenHash');

const ADMIN_ROLE_ID = 1;
const CUSTOMER_ROLE_ID = 5;

const logSecurityEvent = async (req, eventType, details = {}, severity = 'warning') => {
  try {
    await db.query(
      `INSERT INTO security_events (user_id, branch_id, event_type, severity, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.user_id || null,
        req.branchId || req.user?.branch_id || null,
        eventType,
        severity,
        req.ip || null,
        req.get?.('user-agent') || null,
        details
      ]
    );
  } catch {
    // Security logging must never mask the original request result.
  }
};

/**
 * Verify JWT and ensure the token is still present in user_sessions (logout-safe).
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token is required' });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authorization token is required' });
  }

  try {
    req.user = verifyToken(token);
    if (req.user.role == null && req.user.role_id != null) {
      req.user.role = req.user.role_id;
    }
    // Load assigned active branches for the user
    const branchResult = await db.query(
      `SELECT branch_id FROM user_branches WHERE user_id = $1 AND deleted = FALSE AND state = 'active'`,
      [req.user.user_id]
    );
    req.user.branches = branchResult.rows.map(r => Number(r.branch_id));

    if (Number(req.user.role_id ?? req.user.role) === CUSTOMER_ROLE_ID) {
      await logSecurityEvent(req, 'customer_role_api_access_blocked', {}, 'critical');
      return res.status(403).json({ success: false, message: 'Customer accounts are disabled for this internal system' });
    }

    if (Number(req.user.role_id ?? req.user.role) !== ADMIN_ROLE_ID && req.user.branches.length !== 1) {
      await logSecurityEvent(req, 'invalid_branch_assignment_count', { branch_count: req.user.branches.length }, 'critical');
      return res.status(403).json({ success: false, message: 'User must have exactly one active branch assignment' });
    }
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  try {
    const sessionResult = await db.query(
      `SELECT session_id
       FROM user_sessions
       WHERE token_hash = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [hashToken(token)]
    );

    if (!sessionResult.rows.length) {
      return res.status(401).json({ success: false, message: 'Session expired or revoked' });
    }

    req.sessionId = sessionResult.rows[0].session_id;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Require x-branch-id and confirm the user is assigned to that branch (admins bypass).
 */
const requireBranchAccess = async (req, res, next) => {
  try {
    if (!req.user?.user_id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const branchHeader = req.headers['x-branch-id'];

    if (!branchHeader) {
      return res.status(400).json({ success: false, message: 'x-branch-id header is required' });
    }

    const branchId = Number(branchHeader);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ success: false, message: 'x-branch-id must be a valid branch id' });
    }

    if (Number(req.user.role_id ?? req.user.role) === ADMIN_ROLE_ID) {
      req.branchId = branchId;
      req.user.branch_id = branchId;

      const adminBranch = await db.query(
        `SELECT user_branch_id
         FROM user_branches
         WHERE user_id = $1
           AND branch_id = $2
           AND deleted = FALSE
           AND state = 'active'
         LIMIT 1`,
        [req.user.user_id, branchId]
      );

      if (adminBranch.rows.length) {
        req.uBrId = Number(adminBranch.rows[0].user_branch_id);
        req.user.user_branch_id = req.uBrId;
      }

      return next();
    }

    const result = await db.query(
      `SELECT user_branch_id
       FROM user_branches
       WHERE user_id = $1
         AND branch_id = $2
         AND deleted = FALSE
         AND state = 'active'
       LIMIT 1`,
      [req.user.user_id, branchId]
    );

    if (!result.rows.length) {
      await logSecurityEvent(req, 'cross_branch_access_denied', { requested_branch_id: branchId }, 'critical');
      return res.status(403).json({ success: false, message: 'Access denied to this branch' });
    }

    req.branchId = branchId;
    req.uBrId = Number(result.rows[0].user_branch_id);
    req.user.branch_id = branchId;
    req.user.user_branch_id = req.uBrId;

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * SET LOCAL myapp.user_id for DB triggers / current_app_user_id() on this request connection.
 */
const setBranchContext = async (req, res, next) => {
  if (!req.user?.user_id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  let client;
  let released = false;

  const releaseClient = async () => {
    if (released || !client) {
      return;
    }

    released = true;

    try {
      await client.query(`SELECT set_config('myapp.user_id', '', true)`);
    } catch {
      // ignore cleanup errors
    }

    client.release();
    client = null;
    req.dbClient = null;
  };

  try {
    client = await db.pool.connect();
    await client.query(
      `SELECT set_config('myapp.user_id', $1::text, true)`,
      [String(req.user.user_id)]
    );

    req.dbClient = client;

    res.on('finish', releaseClient);
    res.on('close', releaseClient);

    return next();
  } catch (error) {
    await releaseClient();
    return next(error);
  }
};

const requireRole = (...roleIds) => (req, res, next) => {
  if (!req.user || !roleIds.includes(req.user.role_id)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  return next();
};

/**
 * Guard access to a branch id taken from route params (e.g. GET /branches/:id).
 */
const requireBranchParamAccess = (branchIdParam = 'id') => async (req, res, next) => {
  try {
    if (!req.user?.user_id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (Number(req.user.role_id ?? req.user.role) === ADMIN_ROLE_ID) {
      return next();
    }

    const branchId = Number(req.params[branchIdParam]);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid branch id' });
    }

    const result = await db.query(
      `SELECT 1
       FROM user_branches
       WHERE user_id = $1
         AND branch_id = $2
         AND deleted = FALSE
         AND state = 'active'
       LIMIT 1`,
      [req.user.user_id, branchId]
    );

    if (!result.rows.length) {
      return res.status(403).json({ success: false, message: 'Access denied to this branch' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authenticate,
  requireBranchAccess,
  setBranchContext,
  requireRole,
  requireBranchParamAccess
};

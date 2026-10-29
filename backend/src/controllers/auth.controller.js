const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../config/jwt');
const authService = require('../services/auth.service');
const { hashToken } = require('../utils/tokenHash');

const ADMIN_ROLE_ID = 1;

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

const logSecurityEvent = async (req, eventType, details = {}, severity = 'warning', userId = null, branchId = null) => {
  try {
    await db.query(
      `INSERT INTO security_events (user_id, branch_id, event_type, severity, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        branchId,
        eventType,
        severity,
        req.ip || null,
        req.get('user-agent') || null,
        details
      ]
    );
  } catch {
    // Ignore logging errors to preserve auth response semantics during migrations.
  }
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const userResult = await db.query(
      `SELECT u.user_id, u.username, u.password_hash, u.role_id, u.full_name, u.state
       FROM users u
       WHERE u.username = $1
         AND u.deleted = FALSE
       LIMIT 1`,
      [username]
    );

    const user = userResult.rows[0];

    if (!user || user.state !== 'active') {
      await logSecurityEvent(req, 'login_failed_unknown_or_inactive', { username }, 'warning');
      // eslint-disable-next-line no-console
      console.warn('[auth.login] login failed - unknown or inactive user', { username });
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      await logSecurityEvent(req, 'login_failed_bad_password', { username }, 'warning', user.user_id, user.branch_id);
      // eslint-disable-next-line no-console
      console.warn('[auth.login] login failed - bad password', { user_id: user.user_id, username });
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const branchResult = await db.query(
      `SELECT ub.user_branch_id, ub.branch_id, b.branch_name
       FROM user_branches ub
       JOIN branches b ON b.branch_id = ub.branch_id
       WHERE ub.user_id = $1
         AND ub.deleted = FALSE
         AND ub.state = 'active'
       ORDER BY ub.branch_id
       LIMIT 1`,
      [user.user_id]
    );

    const activeBranch = branchResult.rows[0] || null;
    const branchId = activeBranch ? Number(activeBranch.branch_id) : null;
    const userBranchId = activeBranch ? Number(activeBranch.user_branch_id) : null;

    if (!activeBranch && Number(user.role_id) !== ADMIN_ROLE_ID) {
      return res.status(403).json({ success: false, message: 'No active branch is assigned to this user' });
    }

    const branchesResult = await db.query(
      `SELECT user_branch_id, branch_id
       FROM user_branches
       WHERE user_id = $1
         AND deleted = FALSE
         AND state = 'active'
       ORDER BY branch_id`,
      [user.user_id]
    );

    const branches = branchesResult.rows.map((row) => Number(row.branch_id));

    if (Number(user.role_id) !== 1 && branches.length !== 1) {
      await logSecurityEvent(
        req,
        'login_blocked_invalid_branch_assignment_count',
        { username, branch_count: branches.length },
        'critical',
        user.user_id,
        branchId
      );
      return res.status(403).json({ success: false, message: 'User must have exactly one active branch assignment' });
    }

    const payload = {
      id: user.user_id,
      user_id: user.user_id,
      username: user.username,
      role: user.role_id,
      role_id: user.role_id,
      name: user.full_name,
      isActive: user.state === 'active',
      user_branch_id: userBranchId,
      branch_id: branchId,
      branches
    };
    const token = signToken(payload);

    try {
      await db.query(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.user_id,
          hashToken(token),
          parseJwtExpiryToDate(),
          req.ip || null,
          req.get('user-agent') || null
        ]
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[auth.login] failed to insert user_session', err && err.message);
      // proceed; do not block login on session logging error
    }

    await logSecurityEvent(req, 'login_success', { username }, 'info', user.user_id, branchId);

    // eslint-disable-next-line no-console
    console.info('[auth.login] login successful', { user_id: user.user_id, branch_id: branchId, tokenLength: token.length });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          ...payload,
          user_branch_id: userBranchId,
          branch_id: branchId,
          activeBranchId: branchId,
          activeUserBranchId: userBranchId,
          activeBranchName: activeBranch?.branch_name || null
        },
        user_branch_id: userBranchId,
        branch_id: branchId,
        activeBranch: branchId,
        activeBranchName: activeBranch?.branch_name || null
      },
      message: 'Login successful'
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authorization token is required' });
    }

    const token = authHeader.split(' ')[1];

    await db.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const userResult = await db.query(
      `SELECT user_id, username, role_id, full_name, state
       FROM users
       WHERE user_id = $1
         AND deleted = FALSE
       LIMIT 1`,
      [req.user.user_id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const branchesResult = await db.query(
      `SELECT ub.branch_id, b.branch_name
       FROM user_branches ub
       JOIN branches b ON b.branch_id = ub.branch_id
       WHERE ub.user_id = $1
         AND ub.deleted = FALSE
         AND ub.state = 'active'
       ORDER BY ub.branch_id`,
      [req.user.user_id]
    );

    return res.json({
      success: true,
      data: {
        ...userResult.rows[0],
        name: userResult.rows[0].full_name,
        id: req.user.user_id,
        isActive: userResult.rows[0].state === 'active',
        user_branch_id: req.user.user_branch_id || null,
        branch_id: req.user.branch_id || null,
        branches: branchesResult.rows.map((row) => Number(row.branch_id)),
        branchNames: branchesResult.rows.map((row) => row.branch_name)
      },
      message: 'User profile retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authorization token is required' });
    }

    const token = authHeader.split(' ')[1];
    const data = await authService.refreshToken(token, {
      ip: req.ip || null,
      userAgent: req.get('user-agent') || null
    });

    return res.json({
      success: true,
      data,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const refreshToken = async (req, res, next) => {
  return refresh(req, res, next);
};

module.exports = {
  login,
  logout,
  me,
  refresh,
  refreshToken
};

const db = require('../config/db');

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeCreateBody(body) {
  return {
    provider_id:      body.provider_id    || body.transport_provider_id,
    route_id:         body.route_id,
    from_branch_id:   body.from_branch_id ? Number(body.from_branch_id) : null,
    to_branch_id:     body.to_branch_id   ? Number(body.to_branch_id)   : null,
    trip_date:        body.trip_date      || body.departure_date,
    departure_time:   body.departure_time || '08:00',
    arrival_time:     body.arrival_time   || '18:00',
    notes:            body.notes          || null
  };
}

async function resolveRouteId(fromBranchId, toBranchId, uBrId, userId) {
  if (fromBranchId === toBranchId) {
    const err = new Error('Origin and Destination branches must be different.');
    err.status = 422;
    throw err;
  }
  const existing = await db.queryWithUser(
    `SELECT route_id FROM routes
     WHERE from_branch_id = $1 AND to_branch_id = $2 AND deleted = FALSE
     LIMIT 1`,
    [fromBranchId, toBranchId],
    userId
  );
  if (existing.rows.length) return existing.rows[0].route_id;

  const created = await db.queryWithUser(
    `INSERT INTO routes (route_code, from_branch_id, to_branch_id, user_branch_id, created_by, updated_by)
     VALUES (CONCAT('RT-', $1, '-', $2), $1, $2, $3, $4, $4) RETURNING route_id`,
    [fromBranchId, toBranchId, uBrId, userId],
    userId
  );
  return created.rows[0].route_id;
}

// ── GET /api/trips ─────────────────────────────────────────────────────────────

const getAll = async (req, res, next) => {
  try {
    const page   = Number(req.query.page)  > 0 ? Number(req.query.page)  : 1;
    const limit  = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;

    const values  = [req.uBrId];
    const filters = ['t.deleted = FALSE', 't.user_branch_id = $1'];

    if (req.query.status) {
      values.push(req.query.status);
      filters.push(`t.status = $${values.length}`);
    }

    if (req.query.trip_date) {
      values.push(req.query.trip_date);
      filters.push(`t.trip_date = $${values.length}`);
    }

    const where = `WHERE ${filters.join(' AND ')}`;

    const countResult = await db.queryWithUser(
      `SELECT COUNT(*) AS total FROM trips t ${where}`,
      values,
      req.user.user_id
    );

    values.push(limit, offset);

    const result = await db.queryWithUser(
      `SELECT t.trip_id,
              concat('TRP', t.trip_id)                      AS trip_no,
              t.trip_date,
              t.departure_time,
              t.arrival_time,
              t.notes,
              t.status,
              t.total_cost,
              concat(fb.branch_name, ' -> ', tb.branch_name) AS route,
              t.provider_id,
              p.name                                         AS provider_name,
              COALESCE(tc.cargo_count, 0)                    AS cargo_count
       FROM   trips t
       JOIN   routes              r  ON r.route_id    = t.route_id
       JOIN   transport_providers p  ON p.provider_id = t.provider_id
       JOIN   branches              fb ON fb.branch_id      = r.from_branch_id
       JOIN   branches              tb ON tb.branch_id      = r.to_branch_id
       LEFT JOIN (
         SELECT trip_id, COUNT(*)::INT AS cargo_count
         FROM   trip_cargo
         WHERE  deleted = FALSE
         GROUP  BY trip_id
       ) tc ON tc.trip_id = t.trip_id
       ${where}
       ORDER  BY t.trip_date DESC, t.created_at DESC
       LIMIT  $${values.length - 1} OFFSET $${values.length}`,
      values,
      req.user.user_id
    );

    return res.json({
      success: true,
      data:    result.rows,
      meta:    {
        page,
        limit,
        total: Number(countResult.rows[0].total),
        pages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    return next(error);
  }
};

// ── GET /api/trips/:id ─────────────────────────────────────────────────────────

const getOne = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);

    const tripResult = await db.queryWithUser(
      `SELECT t.*,
              p.name             AS provider_name,
              fb.branch_name     AS from_branch_name,
              tb.branch_name     AS to_branch_name,
              r.from_branch_id,
              r.to_branch_id
       FROM   trips t
       JOIN   routes              r  ON r.route_id    = t.route_id
       JOIN   transport_providers p  ON p.provider_id = t.provider_id
       JOIN   branches              fb ON fb.branch_id      = r.from_branch_id
       JOIN   branches              tb ON tb.branch_id      = r.to_branch_id
       WHERE  t.trip_id = $1
         AND  t.deleted = FALSE`,
      [tripId],
      req.user.user_id
    );

    if (!tripResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const cargoResult = await db.queryWithUser(
      `SELECT tc.*, c.tracking_number, c.sender_id, c.receiver_id
       FROM   trip_cargo tc
       JOIN   cargo c ON c.cargo_id = tc.cargo_id
       WHERE  tc.trip_id = $1
         AND  tc.deleted = FALSE`,
      [tripId],
      req.user.user_id
    );

    return res.json({
      success: true,
      data:    { ...tripResult.rows[0], trip_cargo: cargoResult.rows },
      message: 'Trip retrieved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── POST /api/trips ────────────────────────────────────────────────────────────

const create = async (req, res, next) => {
  try {
    const p = normalizeCreateBody(req.body);

    if (!p.provider_id || !p.trip_date) {
      return res.status(400).json({ success: false, message: 'provider_id and departure_date are required' });
    }

    // Resolve route_id from branches pair if provided
    if (p.from_branch_id && p.to_branch_id) {
      p.route_id = await resolveRouteId(p.from_branch_id, p.to_branch_id, req.uBrId, req.user.user_id);
    }

    if (!p.route_id) {
      return res.status(400).json({ success: false, message: 'from_branch_id and to_branch_id (or route_id) are required' });
    }

    const result = await db.queryWithUser(
      `INSERT INTO trips
         (provider_id, route_id, trip_date, departure_time, arrival_time, notes, user_branch_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4::time, $5::time, $6, $7, $8, $8)
       RETURNING trip_id, trip_date, departure_time, status, notes`,
      [
        p.provider_id,
        p.route_id,
        p.trip_date,
        p.departure_time,
        p.arrival_time,
        p.notes,
        req.uBrId,
        req.user.user_id
      ],
      req.user.user_id
    );

    return res.status(201).json({
      success: true,
      data:    result.rows[0],
      message: 'Trip created successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── PUT /api/trips/:id  (edit details) ────────────────────────────────────────

const update = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);
    const p = normalizeCreateBody(req.body);

    const existing = await db.queryWithUser(
      `SELECT status FROM trips WHERE trip_id = $1 AND user_branch_id = $2 AND deleted = FALSE`,
      [tripId, req.uBrId],
      req.user.user_id
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    // Resolve route from branches pair if provided
    if (p.from_branch_id && p.to_branch_id) {
      p.route_id = await resolveRouteId(p.from_branch_id, p.to_branch_id, req.uBrId, req.user.user_id);
    }

    const fields = [];
    const values = [tripId, req.uBrId, req.user.user_id];
    const push = (expr, val) => { values.push(val); fields.push(`${expr} = $${values.length}`); };

    if (p.route_id)       push('route_id',       Number(p.route_id));
    if (p.provider_id)    push('provider_id',     Number(p.provider_id));
    if (p.trip_date)      push('trip_date',       p.trip_date);
    if (p.departure_time) push('departure_time',  p.departure_time);
    if (p.arrival_time)   push('arrival_time',    p.arrival_time);
    if (p.notes !== undefined) push('notes',      p.notes || null);

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP', `updated_by = $3`);

    const result = await db.queryWithUser(
      `UPDATE trips SET ${fields.join(', ')}
       WHERE trip_id = $1 AND user_branch_id = $2 AND deleted = FALSE
       RETURNING trip_id, status`,
      values,
      req.user.user_id
    );

    return res.json({ success: true, data: result.rows[0], message: 'Trip updated successfully' });
  } catch (error) {
    return next(error);
  }
};

// ── PUT /api/trips/:id/status ──────────────────────────────────────────────────

const updateStatus = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);
    const status = req.body.status_name || req.body.status;

    if (!status) {
      return res.status(400).json({ success: false, message: 'status_name is required' });
    }

    const result = await db.queryWithUser(
      `UPDATE trips
       SET    status     = $2::trip_status_enum,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $3
       WHERE  trip_id  = $1
         AND  user_branch_id  = $4
         AND  deleted  = FALSE
       RETURNING trip_id, status`,
      [tripId, status, req.user.user_id, req.uBrId],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    return res.json({
      success: true,
      data:    result.rows[0],
      message: 'Trip status updated successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── POST /api/trips/:id/cargo  (single) ───────────────────────────────────────

const assignCargo = async (req, res, next) => {
  try {
    const tripId        = Number(req.params.id);
    const cargoId       = Number(req.body.cargo_id);
    const transportCost = req.body.transport_cost || 0;

    await db.queryWithUser(
      `INSERT INTO trip_cargo (trip_id, cargo_id, transport_cost, user_branch_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (trip_id, cargo_id) DO UPDATE
         SET deleted        = FALSE,
             transport_cost = EXCLUDED.transport_cost`,
      [tripId, cargoId, transportCost, req.uBrId],
      req.user.user_id
    );

    return res.json({
      success: true,
      data:    { trip_id: tripId, cargo_id: cargoId },
      message: 'Cargo assigned to trip successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── POST /api/trips/:id/cargo  (bulk, array of ids) ──────────────────────────

const bulkAssignCargo = async (req, res, next) => {
  try {
    const tripId        = Number(req.params.id);
    const cargoIds      = req.body.cargo_ids || (req.body.cargo_id ? [req.body.cargo_id] : []);
    const transportCost = req.body.transport_cost || 0;

    if (!cargoIds.length) {
      return res.status(400).json({ success: false, message: 'cargo_ids must be a non-empty array' });
    }

    const inserted = [];
    for (const cargoId of cargoIds) {
      await db.queryWithUser(
        `INSERT INTO trip_cargo (trip_id, cargo_id, transport_cost, user_branch_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (trip_id, cargo_id) DO UPDATE
           SET deleted        = FALSE,
               transport_cost = EXCLUDED.transport_cost`,
        [tripId, Number(cargoId), transportCost, req.uBrId],
        req.user.user_id
      );
      inserted.push(Number(cargoId));
    }

    return res.json({
      success: true,
      data:    { trip_id: tripId, assigned_count: inserted.length, cargo_ids: inserted },
      message: 'Cargo assigned to trip successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── PUT /api/trips/:id/complete ────────────────────────────────────────────────

const complete = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);

    const result = await db.queryWithUser(
      `UPDATE trips
       SET    status     = 'completed',
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $2
       WHERE  trip_id  = $1
         AND  user_branch_id  = $3
         AND  deleted  = FALSE
         AND  status  != 'cancelled'
       RETURNING trip_id, status`,
      [tripId, req.user.user_id, req.uBrId],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found or already cancelled' });
    }

    return res.json({
      success: true,
      data:    result.rows[0],
      message: 'Trip completed successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── PUT /api/trips/:id/cancel ─────────────────────────────────────────────────

const cancel = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);

    const result = await db.queryWithUser(
      `UPDATE trips
       SET    status     = 'cancelled',
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $2
       WHERE  trip_id  = $1
         AND  user_branch_id  = $3
         AND  deleted  = FALSE
         AND  status  != 'completed'
       RETURNING trip_id, status`,
      [tripId, req.user.user_id, req.uBrId],
      req.user.user_id
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found or already completed' });
    }

    return res.json({
      success: true,
      data:    result.rows[0],
      message: 'Trip cancelled successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// ── DELETE /api/trips/:id ─────────────────────────────────────────────────────

const remove = async (req, res, next) => {
  try {
    const tripId = Number(req.params.id);

    const existing = await db.queryWithUser(
      `SELECT status FROM trips
       WHERE  trip_id = $1 AND user_branch_id = $2 AND deleted = FALSE`,
      [tripId, req.uBrId],
      req.user.user_id
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    if (String(existing.rows[0].status).toLowerCase() !== 'planned') {
      return res.status(400).json({ success: false, message: 'Only planned trips can be deleted' });
    }

    await db.queryWithUser(
      `UPDATE trips
       SET    deleted    = TRUE,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $3
       WHERE  trip_id  = $1
         AND  user_branch_id  = $2`,
      [tripId, req.uBrId, req.user.user_id],
      req.user.user_id
    );

    return res.json({ success: true, data: { trip_id: tripId }, message: 'Trip deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAll, getOne, create, update, updateStatus, assignCargo, bulkAssignCargo, complete, cancel, remove };

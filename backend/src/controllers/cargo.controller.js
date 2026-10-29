const db = require('../config/db');
const {
  cargoFinancialSQL,
  paymentStatusSql
} = require('../utils/cargoFinancials');

const queryReq = (req, sql, params) => {
  if (req.dbClient) {
    return req.dbClient.query(sql, params);
  }

  return db.queryWithUser(sql, params, req.user.user_id);
};

const withTransaction = async (req, fn) => {
  if (req.dbClient) {
    await req.dbClient.query('BEGIN');

    try {
      const result = await fn(req.dbClient);
      await req.dbClient.query('COMMIT');
      return result;
    } catch (error) {
      await req.dbClient.query('ROLLBACK');
      throw error;
    }
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await db.setUserContext(client, req.user.user_id);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    try {
      await db.clearUserContext(client);
    } catch {
      // ignore cleanup failures
    }
    client.release();
  }
};

const cargoDetailSelect = `
  c.cargo_id, c.tracking_number, c.sender_id, c.receiver_id,
  s.full_name AS sender_name, s.phone AS sender_phone,
  COALESCE(r.full_name, c.receiver_name_manual) AS receiver_name,
  COALESCE(r.phone, c.receiver_phone_manual) AS receiver_phone,
  c.receiver_name_manual, c.receiver_phone_manual,
  c.receiver_address_manual, c.receiver_city_manual, c.receiver_country_manual,
  c.from_branch_id, fb.branch_name AS from_branch_name,
  c.to_branch_id, tb.branch_name AS to_branch_name,
  c.weight, c.price, c.current_status_id, c.user_branch_id,
  c.created_at, c.updated_at, c.deleted, c.shipment_date,
  c.rate_type, c.rate_per_kg, c.extra_charges, c.paid_origin,
  c.payment_received_amount, c.fly_name, c.fly_awb_no, c.mark, c.pcs, c.description,
  c.transport_provider_id, tp.name AS transport_provider_name, tp.entity_type AS transport_provider_entity_type,
  ${cargoFinancialSQL},
  cs.status_name`;

const cargoDetailJoins = `
  FROM cargo c
  JOIN customers s ON c.sender_id = s.customer_id
  LEFT JOIN customers r ON c.receiver_id = r.customer_id
  JOIN branches fb ON c.from_branch_id = fb.branch_id
  JOIN branches tb ON c.to_branch_id = tb.branch_id
  JOIN cargo_status cs ON c.current_status_id = cs.status_id
  LEFT JOIN transport_providers tp ON tp.provider_id = c.transport_provider_id`;

const findOrCreateCustomer = async (client, fullName, phone, userBranchId) => {
  const normalizedName = String(fullName || '').trim();
  const normalizedPhone = String(phone || '').trim();

  const existingResult = await client.query(
    `SELECT customer_id
     FROM customers
     WHERE deleted = FALSE
       AND LOWER(full_name) = LOWER($1)
       AND COALESCE(phone, '') = COALESCE($2, '')
     ORDER BY customer_id DESC
     LIMIT 1`,
    [normalizedName, normalizedPhone || null]
  );

  if (existingResult.rows.length) {
    return existingResult.rows[0].customer_id;
  }

  const insertResult = await client.query(
    `INSERT INTO customers (full_name, phone, user_branch_id)
     VALUES ($1, $2, $3)
     RETURNING customer_id`,
    [normalizedName, normalizedPhone || null, userBranchId]
  );

  return insertResult.rows[0].customer_id;
};

const normalizeNumber = (value, defaultValue = 0) => {
  if (value === '' || value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const calculatePrice = (weight, ratePerKg, pcs = 1) => {
  const weightValue = normalizeNumber(weight, 0);
  const rateValue = normalizeNumber(ratePerKg, 0);
  const pcsValue = normalizeNumber(pcs, 0);

  if (!Number.isFinite(weightValue) || !Number.isFinite(rateValue) || !Number.isFinite(pcsValue)) {
    return 0;
  }

  return Number((pcsValue * weightValue * rateValue).toFixed(2));
};

const validateCargoCreate = (body) => {
  const errors = [];

  if (!body.sender_id && !body.sender_name) {
    errors.push('sender_id or sender_name is required');
  }

  if (!body.receiver_id && !body.receiver_name) {
    errors.push('receiver_id or receiver_name is required');
  }

  if (
    body.sender_id && body.receiver_id &&
    Number(body.sender_id) === Number(body.receiver_id)
  ) {
    errors.push('Sender and Receiver must be different customers');
  }

  if (!body.from_branch_id) {
    errors.push('from_branch_id is required');
  }

  if (!body.to_branch_id) {
    errors.push('to_branch_id is required');
  }

  const weight = normalizeNumber(body.weight, 0);
  if (weight <= 0) {
    errors.push('weight must be a positive number');
  }

  const pcs = normalizeNumber(body.pcs, 1);
  if (pcs <= 0 || !Number.isInteger(pcs)) {
    errors.push('pcs must be a positive integer');
  }

  const ratePerKg = normalizeNumber(body.rate_per_kg, 0);
  if (ratePerKg < 0) {
    errors.push('rate_per_kg must be a non-negative number');
  }

  const extraCharges = normalizeNumber(body.extra_charges, 0);
  if (extraCharges < 0) {
    errors.push('extra_charges must be a non-negative number');
  }

  const paymentReceivedAmount = normalizeNumber(body.payment_received_amount, 0);
  if (paymentReceivedAmount < 0) {
    errors.push('payment_received_amount must be a non-negative number');
  }

  return errors;
};

const getAll = async (req, res, next) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const values = [];
    const filters = ['c.deleted = FALSE'];

    // Only filter by branch if not requesting system-wide data.
    // A branch needs both outgoing and incoming shipments for day-to-day operations.
    if (!req.query.system_wide) {
      values.push(req.branchId);
      filters.push('(c.from_branch_id = $1 OR c.to_branch_id = $1)');
    }

    filters.push('s.deleted = FALSE', '(r.customer_id IS NULL OR r.deleted = FALSE)');

    if (req.query.status) {
      values.push(req.query.status);
      filters.push(`cs.status_name = $${values.length}`);
    }

    if (req.query.from_branch_id) {
      values.push(Number(req.query.from_branch_id));
      filters.push(`c.from_branch_id = $${values.length}`);
    }

    if (req.query.to_branch_id) {
      values.push(Number(req.query.to_branch_id));
      filters.push(`c.to_branch_id = $${values.length}`);
    }

    if (req.query.transport_provider_id) {
      values.push(Number(req.query.transport_provider_id));
      filters.push(`c.transport_provider_id = $${values.length}`);
    }

    if (req.query.branch) {
      values.push(Number(req.query.branch));
      filters.push(`(c.from_branch_id = $${values.length} OR c.to_branch_id = $${values.length})`);
    }

    if (req.query.date_from) {
      values.push(req.query.date_from);
      filters.push(`DATE(COALESCE(c.shipment_date, c.created_at)) >= $${values.length}`);
    }

    if (req.query.date_to) {
      values.push(req.query.date_to);
      filters.push(`DATE(COALESCE(c.shipment_date, c.created_at)) <= $${values.length}`);
    }

    if (req.query.tracking_number) {
      values.push(`%${String(req.query.tracking_number).trim()}%`);
      filters.push(`c.tracking_number ILIKE $${values.length}`);
    }

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(
        c.tracking_number ILIKE $${values.length}
        OR s.full_name ILIKE $${values.length}
        OR COALESCE(r.full_name, c.receiver_name_manual) ILIKE $${values.length}
        OR COALESCE(s.phone, '') ILIKE $${values.length}
        OR COALESCE(r.phone, c.receiver_phone_manual, '') ILIKE $${values.length}
      )`);
    }

    if (req.query.payment_status) {
      const normalizedPaymentStatus = String(req.query.payment_status).trim().toLowerCase();
      const statusMap = {
        paid: 'Paid',
        partial: 'Partial',
        balance_remaining: 'Balance remaining',
        balance: 'Balance remaining',
        unpaid: 'Balance remaining',
        pending: 'Balance remaining'
      };
      const mappedStatus = statusMap[normalizedPaymentStatus];

      if (mappedStatus) {
        values.push(mappedStatus);
        filters.push(`(${paymentStatusSql}) = $${values.length}`);
      }
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const fromClause = `
      FROM cargo c
      JOIN customers s ON c.sender_id = s.customer_id
      LEFT JOIN customers r ON c.receiver_id = r.customer_id
      JOIN branches fb ON c.from_branch_id = fb.branch_id
      JOIN branches tb ON c.to_branch_id = tb.branch_id
      JOIN cargo_status cs ON cs.status_id = c.current_status_id
      LEFT JOIN transport_providers tp ON tp.provider_id = c.transport_provider_id
      ${whereClause}
    `;
    const countResult = await queryReq(
      req,
      `SELECT COUNT(*) AS total ${fromClause}`,
      values
    );

    values.push(limit, offset);
    const result = await queryReq(
      req,
      `SELECT c.cargo_id, c.tracking_number, c.sender_id, c.receiver_id,
              s.full_name AS sender,
              COALESCE(r.full_name, c.receiver_name_manual) AS receiver,
              s.full_name AS sender_name, s.phone AS sender_phone,
              COALESCE(r.full_name, c.receiver_name_manual) AS receiver_name,
              COALESCE(r.phone, c.receiver_phone_manual) AS receiver_phone,
              c.receiver_name_manual, c.receiver_phone_manual,
              c.receiver_address_manual, c.receiver_city_manual, c.receiver_country_manual,
              c.from_branch_id, fb.branch_name AS from_branch_name,
              c.to_branch_id, tb.branch_name AS to_branch_name,
              c.weight, c.price, c.current_status_id, c.user_branch_id,
              c.created_at, c.updated_at, c.deleted, c.shipment_date,
              c.rate_type, c.rate_per_kg, c.extra_charges, c.paid_origin,
              c.payment_received_amount, c.fly_name, c.fly_awb_no, c.mark, c.pcs, c.description,
              c.transport_provider_id, tp.name AS transport_provider_name,
              ${cargoFinancialSQL},
              cs.status_name
       ${fromClause}
       ORDER BY COALESCE(c.shipment_date, c.created_at) DESC, c.cargo_id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      success: true,
      data: result.rows,
      meta: {
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

const getOne = async (req, res, next) => {
  try {
    const result = await queryReq(
      req,
      `SELECT ${cargoDetailSelect}
       ${cargoDetailJoins}
       WHERE c.cargo_id = $1
         AND (c.from_branch_id = $2 OR c.to_branch_id = $2)
         AND c.deleted = FALSE`,
      [Number(req.params.id), req.branchId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Cargo retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const validationErrors = validateCargoCreate(req.body);
    if (validationErrors.length) {
      console.error('Cargo create validation failed', {
        userId: req.user?.user_id,
        branchId: req.branchId,
        errors: validationErrors,
        body: req.body
      });

      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    let trackingNo = req.body.tracking_number;
    const {
      sender_id,
      receiver_id,
      sender_name,
      sender_phone,
      receiver_name,
      receiver_phone,
      receiver_address,
      receiver_city,
      receiver_country,
      from_branch_id,
      to_branch_id,
      weight,
      shipment_date,
      items = [],
      rate_type,
      rate_per_kg,
      extra_charges,
      paid_origin,
      payment_received_amount,
      fly_name,
      fly_awb_no,
      mark,
      pcs,
      description,
      transport_provider_id
    } = req.body;

    const normalizedWeight = normalizeNumber(weight, 0);
    const normalizedRatePerKg = normalizeNumber(rate_per_kg, 0);
    const normalizedPcs = normalizeNumber(pcs, 1);
    const normalizedExtraCharges = normalizeNumber(extra_charges, 0);
    const normalizedPaidOrigin = normalizeNumber(paid_origin, 0);
    const normalizedPaymentReceivedAmount = normalizeNumber(payment_received_amount, 0);

    const computedPrice = calculatePrice(normalizedWeight, normalizedRatePerKg, normalizedPcs);

    const isAdmin = Number(req.user?.role_id ?? req.user?.role) === 1;
    if (!isAdmin && Number(from_branch_id) !== Number(req.branchId)) {
      return res.status(403).json({
        success: false,
        message: 'Cargo must be created from your active branch (from_branch_id)'
      });
    }

    const cargoId = await withTransaction(req, async (client) => {
      // Resolve sender (always a customer)
      const resolvedSenderId = sender_id
        || await findOrCreateCustomer(client, sender_name, sender_phone, req.uBrId);

      // Resolve receiver — can be an existing customer OR manual entry
      let resolvedReceiverId = receiver_id ? Number(receiver_id) : null;
      let manualReceiverName = null;
      let manualReceiverPhone = null;
      let manualReceiverAddress = null;
      let manualReceiverCity = null;
      let manualReceiverCountry = null;

      if (!resolvedReceiverId) {
        // Store manual receiver fields; do NOT create a customer record
        manualReceiverName = String(receiver_name || '').trim() || null;
        manualReceiverPhone = String(receiver_phone || '').trim() || null;
        manualReceiverAddress = String(receiver_address || '').trim() || null;
        manualReceiverCity = String(receiver_city || '').trim() || null;
        manualReceiverCountry = String(receiver_country || '').trim() || null;
      }

      // Prevent sender === receiver when both are customers
      if (resolvedReceiverId && Number(resolvedSenderId) === resolvedReceiverId) {
        const err = new Error('Sender and Receiver must be different customers');
        err.statusCode = 422;
        throw err;
      }

      // If no tracking_number supplied, DB DEFAULT will generate it automatically

      const normalizedItems = items.length
        ? items
        : [
            {
              item_name: mark || description || 'Cargo',
              quantity: normalizedPcs,
              weight: normalizedWeight
            }
          ];

      const statusRow = await client.query(
        `SELECT status_id FROM cargo_status WHERE status_name = 'Pending' LIMIT 1`
      );
      const defaultStatusId = statusRow.rows[0].status_id;

      const hasTracking = Boolean(trackingNo);
      const insertResult = await client.query(
        hasTracking
          ? `INSERT INTO cargo
               (sender_id, receiver_id, receiver_name_manual, receiver_phone_manual,
                receiver_address_manual, receiver_city_manual, receiver_country_manual,
                from_branch_id, to_branch_id, weight, price,
                user_branch_id, tracking_number, description, pcs, shipment_date,
                current_status_id, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
             RETURNING cargo_id, tracking_number`
          : `INSERT INTO cargo
               (sender_id, receiver_id, receiver_name_manual, receiver_phone_manual,
                receiver_address_manual, receiver_city_manual, receiver_country_manual,
                from_branch_id, to_branch_id, weight, price,
                user_branch_id, description, pcs, shipment_date,
                current_status_id, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
             RETURNING cargo_id, tracking_number`,
        hasTracking
          ? [resolvedSenderId, resolvedReceiverId, manualReceiverName, manualReceiverPhone,
             manualReceiverAddress, manualReceiverCity, manualReceiverCountry,
             from_branch_id, to_branch_id, normalizedWeight, computedPrice,
             req.uBrId, trackingNo, description || null, normalizedPcs, shipment_date || null,
             defaultStatusId, req.user.user_id]
          : [resolvedSenderId, resolvedReceiverId, manualReceiverName, manualReceiverPhone,
             manualReceiverAddress, manualReceiverCity, manualReceiverCountry,
             from_branch_id, to_branch_id, normalizedWeight, computedPrice,
             req.uBrId, description || null, normalizedPcs, shipment_date || null,
             defaultStatusId, req.user.user_id]
      );
      const newCargoId = insertResult.rows[0].cargo_id;

      for (const item of normalizedItems) {
        await client.query(
          `INSERT INTO cargo_items (cargo_id, item_name, quantity, weight, user_branch_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [newCargoId, item.item_name || 'Cargo', item.quantity || 1, item.weight || normalizedWeight, req.uBrId]
        );
      }

      await client.query(
        `INSERT INTO cargo_tracking (cargo_id, status_id, branch_id, location, note, updated_by)
         VALUES ($1, $2, $3, NULL, NULL, $4)
         ON CONFLICT (cargo_id) DO UPDATE
           SET status_id   = EXCLUDED.status_id,
               branch_id   = EXCLUDED.branch_id,
               updated_by  = EXCLUDED.updated_by,
               update_time = CURRENT_TIMESTAMP`,
        [newCargoId, defaultStatusId, Number(from_branch_id), req.user.user_id]
      );

      await client.query(
        `UPDATE cargo
         SET shipment_date = COALESCE($1, shipment_date),
             rate_type = COALESCE($2, rate_type),
             rate_per_kg = COALESCE($3, rate_per_kg),
             extra_charges = COALESCE($4, extra_charges),
             paid_origin = COALESCE($5, paid_origin),
             payment_received_amount = COALESCE($6, payment_received_amount),
             fly_name = COALESCE($7, fly_name),
             fly_awb_no = COALESCE($8, fly_awb_no),
             mark = COALESCE($9, mark),
             pcs = COALESCE($10, pcs),
             description = COALESCE($11, description),
             transport_provider_id = COALESCE($12, transport_provider_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE cargo_id = $13
           AND deleted = FALSE`,
        [
          shipment_date || null,
          rate_type || null,
          normalizedRatePerKg ?? null,
          normalizedExtraCharges,
          normalizedPaidOrigin,
          normalizedPaymentReceivedAmount,
          fly_name || null,
          fly_awb_no || null,
          mark || null,
          normalizedPcs,
          description || null,
          transport_provider_id || null,
          newCargoId
        ]
      );

      return newCargoId;
    });

    const freshResult = await queryReq(
      req,
      `SELECT ${cargoDetailSelect}
       ${cargoDetailJoins}
       WHERE c.cargo_id = $1
         AND (c.from_branch_id = $2 OR c.to_branch_id = $2)
         AND c.deleted = FALSE
       LIMIT 1`,
      [cargoId, req.branchId]
    );

    return res.status(201).json({
      success: true,
      data: freshResult.rows[0],
      message: 'Cargo created successfully'
    });
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);

    await withTransaction(req, async (client) => {
      const accessResult = await client.query(
        `SELECT cargo_id
         FROM cargo
         WHERE cargo_id = $1
           AND (from_branch_id = $2 OR to_branch_id = $2)
           AND deleted = FALSE`,
        [cargoId, req.branchId]
      );

      if (!accessResult.rows.length) {
        const notFound = new Error('Cargo not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      await client.query(
        `UPDATE cargo
         SET shipment_date = COALESCE($1, shipment_date),
             rate_type = COALESCE($2, rate_type),
             rate_per_kg = COALESCE($3, rate_per_kg),
             extra_charges = COALESCE($4, extra_charges),
             paid_origin = COALESCE($5, paid_origin),
             payment_received_amount = COALESCE($6, payment_received_amount),
             fly_name = COALESCE($7, fly_name),
             fly_awb_no = COALESCE($8, fly_awb_no),
             mark = COALESCE($9, mark),
             pcs = COALESCE($10, pcs),
             description = COALESCE($11, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE cargo_id = $12
           AND deleted = FALSE`,
        [
          req.body.shipment_date ?? null,
          req.body.rate_type ?? null,
          req.body.rate_per_kg ?? null,
          req.body.extra_charges ?? null,
          req.body.paid_origin ?? null,
          req.body.payment_received_amount ?? null,
          req.body.fly_name ?? null,
          req.body.fly_awb_no ?? null,
          req.body.mark ?? null,
          req.body.pcs ?? null,
          req.body.description ?? null,
          cargoId
        ]
      );

      const statusLookup = await client.query(
        'SELECT status_id FROM cargo_status WHERE status_name = $1 LIMIT 1',
        [req.body.status_name]
      );
      if (!statusLookup.rows.length) {
        const e = new Error(`Unknown status: ${req.body.status_name}`);
        e.statusCode = 400;
        throw e;
      }
      const newStatusId = statusLookup.rows[0].status_id;

      await client.query(
        `UPDATE cargo SET current_status_id = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
         WHERE cargo_id = $3 AND deleted = FALSE`,
        [newStatusId, req.user.user_id, cargoId]
      );

      await client.query(
        `INSERT INTO cargo_history (cargo_id, status_id, user_branch_id, note)
         VALUES ($1, $2, $3, $4)`,
        [cargoId, newStatusId, req.uBrId, req.body.note || null]
      );

      await client.query(
        `INSERT INTO cargo_tracking (cargo_id, status_id, branch_id, location, note, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cargo_id) DO UPDATE
           SET status_id   = EXCLUDED.status_id,
               branch_id   = EXCLUDED.branch_id,
               location    = EXCLUDED.location,
               note        = EXCLUDED.note,
               updated_by  = EXCLUDED.updated_by,
               update_time = CURRENT_TIMESTAMP`,
        [cargoId, newStatusId, req.body.branch_id || req.branchId, req.body.location || null, req.body.note || null, req.user.user_id]
      );
    });

    const freshResult = await queryReq(
      req,
      `SELECT ${cargoDetailSelect}
       ${cargoDetailJoins}
       WHERE c.cargo_id = $1
         AND (c.from_branch_id = $2 OR c.to_branch_id = $2)
         AND c.deleted = FALSE
       LIMIT 1`,
      [cargoId, req.branchId]
    );

    if (!freshResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    return res.json({
      success: true,
      data: freshResult.rows[0],
      message: 'Cargo status updated successfully'
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const accessResult = await queryReq(
      req,
      `SELECT cargo_id
       FROM cargo
       WHERE cargo_id = $1
         AND from_branch_id = $2
         AND deleted = FALSE`,
      [Number(req.params.id), req.branchId]
    );

    if (!accessResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    await queryReq(
      req,
      `UPDATE cargo
       SET deleted    = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $2
       WHERE cargo_id = $1 AND deleted = FALSE`,
      [Number(req.params.id), req.user.user_id]
    );

    return res.json({ success: true, data: { cargo_id: Number(req.params.id) }, message: 'Cargo deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

const trackByNumber = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ct.track_id, ct.cargo_id, ct.status_id, ct.branch_id, ct.location, ct.note, ct.update_time,
              c.tracking_number, c.from_branch_id, c.to_branch_id, c.weight, c.shipment_date, c.fly_name, c.description,
              cs.status_name, b.branch_name
       FROM cargo_tracking ct
       JOIN cargo_status cs ON ct.status_id = cs.status_id
       JOIN branches b ON ct.branch_id = b.branch_id
       JOIN cargo c ON ct.cargo_id = c.cargo_id
       WHERE c.tracking_number = $1
         AND c.deleted = FALSE`,
      [req.params.tracking_number]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Cargo tracking retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const getTimeline = async (req, res, next) => {
  try {
    const accessResult = await queryReq(
      req,
      `SELECT cargo_id
       FROM cargo
       WHERE cargo_id = $1
         AND (from_branch_id = $2 OR to_branch_id = $2)
         AND deleted = FALSE`,
      [Number(req.params.id), req.branchId]
    );

    if (!accessResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const result = await queryReq(
      req,
      `SELECT cs.status_name,
              ch.created_at AS update_time,
              ch.note,
              ub.branch_id AS branch_id,
              b.branch_name,
              COALESCE(ct.location, b.branch_name) AS location
       FROM cargo_history ch
       JOIN cargo_status cs ON ch.status_id = cs.status_id
       LEFT JOIN user_branches ub ON ch.user_branch_id = ub.user_branch_id
       LEFT JOIN branches b ON ub.branch_id = b.branch_id
       LEFT JOIN cargo_tracking ct ON ct.cargo_id = ch.cargo_id AND ct.status_id = ch.status_id
       WHERE ch.cargo_id = $1
       ORDER BY ch.created_at DESC`,
      [Number(req.params.id)]
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo timeline retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

const getItems = async (req, res, next) => {
  try {
    const accessResult = await queryReq(
      req,
      `SELECT cargo_id
       FROM cargo
       WHERE cargo_id = $1
         AND (from_branch_id = $2 OR to_branch_id = $2)
         AND deleted = FALSE`,
      [Number(req.params.id), req.branchId]
    );

    if (!accessResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const result = await queryReq(
      req,
      'SELECT * FROM cargo_items WHERE cargo_id = $1 AND deleted = FALSE',
      [Number(req.params.id)]
    );

    return res.json({ success: true, data: result.rows, message: 'Cargo items retrieved successfully' });
  } catch (error) {
    return next(error);
  }
};

// Update editable cargo fields (tracking_number, dates, flight, weights, charges, etc.)
const update = async (req, res, next) => {
  try {
    const cargoId = Number(req.params.id);
    const {
      tracking_number, shipment_date, fly_name, fly_awb_no,
      weight, rate_per_kg, extra_charges, payment_received_amount,
      pcs, description, mark, rate_type, transport_provider_id
    } = req.body;

    const normalizedWeight   = weight != null   ? normalizeNumber(weight, null)   : undefined;
    const normalizedRate     = rate_per_kg != null ? normalizeNumber(rate_per_kg, null) : undefined;
    const normalizedPcs      = pcs != null       ? normalizeNumber(pcs, null)       : undefined;
    const normalizedExtra    = extra_charges != null ? normalizeNumber(extra_charges, null) : undefined;
    const normalizedReceived = payment_received_amount != null ? normalizeNumber(payment_received_amount, null) : undefined;

    // Recompute price if weight or rate changed
    let computedPrice;
    if (normalizedWeight !== undefined || normalizedRate !== undefined) {
      const existingResult = await queryReq(req,
        'SELECT weight, rate_per_kg, pcs FROM cargo WHERE cargo_id = $1 AND deleted = FALSE',
        [cargoId]
      );
      if (!existingResult.rows.length) return res.status(404).json({ success: false, message: 'Cargo not found' });
      const ex = existingResult.rows[0];
      const w = normalizedWeight ?? Number(ex.weight);
      const r = normalizedRate   ?? Number(ex.rate_per_kg);
      const p = normalizedPcs    ?? Number(ex.pcs);
      computedPrice = calculatePrice(w, r, p);
    }

    const result = await queryReq(
      req,
      `UPDATE cargo SET
         tracking_number             = COALESCE($1,  tracking_number),
         shipment_date           = COALESCE($2,  shipment_date),
         fly_name                = COALESCE($3,  fly_name),
         fly_awb_no              = COALESCE($4,  fly_awb_no),
         weight                  = COALESCE($5,  weight),
         rate_per_kg             = COALESCE($6,  rate_per_kg),
         price                   = COALESCE($7,  price),
         extra_charges           = COALESCE($8,  extra_charges),
         payment_received_amount = COALESCE($9,  payment_received_amount),
         pcs                     = COALESCE($10, pcs),
         description             = COALESCE($11, description),
         mark                    = COALESCE($12, mark),
         rate_type               = COALESCE($13, rate_type),
         transport_provider_id   = COALESCE($14, transport_provider_id),
         updated_at              = CURRENT_TIMESTAMP,
         updated_by              = $15
       WHERE cargo_id = $16
         AND (from_branch_id = $17 OR to_branch_id = $17)
         AND deleted = FALSE
       RETURNING cargo_id`,
      [
        tracking_number        || null,
        shipment_date      || null,
        fly_name           || null,
        fly_awb_no         || null,
        normalizedWeight   ?? null,
        normalizedRate     ?? null,
        computedPrice      ?? null,
        normalizedExtra    ?? null,
        normalizedReceived ?? null,
        normalizedPcs      ?? null,
        description        || null,
        mark               || null,
        rate_type          || null,
        transport_provider_id || null,
        req.user.user_id,
        cargoId,
        req.branchId
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Cargo not found' });
    }

    const freshResult = await queryReq(
      req,
      `SELECT ${cargoDetailSelect} ${cargoDetailJoins}
       WHERE c.cargo_id = $1 AND (c.from_branch_id = $2 OR c.to_branch_id = $2) AND c.deleted = FALSE LIMIT 1`,
      [cargoId, req.branchId]
    );

    return res.json({ success: true, data: freshResult.rows[0], message: 'Cargo updated successfully' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  updateStatus,
  remove,
  trackByNumber,
  getTimeline,
  getItems
};

const Joi = require('joi');

const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;  // HH:MM or HH:MM:SS

// Use string().isoDate() to keep departure_date as a string (avoid Joi coercing it
// to a Date object which can confuse .or() peer-presence checks in Joi 17).
const createSchema = Joi.object({
  // Route: either a direct route_id OR a from+to branch pair
  route_id:              Joi.number().integer().positive().optional(),
  from_branch_id:        Joi.number().integer().positive().optional(),
  to_branch_id:          Joi.number().integer().positive().optional(),

  // Provider: accept both field name variants
  provider_id:           Joi.number().integer().positive().optional(),
  transport_provider_id: Joi.number().integer().positive().optional(),

  // Date: accept both field name variants, keep as string
  trip_date:             Joi.string().isoDate().optional(),
  departure_date:        Joi.string().isoDate().optional(),

  // Times
  departure_time:        Joi.string().pattern(timePattern).default('08:00'),
  arrival_time:          Joi.string().pattern(timePattern).default('18:00'),

  notes: Joi.string().trim().max(500).allow('', null).optional(),
})
  // At least one provider field must be present
  .or('provider_id', 'transport_provider_id')
  // At least one date field must be present
  .or('trip_date', 'departure_date')
  // Route: either route_id alone, or BOTH branch IDs
  .custom((value, helpers) => {
    const hasRoute    = Boolean(value.route_id);
    const hasFrom     = Boolean(value.from_branch_id);
    const hasTo       = Boolean(value.to_branch_id);
    const hasBranches = hasFrom && hasTo;

    if (!hasRoute && !hasBranches) {
      return helpers.error('any.custom', {
        message: 'Provide either route_id or both from_branch_id and to_branch_id'
      });
    }

    if (hasBranches && !hasRoute) {
      if (value.from_branch_id === value.to_branch_id) {
        return helpers.error('any.custom', {
          message: 'Origin and Destination branches must be different'
        });
      }
    }

    return value;
  })
  .messages({
    'any.custom': '{{#message}}',
    'object.missing': 'At least one of {{#peers}} is required',
  });

const updateSchema = Joi.object({
  route_id:              Joi.number().integer().positive().optional(),
  from_branch_id:        Joi.number().integer().positive().optional(),
  to_branch_id:          Joi.number().integer().positive().optional(),
  provider_id:           Joi.number().integer().positive().optional(),
  transport_provider_id: Joi.number().integer().positive().optional(),
  trip_date:             Joi.string().isoDate().optional(),
  departure_date:        Joi.string().isoDate().optional(),
  departure_time:        Joi.string().pattern(timePattern).optional(),
  arrival_time:          Joi.string().pattern(timePattern).optional(),
  notes:                 Joi.string().trim().max(500).allow('', null).optional(),
}).min(1);

const assignCargoSchema = Joi.object({
  cargo_id:       Joi.number().integer().required(),
  transport_cost: Joi.number().positive().required()
});

const bulkAssignSchema = Joi.object({
  cargo_ids:      Joi.array().items(Joi.number().integer()).min(1).required(),
  transport_cost: Joi.number().positive().default(1)
});

const assignCargoIdsSchema = Joi.object({
  cargo_ids:      Joi.array().items(Joi.number().integer()).min(1).required(),
  transport_cost: Joi.number().positive().default(1)
});

const updateStatusSchema = Joi.object({
  status_name: Joi.string().trim().required()
});

module.exports = {
  createSchema,
  updateSchema,
  assignCargoSchema,
  bulkAssignSchema,
  assignCargoIdsSchema,
  updateStatusSchema
};

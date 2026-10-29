const Joi = require('joi');

const createSchema = Joi.object({
  full_name: Joi.string().trim().min(2).required(),
  phone: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).required(),
  address_id: Joi.number().integer().positive().optional()
});

const updateSchema = Joi.object({
  full_name: Joi.string().trim().min(2).optional(),
  phone: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).optional(),
  address_id: Joi.number().integer().positive().optional()
});

module.exports = {
  createSchema,
  updateSchema
};

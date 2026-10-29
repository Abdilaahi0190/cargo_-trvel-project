const Joi = require('joi');

const createSchema = Joi.object({
  name: Joi.string().trim().required(),
  city_id: Joi.number().integer().optional(),
  address: Joi.string().trim().required(),
  postal_code: Joi.string().trim().optional()
});

const updateSchema = Joi.object({
  name: Joi.string().trim().optional(),
  city_id: Joi.number().integer().optional(),
  address: Joi.string().trim().optional(),
  postal_code: Joi.string().trim().optional(),
  state: Joi.string().optional()
});

module.exports = {
  createSchema,
  updateSchema
};
const Joi = require('joi');

const createSchema = Joi.object({
  first_name: Joi.string().trim().required(),
  last_name: Joi.string().trim().required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().trim().optional(),
  position: Joi.string().trim().optional(),
  schedule: Joi.string().trim().optional()
});

const updateSchema = Joi.object({
  first_name: Joi.string().trim().optional(),
  last_name: Joi.string().trim().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().trim().optional(),
  position: Joi.string().trim().optional(),
  schedule: Joi.string().trim().optional()
});

module.exports = {
  createSchema,
  updateSchema
};
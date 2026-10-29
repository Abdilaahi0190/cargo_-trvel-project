const Joi = require('joi');

const generateSchema = Joi.object({
  month_year: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
});

const paySchema = Joi.object({
  amount:      Joi.number().positive().required(),
  account_id:  Joi.number().integer().required(),
  description: Joi.string().trim().optional()
});

const adjustmentSchema = Joi.object({
  employee_branch_id: Joi.number().integer().positive().required(),
  month:              Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  overtime_hours:     Joi.number().min(0).default(0),
  overtime_rate:      Joi.number().min(0).default(0),
  bonus:              Joi.number().min(0).default(0),
  penalty:            Joi.number().min(0).default(0),
  notes:              Joi.string().trim().allow('', null).optional()
});

module.exports = { generateSchema, paySchema, adjustmentSchema };

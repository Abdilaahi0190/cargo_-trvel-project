const Joi = require('joi');

const createSchema = Joi.object({
  expense_type_id: Joi.number().integer(),
  expense_type_id: Joi.number().integer(),
  amount: Joi.number().positive().required(),
  charge_month: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: Joi.string().trim().optional(),
  user_branch_id: Joi.number().integer().optional(),
  trip_id: Joi.number().integer().positive().optional().allow(null, ''),
  transport_provider_id: Joi.number().integer().positive().optional().allow(null, ''),
  cargo_id: Joi.number().integer().positive().optional().allow(null, '')
}).or('expense_type_id', 'expense_type_id');

const expensePaymentSchema = Joi.object({
  expense_charge_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  account_id: Joi.number().integer().required(),
  payment_type: Joi.string().trim().optional(),
  description: Joi.string().trim().optional()
});

const paySchema = Joi.object({
  amount: Joi.number().positive().required(),
  account_id: Joi.number().integer().required(),
  description: Joi.string().trim().optional()
});

module.exports = {
  createSchema,
  paySchema,
  expensePaymentSchema
};

const Joi = require('joi');


const transferSchema = Joi.object({
  from_acc: Joi.number().integer(),
  from_account_id: Joi.number().integer(),
  to_acc: Joi.number().integer(),
  to_account_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  reasons: Joi.string().trim().optional(),
  notes: Joi.string().trim().optional()
}).or('from_acc', 'from_account_id')
  .or('to_acc', 'to_account_id');

const movementSchema = Joi.object({
  amount: Joi.number().positive().required(),
  notes: Joi.string().trim().optional(),
  description: Joi.string().trim().optional()
});

const createAccountSchema = Joi.object({
  name: Joi.string().trim(),
  account_name: Joi.string().trim(),
  institution_type: Joi.string().trim().optional(),
  currency: Joi.string().trim().optional(),
  initial_balance: Joi.number().min(0).default(0),
  branch_id: Joi.number().integer().required()
}).or('name', 'account_name');

module.exports = {
  createSchema: createAccountSchema,
  transferSchema,
  movementSchema
};

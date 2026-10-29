const Joi = require('joi');

const createSchema = Joi.object({
  cargo_id: Joi.number().integer().required(),
  account_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  payment_type: Joi.string().valid('cash', 'bank', 'mobile').required()
});

module.exports = {
  createSchema
};

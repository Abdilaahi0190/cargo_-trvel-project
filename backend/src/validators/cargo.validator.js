const Joi = require('joi');

const cargoItemSchema = Joi.object({
  item_name: Joi.string().trim().required(),
  quantity: Joi.number().integer().min(1).required(),
  weight: Joi.number().positive().required()
});

const createSchema = Joi.object({
  sender_id: Joi.number().integer().required(),
  receiver_id: Joi.number().integer().required(),
  from_branch_id: Joi.number().integer().required(),
  to_branch_id: Joi.number().integer().required().custom((value, helpers) => {
    if (value === helpers.state.ancestors[0].from_branch_id) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'Different branch validation'),
  weight: Joi.number().positive().required(),
  price: Joi.number().min(0).required(),
  items: Joi.array().items(cargoItemSchema).optional()
}).messages({
  'any.invalid': 'to_branch_id must be different from from_branch_id'
});

const updateStatusSchema = Joi.object({
  status_name: Joi.string().trim().required(),
  branch_id: Joi.number().integer().optional(),
  location: Joi.string().trim().optional(),
  note: Joi.string().trim().optional()
});

module.exports = {
  createSchema,
  updateStatusSchema
};

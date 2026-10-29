const Joi = require('joi');

const loginSchema = Joi.object({
  username: Joi.string().trim().required(),
  password: Joi.string().min(6).required()
});

module.exports = {
  loginSchema
};

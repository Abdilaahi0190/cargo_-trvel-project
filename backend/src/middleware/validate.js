const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly:    false,
    stripUnknown:  true,
    convert:       true,
  });

  if (error) {
    // Build a field-keyed errors map for the client
    const errors = {};
    error.details.forEach((detail) => {
      const field = detail.path.length ? detail.path.join('.') : 'body';
      errors[field] = detail.message.replace(/['"]/g, '');
    });

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body = value;
  return next();
};

module.exports = validate;

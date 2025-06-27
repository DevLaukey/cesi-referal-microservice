const Joi = require("joi");

const validateReferral = (data) => {
  const schema = Joi.object({
    referral_code: Joi.string().max(20).required(),
    referee_id: Joi.string().uuid().required(),
    referee_type: Joi.string()
      .valid("customer", "driver", "restaurant")
      .required(),
  });

  return schema.validate(data);
};

const validateReferralCode = (data) => {
  const schema = Joi.object({
    code: Joi.string().max(20).optional(),
    max_usage: Joi.number().integer().min(1).max(1000).default(50),
    bonus_amount: Joi.number().positive().precision(2).optional(),
    bonus_type: Joi.string()
      .valid("cash", "credit", "percentage")
      .default("credit"),
    minimum_order_amount: Joi.number().min(0).precision(2).default(0),
    expiry_date: Joi.date().greater("now").optional(),
    campaign_id: Joi.string().uuid().optional(),
    allow_multiple: Joi.boolean().default(false),
  });

  return schema.validate(data);
};

const validateCampaign = (data) => {
  const schema = Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().max(1000).optional(),
    campaign_type: Joi.string()
      .valid("referral", "milestone", "seasonal", "promotional")
      .required(),
    target_audience: Joi.string()
      .valid("customer", "driver", "restaurant", "all")
      .default("all"),
    bonus_amount: Joi.number().positive().precision(2).required(),
    bonus_type: Joi.string()
      .valid("cash", "credit", "percentage")
      .default("credit"),
    minimum_requirement: Joi.number().min(0).precision(2).default(0),
    max_participants: Joi.number().integer().positive().optional(),
    start_date: Joi.date().required(),
    end_date: Joi.date().greater(Joi.ref("start_date")).required(),
    terms_conditions: Joi.string().max(2000).optional(),
  });

  return schema.validate(data);
};

module.exports = {
  validateReferral,
  validateReferralCode,
  validateCampaign,
};

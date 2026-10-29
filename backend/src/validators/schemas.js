const Joi = require('joi');

const CARGO_STATUS_NAMES = ['Pending', 'Picked Up', 'In Transit', 'Arrived', 'Out for Delivery', 'On Hold', 'Delivered', 'Returned', 'Cancelled'];

const login = Joi.object({
  username: Joi.string().trim().required(),
  password: Joi.string().trim().required()
});

const createCargo = Joi.object({
  tracking_number: Joi.string().trim().optional().empty(''),
  shipment_date: Joi.date().optional().empty(''),
  sender_id: Joi.number().integer().optional().empty(''),
  receiver_id: Joi.number().integer().optional().empty(''),
  sender_name: Joi.string().trim().when('sender_id', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
  sender_phone: Joi.string().trim().allow('').optional(),
  receiver_name: Joi.string().trim().when('receiver_id', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
  receiver_phone: Joi.string().trim().allow('').optional(),
  from_branch_id: Joi.number().integer().required().empty(''),
  to_branch_id: Joi.number().integer().required().empty(''),
  weight: Joi.number().positive().required().empty(''),
  price: Joi.number().min(0).optional().empty(''),
  rate_type: Joi.string().valid('F020F', 'WAAFI', 'KQ').optional(),
  rate_per_kg: Joi.number().min(0).optional().empty(''),
  extra_charges: Joi.number().min(0).optional().empty(''),
  paid_origin: Joi.number().min(0).optional().empty(''),
  payment_received_amount: Joi.number().min(0).optional().empty(''),
  fly_awb_no: Joi.string().optional(),
  fly_name: Joi.string().trim().allow('').optional(),
  mark: Joi.string().allow('').optional(),
  pcs: Joi.number().integer().min(1).optional(),
  description: Joi.string().trim().allow('').optional(),
  transport_provider_id: Joi.number().integer().positive().optional().empty(''),
  user_branch_id: Joi.number().integer().required(),
  branch_id: Joi.number().integer().optional(),
  items: Joi.array().items(
    Joi.object({
      item_name: Joi.string().trim().required(),
      quantity: Joi.number().integer().min(1).required(),
      weight: Joi.number().positive().required()
    })
  ).optional()
});

const updateCargoStatus = Joi.object({
  status_name: Joi.string().valid(...CARGO_STATUS_NAMES).required(),
  branch_id: Joi.number().integer().required(),
  user_branch_id: Joi.number().integer().required(),
  location: Joi.string().trim().optional(),
  note: Joi.string().trim().optional(),
  shipment_date: Joi.date().optional(),
  rate_type: Joi.string().valid('F020F', 'WAAFI', 'KQ').optional(),
  rate_per_kg: Joi.number().min(0).optional(),
  extra_charges: Joi.number().min(0).optional(),
  paid_origin: Joi.number().min(0).optional(),
  payment_received_amount: Joi.number().min(0).optional(),
  fly_awb_no: Joi.string().optional(),
  fly_name: Joi.string().trim().allow('').optional(),
  mark: Joi.string().allow('').optional(),
  pcs: Joi.number().integer().min(1).optional(),
  description: Joi.string().trim().allow('').optional()
});

const CUSTOMER_TYPES = ['regular', 'one_time', 'vip'];

const createCustomer = Joi.object({
  full_name: Joi.string().trim().required(),
  phone: Joi.string().trim().required(),
  address_id: Joi.number().integer().optional(),
  customer_type: Joi.string().valid(...CUSTOMER_TYPES).optional().default('regular'),
  user_branch_id: Joi.number().integer().required()
});

const processPayment = Joi.object({
  cargo_id: Joi.number().integer().required(),
  account_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  payment_type: Joi.string().valid('cash', 'bank', 'mobile').required(),
  user_branch_id: Joi.number().integer().required()
});

const createEmployee = Joi.object({
  full_name: Joi.string().trim().required(),
  phone: Joi.string().trim().optional(),
  email: Joi.string().email().optional(),
  job_id: Joi.number().integer().required(),
  amount: Joi.number().positive().optional(),
  hire_date: Joi.date().optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
  branch_id: Joi.number().integer().optional(),
  shift_id: Joi.number().integer().optional(),
  salary: Joi.number().positive().optional(),
  salary_type_id: Joi.number().integer().optional(),
  sl_t_id: Joi.number().integer().optional(),
  employee_type_id: Joi.number().integer().optional(),
  user_branch_id: Joi.number().integer().required()
});

const createJob = Joi.object({
  job_title: Joi.string().trim().required()
});

const assignBranch = Joi.object({
  employee_id: Joi.number().integer().required(),
  branch_id: Joi.number().integer().required()
});

const TIME_RE = /^\d{2}:\d{2}$/;

const setSchedule = Joi.object({
  emp_id:      Joi.number().integer().required(),
  day_id:      Joi.number().integer().required(),
  time_in:     Joi.string().pattern(TIME_RE).optional().allow(null, ''),
  time_out:    Joi.string().pattern(TIME_RE).optional().allow(null, ''),
  break_start: Joi.string().pattern(TIME_RE).optional().allow(null, ''),
  break_end:   Joi.string().pattern(TIME_RE).optional().allow(null, '')
});

const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'leave', 'sick_leave', 'overtime'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const markAttendance = Joi.object({
  employee_id:     Joi.number().integer().required(),
  employee_schedule_id:      Joi.number().integer().optional().allow(null),
  day_id:          Joi.number().integer().optional().allow(null),
  attendance_date: Joi.string().pattern(DATE_RE).required(),
  time_in:         Joi.string().pattern(TIME_RE).optional().allow(null, ''),
  time_out:        Joi.string().pattern(TIME_RE).optional().allow(null, ''),
  status:          Joi.string().valid(...ATTENDANCE_STATUSES).optional().default('present'),
  notes:           Joi.string().trim().allow('', null).optional()
});

const bulkMarkAttendance = Joi.object({
  attendance_date: Joi.string().pattern(DATE_RE).required(),
  records: Joi.array().items(Joi.object({
    employee_id:     Joi.number().integer().required(),
    employee_schedule_id:      Joi.number().integer().optional().allow(null),
    day_id:          Joi.number().integer().optional().allow(null),
    time_in:         Joi.string().pattern(TIME_RE).optional().allow(null, ''),
    time_out:        Joi.string().pattern(TIME_RE).optional().allow(null, ''),
    status:          Joi.string().valid(...ATTENDANCE_STATUSES).optional().default('present'),
    notes:           Joi.string().trim().allow('', null).optional()
  })).min(1).required()
});

const createUser = Joi.object({
  name: Joi.string().trim().required(),
  username: Joi.string().trim().required(),
  password: Joi.string().min(6).required(),
  role_id: Joi.number().integer().valid(1, 2).required(),
  phone: Joi.string().trim().optional(),
  state: Joi.string().valid('active', 'inactive').optional()
});

const createBranch = Joi.object({
  branch_name: Joi.string().trim().required(),
  address_id: Joi.number().integer().required(),
  manager_name: Joi.string().trim().optional(),
  manager_tel: Joi.string().trim().optional(),
  banner_tel: Joi.string().trim().optional(),
  br_email: Joi.string().email().optional(),
  fg_message: Joi.string().trim().optional()
});

const createCity = Joi.object({
  city_name: Joi.string().trim().required(),
  state_region: Joi.string().trim().optional().allow(''),
  country: Joi.string().trim().optional().allow('')
});

const updateCity = Joi.object({
  city_name: Joi.string().trim().optional(),
  state_region: Joi.string().trim().optional(),
  country: Joi.string().trim().optional()
}).min(1);

const createAddress = Joi.object({
  city_id: Joi.number().integer().required(),
  location_name: Joi.string().trim().optional().allow(''),
  description: Joi.string().trim().optional().allow('')
});

const assignUserBranch = Joi.object({
  user_id: Joi.number().integer().required(),
  branch_id: Joi.number().integer().required()
});

const updateUserState = Joi.object({
  state: Joi.string().valid('active', 'inactive').required()
});

const resetUserPassword = Joi.object({
  new_password: Joi.string().trim().min(6).required()
});

const transferAccounts = Joi.object({
  from_acc: Joi.number().integer().required(),
  to_acc: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  reasons: Joi.string().trim().optional()
});

const createDisputeSchema = Joi.object({
  cargo_id: Joi.number().integer().required(),
  dispute_type_id: Joi.number().integer().required(),
  description: Joi.string().trim().max(1000).required()
});

const resolveDisputeSchema = Joi.object({
  resolution: Joi.string().trim().max(1000).required(),
  refund_amount: Joi.number().min(0).optional()
});

const updateCustomer = Joi.object({
  full_name: Joi.string().trim().optional(),
  phone: Joi.string().trim().optional(),
  address_id: Joi.number().integer().optional().allow(null),
  customer_type: Joi.string().valid(...CUSTOMER_TYPES).optional()
}).min(1);

module.exports = {
  CUSTOMER_TYPES,
  ATTENDANCE_STATUSES,
  login,
  createCargo,
  updateCargoStatus,
  createCustomer,
  updateCustomer,
  processPayment,
  createEmployee,
  createJob,
  assignBranch,
  setSchedule,
  markAttendance,
  bulkMarkAttendance,
  createUser,
  createBranch,
  createCity,
  updateCity,
  createAddress,
  assignUserBranch,
  updateUserState,
  resetUserPassword,
  transferAccounts,
  createDisputeSchema,
  resolveDisputeSchema,
  /** @deprecated use createDisputeSchema */
  createDispute: createDisputeSchema,
  /** @deprecated use resolveDisputeSchema */
  resolveDispute: resolveDisputeSchema
};

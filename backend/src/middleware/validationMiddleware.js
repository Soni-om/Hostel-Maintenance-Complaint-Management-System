/**
 * HostelCare — Request Validation Middleware
 * Uses express-validator to enforce input schemas, email normalization, and RBAC enrollment rules
 */

import { body, query, param, validationResult } from 'express-validator';
import CategoryModel from '../models/categoryModel.js';

/**
 * Standardized validation error responder
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      message: formattedErrors[0]?.message || 'Validation failed. Please verify your input.',
      errors: formattedErrors
    });
  }
  next();
};

/**
 * Enforces RBAC rule: Prevents public users from self-registering as Staff or Admin.
 * Staff and Admin accounts must be provisioned exclusively by authorized administration.
 */
export const preventElevatedRegistration = (req, res, next) => {
  if (req.body && req.body.role !== undefined && req.body.role !== null) {
    if (typeof req.body.role !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid role format. Role must be a string if provided.'
      });
    }

    const requestedRole = req.body.role.toLowerCase().trim();
    if (requestedRole === 'staff' || requestedRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Public registration is restricted to students only. Staff and Admin accounts must be provisioned by the Chief Warden or System Administrator.'
      });
    }

    if (requestedRole !== 'student') {
      return res.status(400).json({
        success: false,
        message: `Invalid role '${req.body.role}'. Only 'student' registration is permitted.`
      });
    }
  }
  next();
};

/**
 * Validation rules for Student Registration (POST /api/auth/register)
 */
export const validateRegistrationRules = [
  preventElevatedRegistration,

  body('name')
    .isString().withMessage('Full name must be a string.')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters.')
    .matches(/^[a-zA-Z\s.'-]+$/).withMessage('Full name can only contain letters, spaces, hyphens, and periods.'),

  body('email')
    .isString().withMessage('Email address must be a string.')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 150 }).withMessage('Email address cannot exceed 150 characters.'),

  body('password')
    .isString().withMessage('Password must be a string.')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
    .isLength({ max: 128 }).withMessage('Password cannot exceed 128 characters.'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Phone number must be a string.')
    .trim()
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters.')
    .matches(/^[+0-9\s()-]+$/).withMessage('Please provide a valid phone number format.'),

  body('hostel_block')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Hostel block must be a string.')
    .trim()
    .isLength({ max: 50 }).withMessage('Hostel block name cannot exceed 50 characters.'),

  body('room_number')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Room number must be a string.')
    .trim()
    .isLength({ max: 20 }).withMessage('Room number cannot exceed 20 characters.'),

  handleValidationErrors
];

/**
 * Validation rules for User Login (POST /api/auth/login)
 */
export const validateLoginRules = [
  body('email')
    .isString().withMessage('Email address must be a string.')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .isString().withMessage('Password must be a string.')
    .notEmpty().withMessage('Password is required.'),

  handleValidationErrors
];

/**
 * Validation rules for Controlled Staff & Admin Account Provisioning (POST /api/users)
 * Accessible exclusively by authorized administrators
 */
export const validateUserProvisioningRules = [
  body('name')
    .isString().withMessage('Full name must be a string.')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters.')
    .matches(/^[a-zA-Z\s.'-]+$/).withMessage('Full name can only contain letters, spaces, hyphens, and periods.'),

  body('email')
    .isString().withMessage('Email address must be a string.')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 150 }).withMessage('Email address cannot exceed 150 characters.'),

  body('password')
    .isString().withMessage('Password must be a string.')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
    .isLength({ max: 128 }).withMessage('Password cannot exceed 128 characters.'),

  body('role')
    .isString().withMessage('Role must be a string.')
    .trim()
    .notEmpty().withMessage('Role is required.')
    .custom((val) => {
      const normalized = val.toLowerCase();
      if (normalized === 'admin') {
        throw new Error("Policy Denied: Administrator accounts are strictly system-seeded and cannot be created via the API.");
      }
      if (normalized !== 'staff') {
        throw new Error(`Invalid provisioning role '${val}'. Only 'staff' accounts can be provisioned via this endpoint.`);
      }
      return true;
    }),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Phone number must be a string.')
    .trim()
    .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters.')
    .matches(/^[+0-9\s()-]+$/).withMessage('Please provide a valid phone number format.'),

  body('staff_designation')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Staff designation must be a string.')
    .trim()
    .isLength({ max: 100 }).withMessage('Staff designation cannot exceed 100 characters.'),

  body('hostel_block')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Hostel block must be a string.')
    .trim()
    .isLength({ max: 50 }).withMessage('Hostel block name cannot exceed 50 characters.'),

  handleValidationErrors
];

/**
 * Validation rules for User Account Status update (PATCH /api/users/:id/status)
 */
export const validateUserStatusRules = [
  body('account_status')
    .isString().withMessage('account_status must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['active', 'inactive']).withMessage("account_status must be either 'active' or 'inactive'."),

  handleValidationErrors
];

/**
 * Rejects attempts by clients to set privileged or system-controlled complaint fields
 */
export const preventPrivilegedComplaintFields = (req, res, next) => {
  const forbiddenFields = [
    'priority',
    'status',
    'student_id',
    'assigned_staff_id',
    'staff_id',
    'ticket_number',
    'block_id',
    'hostel_block'
  ];

  if (req.body && typeof req.body === 'object') {
    for (const field of forbiddenFields) {
      if (field in req.body) {
        return res.status(400).json({
          success: false,
          message: `Privileged field '${field}' cannot be specified during complaint creation.`
        });
      }
    }
  }
  next();
};

/**
 * Validates that the authenticated student's profile has required hostel block and room information
 */
export const verifyStudentProfileForComplaint = (req, res, next) => {
  if (!req.user || !req.user.hostel_block || !req.user.room_number) {
    return res.status(400).json({
      success: false,
      message: 'Profile incomplete: Registered hostel block and room number are required to submit a complaint. Please update your profile.'
    });
  }
  next();
};

/**
 * Validation rules for Student Complaint Creation (POST /api/complaints)
 */
export const validateComplaintCreationRules = [
  preventPrivilegedComplaintFields,
  verifyStudentProfileForComplaint,

  body('title')
    .isString().withMessage('Title must be a string.')
    .trim()
    .notEmpty().withMessage('Complaint title is required.')
    .isLength({ min: 5, max: 150 }).withMessage('Title must be between 5 and 150 characters long.'),

  body('description')
    .isString().withMessage('Description must be a string.')
    .trim()
    .notEmpty().withMessage('Complaint description is required.')
    .isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters long.'),

  body('category_id')
    .notEmpty().withMessage('Category ID is required.')
    .isInt({ min: 1 }).withMessage('Category ID must be a valid positive integer.')
    .toInt()
    .custom(async (catId) => {
      const category = await CategoryModel.findById(catId);
      if (!category) {
        throw new Error(`Category ID ${catId} does not exist.`);
      }
      if (!category.active) {
        throw new Error(`Category '${category.name}' is currently inactive.`);
      }
      return true;
    }),

  body('room_number')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Room number must be a string.')
    .trim()
    .custom((val, { req }) => {
      if (val && req.user && req.user.room_number) {
        if (val.trim().toLowerCase() !== req.user.room_number.trim().toLowerCase()) {
          throw new Error(`Room number mismatch: Complaints must be lodged for your assigned room '${req.user.room_number}'.`);
        }
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation rules for Student Complaint Listing (GET /api/complaints/mine)
 */
export const validateComplaintListRules = [
  query('page')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Page must be a valid positive integer greater than or equal to 1.')
    .toInt(),

  query('limit')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 50 }).withMessage('Limit must be an integer between 1 and 50.')
    .toInt(),

  query('status')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Status filter must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['pending', 'assigned', 'in_progress', 'resolved', 'closed'])
    .withMessage("Invalid status filter. Allowed values: 'pending', 'assigned', 'in_progress', 'resolved', 'closed'."),

  query('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Category ID must be a valid positive integer.')
    .toInt(),

  handleValidationErrors
];

/**
 * Validation rules for Single Complaint Details (GET /api/complaints/:id)
 */
export const validateComplaintIdRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  handleValidationErrors
];

/**
 * Validation rules for Staff Complaint Queue Listing (GET /api/staff/complaints)
 */
export const validateStaffComplaintQueryRules = [
  query('page')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Page must be a valid positive integer greater than or equal to 1.')
    .toInt(),

  query('limit')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 50 }).withMessage('Limit must be an integer between 1 and 50.')
    .toInt(),

  query('status')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Status filter must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['pending', 'assigned', 'in_progress', 'resolved', 'closed'])
    .withMessage("Invalid status filter. Allowed values: 'pending', 'assigned', 'in_progress', 'resolved', 'closed'."),

  query('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Category ID must be a valid positive integer.')
    .toInt(),

  query('priority')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Priority filter must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage("Invalid priority filter. Allowed values: 'low', 'normal', 'high', 'urgent'."),

  query('keyword')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Keyword search must be a string.')
    .trim()
    .isLength({ max: 100 }).withMessage('Keyword search cannot exceed 100 characters.'),

  query('start_date')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Start date must be in strict YYYY-MM-DD format.')
    .custom((val) => {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        throw new Error('Start date must be a valid calendar date.');
      }
      return true;
    }),

  query('end_date')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('End date must be in strict YYYY-MM-DD format.')
    .custom((val, { req }) => {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        throw new Error('End date must be a valid calendar date.');
      }
      if (req.query && req.query.start_date) {
        const start = new Date(req.query.start_date);
        if (!isNaN(start.getTime()) && start > d) {
          throw new Error('Start date cannot be after end date.');
        }
      }
      return true;
    }),

  query('assigned_to_me')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('assigned_to_me must be a string or boolean representation.')
    .trim()
    .toLowerCase()
    .isIn(['true', 'false', '1', '0']).withMessage("assigned_to_me must be 'true' or 'false'."),

  query('sort_by')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('sort_by must be a string.')
    .trim()
    .isIn(['created_at', 'priority', 'status', 'id', 'ticket_number'])
    .withMessage("Invalid sort_by field. Allowed values: 'created_at', 'priority', 'status', 'id', 'ticket_number'."),

  query('sort_order')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('sort_order must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['asc', 'desc'])
    .withMessage("Invalid sort_order. Allowed values: 'asc', 'desc'."),

  handleValidationErrors
];

/**
 * Validation rules for Complaint Assignment / Reassignment (POST /api/staff/complaints/:id/assign)
 */
export const validateComplaintAssignmentRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('staff_id')
    .custom((val, { req }) => {
      const staffId = (val !== undefined && val !== null && val !== '')
        ? val
        : req.body?.assigned_to_user_id;

      if (staffId === undefined || staffId === null || staffId === '') {
        throw new Error('staff_id (or assigned_to_user_id) is required.');
      }
      const num = parseInt(staffId, 10);
      if (isNaN(num) || num < 1) {
        throw new Error('staff_id must be a valid positive integer.');
      }
      req.body.staff_id = num;
      return true;
    }),

  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Notes must be a string.')
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters.'),

  handleValidationErrors
];

/**
 * Validation rules for Complaint Status Update (PATCH /api/complaints/:id/status)
 */
export const validateComplaintStatusUpdateRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('status')
    .notEmpty().withMessage('Status is required.')
    .isString().withMessage('Status must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['pending', 'assigned', 'in_progress', 'resolved', 'closed'])
    .withMessage("Invalid status. Allowed values: 'pending', 'assigned', 'in_progress', 'resolved', 'closed'."),

  body('remarks')
    .optional({ nullable: true })
    .custom((val, { req }) => {
      const targetStatus = req.body?.status ? String(req.body.status).toLowerCase().trim() : '';

      // Compulsory resolution remarks when moving to 'resolved'
      if (targetStatus === 'resolved') {
        if (!val || typeof val !== 'string' || !val.trim()) {
          throw new Error('Resolution remarks are required when marking a complaint as resolved.');
        }
        if (val.trim().length < 5) {
          throw new Error('Resolution remarks must be at least 5 characters long.');
        }
      }

      if (val !== undefined && val !== null && typeof val !== 'string') {
        throw new Error('Remarks must be a string.');
      }

      if (val && typeof val === 'string' && val.trim().length > 1000) {
        throw new Error('Remarks cannot exceed 1000 characters.');
      }

      return true;
    }),

  handleValidationErrors
];

/**
 * Validation rules for Complaint Priority Update (PATCH /api/complaints/:id/priority)
 */
export const validateComplaintPriorityUpdateRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('priority')
    .notEmpty().withMessage('Priority is required.')
    .isString().withMessage('Priority must be a string.')
    .trim()
    .toLowerCase()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage("Invalid priority level. Allowed values: 'low', 'normal', 'high', 'urgent'."),

  body('remarks')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Remarks must be a string.')
    .trim()
    .isLength({ max: 1000 }).withMessage('Remarks cannot exceed 1000 characters.'),

  handleValidationErrors
];

/**
 * Validation rules for Complaint Closure (PATCH /api/complaints/:id/close)
 */
export const validateComplaintCloseRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('closing_remarks')
    .optional({ nullable: true, checkFalsy: true })
    .custom((val, { req }) => {
      const remarks = val || req.body?.remarks;
      if (remarks && typeof remarks !== 'string') {
        throw new Error('Closing remarks must be a string.');
      }
      if (remarks && remarks.trim().length > 1000) {
        throw new Error('Closing remarks cannot exceed 1000 characters.');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation rules for Complaint Reopen (PATCH /api/complaints/:id/reopen)
 */
export const validateComplaintReopenRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('reason')
    .custom((val, { req }) => {
      const reasonVal = val || req.body?.remarks;
      if (!reasonVal || typeof reasonVal !== 'string' || !reasonVal.trim()) {
        throw new Error('Reason is required when reopening a complaint.');
      }
      if (reasonVal.trim().length < 5) {
        throw new Error('Reopen reason must be at least 5 characters long.');
      }
      if (reasonVal.trim().length > 1000) {
        throw new Error('Reopen reason cannot exceed 1000 characters.');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation rules for Student Feedback Submission (POST /api/complaints/:id/feedback)
 */
export const validateSubmitFeedbackRules = [
  param('id')
    .notEmpty().withMessage('Complaint ID is required.')
    .isInt({ min: 1 }).withMessage('Complaint ID must be a valid positive integer.')
    .toInt(),

  body('rating')
    .notEmpty().withMessage('Rating is required.')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer between 1 and 5.')
    .toInt(),

  body('comments')
    .optional({ nullable: true })
    .custom((val, { req }) => {
      const commentVal = val !== undefined ? val : req.body?.comment;
      if (commentVal !== undefined && commentVal !== null && typeof commentVal !== 'string') {
        throw new Error('Comments must be a string if provided.');
      }
      if (typeof commentVal === 'string' && commentVal.length > 2000) {
        throw new Error('Comments cannot exceed 2000 characters.');
      }
      return true;
    }),

  body('comment')
    .optional({ nullable: true })
    .custom((val, { req }) => {
      if (val !== undefined && val !== null && typeof val !== 'string') {
        throw new Error('Comment must be a string if provided.');
      }
      if (typeof val === 'string' && val.length > 2000) {
        throw new Error('Comment cannot exceed 2000 characters.');
      }
      return true;
    }),

  handleValidationErrors
];

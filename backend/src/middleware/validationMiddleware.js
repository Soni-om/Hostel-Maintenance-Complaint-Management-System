/**
 * HostelCare — Request Validation Middleware
 * Uses express-validator to enforce input schemas, email normalization, and RBAC enrollment rules
 */

import { body, validationResult } from 'express-validator';
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

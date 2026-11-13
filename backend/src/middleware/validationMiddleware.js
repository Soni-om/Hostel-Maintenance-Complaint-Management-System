/**
 * HostelCare — Request Validation Middleware
 * Uses express-validator to enforce input schemas, email normalization, and RBAC enrollment rules
 */

import { body, validationResult } from 'express-validator';

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

/**
 * HostelCare — User Management & Administrative Provisioning Routes
 * Implements RBAC-protected endpoints for user directory queries,
 * account status administration, user detail updates, and controlled staff provisioning.
 */

import { Router } from 'express';
import UserController from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  validateUserProvisioningRules,
  validateUserStatusRules,
  validateUserUpdateRules
} from '../middleware/validationMiddleware.js';

const router = Router();

// Enforce authentication on all user administration routes
router.use(requireAuth);

/**
 * @route   POST /api/users or /api/v1/users
 * @desc    Controlled Staff Account Provisioning (Admin accounts are system-seeded)
 * @access  Admin only
 */
router.post('/', requireRole('admin'), validateUserProvisioningRules, UserController.provisionUser);

/**
 * @route   GET /api/users or /api/v1/users
 * @desc    List all system users (filtered & paginated)
 * @access  Admin only
 */
router.get('/', requireRole('admin'), UserController.listUsers);

/**
 * @route   GET /api/users/:id or /api/v1/users/:id
 * @desc    Get user account details by ID
 * @access  Admin only
 */
router.get('/:id', requireRole('admin'), UserController.getUserById);

/**
 * @route   PATCH /api/users/:id or /api/v1/users/:id
 * @desc    Update user profile, role, or block details
 * @access  Admin only
 */
router.patch('/:id', requireRole('admin'), validateUserUpdateRules, UserController.updateUser);

/**
 * @route   PATCH /api/users/:id/status or /api/v1/users/:id/status
 * @desc    Activate or deactivate user account
 * @access  Admin only
 */
router.patch('/:id/status', requireRole('admin'), validateUserStatusRules, UserController.updateStatus);

export default router;

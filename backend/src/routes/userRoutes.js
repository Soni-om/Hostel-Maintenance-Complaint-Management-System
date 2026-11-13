/**
 * HostelCare — User Management & Administrative Provisioning Routes
 * Implements RBAC-protected endpoints for user directory queries,
 * account status administration, and controlled staff/admin provisioning.
 */

import { Router } from 'express';
import UserController from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateUserProvisioningRules, validateUserStatusRules } from '../middleware/validationMiddleware.js';

const router = Router();

// Enforce authentication on all user administration routes
router.use(requireAuth);

/**
 * @route   POST /api/users or /api/v1/users
 * @desc    Controlled Staff & Admin Account Provisioning
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
 * @route   PATCH /api/users/:id/status or /api/v1/users/:id/status
 * @desc    Activate or deactivate user account
 * @access  Admin only
 */
router.patch('/:id/status', requireRole('admin'), validateUserStatusRules, UserController.updateStatus);

export default router;

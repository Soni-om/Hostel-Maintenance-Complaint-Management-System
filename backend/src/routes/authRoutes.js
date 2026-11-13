/**
 * HostelCare — Authentication Routes
 * Public routing endpoints for User Registration and Authentication
 */

import { Router } from 'express';
import AuthController from '../controllers/authController.js';
import { validateRegistrationRules } from '../middleware/validationMiddleware.js';

const router = Router();

/**
 * @route   POST /api/auth/register or /api/v1/auth/register
 * @desc    Student self-registration
 * @access  Public
 */
router.post('/register', validateRegistrationRules, AuthController.register);

export default router;


/**
 * HostelCare — Dashboard Statistics Routes
 * Implements context-scoped statistics endpoints for Student, Staff, and Admin
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import StatsController from '../controllers/statsController.js';

const router = Router();

// Enforce authentication across all statistics routes
router.use(requireAuth);

/**
 * @route   GET /api/stats/dashboard or /api/v1/stats/dashboard
 * @desc    Get live metrics and statistics scoped to current authenticated user's role
 * @access  Authenticated (Student, Staff, Admin)
 */
router.get('/dashboard', StatsController.getDashboardStats);

export default router;

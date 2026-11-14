/**
 * HostelCare — Complaint Category Routes
 * Architecture: ES Modules, Express Router, JWT Auth Middleware
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import CategoryController from '../controllers/categoryController.js';

const router = Router();

// Enforce authentication across category routes
router.use(requireAuth);

/**
 * @route   GET /api/categories or /api/v1/categories
 * @desc    Get all active complaint categories
 * @access  Authenticated (Student, Staff, Admin)
 */
router.get('/', CategoryController.getCategories);

export default router;

/**
 * HostelCare — Complaint Category Routes
 * Architecture: ES Modules, Express Router, JWT Auth Middleware, RBAC
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import CategoryController from '../controllers/categoryController.js';
import { validateCategoryCreationRules, validateCategoryUpdateRules } from '../middleware/validationMiddleware.js';

const router = Router();

// Enforce authentication across all category routes
router.use(requireAuth);

/**
 * @route   GET /api/categories or /api/v1/categories
 * @desc    Get complaint categories (active by default, or all if include_inactive=true & admin)
 * @access  Authenticated (Student, Staff, Admin)
 */
router.get('/', CategoryController.getCategories);

/**
 * @route   GET /api/categories/:id
 * @desc    Get category details by ID
 * @access  Authenticated
 */
router.get('/:id', CategoryController.getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Create a new complaint category
 * @access  Admin only
 */
router.post('/', requireRole('admin'), validateCategoryCreationRules, CategoryController.createCategory);

/**
 * @route   PUT /api/categories/:id or PATCH /api/categories/:id
 * @desc    Update complaint category details
 * @access  Admin only
 */
router.put('/:id', requireRole('admin'), validateCategoryUpdateRules, CategoryController.updateCategory);
router.patch('/:id', requireRole('admin'), validateCategoryUpdateRules, CategoryController.updateCategory);

/**
 * @route   PATCH /api/categories/:id/status
 * @desc    Toggle category active/inactive status
 * @access  Admin only
 */
router.patch('/:id/status', requireRole('admin'), CategoryController.updateStatus);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category (only if no complaints reference it)
 * @access  Admin only
 */
router.delete('/:id', requireRole('admin'), CategoryController.deleteCategory);

export default router;

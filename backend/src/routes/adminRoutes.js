/**
 * HostelCare — Administrator Governance & Operations Routes
 * Implements RBAC-protected endpoints for full platform administration,
 * user directory management, category CRUD, and system analytics.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import AdminController from '../controllers/adminController.js';
import UserController from '../controllers/userController.js';
import CategoryController from '../controllers/categoryController.js';
import {
  validateUserProvisioningRules,
  validateUserStatusRules,
  validateUserUpdateRules,
  validateCategoryCreationRules,
  validateCategoryUpdateRules
} from '../middleware/validationMiddleware.js';

const router = Router();

// Strict RBAC: All administrative endpoints require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin'));

// Analytics & Dashboard Statistics
router.get('/stats', AdminController.getStats);
router.get('/dashboard', AdminController.getStats);

// User Management Sub-Resource
router.get('/users', UserController.listUsers);
router.post('/users', validateUserProvisioningRules, UserController.provisionUser);
router.get('/users/:id', UserController.getUserById);
router.patch('/users/:id', validateUserUpdateRules, UserController.updateUser);
router.patch('/users/:id/status', validateUserStatusRules, UserController.updateStatus);

// Category Management Sub-Resource
router.get('/categories', CategoryController.getAllCategories);
router.post('/categories', validateCategoryCreationRules, CategoryController.createCategory);
router.get('/categories/:id', CategoryController.getCategoryById);
router.put('/categories/:id', validateCategoryUpdateRules, CategoryController.updateCategory);
router.patch('/categories/:id', validateCategoryUpdateRules, CategoryController.updateCategory);
router.patch('/categories/:id/status', CategoryController.updateStatus);
router.delete('/categories/:id', CategoryController.deleteCategory);

export default router;

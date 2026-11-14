/**
 * HostelCare — Complaint Management Routes
 * Architecture: ES Modules, Express Router, JWT Auth, Role RBAC & Validation
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { validateComplaintCreationRules } from '../middleware/validationMiddleware.js';
import ComplaintController from '../controllers/complaintController.js';

const router = Router();

// Enforce authentication across complaint routes
router.use(requireAuth);

/**
 * @route   POST /api/complaints or /api/v1/complaints
 * @desc    Lodge a new maintenance complaint ticket
 * @access  Student only
 */
router.post(
  '/',
  requireRole('student'),
  validateComplaintCreationRules,
  ComplaintController.createComplaint
);

export default router;

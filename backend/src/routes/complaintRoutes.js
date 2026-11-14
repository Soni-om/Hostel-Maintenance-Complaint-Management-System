/**
 * HostelCare — Complaint Management Routes
 * Architecture: ES Modules, Express Router, JWT Auth, Role RBAC & Validation
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  validateComplaintCreationRules,
  validateComplaintListRules,
  validateComplaintIdRules
} from '../middleware/validationMiddleware.js';
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

/**
 * @route   GET /api/complaints/mine or /api/v1/complaints/mine
 * @desc    Retrieve personal complaint list with pagination and filters
 * @access  Student only
 */
router.get(
  '/mine',
  requireRole('student'),
  validateComplaintListRules,
  ComplaintController.getStudentComplaints
);

/**
 * @route   GET /api/complaints or /api/v1/complaints
 * @desc    Alias for student personal complaint list
 * @access  Student only
 */
router.get(
  '/',
  requireRole('student'),
  validateComplaintListRules,
  ComplaintController.getStudentComplaints
);

/**
 * @route   GET /api/complaints/:id or /api/v1/complaints/:id
 * @desc    Retrieve detailed information for an owned complaint ticket
 * @access  Student owner only
 */
router.get(
  '/:id',
  requireRole('student'),
  validateComplaintIdRules,
  ComplaintController.getStudentComplaintById
);

export default router;

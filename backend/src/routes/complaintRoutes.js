/**
 * HostelCare — Complaint Management Routes
 * Architecture: ES Modules, Express Router, JWT Auth, Role RBAC & Validation
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { uploadSinglePhoto } from '../middleware/uploadMiddleware.js';
import {
  validateComplaintCreationRules,
  validateComplaintListRules,
  validateComplaintIdRules,
  validateComplaintAssignmentRules
} from '../middleware/validationMiddleware.js';
import ComplaintController from '../controllers/complaintController.js';
import StaffController from '../controllers/staffController.js';

const router = Router();

// Enforce authentication across complaint routes
router.use(requireAuth);

/**
 * @route   POST /api/complaints or /api/v1/complaints
 * @desc    Lodge a new maintenance complaint ticket with optional photo attachment
 * @access  Student only
 * @pipeline requireAuth -> requireRole('student') -> upload.single('photo') -> validation -> controller
 */
router.post(
  '/',
  requireRole('student'),
  uploadSinglePhoto,
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

/**
 * @route   GET /api/complaints/:id/attachments/:attachmentId or /api/v1/...
 * @desc    Download / stream complaint attachment photograph
 * @access  Authenticated (Student owner, Staff, Admin)
 */
router.get(
  '/:id/attachments/:attachmentId',
  ComplaintController.downloadAttachment
);

/**
 * @route   GET /api/complaints/:id/attachment or /api/v1/...
 * @desc    Download / stream complaint attachment photograph (alias)
 * @access  Authenticated (Student owner, Staff, Admin)
 */
router.get(
  '/:id/attachment',
  ComplaintController.downloadAttachment
);

/**
 * @route   POST /api/complaints/:id/assign or /api/v1/complaints/:id/assign
 * @desc    Assign or reassign a complaint to an active maintenance staff member
 * @access  Staff and Admin only
 */
router.post(
  '/:id/assign',
  requireRole('staff', 'admin'),
  validateComplaintAssignmentRules,
  StaffController.assignComplaint
);

/**
 * @route   GET /api/complaints/:id/assignments or /api/v1/complaints/:id/assignments
 * @desc    Get chronological assignment history for a complaint
 * @access  Staff and Admin only
 */
router.get(
  '/:id/assignments',
  requireRole('staff', 'admin'),
  validateComplaintIdRules,
  StaffController.getAssignments
);

export default router;

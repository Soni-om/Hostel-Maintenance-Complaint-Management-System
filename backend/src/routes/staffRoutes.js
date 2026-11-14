/**
 * HostelCare — Staff Operations Routes
 * Implements RBAC-protected endpoints for hostel maintenance staff operations.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import StaffController from '../controllers/staffController.js';
import {
  validateStaffComplaintQueryRules,
  validateComplaintAssignmentRules,
  validateComplaintIdRules
} from '../middleware/validationMiddleware.js';

const router = Router();

// Enforce authentication on all staff routes
router.use(requireAuth);

/**
 * @route   GET /api/staff/overview or /api/v1/staff/overview
 * @desc    Get staff operational overview & queue summary
 * @access  Staff and Admin only (Students strictly forbidden)
 */
router.get('/overview', requireRole('staff', 'admin'), (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Staff maintenance operations overview loaded.',
    data: {
      staffName: req.user.name,
      role: req.user.role,
      designation: req.user.staff_designation || 'Maintenance Staff',
      assignedHostel: req.user.hostel_block || 'All Blocks',
      activeQueueCount: 0
    }
  });
});

/**
 * @route   GET /api/staff/technicians or /api/v1/staff/technicians
 * @desc    Get active maintenance staff members for ticket assignment
 * @access  Staff and Admin only
 */
router.get('/technicians', requireRole('staff', 'admin'), StaffController.getTechnicians);

/**
 * @route   GET /api/staff/complaints or /api/v1/staff/complaints
 * @desc    Get paginated maintenance complaints queue with keyword search, multi-field filters, and stats
 * @access  Staff and Admin only (Students strictly forbidden with HTTP 403)
 */
router.get(
  '/complaints',
  requireRole('staff', 'admin'),
  validateStaffComplaintQueryRules,
  StaffController.getStaffComplaints
);

/**
 * @route   POST /api/staff/complaints/:id/assign or /api/v1/staff/complaints/:id/assign
 * @desc    Assign or reassign a complaint to an active maintenance staff member
 * @access  Staff and Admin only
 */
router.post(
  '/complaints/:id/assign',
  requireRole('staff', 'admin'),
  validateComplaintAssignmentRules,
  StaffController.assignComplaint
);

/**
 * @route   GET /api/staff/complaints/:id/assignments or /api/v1/staff/complaints/:id/assignments
 * @desc    Get chronological assignment history for a complaint
 * @access  Staff and Admin only
 */
router.get(
  '/complaints/:id/assignments',
  requireRole('staff', 'admin'),
  validateComplaintIdRules,
  StaffController.getAssignments
);

export default router;


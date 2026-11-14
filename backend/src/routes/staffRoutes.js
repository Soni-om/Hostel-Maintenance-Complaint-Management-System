/**
 * HostelCare — Staff Operations Routes
 * Implements RBAC-protected endpoints for hostel maintenance staff operations.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import StaffController from '../controllers/staffController.js';
import ComplaintModel from '../models/complaintModel.js';
import {
  validateStaffComplaintQueryRules,
  validateComplaintAssignmentRules,
  validateComplaintIdRules,
  validateComplaintStatusUpdateRules,
  validateComplaintPriorityUpdateRules
} from '../middleware/validationMiddleware.js';

const router = Router();

// Enforce authentication on all staff routes
router.use(requireAuth);

/**
 * @route   GET /api/staff/overview or /api/v1/staff/overview
 * @desc    Get staff operational overview & queue summary
 * @access  Staff and Admin only (Students strictly forbidden)
 */
router.get('/overview', requireRole('staff', 'admin'), async (req, res) => {
  try {
    const stats = await ComplaintModel.getStaffComplaintStats({ user: req.user });
    return res.status(200).json({
      success: true,
      message: 'Staff maintenance operations overview loaded.',
      data: {
        staffName: req.user.name,
        role: req.user.role,
        designation: req.user.staff_designation || 'Maintenance Staff',
        assignedHostel: req.user.hostel_block || 'All Blocks',
        activeQueueCount: stats.totalPermitted,
        stats
      }
    });
  } catch (err) {
    console.error('Staff overview error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load staff operations overview.'
    });
  }
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
 * @route   GET /api/staff/complaints/:id or /api/v1/staff/complaints/:id
 * @desc    Get detailed information for a complaint under Option D visibility
 * @access  Staff and Admin only
 */
router.get(
  '/complaints/:id',
  requireRole('staff', 'admin'),
  validateComplaintIdRules,
  StaffController.getComplaintById
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

/**
 * @route   PATCH /api/staff/complaints/:id/status or /api/v1/staff/complaints/:id/status
 * @desc    Update complaint status through lifecycle transition engine
 * @access  Staff and Admin only
 */
router.patch(
  '/complaints/:id/status',
  requireRole('staff', 'admin'),
  validateComplaintStatusUpdateRules,
  StaffController.updateStatus
);

/**
 * @route   PATCH /api/staff/complaints/:id/priority or /api/v1/staff/complaints/:id/priority
 * @desc    Update complaint priority level
 * @access  Staff and Admin only
 */
router.patch(
  '/complaints/:id/priority',
  requireRole('staff', 'admin'),
  validateComplaintPriorityUpdateRules,
  StaffController.updatePriority
);

/**
 * @route   GET /api/staff/complaints/:id/history or /api/v1/staff/complaints/:id/history
 * @desc    Retrieve full chronological status history for a complaint
 * @access  Staff and Admin only
 */
router.get(
  '/complaints/:id/history',
  requireRole('staff', 'admin'),
  validateComplaintIdRules,
  StaffController.getStatusHistory
);

/**
 * @route   GET /api/staff/complaints/:id/feedback or /api/v1/staff/complaints/:id/feedback
 * @desc    Retrieve feedback rating and comments for a complaint
 * @access  Staff and Admin only
 */
router.get(
  '/complaints/:id/feedback',
  requireRole('staff', 'admin'),
  validateComplaintIdRules,
  StaffController.getFeedback
);

export default router;


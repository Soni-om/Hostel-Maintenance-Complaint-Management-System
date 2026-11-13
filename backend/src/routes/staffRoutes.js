/**
 * HostelCare — Staff Operations Routes
 * Implements RBAC-protected endpoints for hostel maintenance staff operations.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

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

export default router;


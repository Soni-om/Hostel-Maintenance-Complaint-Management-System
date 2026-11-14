/**
 * HostelCare — Dashboard Statistics Controller
 * Dynamically computes and returns real-time SQL aggregates scoped per user role context:
 * - Student: Personal complaint totals by status (pending, assigned, in_progress, resolved, closed)
 * - Staff: Option D scoped queue counts (totalPermitted, assignedToMe, pendingReview, inProgress, resolved)
 * - Admin: Campus-wide system statistics, SLA performance, and feedback ratings
 */

import ComplaintModel from '../models/complaintModel.js';
import AdminController from './adminController.js';

const StatsController = {
  /**
   * Retrieves role-scoped dashboard analytics
   * GET /api/stats/dashboard or GET /api/v1/stats/dashboard
   * Access: Authenticated (Student, Staff, Admin)
   */
  async getDashboardStats(req, res) {
    try {
      const user = req.user;

      if (user.role === 'student') {
        const stats = await ComplaintModel.getStudentComplaintStats(user.id);
        return res.status(200).json({
          success: true,
          role: 'student',
          stats
        });
      }

      if (user.role === 'staff') {
        const stats = await ComplaintModel.getStaffComplaintStats({ user });
        return res.status(200).json({
          success: true,
          role: 'staff',
          stats
        });
      }

      if (user.role === 'admin') {
        return AdminController.getStats(req, res);
      }

      return res.status(403).json({
        success: false,
        message: 'Unknown role context.'
      });
    } catch (err) {
      console.error('StatsController getDashboardStats Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard statistics.'
      });
    }
  }
};

export default StatsController;

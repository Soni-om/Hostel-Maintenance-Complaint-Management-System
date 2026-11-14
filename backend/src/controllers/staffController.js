/**
 * HostelCare — Staff Operations Controller
 * Handles maintenance desk queue, complaints search, multi-field filtering, pagination, and real-time statistics
 */

import ComplaintModel from '../models/complaintModel.js';

const StaffController = {
  /**
   * Retrieves paginated complaints queue and database statistics for authenticated Staff or Admin
   * GET /api/staff/complaints or /api/v1/staff/complaints
   * Access: Staff and Admin only (enforced by route middleware)
   */
  async getStaffComplaints(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        keyword,
        status,
        category_id,
        priority,
        start_date,
        end_date,
        assigned_to_me,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = req.query;

      // Execute complaints query and statistics query concurrently
      const [complaintsData, statsData] = await Promise.all([
        ComplaintModel.findStaffComplaints({
          user: req.user,
          page: parseInt(page, 10) || 1,
          limit: parseInt(limit, 10) || 10,
          keyword,
          status,
          categoryId: category_id ? parseInt(category_id, 10) : undefined,
          priority,
          startDate: start_date,
          endDate: end_date,
          assignedToMe: assigned_to_me,
          sortBy: sort_by,
          sortOrder: sort_order
        }),
        ComplaintModel.getStaffComplaintStats({
          user: req.user
        })
      ]);

      return res.status(200).json({
        success: true,
        complaints: complaintsData.complaints,
        pagination: {
          total: complaintsData.total,
          page: complaintsData.page,
          limit: complaintsData.limit,
          totalPages: complaintsData.totalPages
        },
        stats: statsData
      });
    } catch (error) {
      console.error('Staff getStaffComplaints Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving staff maintenance queue.'
      });
    }
  }
};

export default StaffController;

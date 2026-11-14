/**
 * HostelCare — Staff Operations Controller
 * Handles maintenance desk queue, complaints search, multi-field filtering, pagination, and real-time statistics
 */

import ComplaintModel from '../models/complaintModel.js';
import UserModel from '../models/userModel.js';

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
  },

  /**
   * Assigns or reassigns a complaint to an active maintenance staff member
   * POST /api/staff/complaints/:id/assign or /api/v1/staff/complaints/:id/assign
   * Access: Staff and Admin only
   */
  async assignComplaint(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      const staffId = parseInt(req.body.staff_id || req.body.assigned_to_user_id, 10);
      const notes = req.body.notes || null;

      const result = await ComplaintModel.assignComplaint({
        complaintId,
        staffId,
        assignedBy: req.user.id,
        notes,
        user: req.user
      });

      return res.status(200).json({
        success: true,
        message: result.complaint.is_reassignment
          ? `Complaint reassigned successfully to ${result.assignment.staff_name}.`
          : `Complaint assigned successfully to ${result.assignment.staff_name}.`,
        assignment: result.assignment,
        complaint: result.complaint
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      console.error('Staff assignComplaint Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while assigning the complaint.'
      });
    }
  },

  /**
   * Retrieves full chronological assignment history for a complaint
   * GET /api/staff/complaints/:id/assignments or /api/v1/staff/complaints/:id/assignments
   * Access: Staff and Admin only
   */
  async getAssignments(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);

      const complaint = await ComplaintModel.findById(complaintId);
      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found.'
        });
      }

      if (req.user.role === 'staff') {
        const hasBlockAccess = Boolean(
          req.user.hostel_block &&
          req.user.hostel_block.trim() &&
          complaint.hostel_block &&
          complaint.hostel_block.trim().toLowerCase() === req.user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          hasActiveAssignment = await ComplaintModel.isComplaintAssignedToStaff(complaintId, req.user.id);
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          return res.status(404).json({
            success: false,
            message: 'Complaint not found.'
          });
        }
      }

      const assignments = await ComplaintModel.getComplaintAssignments(complaintId);

      return res.status(200).json({
        success: true,
        complaint_id: complaintId,
        ticket_number: complaint.ticket_number,
        assignments
      });
    } catch (error) {
      console.error('Staff getAssignments Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving assignment history.'
      });
    }
  },

  /**
   * Retrieves available active technicians for assignment dropdowns
   * GET /api/staff/technicians or /api/v1/staff/technicians
   * Access: Staff and Admin only
   */
  async getTechnicians(req, res, next) {
    try {
      const technicians = await UserModel.findActiveStaff();
      return res.status(200).json({
        success: true,
        technicians
      });
    } catch (error) {
      console.error('Staff getTechnicians Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving active technicians.'
      });
    }
  }
};

export default StaffController;

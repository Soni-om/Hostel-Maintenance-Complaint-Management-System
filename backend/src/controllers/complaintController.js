/**
 * HostelCare — Complaint Controller
 * Handles student maintenance complaint creation and initial lifecycle orchestration
 */

import ComplaintModel from '../models/complaintModel.js';

const ComplaintController = {
  /**
   * Lodges a new maintenance complaint for an authenticated student
   * POST /api/complaints or /api/v1/complaints
   * Access: Student only
   */
  async createComplaint(req, res, next) {
    try {
      const { title, description, category_id, room_number } = req.body;

      // 1. Derive student ownership and location strictly from authenticated profile
      const studentId = req.user.id;
      const blockId = req.user.block_id || null;
      const hostelBlock = req.user.hostel_block;
      // Room number fallback: use request room_number if provided, else student registered room
      const resolvedRoomNumber = (room_number && room_number.trim()) || req.user.room_number;

      // 2. Atomically create complaint and initial pending status history
      const createdComplaint = await ComplaintModel.createComplaint({
        studentId,
        categoryId: parseInt(category_id, 10),
        title,
        description,
        blockId,
        hostelBlock,
        roomNumber: resolvedRoomNumber
      });

      return res.status(201).json({
        success: true,
        message: 'Complaint lodged successfully.',
        complaint: createdComplaint
      });
    } catch (error) {
      console.error('Complaint Creation Error:', error);

      if (error.code === 'DAILY_TICKET_LIMIT_EXCEEDED') {
        return res.status(503).json({
          success: false,
          code: 'DAILY_LIMIT_EXCEEDED',
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while lodging the complaint.'
      });
    }
  },

  /**
   * Retrieves paginated complaints for the authenticated student
   * GET /api/complaints/mine or /api/v1/complaints/mine (and /api/complaints)
   * Access: Student only
   */
  async getStudentComplaints(req, res, next) {
    try {
      const studentId = req.user.id;
      const { page, limit, status, category_id } = req.query;

      const result = await ComplaintModel.findStudentComplaints({
        studentId,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
        status: status ? status.trim().toLowerCase() : undefined,
        categoryId: category_id ? parseInt(category_id, 10) : undefined
      });

      return res.status(200).json({
        success: true,
        complaints: result.complaints,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Get Student Complaints Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving your complaints.'
      });
    }
  },

  /**
   * Retrieves details of a specific complaint owned by the authenticated student
   * GET /api/complaints/:id or /api/v1/complaints/:id
   * Access: Student owner only
   */
  async getStudentComplaintById(req, res, next) {
    try {
      const studentId = req.user.id;
      const complaintId = parseInt(req.params.id, 10);

      const complaint = await ComplaintModel.findStudentComplaintById({
        complaintId,
        studentId
      });

      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found.'
        });
      }

      return res.status(200).json({
        success: true,
        complaint
      });
    } catch (error) {
      console.error('Get Student Complaint By ID Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving complaint details.'
      });
    }
  }
};

export default ComplaintController;

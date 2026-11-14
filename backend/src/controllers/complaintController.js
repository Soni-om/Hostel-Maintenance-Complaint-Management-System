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
  }
};

export default ComplaintController;

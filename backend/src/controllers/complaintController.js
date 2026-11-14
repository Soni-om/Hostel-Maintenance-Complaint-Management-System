/**
 * HostelCare — Complaint Controller
 * Handles student maintenance complaint creation and initial lifecycle orchestration
 */

import fs from 'node:fs';
import ComplaintModel from '../models/complaintModel.js';
import { resolveSafeStoragePath } from '../utils/fileStorage.js';

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

      // 2. Atomically create complaint, initial pending history, and optional photo attachment
      const createdComplaint = await ComplaintModel.createComplaint({
        studentId,
        categoryId: parseInt(category_id, 10),
        title,
        description,
        blockId,
        hostelBlock,
        roomNumber: resolvedRoomNumber,
        photoFile: req.file || null
      });

      return res.status(201).json({
        success: true,
        message: 'Complaint lodged successfully.',
        complaint: createdComplaint
      });
    } catch (error) {
      console.error('Complaint Creation Error:', error);

      if (
        error.statusCode === 415 ||
        error.code === 'UNSUPPORTED_MEDIA_TYPE' ||
        error.code === 'INVALID_IMAGE_SIGNATURE' ||
        error.code === 'CORRUPTED_IMAGE'
      ) {
        return res.status(415).json({
          success: false,
          code: error.code || 'UNSUPPORTED_MEDIA_TYPE',
          message: error.message || 'Unsupported or invalid image format. Only JPEG, PNG, and WEBP images are permitted.'
        });
      }

      if (error.code === 'FILE_TOO_LARGE' || error.statusCode === 413) {
        return res.status(413).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds maximum permitted limit of 5MB.'
        });
      }

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
  },

  /**
   * Secure authenticated download/stream of a complaint photo attachment
   * GET /api/complaints/:id/attachments/:attachmentId or /api/complaints/:id/attachment
   * Access: Student owner, Permitted Staff (Option D Hybrid Domain/Assignment), Admin
   */
  async downloadAttachment(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      const attachmentId = req.params.attachmentId ? parseInt(req.params.attachmentId, 10) : null;

      if (isNaN(complaintId) || (req.params.attachmentId && isNaN(attachmentId))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid complaint or attachment ID parameter.'
        });
      }

      // 1. Fetch attachment record joined with complaint
      const attachment = await ComplaintModel.findAttachment({
        complaintId,
        attachmentId
      });

      if (!attachment) {
        return res.status(404).json({
          success: false,
          message: 'Attachment not found.'
        });
      }

      // 2. Authorization check per RBAC Matrix & Option D
      if (req.user.role === 'student') {
        // Student: must own the complaint (strict anti-enumeration)
        if (attachment.student_id !== req.user.id) {
          return res.status(404).json({
            success: false,
            message: 'Attachment not found.'
          });
        }
      } else if (req.user.role === 'staff') {
        // Staff: Option D Hybrid Domain & Assignment Visibility Policy
        // Authorized if complaint is within staff member's assigned hostel block OR actively assigned to them
        const hasBlockAccess = Boolean(
          req.user.hostel_block &&
          req.user.hostel_block.trim() &&
          attachment.hostel_block &&
          attachment.hostel_block.trim().toLowerCase() === req.user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          hasActiveAssignment = await ComplaintModel.isComplaintAssignedToStaff(complaintId, req.user.id);
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          // Anti-enumeration: return 404 so existence of cross-hostel ticket/attachment is never leaked
          return res.status(404).json({
            success: false,
            message: 'Attachment not found.'
          });
        }
      } else if (req.user.role === 'admin') {
        // Admin: unrestricted access to all complaint attachments
      } else {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Access denied. Insufficient permissions to view attachments.'
        });
      }

      // 4. Resolve physical path safely with path-traversal prevention
      const absolutePath = resolveSafeStoragePath(attachment.storage_key);

      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({
          success: false,
          message: 'Attachment file not found on server.'
        });
      }

      // 4. Set verified Content-Type, safe Content-Disposition, and anti-sniff headers
      res.setHeader('Content-Type', attachment.mime_type);
      const safeFilename = (attachment.original_name || 'attachment')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // 5. Stream file
      const stream = fs.createReadStream(absolutePath);
      stream.on('error', (err) => {
        console.error('Attachment streaming error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'An error occurred while streaming attachment.'
          });
        }
      });
      return stream.pipe(res);
    } catch (error) {
      console.error('Download Attachment Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving attachment.'
      });
    }
  }
};

export default ComplaintController;

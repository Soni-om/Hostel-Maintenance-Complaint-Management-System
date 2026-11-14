/**
 * HostelCare — Complaint Data Model
 * Handles atomic ACID transactions for complaint creation and lifecycle history
 */

import path from 'node:path';
import fs from 'node:fs';
import pool from '../config/db.js';
import { generateNextTicketNumber } from '../utils/ticketGenerator.js';
import {
  COMPLAINTS_UPLOAD_DIR,
  validateAndProcessImage,
  generateRandomFilename,
  unlinkFileSafely
} from '../utils/fileStorage.js';

const MAX_CREATION_RETRIES = 3;

const ComplaintModel = {
  /**
   * Atomically creates a complaint and logs its initial status history entry
   * Employs fresh-transaction retry on collision and guarantees relational integrity
   * 
   * @param {object} complaintData
   * @param {number} complaintData.studentId
   * @param {number} complaintData.categoryId
   * @param {string} complaintData.title
   * @param {string} complaintData.description
   * @param {number|null} complaintData.blockId
   * @param {string} complaintData.hostelBlock
   * @param {string} complaintData.roomNumber
   * @returns {Promise<object>} Created complaint record
   */
  async createComplaint({
    studentId,
    categoryId,
    title,
    description,
    blockId = null,
    hostelBlock,
    roomNumber,
    photoFile = null
  }) {
    // 1. If photoFile is provided, validate & process in memory before acquiring DB connection
    let processedImage = null;
    if (photoFile && photoFile.buffer) {
      processedImage = await validateAndProcessImage(photoFile.buffer, photoFile.originalname);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CREATION_RETRIES; attempt++) {
      const connection = await pool.getConnection();
      let writtenFilePath = null;

      try {
        await connection.beginTransaction();

        // 1. Generate unique ticket number with highest numeric suffix inspection
        const ticketNumber = await generateNextTicketNumber(connection);

        // 2. Insert primary complaint entity (priority strictly hardcoded to 'normal')
        const [complaintResult] = await connection.execute(
          `INSERT INTO complaints (
             ticket_number, student_id, category_id, title, description,
             block_id, hostel_block, room_number, priority, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'pending')`,
          [
            ticketNumber,
            studentId,
            categoryId,
            title.trim(),
            description.trim(),
            blockId,
            hostelBlock.trim(),
            roomNumber.trim()
          ]
        );

        const complaintId = complaintResult.insertId;

        // 3. Atomically insert initial status history record
        await connection.execute(
          `INSERT INTO complaint_status_history (
             complaint_id, changed_by, old_status, new_status, remarks
           ) VALUES (?, ?, NULL, 'pending', ?)`,
          [
            complaintId,
            studentId,
            'Complaint lodged by resident.'
          ]
        );

        let createdAttachment = null;

        // 4. If photo is present, write re-encoded image to disk and record attachment metadata
        if (processedImage) {
          const filename = generateRandomFilename(processedImage.extension);
          const storageKey = `complaints/${filename}`;
          const absolutePath = path.join(COMPLAINTS_UPLOAD_DIR, filename);

          // Write processed buffer to private uploads directory
          await fs.promises.writeFile(absolutePath, processedImage.processedBuffer);
          writtenFilePath = absolutePath;

          const originalSanitizedName = path.basename(photoFile.originalname || `photo${processedImage.extension}`).slice(0, 255);

          const [attachmentResult] = await connection.execute(
            `INSERT INTO complaint_attachments (
               complaint_id, storage_key, original_name, mime_type, size_bytes
             ) VALUES (?, ?, ?, ?, ?)`,
            [
              complaintId,
              storageKey,
              originalSanitizedName,
              processedImage.mimeType,
              processedImage.sizeBytes
            ]
          );

          createdAttachment = {
            id: attachmentResult.insertId,
            original_name: originalSanitizedName,
            mime_type: processedImage.mimeType,
            size_bytes: processedImage.sizeBytes,
            uploaded_at: new Date().toISOString(),
            download_url: `/api/v1/complaints/${complaintId}/attachments/${attachmentResult.insertId}`
          };
        }

        // 5. Commit atomic transaction
        await connection.commit();

        // 6. Query and return clean complaint details
        const [rows] = await connection.query(
          `SELECT c.id, c.ticket_number, c.student_id, c.category_id,
                  cat.name AS category_name,
                  c.title, c.description, c.block_id, c.hostel_block,
                  c.room_number, c.priority, c.status, c.created_at, c.updated_at
           FROM complaints c
           LEFT JOIN complaint_categories cat ON c.category_id = cat.id
           WHERE c.id = ?`,
          [complaintId]
        );

        const complaint = rows[0];
        complaint.attachment = createdAttachment;

        return complaint;
      } catch (error) {
        await connection.rollback();
        lastError = error;

        // If file was written to disk, safely clean it up to prevent orphaned files
        if (writtenFilePath) {
          await unlinkFileSafely(writtenFilePath);
          writtenFilePath = null;
        }

        // Duplicate-key collision on ticket_number -> retry with fresh transaction
        if ((error.code === 'ER_DUP_ENTRY' || error.errno === 1062) && attempt < MAX_CREATION_RETRIES) {
          const jitterMs = 10 * attempt + Math.floor(Math.random() * 20);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
          continue;
        }

        throw error;
      } finally {
        connection.release();
      }
    }

    throw lastError;
  },

  /**
   * Finds a complaint by ID
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT c.id, c.ticket_number, c.student_id, c.category_id,
              cat.name AS category_name,
              c.title, c.description, c.block_id, c.hostel_block,
              c.room_number, c.priority, c.status, c.created_at, c.updated_at, c.resolved_at
       FROM complaints c
       LEFT JOIN complaint_categories cat ON c.category_id = cat.id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a complaint by ticket number
   * @param {string} ticketNumber
   * @returns {Promise<object|null>}
   */
  async findByTicketNumber(ticketNumber) {
    const [rows] = await pool.query(
      `SELECT c.id, c.ticket_number, c.student_id, c.category_id,
              cat.name AS category_name,
              c.title, c.description, c.block_id, c.hostel_block,
              c.room_number, c.priority, c.status, c.created_at, c.updated_at, c.resolved_at
       FROM complaints c
       LEFT JOIN complaint_categories cat ON c.category_id = cat.id
       WHERE c.ticket_number = ?
       LIMIT 1`,
      [ticketNumber]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds paginated complaints belonging to a specific student with optional filters
   * Enforces strict ownership, newest-first ordering (created_at DESC, id DESC), and category join
   * 
   * @param {object} params
   * @param {number} params.studentId
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @param {string} [params.status]
   * @param {number} [params.categoryId]
   * @returns {Promise<{ complaints: Array<object>, total: number, page: number, limit: number, totalPages: number }>}
   */
  async findStudentComplaints({ studentId, page = 1, limit = 10, status, categoryId } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ['c.student_id = ?'];
    const queryParams = [studentId];

    if (status && status.trim()) {
      whereClauses.push('c.status = ?');
      queryParams.push(status.trim().toLowerCase());
    }

    if (categoryId && parseInt(categoryId, 10) > 0) {
      whereClauses.push('c.category_id = ?');
      queryParams.push(parseInt(categoryId, 10));
    }

    const whereSql = whereClauses.join(' AND ');

    // 1. Total count query with exact same ownership and filter conditions
    const countSql = `SELECT COUNT(*) AS total FROM complaints c WHERE ${whereSql}`;
    const [countRows] = await pool.query(countSql, queryParams);
    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // 2. Data selection query with category join and newest-first ordering
    const dataSql = `
      SELECT c.id, c.ticket_number, c.student_id, c.category_id,
             cat.name AS category_name,
             c.title, c.description, c.block_id, c.hostel_block,
             c.room_number, c.priority, c.status, c.created_at,
             c.updated_at, c.resolved_at
      FROM complaints c
      LEFT JOIN complaint_categories cat ON c.category_id = cat.id
      WHERE ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

    return {
      complaints: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    };
  },

  /**
   * Retrieves live complaint counts aggregated by status for a specific student
   * @param {number} studentId
   * @returns {Promise<{ total: number, pending: number, assigned: number, in_progress: number, resolved: number, closed: number }>}
   */
  async getStudentComplaintStats(studentId) {
    const [rows] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END) AS assigned,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed
       FROM complaints
       WHERE student_id = ?`,
      [studentId]
    );

    const row = rows[0] || {};
    return {
      total: Number(row.total || 0),
      pending: Number(row.pending || 0),
      assigned: Number(row.assigned || 0),
      in_progress: Number(row.in_progress || 0),
      resolved: Number(row.resolved || 0),
      closed: Number(row.closed || 0)
    };
  },

  /**
   * Finds a single complaint by ID ensuring student ownership
   * Retrieves category name and latest remarks from complaint_status_history
   * 
   * @param {object} params
   * @param {number} params.complaintId
   * @param {number} params.studentId
   * @returns {Promise<object|null>}
   */
  async findStudentComplaintById({ complaintId, studentId }) {
    const [rows] = await pool.query(
      `SELECT c.id, c.ticket_number, c.student_id, c.category_id,
              cat.name AS category_name,
              c.title, c.description, c.block_id, c.hostel_block,
              c.room_number, c.priority, c.status, c.created_at,
              c.updated_at, c.resolved_at,
              (
                SELECT h.remarks
                FROM complaint_status_history h
                WHERE h.complaint_id = c.id
                ORDER BY h.changed_at DESC, h.id DESC
                LIMIT 1
              ) AS remarks,
              ca.id AS attachment_id,
              ca.original_name AS attachment_name,
              ca.mime_type AS attachment_mime,
              ca.size_bytes AS attachment_size,
              ca.uploaded_at AS attachment_uploaded_at
       FROM complaints c
       LEFT JOIN complaint_categories cat ON c.category_id = cat.id
       LEFT JOIN complaint_attachments ca ON ca.complaint_id = c.id
       WHERE c.id = ? AND c.student_id = ?
       LIMIT 1`,
      [complaintId, studentId]
    );

    if (rows.length === 0) {
      return null;
    }

    const complaint = rows[0];
    complaint.latest_remarks = complaint.remarks;

    if (complaint.attachment_id) {
      complaint.attachment = {
        id: complaint.attachment_id,
        original_name: complaint.attachment_name,
        mime_type: complaint.attachment_mime,
        size_bytes: Number(complaint.attachment_size),
        uploaded_at: complaint.attachment_uploaded_at,
        download_url: `/api/v1/complaints/${complaint.id}/attachments/${complaint.attachment_id}`
      };
    } else {
      complaint.attachment = null;
    }

    delete complaint.attachment_id;
    delete complaint.attachment_name;
    delete complaint.attachment_mime;
    delete complaint.attachment_size;
    delete complaint.attachment_uploaded_at;

    // Retrieve post-resolution feedback if submitted
    const [feedbackRows] = await pool.query(
      `SELECT f.id, f.complaint_id, f.student_id, f.rating, f.comment, f.created_at
       FROM feedback f
       WHERE f.complaint_id = ?
       LIMIT 1`,
      [complaintId]
    );
    complaint.feedback = feedbackRows.length > 0 ? feedbackRows[0] : null;

    return complaint;
  },

  /**
   * Finds an attachment record by complaint ID and optional attachment ID
   * Joins complaints table to access student_id and hostel_block for authorization verification
   * 
   * @param {object} params
   * @param {number} params.complaintId
   * @param {number|null} [params.attachmentId]
   * @returns {Promise<object|null>}
   */
  async findAttachment({ complaintId, attachmentId = null }) {
    let sql = `
      SELECT ca.id, ca.complaint_id, ca.storage_key, ca.original_name,
             ca.mime_type, ca.size_bytes, ca.uploaded_at,
             c.student_id, c.hostel_block
      FROM complaint_attachments ca
      INNER JOIN complaints c ON ca.complaint_id = c.id
      WHERE ca.complaint_id = ?
    `;
    const params = [complaintId];
    if (attachmentId) {
      sql += ' AND ca.id = ?';
      params.push(attachmentId);
    }
    sql += ' LIMIT 1';

    const [rows] = await pool.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Checks if a complaint has an active assignment to a specific staff member
   * @param {number} complaintId
   * @param {number} staffId
   * @returns {Promise<boolean>}
   */
  async isComplaintAssignedToStaff(complaintId, staffId) {
    const [rows] = await pool.query(
      `SELECT id FROM complaint_assignments
       WHERE complaint_id = ? AND staff_id = ? AND unassigned_at IS NULL
       LIMIT 1`,
      [complaintId, staffId]
    );
    return rows.length > 0;
  },

  /**
   * Finds paginated complaints for Staff/Admin according to Option D: Hybrid Domain & Assignment Visibility Policy
   *
   * @param {object} params
   * @param {object} params.user Authenticated user object (role, id, hostel_block)
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @param {string} [params.keyword]
   * @param {string} [params.status]
   * @param {number} [params.categoryId]
   * @param {string} [params.priority]
   * @param {string} [params.startDate]
   * @param {string} [params.endDate]
   * @param {boolean|string} [params.assignedToMe]
   * @param {string} [params.sortBy='created_at']
   * @param {string} [params.sortOrder='desc']
   * @returns {Promise<{ complaints: Array<object>, total: number, page: number, limit: number, totalPages: number }>}
   */
  async findStaffComplaints({
    user,
    page = 1,
    limit = 10,
    keyword,
    status,
    categoryId,
    priority,
    startDate,
    endDate,
    assignedToMe,
    sortBy = 'created_at',
    sortOrder = 'desc'
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [];
    const queryParams = [];

    // 1. Enforce Option D Hybrid Domain & Assignment Visibility Policy
    if (user.role === 'admin') {
      // Admin has unrestricted access across all hostel blocks and assignments
    } else if (user.role === 'staff') {
      if (user.hostel_block && user.hostel_block.trim()) {
        // Staff with assigned block: can view complaints in their block OR actively assigned to them
        whereClauses.push(`(
          c.hostel_block = ?
          OR EXISTS (
            SELECT 1 FROM complaint_assignments ca_perm
            WHERE ca_perm.complaint_id = c.id
              AND ca_perm.staff_id = ?
              AND ca_perm.unassigned_at IS NULL
          )
        )`);
        queryParams.push(user.hostel_block.trim(), user.id);
      } else {
        // NULL hostel_block rule: Staff without an assigned block can only view complaints actively assigned to them
        whereClauses.push(`EXISTS (
          SELECT 1 FROM complaint_assignments ca_perm
          WHERE ca_perm.complaint_id = c.id
            AND ca_perm.staff_id = ?
            AND ca_perm.unassigned_at IS NULL
        )`);
        queryParams.push(user.id);
      }
    } else {
      // Any other role (e.g. student) has zero visibility through staff model
      whereClauses.push('1 = 0');
    }

    // 2. Filter: assigned_to_me
    const isAssignedToMe = (assignedToMe === true || assignedToMe === 'true' || assignedToMe === '1');
    if (isAssignedToMe) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM complaint_assignments ca_filter
        WHERE ca_filter.complaint_id = c.id
          AND ca_filter.staff_id = ?
          AND ca_filter.unassigned_at IS NULL
      )`);
      queryParams.push(user.id);
    }

    // 3. Filter: keyword search (ticket_number, title, description, resident name, room_number)
    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      whereClauses.push(`(
        c.ticket_number LIKE ?
        OR c.title LIKE ?
        OR c.description LIKE ?
        OR u.name LIKE ?
        OR c.room_number LIKE ?
      )`);
      queryParams.push(kw, kw, kw, kw, kw);
    }

    // 4. Filter: status
    if (status && status.trim()) {
      whereClauses.push('c.status = ?');
      queryParams.push(status.trim().toLowerCase());
    }

    // 5. Filter: category_id
    if (categoryId && parseInt(categoryId, 10) > 0) {
      whereClauses.push('c.category_id = ?');
      queryParams.push(parseInt(categoryId, 10));
    }

    // 6. Filter: priority
    if (priority && priority.trim()) {
      whereClauses.push('c.priority = ?');
      queryParams.push(priority.trim().toLowerCase());
    }

    // 7. Filter: date range (created_at)
    if (startDate && startDate.trim()) {
      whereClauses.push('c.created_at >= ?');
      queryParams.push(`${startDate.trim()} 00:00:00`);
    }
    if (endDate && endDate.trim()) {
      whereClauses.push('c.created_at <= ?');
      queryParams.push(`${endDate.trim()} 23:59:59.999`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 8. Sorting allowlist map
    const SORT_COLUMNS = {
      'created_at': 'c.created_at',
      'priority': 'c.priority',
      'status': 'c.status',
      'id': 'c.id',
      'ticket_number': 'c.ticket_number'
    };

    const sortColumn = SORT_COLUMNS[sortBy] || 'c.created_at';
    const sortDirection = (String(sortOrder).toLowerCase() === 'asc') ? 'ASC' : 'DESC';

    // 9. Count query with identical WHERE conditions (no joins creating duplicate rows)
    const countSql = `
      SELECT COUNT(*) AS total
      FROM complaints c
      INNER JOIN users u ON c.student_id = u.id
      LEFT JOIN complaint_categories cat ON c.category_id = cat.id
      ${whereSql}
    `;
    const [countRows] = await pool.query(countSql, queryParams);
    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // 10. Data query with resident details, active staff assignment, and attachment flag
    const dataSql = `
      SELECT c.id, c.ticket_number, c.student_id,
             u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
             c.category_id, cat.name AS category_name,
             c.title, c.description, c.block_id, c.hostel_block, c.room_number,
             c.priority, c.status, c.created_at, c.updated_at, c.resolved_at,
             (
               SELECT ca.staff_id
               FROM complaint_assignments ca
               WHERE ca.complaint_id = c.id AND ca.unassigned_at IS NULL
               ORDER BY ca.id DESC
               LIMIT 1
             ) AS assigned_staff_id,
             (
               SELECT u2.name
               FROM complaint_assignments ca
               INNER JOIN users u2 ON ca.staff_id = u2.id
               WHERE ca.complaint_id = c.id AND ca.unassigned_at IS NULL
               ORDER BY ca.id DESC
               LIMIT 1
             ) AS assigned_staff_name,
             (
               SELECT ca.assigned_at
               FROM complaint_assignments ca
               WHERE ca.complaint_id = c.id AND ca.unassigned_at IS NULL
               ORDER BY ca.id DESC
               LIMIT 1
             ) AS assigned_at,
             (
               SELECT ca.id
               FROM complaint_attachments ca
               WHERE ca.complaint_id = c.id
               LIMIT 1
             ) AS attachment_id
      FROM complaints c
      INNER JOIN users u ON c.student_id = u.id
      LEFT JOIN complaint_categories cat ON c.category_id = cat.id
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}, c.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

    const formattedComplaints = rows.map((row) => ({
      ...row,
      has_attachment: Boolean(row.attachment_id),
      attachment_download_url: row.attachment_id
        ? `/api/v1/complaints/${row.id}/attachments/${row.attachment_id}`
        : null
    }));

    return {
      complaints: formattedComplaints,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    };
  },

  /**
   * Computes real database statistics respecting Option D visibility for the authenticated user
   *
   * @param {object} params
   * @param {object} params.user Authenticated user object (role, id, hostel_block)
   * @returns {Promise<{ totalPermitted: number, assignedToMe: number, pendingReview: number, inProgress: number, resolved: number }>}
   */
  async getStaffComplaintStats({ user }) {
    const scopeWhereClauses = [];
    const scopeParams = [];

    // 1. Enforce Option D Hybrid Domain & Assignment Visibility Policy
    if (user.role === 'admin') {
      // Admin sees global scope
    } else if (user.role === 'staff') {
      if (user.hostel_block && user.hostel_block.trim()) {
        scopeWhereClauses.push(`(
          c.hostel_block = ?
          OR EXISTS (
            SELECT 1 FROM complaint_assignments ca_perm
            WHERE ca_perm.complaint_id = c.id
              AND ca_perm.staff_id = ?
              AND ca_perm.unassigned_at IS NULL
          )
        )`);
        scopeParams.push(user.hostel_block.trim(), user.id);
      } else {
        scopeWhereClauses.push(`EXISTS (
          SELECT 1 FROM complaint_assignments ca_perm
          WHERE ca_perm.complaint_id = c.id
            AND ca_perm.staff_id = ?
            AND ca_perm.unassigned_at IS NULL
        )`);
        scopeParams.push(user.id);
      }
    } else {
      return {
        totalPermitted: 0,
        assignedToMe: 0,
        pendingReview: 0,
        inProgress: 0,
        resolved: 0
      };
    }

    const scopeWhereSql = scopeWhereClauses.length > 0 ? `WHERE ${scopeWhereClauses.join(' AND ')}` : '';

    const statsSql = `
      SELECT
        COUNT(*) AS totalPermitted,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM complaint_assignments ca
          WHERE ca.complaint_id = c.id
            AND ca.staff_id = ?
            AND ca.unassigned_at IS NULL
        ) THEN 1 END) AS assignedToMe,
        COUNT(CASE WHEN c.status = 'pending' THEN 1 END) AS pendingReview,
        COUNT(CASE WHEN c.status = 'in_progress' THEN 1 END) AS inProgress,
        COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) AS resolved
      FROM complaints c
      ${scopeWhereSql}
    `;

    const [rows] = await pool.query(statsSql, [user.id, ...scopeParams]);
    const row = rows[0] || {};

    return {
      totalPermitted: Number(row.totalPermitted || 0),
      assignedToMe: Number(row.assignedToMe || 0),
      pendingReview: Number(row.pendingReview || 0),
      inProgress: Number(row.inProgress || 0),
      resolved: Number(row.resolved || 0)
    };
  },

  /**
   * Atomically assigns or reassigns a complaint to an active staff member
   * - Enforces Option D access control for requesting user
   * - Verifies complaint exists and is not closed
   * - Verifies target user is an active maintenance staff account
   * - Closes previous active assignment (if any) with unassigned_at = CURRENT_TIMESTAMP
   * - Creates new active assignment record
   * - Moves pending complaints to 'assigned' status and logs lifecycle status history
   *
   * @param {object} params
   * @param {number} params.complaintId
   * @param {number} params.staffId
   * @param {number} params.assignedBy
   * @param {string|null} [params.notes]
   * @param {object} params.user Requesting authenticated user (role, id, hostel_block)
   * @returns {Promise<{ assignment: object, complaint: object }>}
   */
  async assignComplaint({ complaintId, staffId, assignedBy, notes = null, user }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Lock and inspect complaint
      const [complaintRows] = await connection.query(
        `SELECT c.id, c.ticket_number, c.student_id, c.hostel_block, c.status, c.priority
         FROM complaints c
         WHERE c.id = ?
         FOR UPDATE`,
        [complaintId]
      );

      if (complaintRows.length === 0) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      const complaint = complaintRows[0];

      // 2. Enforce Option D Hybrid Domain & Assignment Visibility Policy on complaint
      if (user.role === 'staff') {
        const hasBlockAccess = Boolean(
          user.hostel_block &&
          user.hostel_block.trim() &&
          complaint.hostel_block &&
          complaint.hostel_block.trim().toLowerCase() === user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          const [assignmentCheck] = await connection.query(
            `SELECT id FROM complaint_assignments
             WHERE complaint_id = ? AND staff_id = ? AND unassigned_at IS NULL
             LIMIT 1`,
            [complaintId, user.id]
          );
          hasActiveAssignment = assignmentCheck.length > 0;
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          // Anti-enumeration: return 404
          const err = new Error('Complaint not found.');
          err.statusCode = 404;
          throw err;
        }
      }

      // 3. Verify complaint lifecycle state
      if (complaint.status === 'closed') {
        const err = new Error('Cannot assign a closed complaint. Please reopen the ticket before assigning.');
        err.statusCode = 400;
        throw err;
      }

      // 4. Verify target user is an active maintenance staff account
      const [userRows] = await connection.query(
        `SELECT id, name, email, phone, role, account_status, staff_designation, hostel_block
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [staffId]
      );

      if (userRows.length === 0) {
        const err = new Error('Assigned staff user not found.');
        err.statusCode = 400;
        throw err;
      }

      const targetStaff = userRows[0];

      if (targetStaff.role !== 'staff') {
        const err = new Error(`Invalid assignee: Complaints can only be assigned to active maintenance staff accounts (Target user role: '${targetStaff.role}').`);
        err.statusCode = 400;
        throw err;
      }

      if (targetStaff.account_status !== 'active') {
        const err = new Error('Cannot assign complaint to an inactive staff member.');
        err.statusCode = 400;
        throw err;
      }

      // 5. Close previous active assignment if reassigned
      const [activeAssignments] = await connection.query(
        `SELECT id, staff_id FROM complaint_assignments
         WHERE complaint_id = ? AND unassigned_at IS NULL`,
        [complaintId]
      );

      let isReassignment = false;
      let previousStaffId = null;

      if (activeAssignments.length > 0) {
        isReassignment = true;
        previousStaffId = activeAssignments[0].staff_id;

        await connection.query(
          `UPDATE complaint_assignments
           SET unassigned_at = CURRENT_TIMESTAMP
           WHERE complaint_id = ? AND unassigned_at IS NULL`,
          [complaintId]
        );
      }

      // 6. Insert new assignment record
      const [insertResult] = await connection.execute(
        `INSERT INTO complaint_assignments (
           complaint_id, staff_id, assigned_by, notes, assigned_at
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          complaintId,
          staffId,
          assignedBy,
          notes && notes.trim() ? notes.trim() : null
        ]
      );

      const newAssignmentId = insertResult.insertId;

      // 7. Update status: Move Pending complaints to Assigned when appropriate
      let newStatus = complaint.status;
      const previousStatus = complaint.status;

      if (complaint.status === 'pending') {
        newStatus = 'assigned';
        await connection.query(
          `UPDATE complaints SET status = 'assigned' WHERE id = ?`,
          [complaintId]
        );

        await connection.execute(
          `INSERT INTO complaint_status_history (
             complaint_id, changed_by, old_status, new_status, remarks, changed_at
           ) VALUES (?, ?, 'pending', 'assigned', ?, CURRENT_TIMESTAMP)`,
          [
            complaintId,
            assignedBy,
            `Assigned to ${targetStaff.name}${targetStaff.staff_designation ? ` (${targetStaff.staff_designation})` : ''}.${notes && notes.trim() ? ` Notes: ${notes.trim()}` : ''}`
          ]
        );
      } else if (isReassignment) {
        await connection.execute(
          `INSERT INTO complaint_status_history (
             complaint_id, changed_by, old_status, new_status, remarks, changed_at
           ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            complaintId,
            assignedBy,
            complaint.status,
            complaint.status,
            `Reassigned to ${targetStaff.name}${targetStaff.staff_designation ? ` (${targetStaff.staff_designation})` : ''}.${notes && notes.trim() ? ` Notes: ${notes.trim()}` : ''}`
          ]
        );
      }

      await connection.commit();

      // 8. Fetch complete new assignment details
      const [assignmentRows] = await pool.query(
        `SELECT ca.id, ca.complaint_id, ca.staff_id,
                u.name AS staff_name, u.email AS staff_email, u.phone AS staff_phone, u.staff_designation,
                ca.assigned_by,
                u_by.name AS assigned_by_name,
                ca.notes, ca.assigned_at, ca.unassigned_at,
                true AS is_active
         FROM complaint_assignments ca
         INNER JOIN users u ON ca.staff_id = u.id
         INNER JOIN users u_by ON ca.assigned_by = u_by.id
         WHERE ca.id = ?`,
        [newAssignmentId]
      );

      return {
        assignment: {
          ...assignmentRows[0],
          is_active: true
        },
        complaint: {
          id: complaintId,
          ticket_number: complaint.ticket_number,
          status: newStatus,
          previous_status: previousStatus,
          is_reassignment: isReassignment
        }
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Retrieves full chronological assignment history for a complaint
   * @param {number} complaintId
   * @returns {Promise<Array<object>>}
   */
  async getComplaintAssignments(complaintId) {
    const [rows] = await pool.query(
      `SELECT ca.id, ca.complaint_id, ca.staff_id,
              u.name AS staff_name, u.email AS staff_email, u.phone AS staff_phone, u.staff_designation,
              ca.assigned_by,
              u_by.name AS assigned_by_name,
              ca.notes, ca.assigned_at, ca.unassigned_at,
              (ca.unassigned_at IS NULL) AS is_active
       FROM complaint_assignments ca
       INNER JOIN users u ON ca.staff_id = u.id
       INNER JOIN users u_by ON ca.assigned_by = u_by.id
       WHERE ca.complaint_id = ?
       ORDER BY ca.assigned_at ASC, ca.id ASC`,
      [complaintId]
    );

    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active)
    }));
  },

  /**
   * Updates complaint status through verified lifecycle transition rules
   * Executes inside an ACID transaction with FOR UPDATE row locking and status history logging
   *
   * @param {object} params
   * @param {number} params.complaintId
   * @param {string} params.newStatus
   * @param {string} [params.remarks]
   * @param {object} params.user - Authenticated user context { id, role, hostel_block }
   * @returns {Promise<object>} Updated complaint and transition details
   */
  async updateStatus({ complaintId, newStatus, remarks, user }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch current complaint with pessimistic row lock
      const [rows] = await connection.query(
        `SELECT id, ticket_number, student_id, category_id, title, hostel_block,
                room_number, priority, status, resolved_at, created_at
         FROM complaints
         WHERE id = ?
         FOR UPDATE`,
        [complaintId]
      );

      if (rows.length === 0) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      const complaint = rows[0];
      const currentStatus = complaint.status;
      const targetStatus = String(newStatus).toLowerCase().trim();

      // 2. Enforce Option D Hybrid Visibility Policy for staff / Ownership for student
      if (user.role === 'staff') {
        const hasBlockAccess = Boolean(
          user.hostel_block &&
          user.hostel_block.trim() &&
          complaint.hostel_block &&
          complaint.hostel_block.trim().toLowerCase() === user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          const [assignCheck] = await connection.query(
            `SELECT id FROM complaint_assignments
             WHERE complaint_id = ? AND staff_id = ? AND unassigned_at IS NULL
             LIMIT 1`,
            [complaintId, user.id]
          );
          hasActiveAssignment = assignCheck.length > 0;
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          const err = new Error('Complaint not found.');
          err.statusCode = 404;
          throw err;
        }
      } else if (user.role === 'student') {
        if (complaint.student_id !== user.id) {
          const err = new Error('Complaint not found.');
          err.statusCode = 404;
          throw err;
        }
      }

      // 3. Prevent no-op transitions
      if (currentStatus === targetStatus) {
        const err = new Error(`Complaint is already in '${targetStatus}' status.`);
        err.statusCode = 400;
        throw err;
      }

      // 4. Role-based transition authorization
      if (user.role === 'student') {
        if (currentStatus === 'resolved' && (targetStatus === 'closed' || targetStatus === 'in_progress')) {
          // Permitted student actions: close or reopen a resolved complaint
        } else {
          const err = new Error("Access denied: Students can only close or reopen complaints in 'resolved' status.");
          err.statusCode = 403;
          throw err;
        }
      }

      // 5. Allowed lifecycle transition rules state machine
      const ALLOWED_TRANSITIONS = {
        pending: ['assigned', 'in_progress'],
        assigned: ['in_progress', 'pending'],
        in_progress: ['resolved', 'assigned'],
        resolved: ['closed', 'in_progress'],
        closed: ['in_progress'] // Reopening from closed is Admin-only
      };

      const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
      if (!allowedNext.includes(targetStatus)) {
        const err = new Error(
          `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions: ${allowedNext.length > 0 ? allowedNext.join(', ') : 'none'}.`
        );
        err.statusCode = 400;
        throw err;
      }

      // 6. Terminal closed state check: Only Admin can reopen a closed ticket
      if (currentStatus === 'closed' && user.role !== 'admin') {
        const err = new Error('Cannot change status of a closed complaint. Closed tickets can only be reopened by an Administrator.');
        err.statusCode = 400;
        throw err;
      }

      // 7. Compulsory remarks validation
      if (targetStatus === 'resolved') {
        if (!remarks || !remarks.trim()) {
          const err = new Error('Resolution remarks are required when marking a complaint as resolved.');
          err.statusCode = 400;
          throw err;
        }
      }

      if (currentStatus === 'resolved' && targetStatus === 'in_progress') {
        if (!remarks || !remarks.trim()) {
          const err = new Error('A reason or remark is required when reopening a complaint.');
          err.statusCode = 400;
          throw err;
        }
      }

      // 8. Update complaint in MySQL
      let resolvedAtSql = '';
      if (targetStatus === 'resolved') {
        resolvedAtSql = ', resolved_at = CURRENT_TIMESTAMP';
      } else if (currentStatus === 'resolved' && targetStatus !== 'resolved') {
        resolvedAtSql = ', resolved_at = NULL';
      }

      await connection.query(
        `UPDATE complaints
         SET status = ? ${resolvedAtSql}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetStatus, complaintId]
      );

      // 9. Record status history audit entry
      const cleanRemarks = remarks && remarks.trim() ? remarks.trim() : null;
      const [historyResult] = await connection.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [complaintId, user.id, currentStatus, targetStatus, cleanRemarks]
      );

      await connection.commit();

      return {
        id: complaintId,
        ticket_number: complaint.ticket_number,
        old_status: currentStatus,
        status: targetStatus,
        resolved_at: targetStatus === 'resolved' ? new Date().toISOString() : null,
        history_id: historyResult.insertId,
        remarks: cleanRemarks
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Updates complaint priority level with RBAC enforcement and audit trail
   *
   * @param {object} params
   * @param {number} params.complaintId
   * @param {string} params.newPriority - 'low', 'normal', 'high', 'urgent'
   * @param {string} [params.remarks]
   * @param {object} params.user - Authenticated user context
   * @returns {Promise<object>} Updated complaint details
   */
  async updatePriority({ complaintId, newPriority, remarks, user }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch current complaint with row lock
      const [rows] = await connection.query(
        `SELECT id, ticket_number, student_id, hostel_block, priority, status
         FROM complaints
         WHERE id = ?
         FOR UPDATE`,
        [complaintId]
      );

      if (rows.length === 0) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      const complaint = rows[0];

      // 2. RBAC: Only staff and admin can update priority
      if (user.role === 'student') {
        const err = new Error('Access denied. Insufficient permissions to update complaint priority.');
        err.statusCode = 403;
        throw err;
      }

      // 3. Option D check for staff
      if (user.role === 'staff') {
        const hasBlockAccess = Boolean(
          user.hostel_block &&
          user.hostel_block.trim() &&
          complaint.hostel_block &&
          complaint.hostel_block.trim().toLowerCase() === user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          const [assignCheck] = await connection.query(
            `SELECT id FROM complaint_assignments
             WHERE complaint_id = ? AND staff_id = ? AND unassigned_at IS NULL
             LIMIT 1`,
            [complaintId, user.id]
          );
          hasActiveAssignment = assignCheck.length > 0;
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          const err = new Error('Complaint not found.');
          err.statusCode = 404;
          throw err;
        }
      }

      // 4. Disallow modifying closed complaints
      if (complaint.status === 'closed') {
        const err = new Error('Cannot update priority of a closed complaint.');
        err.statusCode = 400;
        throw err;
      }

      // 5. Priority allowlist and normalization
      const targetPriority = String(newPriority).toLowerCase().trim();
      if (!['low', 'normal', 'high', 'urgent'].includes(targetPriority)) {
        const err = new Error("Invalid priority level. Allowed values: 'low', 'normal', 'high', 'urgent'.");
        err.statusCode = 400;
        throw err;
      }

      if (complaint.priority === targetPriority) {
        const err = new Error(`Complaint priority is already set to '${targetPriority}'.`);
        err.statusCode = 400;
        throw err;
      }

      // 6. Update priority in MySQL
      await connection.query(
        `UPDATE complaints
         SET priority = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetPriority, complaintId]
      );

      // 7. Record priority change audit remark in complaint_status_history
      const auditRemark = remarks && remarks.trim()
        ? `Priority updated to '${targetPriority}': ${remarks.trim()}`
        : `Priority updated from '${complaint.priority}' to '${targetPriority}'.`;

      await connection.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [complaintId, user.id, complaint.status, complaint.status, auditRemark]
      );

      await connection.commit();

      return {
        id: complaintId,
        ticket_number: complaint.ticket_number,
        old_priority: complaint.priority,
        priority: targetPriority,
        status: complaint.status
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Closes a resolved complaint (Student owner or Admin)
   */
  async closeComplaint({ complaintId, closingRemarks, user }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT id, ticket_number, student_id, hostel_block, status
         FROM complaints
         WHERE id = ?
         FOR UPDATE`,
        [complaintId]
      );

      if (rows.length === 0) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      const complaint = rows[0];

      if (user.role === 'student' && complaint.student_id !== user.id) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      if (complaint.status !== 'resolved') {
        const err = new Error(`Cannot close complaint. Ticket must be in 'resolved' status before closing (Current status: '${complaint.status}').`);
        err.statusCode = 400;
        throw err;
      }

      await connection.query(
        `UPDATE complaints SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [complaintId]
      );

      const remarkText = closingRemarks && closingRemarks.trim()
        ? closingRemarks.trim()
        : 'Complaint closed after resident resolution confirmation.';

      await connection.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, 'resolved', 'closed', ?, CURRENT_TIMESTAMP)`,
        [complaintId, user.id, remarkText]
      );

      await connection.commit();

      return {
        id: complaintId,
        ticket_number: complaint.ticket_number,
        status: 'closed',
        previous_status: 'resolved'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Reopens a resolved complaint (Student owner, Staff, or Admin)
   */
  async reopenComplaint({ complaintId, reason, user }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT id, ticket_number, student_id, hostel_block, status
         FROM complaints
         WHERE id = ?
         FOR UPDATE`,
        [complaintId]
      );

      if (rows.length === 0) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      const complaint = rows[0];

      if (user.role === 'student' && complaint.student_id !== user.id) {
        const err = new Error('Complaint not found.');
        err.statusCode = 404;
        throw err;
      }

      if (user.role === 'staff') {
        const hasBlockAccess = Boolean(
          user.hostel_block &&
          user.hostel_block.trim() &&
          complaint.hostel_block &&
          complaint.hostel_block.trim().toLowerCase() === user.hostel_block.trim().toLowerCase()
        );

        let hasActiveAssignment = false;
        if (!hasBlockAccess) {
          const [assignCheck] = await connection.query(
            `SELECT id FROM complaint_assignments
             WHERE complaint_id = ? AND staff_id = ? AND unassigned_at IS NULL
             LIMIT 1`,
            [complaintId, user.id]
          );
          hasActiveAssignment = assignCheck.length > 0;
        }

        if (!hasBlockAccess && !hasActiveAssignment) {
          const err = new Error('Complaint not found.');
          err.statusCode = 404;
          throw err;
        }
      }

      if (complaint.status !== 'resolved' && complaint.status !== 'closed') {
        const err = new Error(`Cannot reopen complaint. Ticket is currently in '${complaint.status}' status.`);
        err.statusCode = 400;
        throw err;
      }

      if (complaint.status === 'closed' && user.role !== 'admin') {
        const err = new Error('Only an Administrator can reopen a closed complaint.');
        err.statusCode = 400;
        throw err;
      }

      if (!reason || !reason.trim()) {
        const err = new Error('Reason is required when reopening a complaint.');
        err.statusCode = 400;
        throw err;
      }

      await connection.query(
        `UPDATE complaints SET status = 'in_progress', resolved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [complaintId]
      );

      const remarkText = `Reopened: ${reason.trim()}`;

      await connection.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, ?, 'in_progress', ?, CURRENT_TIMESTAMP)`,
        [complaintId, user.id, complaint.status, remarkText]
      );

      await connection.commit();

      return {
        id: complaintId,
        ticket_number: complaint.ticket_number,
        status: 'in_progress',
        previous_status: complaint.status
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Retrieves full chronological status history for a complaint
   * @param {number} complaintId
   * @returns {Promise<Array<object>>}
   */
  async getComplaintStatusHistory(complaintId) {
    const [rows] = await pool.query(
      `SELECT h.id, h.complaint_id, h.changed_by,
              u.name AS changed_by_name,
              u.name AS actor,
              u.role AS changed_by_role,
              u.role AS actor_role,
              u.staff_designation,
              h.old_status, h.new_status, h.remarks,
              h.changed_at,
              h.changed_at AS timestamp,
              h.changed_at AS created_at
       FROM complaint_status_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.complaint_id = ?
       ORDER BY h.changed_at ASC, h.id ASC`,
      [complaintId]
    );

    return rows;
  },

  /**
   * Submits post-resolution quality feedback and 1-5 rating for a complaint
   * Enforces complaint ownership, resolved/closed status eligibility, and duplicate rejection.
   * Atomically records audit event in complaint_status_history.
   *
   * @param {object} params
   * @param {number} params.complaintId
   * @param {number} params.studentId
   * @param {number} params.rating
   * @param {string|null} [params.comment]
   * @returns {Promise<object>}
   */
  async submitFeedback({ complaintId, studentId, rating, comment }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch complaint with row-level lock
      const [complaintRows] = await connection.execute(
        `SELECT id, ticket_number, student_id, status FROM complaints WHERE id = ? FOR UPDATE`,
        [complaintId]
      );

      if (complaintRows.length === 0) {
        const error = new Error('Complaint not found.');
        error.statusCode = 404;
        throw error;
      }

      const complaint = complaintRows[0];

      // 2. Ownership verification: student must be complaint author (uniform 404 anti-enumeration)
      if (complaint.student_id !== studentId) {
        const error = new Error('Complaint not found.');
        error.statusCode = 404;
        throw error;
      }

      // 3. Resolution eligibility verification: complaint must be in 'resolved' or 'closed' status
      if (!['resolved', 'closed'].includes(complaint.status)) {
        const error = new Error('Feedback can only be submitted for resolved or closed complaints.');
        error.statusCode = 400;
        error.code = 'COMPLAINT_NOT_ELIGIBLE';
        throw error;
      }

      // 4. Duplicate feedback check: one feedback per complaint
      const [existingFeedback] = await connection.execute(
        `SELECT id FROM feedback WHERE complaint_id = ?`,
        [complaintId]
      );

      if (existingFeedback.length > 0) {
        const error = new Error('Feedback has already been submitted for this complaint.');
        error.statusCode = 409;
        error.code = 'DUPLICATE_FEEDBACK';
        throw error;
      }

      // 5. Clean comment text
      const cleanComment = (comment && typeof comment === 'string' && comment.trim())
        ? comment.trim().slice(0, 2000)
        : null;

      // 6. Insert feedback record into database
      const [insertResult] = await connection.execute(
        `INSERT INTO feedback (complaint_id, student_id, rating, comment, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [complaintId, studentId, rating, cleanComment]
      );

      const feedbackId = insertResult.insertId;

      // 7. Atomically record feedback submission in complaint_status_history
      const auditRemark = `Resident submitted satisfaction rating: ${rating}/5 stars.${cleanComment ? ` Comments: "${cleanComment}"` : ''}`;
      await connection.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [complaintId, studentId, complaint.status, complaint.status, auditRemark]
      );

      await connection.commit();

      return {
        id: feedbackId,
        complaint_id: complaintId,
        student_id: studentId,
        rating,
        comment: cleanComment,
        ticket_number: complaint.ticket_number
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Retrieves feedback for a specific complaint
   * @param {number} complaintId
   * @returns {Promise<object|null>}
   */
  async getFeedbackByComplaintId(complaintId) {
    const [rows] = await pool.query(
      `SELECT f.id, f.complaint_id, f.student_id,
              u.name AS student_name,
              f.rating, f.comment, f.created_at
       FROM feedback f
       LEFT JOIN users u ON f.student_id = u.id
       WHERE f.complaint_id = ?
       LIMIT 1`,
      [complaintId]
    );

    return rows.length > 0 ? rows[0] : null;
  }
};

export default ComplaintModel;

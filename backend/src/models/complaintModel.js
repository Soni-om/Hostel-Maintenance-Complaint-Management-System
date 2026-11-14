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

    return complaint;
  },

  /**
   * Finds an attachment record by complaint ID and optional attachment ID
   * Joins complaints table to access student_id for authorization verification
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
             c.student_id
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
  }
};

export default ComplaintModel;

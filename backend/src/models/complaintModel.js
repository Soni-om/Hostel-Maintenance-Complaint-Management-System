/**
 * HostelCare — Complaint Data Model
 * Handles atomic ACID transactions for complaint creation and lifecycle history
 */

import pool from '../config/db.js';
import { generateNextTicketNumber } from '../utils/ticketGenerator.js';

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
    roomNumber
  }) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CREATION_RETRIES; attempt++) {
      const connection = await pool.getConnection();

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

        // 4. Commit atomic transaction
        await connection.commit();

        // 5. Query and return clean complaint details
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

        return rows[0];
      } catch (error) {
        await connection.rollback();
        lastError = error;

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
              ) AS remarks
       FROM complaints c
       LEFT JOIN complaint_categories cat ON c.category_id = cat.id
       WHERE c.id = ? AND c.student_id = ?
       LIMIT 1`,
      [complaintId, studentId]
    );

    if (rows.length === 0) {
      return null;
    }

    const complaint = rows[0];
    complaint.latest_remarks = complaint.remarks;
    return complaint;
  }
};

export default ComplaintModel;

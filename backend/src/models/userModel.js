/**
 * HostelCare — User Data Access Model
 * Database operations for User entities using mysql2/promise connection pool
 */

import pool from '../config/db.js';

const UserModel = {
  /**
   * Finds a user record by email address (case-insensitive)
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const [rows] = await pool.query(
      `SELECT id, name, email, password_hash, phone, role, account_status,
              block_id, hostel_block, room_number, staff_designation, created_at, updated_at
       FROM users
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [email.trim()]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a user by primary key ID (excluding sensitive password hash)
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, role, account_status,
              block_id, hostel_block, room_number, staff_designation, created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a hostel block by block_name (e.g. 'Block A') or block_code (e.g. 'BLK-A')
   * @param {string} blockIdentifier
   * @returns {Promise<object|null>}
   */
  async findBlock(blockIdentifier) {
    if (!blockIdentifier) return null;
    const trimmed = blockIdentifier.trim();
    const [rows] = await pool.query(
      `SELECT id, block_code, block_name
       FROM hostel_blocks
       WHERE block_name = ? 
          OR block_code = ?
          OR block_name LIKE CONCAT(?, '%')
       LIMIT 1`,
      [trimmed, trimmed, trimmed]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Inserts a new student user record into MySQL
   * @param {object} userData
   * @returns {Promise<object>} Created user record without password_hash
   */
  async createStudent({ name, email, passwordHash, phone = null, blockId = null, hostelBlock = null, roomNumber = null }) {
    const [result] = await pool.execute(
      `INSERT INTO users (
         name, email, password_hash, phone, role, account_status, block_id, hostel_block, room_number
       ) VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?)`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        phone ? phone.trim() : null,
        blockId || null,
        hostelBlock ? hostelBlock.trim() : null,
        roomNumber ? roomNumber.trim() : null
      ]
    );

    return this.findById(result.insertId);
  }
};

export default UserModel;

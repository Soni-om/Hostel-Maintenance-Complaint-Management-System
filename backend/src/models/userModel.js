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
  },

  /**
   * Controlled Provisioning: Inserts a new staff or admin user record into MySQL
   * Accessible exclusively by authorized administrative processes
   * @param {object} userData
   * @returns {Promise<object>} Created user record without password_hash
   */
  async createUser({
    name,
    email,
    passwordHash,
    phone = null,
    role = 'staff',
    accountStatus = 'active',
    blockId = null,
    hostelBlock = null,
    roomNumber = null,
    staffDesignation = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO users (
         name, email, password_hash, phone, role, account_status,
         block_id, hostel_block, room_number, staff_designation
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        phone ? phone.trim() : null,
        role,
        accountStatus || 'active',
        blockId || null,
        hostelBlock ? hostelBlock.trim() : null,
        roomNumber ? roomNumber.trim() : null,
        staffDesignation ? staffDesignation.trim() : null
      ]
    );

    return this.findById(result.insertId);
  },

  /**
   * Retrieves paginated users list with optional role, status, and search filters
   * Strictly excludes password_hash from result sets
   */
  async findAll({ role = null, status = null, search = null, page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (role) {
      conditions.push('role = ?');
      params.push(role.toLowerCase().trim());
    }

    if (status) {
      conditions.push('account_status = ?');
      params.push(status.toLowerCase().trim());
    }

    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching records
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // Fetch paginated user records without sensitive credentials
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, role, account_status,
              block_id, hostel_block, room_number, staff_designation, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return {
      users: rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  },

  /**
   * Updates account_status for a user
   * @param {number} id 
   * @param {string} status 'active' or 'inactive'
   * @returns {Promise<object|null>} Updated user record
   */
  async updateStatus(id, status) {
    await pool.query(
      `UPDATE users SET account_status = ? WHERE id = ?`,
      [status, id]
    );
    return this.findById(id);
  },

  /**
   * Retrieves all active maintenance staff accounts
   * @returns {Promise<Array<object>>}
   */
  async findActiveStaff() {
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, role, staff_designation, hostel_block
       FROM users
       WHERE role = 'staff' AND account_status = 'active'
       ORDER BY name ASC`
    );
    return rows;
  },

  /**
   * Permanently deletes a user by ID (Used primarily in automated test teardowns)
   * @param {number} id 
   * @returns {Promise<boolean>}
   */
  async deleteById(id) {
    const [result] = await pool.query(
      `DELETE FROM users WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
};

export default UserModel;


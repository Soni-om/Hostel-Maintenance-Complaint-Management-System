/**
 * HostelCare — Complaint Category Data Model
 * Queries complaint_categories table using mysql2/promise
 */

import pool from '../config/db.js';

const CategoryModel = {
  /**
   * Retrieves all active maintenance categories
   * @returns {Promise<Array>} List of category objects
   */
  async findAllActive() {
    const [rows] = await pool.query(
      `SELECT id, name, description, active, created_at
       FROM complaint_categories
       WHERE active = 1
       ORDER BY id ASC`
    );
    return rows;
  },

  /**
   * Finds a category by primary key ID
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, name, description, active, created_at
       FROM complaint_categories
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }
};

export default CategoryModel;

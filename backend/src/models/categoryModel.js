/**
 * HostelCare — Complaint Category Data Model
 * Queries complaint_categories table using mysql2/promise
 * Implements complete Administrative Category CRUD and integrity guards
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
   * Retrieves all categories, optionally including inactive ones and complaint usage counts
   * @param {object} options
   * @param {boolean} options.includeInactive
   * @returns {Promise<Array>}
   */
  async findAll({ includeInactive = false } = {}) {
    let query = `
      SELECT c.id, c.name, c.description, c.active, c.created_at,
             COUNT(comp.id) AS complaint_count
      FROM complaint_categories c
      LEFT JOIN complaints comp ON comp.category_id = c.id
    `;

    const params = [];
    if (!includeInactive) {
      query += ` WHERE c.active = 1`;
    }

    query += ` GROUP BY c.id ORDER BY c.id ASC`;

    const [rows] = await pool.query(query, params);
    return rows.map((r) => ({
      ...r,
      active: Boolean(r.active),
      complaint_count: Number(r.complaint_count || 0)
    }));
  },

  /**
   * Finds a category by primary key ID
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.description, c.active, c.created_at,
              COUNT(comp.id) AS complaint_count
       FROM complaint_categories c
       LEFT JOIN complaints comp ON comp.category_id = c.id
       WHERE c.id = ?
       GROUP BY c.id
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;

    return {
      ...rows[0],
      active: Boolean(rows[0].active),
      complaint_count: Number(rows[0].complaint_count || 0)
    };
  },

  /**
   * Finds a category by exact or case-insensitive name
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async findByName(name) {
    if (!name) return null;
    const [rows] = await pool.query(
      `SELECT id, name, description, active, created_at
       FROM complaint_categories
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Counts how many complaint tickets reference this category
   * Used to protect historical records from being deleted
   * @param {number} id
   * @returns {Promise<number>}
   */
  async countComplaintsByCategoryId(id) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE category_id = ?`,
      [id]
    );
    return Number(rows[0]?.count || 0);
  },

  /**
   * Creates a new complaint category
   * @param {object} data
   * @param {string} data.name
   * @param {string} [data.description]
   * @param {boolean|number} [data.active=1]
   * @returns {Promise<object>} Created category
   */
  async create({ name, description = null, active = 1 }) {
    const activeVal = active === false || active === 0 || active === '0' ? 0 : 1;
    const [result] = await pool.execute(
      `INSERT INTO complaint_categories (name, description, active)
       VALUES (?, ?, ?)`,
      [name.trim(), description ? description.trim() : null, activeVal]
    );

    return this.findById(result.insertId);
  },

  /**
   * Updates an existing category
   * @param {number} id
   * @param {object} fields
   * @returns {Promise<object|null>}
   */
  async update(id, fields = {}) {
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      updates.push('name = ?');
      params.push(fields.name.trim());
    }

    if (fields.description !== undefined) {
      updates.push('description = ?');
      params.push(fields.description ? fields.description.trim() : null);
    }

    if (fields.active !== undefined) {
      const activeVal =
        fields.active === true || fields.active === 1 || fields.active === '1' || fields.active === 'active'
          ? 1
          : 0;
      updates.push('active = ?');
      params.push(activeVal);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(
        `UPDATE complaint_categories SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    return this.findById(id);
  },

  /**
   * Toggles or sets active status of a category
   * @param {number} id
   * @param {boolean|number} active
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, active) {
    const activeVal = active === true || active === 1 || active === '1' || active === 'active' ? 1 : 0;
    await pool.execute(
      `UPDATE complaint_categories SET active = ? WHERE id = ?`,
      [activeVal, id]
    );
    return this.findById(id);
  },

  /**
   * Deletes a category if it has no associated complaints
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const [result] = await pool.execute(
      `DELETE FROM complaint_categories WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
};

export default CategoryModel;

/**
 * HostelCare — Complaint Category Controller
 * Handles retrieval of active maintenance categories
 */

import CategoryModel from '../models/categoryModel.js';

const CategoryController = {
  /**
   * Retrieves all active maintenance categories
   * GET /api/categories or /api/v1/categories
   * Access: Authenticated (Student, Staff, Admin)
   */
  async getCategories(req, res, next) {
    try {
      const categories = await CategoryModel.findAllActive();
      return res.status(200).json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('CategoryController Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve complaint categories.'
      });
    }
  }
};

export default CategoryController;

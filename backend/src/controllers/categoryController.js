/**
 * HostelCare — Complaint Category Controller
 * Handles retrieval, creation, updating, status toggling, and safe deletion of categories
 * Enforces historical audit preservation and RBAC.
 */

import CategoryModel from '../models/categoryModel.js';

const CategoryController = {
  /**
   * Retrieves complaint categories
   * GET /api/categories or /api/v1/categories
   * Access: Authenticated (Student, Staff, Admin)
   * If req.query.include_inactive === 'true' and user is admin, returns all categories with usage count
   */
  async getCategories(req, res) {
    try {
      const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';

      // Only admins may see inactive categories
      if (includeInactive && req.user && req.user.role === 'admin') {
        const categories = await CategoryModel.findAll({ includeInactive: true });
        return res.status(200).json({
          success: true,
          categories
        });
      }

      const categories = await CategoryModel.findAllActive();
      return res.status(200).json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('CategoryController getCategories Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve complaint categories.'
      });
    }
  },

  /**
   * Retrieves all categories including inactive ones with complaint counts
   * GET /api/admin/categories
   * Access: Admin only
   */
  async getAllCategories(req, res) {
    try {
      const categories = await CategoryModel.findAll({ includeInactive: true });
      return res.status(200).json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('CategoryController getAllCategories Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve administrative complaint categories.'
      });
    }
  },

  /**
   * Retrieves a single category by ID
   * GET /api/admin/categories/:id or /api/categories/:id
   * Access: Admin or Authenticated
   */
  async getCategoryById(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier specified.'
        });
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Complaint category not found.'
        });
      }

      return res.status(200).json({
        success: true,
        category
      });
    } catch (error) {
      console.error('CategoryController getCategoryById Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve complaint category details.'
      });
    }
  },

  /**
   * Creates a new complaint category
   * POST /api/admin/categories or POST /api/categories
   * Access: Admin only
   */
  async createCategory(req, res) {
    try {
      const { name, description, active } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Category name is required and must be at least 2 characters long.'
        });
      }

      const trimmedName = name.trim();
      if (trimmedName.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Category name cannot exceed 100 characters.'
        });
      }

      if (description && description.length > 255) {
        return res.status(400).json({
          success: false,
          message: 'Category description cannot exceed 255 characters.'
        });
      }

      // Check for duplicate category name
      const existing = await CategoryModel.findByName(trimmedName);
      if (existing) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_CATEGORY_NAME',
          message: `A complaint category named '${trimmedName}' already exists.`
        });
      }

      const newCategory = await CategoryModel.create({
        name: trimmedName,
        description,
        active: active !== undefined ? active : 1
      });

      return res.status(201).json({
        success: true,
        message: 'Complaint category created successfully.',
        category: newCategory
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_CATEGORY_NAME',
          message: 'A complaint category with this name already exists.'
        });
      }

      console.error('CategoryController createCategory Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create complaint category.'
      });
    }
  },

  /**
   * Updates an existing complaint category
   * PUT/PATCH /api/admin/categories/:id or /api/categories/:id
   * Access: Admin only
   */
  async updateCategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier specified.'
        });
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Complaint category not found.'
        });
      }

      const { name, description, active } = req.body;

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length < 2) {
          return res.status(400).json({
            success: false,
            message: 'Category name must be at least 2 characters long.'
          });
        }
        if (name.trim().length > 100) {
          return res.status(400).json({
            success: false,
            message: 'Category name cannot exceed 100 characters.'
          });
        }

        // Check if name collides with another category
        const duplicate = await CategoryModel.findByName(name.trim());
        if (duplicate && duplicate.id !== id) {
          return res.status(409).json({
            success: false,
            code: 'DUPLICATE_CATEGORY_NAME',
            message: `A complaint category named '${name.trim()}' already exists.`
          });
        }
      }

      if (description !== undefined && description !== null && description.length > 255) {
        return res.status(400).json({
          success: false,
          message: 'Category description cannot exceed 255 characters.'
        });
      }

      const updated = await CategoryModel.update(id, {
        name,
        description,
        active
      });

      return res.status(200).json({
        success: true,
        message: 'Complaint category updated successfully.',
        category: updated
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_CATEGORY_NAME',
          message: 'A complaint category with this name already exists.'
        });
      }

      console.error('CategoryController updateCategory Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update complaint category.'
      });
    }
  },

  /**
   * Toggles category status (Active / Inactive)
   * PATCH /api/admin/categories/:id/status or /api/categories/:id/status
   * Access: Admin only
   */
  async updateStatus(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier specified.'
        });
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Complaint category not found.'
        });
      }

      const { active, status } = req.body;
      let activeVal;
      if (active !== undefined) {
        activeVal = active === true || active === 1 || active === '1' || active === 'active';
      } else if (status !== undefined) {
        activeVal = status === 'active';
      } else {
        return res.status(400).json({
          success: false,
          message: "Please specify 'active' (boolean/number) or 'status' ('active'/'inactive')."
        });
      }

      const updated = await CategoryModel.updateStatus(id, activeVal);

      return res.status(200).json({
        success: true,
        message: `Category '${category.name}' status updated to ${activeVal ? 'active' : 'inactive'}.`,
        category: updated
      });
    } catch (error) {
      console.error('CategoryController updateStatus Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update category status.'
      });
    }
  },

  /**
   * Deletes a category if it has no associated complaints
   * DELETE /api/admin/categories/:id or /api/categories/:id
   * Access: Admin only
   */
  async deleteCategory(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier specified.'
        });
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Complaint category not found.'
        });
      }

      // Check whether this category is referenced by any existing complaints
      const complaintCount = await CategoryModel.countComplaintsByCategoryId(id);
      if (complaintCount > 0) {
        return res.status(409).json({
          success: false,
          code: 'CATEGORY_IN_USE',
          message: `Cannot delete category '${category.name}' because it is referenced by ${complaintCount} existing complaint(s). Deactivate the category instead to preserve historical audit records.`,
          complaint_count: complaintCount
        });
      }

      await CategoryModel.delete(id);

      return res.status(200).json({
        success: true,
        message: `Complaint category '${category.name}' deleted successfully.`
      });
    } catch (error) {
      console.error('CategoryController deleteCategory Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete complaint category.'
      });
    }
  }
};

export default CategoryController;

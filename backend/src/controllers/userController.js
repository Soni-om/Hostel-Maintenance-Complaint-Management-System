/**
 * HostelCare — User Management & Administrative Provisioning Controller
 * Implements controlled staff and administrator account creation,
 * directory lookup, and account status administration.
 */

import bcrypt from 'bcryptjs';
import UserModel from '../models/userModel.js';

const BCRYPT_SALT_ROUNDS = 10;

const UserController = {
  /**
   * Controlled Staff & Admin Account Provisioning
   * POST /api/users or /api/v1/users
   * Access: Admin only
   */
  async provisionUser(req, res) {
    try {
      const {
        name,
        email,
        password,
        role,
        phone,
        staff_designation,
        hostel_block
      } = req.body;

      // 1. Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // 2. Check for duplicate email
      const existingUser = await UserModel.findByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }

      // 3. Hash password using bcryptjs (10 rounds)
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      // 4. Resolve block_id if hostel_block name is provided
      let blockId = null;
      if (hostel_block) {
        const matchedBlock = await UserModel.findBlock(hostel_block);
        if (matchedBlock) {
          blockId = matchedBlock.id;
        }
      }

      // 5. Persist user with specified administrative role
      const newUser = await UserModel.createUser({
        name,
        email: normalizedEmail,
        passwordHash,
        phone,
        role: role.toLowerCase().trim(),
        accountStatus: 'active',
        blockId,
        hostelBlock: hostel_block,
        staffDesignation: role.toLowerCase() === 'staff' ? staff_designation : null
      });

      // 6. Return safe user data without password_hash
      return res.status(201).json({
        success: true,
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} account provisioned successfully.`,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          account_status: newUser.account_status,
          phone: newUser.phone,
          block_id: newUser.block_id,
          hostel_block: newUser.hostel_block,
          staff_designation: newUser.staff_designation,
          created_at: newUser.created_at
        }
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }

      console.error('User Provisioning Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while provisioning the account.'
      });
    }
  },

  /**
   * List Users Directory (Paginated with Filters)
   * GET /api/users or /api/v1/users
   * Access: Admin only
   */
  async listUsers(req, res) {
    try {
      const { role, status, search, page, limit } = req.query;

      const result = await UserModel.findAll({
        role,
        status,
        search,
        page,
        limit
      });

      return res.status(200).json({
        success: true,
        users: result.users,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('List Users Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving users.'
      });
    }
  },

  /**
   * Toggle User Account Status (Active / Inactive)
   * PATCH /api/users/:id/status or /api/v1/users/:id/status
   * Access: Admin only
   */
  async updateStatus(req, res) {
    try {
      const targetId = parseInt(req.params.id, 10);
      const { account_status } = req.body;

      if (isNaN(targetId) || targetId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user identifier specified.'
        });
      }

      const targetUser = await UserModel.findById(targetId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'Target user record not found.'
        });
      }

      // Safety check: Prevent admin from deactivating their own account
      if (req.user && req.user.id === targetId && account_status === 'inactive') {
        return res.status(400).json({
          success: false,
          message: 'Self-deactivation denied. Administrators cannot deactivate their own active account.'
        });
      }

      const updatedUser = await UserModel.updateStatus(targetId, account_status);

      return res.status(200).json({
        success: true,
        message: `Account status updated to '${account_status}' successfully.`,
        user: updatedUser
      });
    } catch (error) {
      console.error('Update Status Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while updating user status.'
      });
    }
  }
};

export default UserController;


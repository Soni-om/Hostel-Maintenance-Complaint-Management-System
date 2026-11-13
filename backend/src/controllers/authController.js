/**
 * HostelCare — Authentication Controller
 * Handles Student Registration, Password Hashing with bcryptjs, and Credential Security
 */

import bcrypt from 'bcryptjs';
import UserModel from '../models/userModel.js';

const BCRYPT_SALT_ROUNDS = 10;

const AuthController = {
  /**
   * Student Self-Registration
   * POST /api/auth/register or /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const { name, email, password, phone, hostel_block, room_number } = req.body;

      // 1. Normalize email address
      const normalizedEmail = email.trim().toLowerCase();

      // 2. Prevent duplicate email registration
      const existingUser = await UserModel.findByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address is already registered.'
        });
      }

      // 3. Hash plain password using bcryptjs
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      // 4. Resolve block_id if hostel_block name is provided
      let blockId = null;
      if (hostel_block) {
        const matchedBlock = await UserModel.findBlock(hostel_block);
        if (matchedBlock) {
          blockId = matchedBlock.id;
        }
      }

      // 5. Persist student user in MySQL
      const newUser = await UserModel.createStudent({
        name,
        email: normalizedEmail,
        passwordHash,
        phone,
        blockId,
        hostelBlock: hostel_block,
        roomNumber: room_number
      });

      // 6. Return safe user data without password_hash
      return res.status(201).json({
        success: true,
        message: 'Student account registered successfully. You may now sign in.',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          account_status: newUser.account_status,
          phone: newUser.phone,
          block_id: newUser.block_id,
          hostel_block: newUser.hostel_block,
          room_number: newUser.room_number,
          created_at: newUser.created_at
        }
      });
    } catch (error) {
      // Handle MySQL duplicate key violation race condition
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address is already registered.'
        });
      }
      return next(error);
    }
  }
};

export default AuthController;

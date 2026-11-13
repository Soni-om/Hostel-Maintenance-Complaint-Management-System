/**
 * HostelCare — Authentication Controller
 * Handles Student Registration, Password Hashing with bcryptjs, and Credential Security
 */

import bcrypt from 'bcryptjs';
import UserModel from '../models/userModel.js';
import { generateToken } from '../utils/jwt.js';

const BCRYPT_SALT_ROUNDS = 10;

const AuthController = {
  /**
   * Student Self-Registration
   * POST /api/auth/register or /api/v1/auth/register
   */
  async register(req, res) {
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

      // 3. Hash plain password using bcryptjs (Salt rounds: 10)
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

      // 6. Return safe user data without password_hash or credentials
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

      // Internal error logging — Never expose internal SQL, credentials or stack traces to client
      console.error('Registration Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while processing registration. Please try again.'
      });
    }
  },

  /**
   * User Authentication & JWT Issuance
   * POST /api/auth/login or /api/v1/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // 1. Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // 2. Query user from database
      const user = await UserModel.findByEmail(normalizedEmail);
      if (!user) {
        // Return 401 Unauthorized with generic message to prevent account enumeration
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.'
        });
      }

      // 3. Verify password hash using bcrypt.compare
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.'
        });
      }

      // 4. Verify account status
      if (user.account_status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Your account is currently inactive or suspended. Please contact the hostel administration.'
        });
      }

      // 5. Generate time-limited JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      });

      // 6. Return safe user data without password_hash
      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          account_status: user.account_status,
          phone: user.phone,
          block_id: user.block_id,
          hostel_block: user.hostel_block,
          room_number: user.room_number,
          staff_designation: user.staff_designation,
          created_at: user.created_at
        }
      });
    } catch (error) {
      console.error('Login Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred during login. Please try again.'
      });
    }
  },

  /**
   * Current Authenticated User Profile
   * GET /api/auth/me or /api/v1/auth/me
   */
  async getMe(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // Safe user data is already attached by requireAuth (via UserModel.findById, excluding password_hash)
      return res.status(200).json({
        success: true,
        user: req.user
      });
    } catch (error) {
      console.error('Get Profile Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred while retrieving user profile.'
      });
    }
  },

  /**
   * User Logout & Session Invalidation Acknowledgment
   * POST /api/auth/logout or /api/v1/auth/logout
   *
   * Architectural Distinction Note:
   * In a stateless JWT architecture, tokens are self-contained and cryptographically signed.
   * True instantaneous token revocation without a centralized state store (e.g., Redis blocklist)
   * is handled via client-side discard (purging token & user from localStorage via Api.clearAuth()).
   * Immediate server-side termination of compromised, inactive, or suspended accounts is
   * enforced on every protected request by requireAuth through live MySQL UserModel.findById() checks.
   */
  async logout(req, res) {
    try {
      return res.status(200).json({
        success: true,
        message: 'Logged out successfully. Client session tokens have been cleared.'
      });
    } catch (error) {
      console.error('Logout Controller Error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred during logout.'
      });
    }
  }
};

export default AuthController;

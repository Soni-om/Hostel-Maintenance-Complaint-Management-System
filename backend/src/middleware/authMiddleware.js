/**
 * HostelCare — Authentication & Role-Based Authorization Middleware
 * Verifies Bearer JWT tokens, validates active MySQL user account status,
 * and attaches database-verified user profile to req.user.
 */

import { verifyToken } from '../utils/jwt.js';
import UserModel from '../models/userModel.js';

/**
 * Middleware: requireAuth / authenticateToken
 * Validates JWT Bearer token, checks database user existence and active status.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    // 1. Missing Authorization Header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'Authentication required. No authorization header provided.'
      });
    }

    // 2. Validate Bearer scheme format
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
      return res.status(401).json({
        success: false,
        code: 'MALFORMED_TOKEN',
        message: 'Malformed authorization header. Expected format: "Bearer <token>".'
      });
    }

    const token = parts[1].trim();

    // 3. Cryptographic JWT Verification
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired. Please sign in again.'
        });
      }
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token.'
      });
    }

    // 4. Validate decoded payload
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid token payload: missing user identifier.'
      });
    }

    // 5. Mandatory Requirement: Fetch current user from MySQL using UserModel.findById()
    const user = await UserModel.findById(decoded.id);

    // 6. User account deleted or not found
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account associated with token no longer exists.'
      });
    }

    // 7. Mandatory Requirement: Reject deleted, inactive, or suspended accounts on every protected request
    if (user.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is currently inactive or suspended. Access denied.'
      });
    }

    // 8. Mandatory Requirement: Attach only safe, database-verified user information (password_hash is excluded by findById)
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication Middleware Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'An unexpected internal error occurred during authentication.'
    });
  }
}

// Alias for flexibility
export const authenticateToken = requireAuth;

/**
 * Middleware: requireRole
 * Enforces Role-Based Access Control (RBAC) across protected endpoints.
 * @param  {...string} allowedRoles Roles permitted to access the route (e.g. 'admin', 'staff')
 */
export function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required before checking authorization roles.'
      });
    }

    const userRole = (req.user.role || '').toLowerCase();
    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: `Access denied. Insufficient permissions for role '${req.user.role}'. Required: ${allowedRoles.join(', ')}.`
      });
    }

    next();
  };
}

export default {
  requireAuth,
  authenticateToken,
  requireRole
};


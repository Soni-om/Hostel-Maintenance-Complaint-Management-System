/**
 * HostelCare — JSON Web Token (JWT) Utilities
 * Secure token generation, signing, and verification
 */

import jwt from 'jsonwebtoken';

/**
 * Returns the configured JWT Secret from environment variables
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
    }
    // Fallback for isolated development / tests
    return 'hostelcare_dev_fallback_secret_key_minimum_32_characters_long';
  }
  return secret;
}

/**
 * Generates a signed, time-limited JWT token
 * @param {object} payload Data to encode in token (id, email, role, name)
 * @param {object} options Optional JWT sign options (expiresIn override)
 * @returns {string} Signed JWT token string
 */
export function generateToken(payload, options = {}) {
  const secret = getJwtSecret();
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, {
    expiresIn,
    algorithm: 'HS256'
  });
}

/**
 * Verifies and decodes a JWT token
 * @param {string} token
 * @returns {object} Decoded token payload
 */
export function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

export default {
  generateToken,
  verifyToken
};

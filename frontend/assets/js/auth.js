/**
 * HostelCare — Shared Frontend Authentication & Session Manager
 * Provides centralized session state, profile fetching from /api/v1/auth/me,
 * page-level role authorization guards, role-based navigation visibility,
 * and client-side session cleanup.
 */

const Auth = {
  /**
   * Retrieves the current user profile from localStorage
   * @returns {object|null} Parsed user profile or null
   */
  getUser() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const userKey = window.CONFIG?.USER_KEY || 'hostelcare_user';
      const stored = localStorage.getItem(userKey);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Failed to parse stored user profile:', e);
      return null;
    }
  },

  /**
   * Updates or saves user profile in localStorage
   * @param {object} user 
   */
  setUser(user) {
    if (typeof localStorage === 'undefined') return;
    const userKey = window.CONFIG?.USER_KEY || 'hostelcare_user';
    if (user) {
      localStorage.setItem(userKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(userKey);
    }
  },

  /**
   * Retrieves the stored JWT authentication token
   * @returns {string|null}
   */
  getToken() {
    return window.Api ? window.Api.getToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token') : null);
  },

  /**
   * Checks if an authentication token exists in storage
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * Returns current user's normalized role (e.g. 'student', 'staff', 'admin')
   * @returns {string}
   */
  getRole() {
    const user = this.getUser();
    return (user?.role || '').toLowerCase();
  },

  /**
   * Checks whether the current user has any of the specified roles
   * @param {...string} roles Permitted roles
   * @returns {boolean}
   */
  hasRole(...roles) {
    const current = this.getRole();
    if (!current) return false;
    const normalized = roles.map((r) => r.toLowerCase().trim());
    return normalized.includes(current);
  },

  /**
   * Resolves the primary dashboard route for a given role
   * @param {string} role 
   * @returns {string}
   */
  getDashboardUrl(role) {
    const normalized = (role || this.getRole()).toLowerCase();
    switch (normalized) {
      case 'student':
        return '/pages/student/dashboard.html';
      case 'staff':
        return '/pages/staff/dashboard.html';
      case 'admin':
        return '/pages/admin/dashboard.html';
      default:
        return '/pages/auth/login.html';
    }
  },

  /**
   * Fetches fresh, database-verified user profile from /api/auth/me
   * Updates localStorage profile cache with current data.
   * @returns {Promise<object>} Current user object
   */
  async fetchProfile() {
    if (!window.Api) {
      throw new Error('API client wrapper (window.Api) is required for fetchProfile');
    }
    const response = await window.Api.get('/auth/me');
    if (response && response.user) {
      this.setUser(response.user);
      return response.user;
    }
    throw new Error('Invalid user profile response received from server');
  },

  /**
   * Logs out user: notifies backend /api/auth/logout, purges localStorage credentials,
   * and navigates to the login screen.
   *
   * Security & Architectural Distinction:
   * Client-side logout purges the stored JWT token and user details from localStorage.
   * Because JWTs are stateless, instantaneous server-side blacklisting is not enforced;
   * however, revoked or deactivated accounts are continuously rejected via live MySQL
   * database checks in requireAuth on every single protected API request.
   *
   * @param {string} redirectUrl Optional custom redirect URL after logout
   */
  async logout(redirectUrl = '/pages/auth/login.html') {
    try {
      if (window.Api && this.isAuthenticated()) {
        // Acknowledge logout with backend (silent fail so network interruption doesn't block logout)
        await window.Api.post('/auth/logout', {}, { silent: true }).catch(() => {});
      }
    } finally {
      if (window.Api) {
        window.Api.clearAuth();
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
        localStorage.removeItem(window.CONFIG?.USER_KEY || 'hostelcare_user');
      }

      if (typeof window !== 'undefined' && redirectUrl) {
        window.location.href = redirectUrl;
      }
    }
  },

  /**
   * Client-side route guard for protected dashboard pages.
   * Validates local session existence, enforces allowed roles, and performs
   * a live background check against GET /api/auth/me to verify database status.
   *
   * @param {string|string[]} allowedRoles Array of permitted roles (e.g. ['student'])
   * @param {string} redirectTarget Redirect URL if not authenticated
   * @returns {boolean} True if authorized locally
   */
  requireAuth(allowedRoles = [], redirectTarget = '/pages/auth/login.html') {
    if (typeof window === 'undefined') return false;

    // 1. Verify existence of JWT token
    if (!this.isAuthenticated()) {
      window.location.href = redirectTarget;
      return false;
    }

    // 2. Enforce Role-Based Access Control if specified
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (allowed.length > 0) {
      const currentRole = this.getRole();
      const normalizedAllowed = allowed.map((r) => r.toLowerCase());
      if (!normalizedAllowed.includes(currentRole)) {
        console.warn(`Unauthorized role '${currentRole}'. Permitted: ${allowed.join(', ')}. Redirecting to appropriate workspace.`);
        window.location.href = this.getDashboardUrl(currentRole);
        return false;
      }
    }

    // 3. Asynchronous Live Database Profile Verification
    // Queries /auth/me to confirm account has not been suspended, deactivated, or deleted.
    this.fetchProfile()
      .then((user) => {
        // Update user UI display elements and role-based links
        this.renderUserInfo(user);
      })
      .catch((err) => {
        console.warn('Session verification against /auth/me failed:', err.message);
        // Api.request handles 401 redirect to login automatically.
        // For 403 (suspended/inactive) explicitly redirect to login with message
        if (err.status === 403) {
          if (window.Utils) {
            window.Utils.showToast(err.message || 'Your account is inactive. Please contact administration.', 'danger');
          }
          setTimeout(() => {
            this.logout('/pages/auth/login.html');
          }, 1500);
        }
      });

    return true;
  },

  /**
   * Dynamically populates user details into the UI and adjusts
   * navigation visibility based on role permissions.
   * @param {object} user 
   */
  renderUserInfo(user) {
    if (!user || typeof document === 'undefined') return;

    // 1. Update elements with data-user-field attribute
    document.querySelectorAll('[data-user-field]').forEach((el) => {
      const field = el.getAttribute('data-user-field');
      if (user[field] !== undefined && user[field] !== null) {
        el.textContent = user[field];
      }
    });

    // 2. Populate common ID selectors
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = user.name;

    const emailEl = document.getElementById('user-display-email');
    if (emailEl) emailEl.textContent = user.email;

    const roleEl = document.getElementById('user-display-role');
    if (roleEl) roleEl.textContent = (user.role || '').toUpperCase();

    const hostelEl = document.getElementById('user-display-hostel');
    if (hostelEl && (user.hostel_block || user.room_number)) {
      hostelEl.textContent = `${user.hostel_block || 'Hostel'} — Room ${user.room_number || 'N/A'}`;
    }

    // 3. Role-Based Navigation & Action Visibility
    // Elements decorated with data-allowed-roles="staff,admin" are shown only if permitted
    const currentRole = (user.role || '').toLowerCase();
    document.querySelectorAll('[data-allowed-roles]').forEach((el) => {
      const allowed = el.getAttribute('data-allowed-roles').toLowerCase().split(',').map((r) => r.trim());
      if (allowed.includes(currentRole)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    // Elements decorated with data-forbidden-roles="student" are hidden for matching roles
    document.querySelectorAll('[data-forbidden-roles]').forEach((el) => {
      const forbidden = el.getAttribute('data-forbidden-roles').toLowerCase().split(',').map((r) => r.trim());
      if (forbidden.includes(currentRole)) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
    });
  },

  /**
   * Binds global logout handlers and initializes navbar
   */
  init() {
    if (typeof document === 'undefined') return;

    document.addEventListener('DOMContentLoaded', () => {
      // Bind logout buttons
      document.querySelectorAll('[data-action="logout"], .btn-logout').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.logout();
        });
      });

      // Render cached user information and role visibility if available
      const cached = this.getUser();
      if (cached) {
        this.renderUserInfo(cached);
      }
    });
  }
};

// Auto-initialize Navbar bindings
Auth.init();

if (typeof window !== 'undefined') {
  window.Auth = Auth;
}

export default Auth;

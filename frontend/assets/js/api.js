/**
 * HostelCare — Centralized Fetch API Client Wrapper
 * Handles Authentication Headers, Content-Type, Health Probing, Token Isolation, and Normalized Error Handling
 */

/**
 * Validates whether a target URL belongs to the trusted same origin or configured API base URL.
 * Prevents Bearer token leakage to untrusted third-party destinations.
 */
function isTrustedOrigin(targetUrlStr, baseUrlStr) {
  try {
    // Relative endpoints (/api/v1/..., api/...) are always same-origin / trusted
    if (!targetUrlStr.startsWith('http://') && !targetUrlStr.startsWith('https://')) {
      return true;
    }
    const targetUrl = new URL(targetUrlStr);

    // Verify against window.location.origin
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
      if (targetUrl.origin === window.location.origin) {
        return true;
      }
    }

    // Verify against CONFIG.API_BASE_URL origin
    if (baseUrlStr) {
      const base = new URL(baseUrlStr, (typeof window !== 'undefined' && window.location?.origin !== 'null') ? window.location?.origin : 'http://localhost:5000');
      if (targetUrl.origin === base.origin) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const Api = {
  /**
   * Retrieves the stored JWT authentication token
   */
  getToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
  },

  /**
   * Sets or removes the stored JWT authentication token
   */
  setToken(token) {
    if (typeof localStorage === 'undefined') return;
    if (token) {
      localStorage.setItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token', token);
    } else {
      localStorage.removeItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
    }
  },

  /**
   * Clears stored authentication credentials and user profile
   */
  clearAuth() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
    localStorage.removeItem(window.CONFIG?.USER_KEY || 'hostelcare_user');
  },

  /**
   * Primary Request Executor
   */
  async request(endpoint, options = {}) {
    const baseUrl = window.CONFIG?.API_BASE_URL || '/api/v1';

    // Resolve full target URL
    let url;
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      url = endpoint;
    } else if (endpoint.startsWith('/api/')) {
      // Direct root API path (e.g. /api/health)
      if (window.CONFIG?.HEALTH_URL && endpoint === '/api/health') {
        url = window.CONFIG.HEALTH_URL;
      } else if (window.CONFIG?.DB_HEALTH_URL && endpoint === '/api/health/db') {
        url = window.CONFIG.DB_HEALTH_URL;
      } else {
        const origin = (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null')
          ? window.location.origin
          : 'http://localhost:5000';
        url = `${origin}${endpoint}`;
      }
    } else {
      url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }

    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    // Attach JWT Bearer Token ONLY if calling a trusted same-origin endpoint
    const isTrusted = isTrustedOrigin(url, baseUrl);
    const token = this.getToken();
    if (token && isTrusted && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let requestBody = options.body;

    // Handle FormData vs JSON Body
    const isFormData = typeof FormData !== 'undefined' && requestBody instanceof FormData;
    if (isFormData) {
      // Browser fetch must compute multipart/form-data boundary automatically
      delete headers['Content-Type'];
    } else if (requestBody !== undefined && requestBody !== null) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (typeof requestBody === 'object' && headers['Content-Type'] === 'application/json') {
        requestBody = JSON.stringify(requestBody);
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: requestBody
      });

      // Handle unauthenticated 401 response: clean up credentials and redirect if appropriate
      if (response.status === 401 && typeof window !== 'undefined') {
        this.clearAuth();
        if (window.location && !window.location.pathname.includes('/auth/')) {
          if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
            window.location.href = '/pages/auth/login.html';
          }
        }
      }

      const contentType = response.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => ({}));
      } else {
        const text = await response.text().catch(() => '');
        data = { raw: text };
      }

      if (!response.ok) {
        const error = new Error(data.message || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      // Diagnostic logging in non-silent mode
      if (!options.silent) {
        console.error(`API Error [${options.method || 'GET'} ${url}]:`, error.message);
      }
      throw error;
    }
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  },

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  },

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  },

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  },

  /**
   * Fetches an authenticated binary blob (e.g. protected complaint attachment)
   * Safely passes Bearer token to trusted endpoints without exposing file paths
   * @param {string} endpoint Target URL or relative endpoint
   * @param {object} options Optional fetch configuration
   * @returns {Promise<Blob>}
   */
  async getBlob(endpoint, options = {}) {
    const baseUrl = window.CONFIG?.API_BASE_URL || '/api/v1';
    let url;
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      url = endpoint;
    } else if (endpoint.startsWith('/api/')) {
      const origin = (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null')
        ? window.location.origin
        : 'http://localhost:5000';
      url = `${origin}${endpoint}`;
    } else {
      url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }

    const headers = { ...options.headers };
    const token = this.getToken();
    if (token && isTrustedOrigin(url, baseUrl) && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401 && typeof window !== 'undefined') {
        this.clearAuth();
        if (window.location && !window.location.pathname.includes('/auth/')) {
          window.location.href = '/pages/auth/login.html';
        }
      }

      if (!response.ok) {
        let errData = {};
        try { errData = await response.json(); } catch {}
        const error = new Error(errData.message || `Attachment fetch failed with HTTP ${response.status}`);
        error.status = response.status;
        error.data = errData;
        throw error;
      }

      return await response.blob();
    } catch (err) {
      if (!options.silent) {
        console.error(`API getBlob Error [${url}]:`, err.message);
      }
      throw err;
    }
  },

  /**
   * Fetches real backend and database health from /api/health
   */
  async checkHealth(options = {}) {
    const healthUrl = window.CONFIG?.HEALTH_URL || '/api/health';
    return this.get(healthUrl, options);
  },

  /**
   * Fetches dedicated database health from /api/health/db
   */
  async checkDbHealth(options = {}) {
    const dbHealthUrl = window.CONFIG?.DB_HEALTH_URL || '/api/health/db';
    return this.get(dbHealthUrl, options);
  }
};

if (typeof window !== 'undefined') {
  window.Api = Api;
}

export default Api;

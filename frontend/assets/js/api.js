/**
 * HostelCare — Centralized Fetch API Client Wrapper
 * Handles Authentication Headers, Content-Type, Health Probing, and Normalized Error Handling
 */

const Api = {
  /**
   * Retrieves the stored JWT authentication token
   */
  getToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
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
      url = endpoint;
    } else {
      url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }

    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    // Attach JWT Bearer Token if available
    const token = this.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Attach JSON Content-Type if body is not FormData
    if (options.body && !(options.body instanceof FormData)) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle unauthenticated 401 response
      if (response.status === 401 && typeof window !== 'undefined') {
        if (!window.location.pathname.includes('/auth/')) {
          localStorage.removeItem(window.CONFIG?.TOKEN_KEY || 'hostelcare_token');
          localStorage.removeItem(window.CONFIG?.USER_KEY || 'hostelcare_user');
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
        const text = await response.text();
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
      console.error(`API Error [${options.method || 'GET'} ${url}]:`, error.message);
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
   * Fetches real backend and database health from /api/health
   */
  async checkHealth() {
    const healthUrl = window.CONFIG?.HEALTH_URL || '/api/health';
    return this.get(healthUrl);
  },

  /**
   * Fetches dedicated database health from /api/health/db
   */
  async checkDbHealth() {
    const dbHealthUrl = window.CONFIG?.DB_HEALTH_URL || '/api/health/db';
    return this.get(dbHealthUrl);
  }
};

if (typeof window !== 'undefined') {
  window.Api = Api;
}

export default Api;

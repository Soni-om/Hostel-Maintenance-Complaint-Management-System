/**
 * HostelCare — Centralized Fetch API Client Wrapper
 * Handles Authentication Headers, Content-Type, and Normalized Error Reporting
 */

const Api = {
  /**
   * Retrieves the stored JWT authentication token
   */
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_STORAGE_KEY);
  },

  /**
   * Generic Fetch Wrapper
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${CONFIG.API_BASE_URL}${endpoint}`;
    
    const headers = {
      ...options.headers
    };

    // Attach Bearer Token if present
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Attach JSON content-type if body is JSON object (unless FormData is passed)
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle unauthenticated 401 response: redirect to login if protected page
      if (response.status === 401 && !window.location.pathname.includes('/auth/')) {
        localStorage.removeItem(CONFIG.TOKEN_STORAGE_KEY);
        localStorage.removeItem(CONFIG.USER_STORAGE_KEY);
        // Only redirect if not already on the landing or auth page
        if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
          window.location.href = '/pages/auth/login.html';
        }
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  },

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};


/**
 * HostelCare — Frontend Global Configuration
 * Central configuration for API endpoints, storage keys, and environment detection
 */

const PRODUCTION_API_ORIGIN = 'https://backend-production-84d31806.up.railway.app';
const LOCAL_DEV_ORIGIN = 'http://localhost:5000';

/**
 * Resolves the backend API origin based on runtime environment.
 * - Localhost / 127.0.0.1: routes to local development server (http://localhost:5000).
 * - Cloud / Vercel: routes to production Railway backend (https://backend-production-84d31806.up.railway.app).
 * - window.__API_BASE_URL__: explicit global override takes precedence if set.
 * @returns {string} Fully qualified origin without trailing slash
 */
function resolveApiOrigin() {
  if (typeof window === 'undefined') {
    return LOCAL_DEV_ORIGIN;
  }
  // 1. Explicit global override for flexible multi-environment or CDN deployment
  if (window.__API_BASE_URL__) {
    return window.__API_BASE_URL__.replace(/\/+$/, '');
  }
  // 2. If opened directly via file:// protocol, fallback to standard localhost:5000 backend
  if (window.location && window.location.protocol === 'file:') {
    return LOCAL_DEV_ORIGIN;
  }
  // 3. Localhost development environments
  const hostname = window.location ? (window.location.hostname || '').toLowerCase() : '';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');
  if (isLocalhost) {
    if (window.location.port === '5000') {
      return window.location.origin;
    }
    return LOCAL_DEV_ORIGIN;
  }
  // 4. Same-origin cloud deployment (e.g. if served directly from Railway backend)
  if (window.location && window.location.origin && window.location.origin.includes('backend-production-84d31806.up.railway.app')) {
    return window.location.origin;
  }
  // 5. Cloud static frontend deployment (e.g. Vercel, Netlify, or custom domain)
  // Directs API traffic to the production Railway Express backend
  return PRODUCTION_API_ORIGIN;
}

const baseOrigin = resolveApiOrigin();

const CONFIG = {
  APP_NAME: 'HostelCare',
  APP_VERSION: '1.0.0',
  API_BASE_URL: `${baseOrigin}/api/v1`,
  HEALTH_URL: `${baseOrigin}/api/health`,
  DB_HEALTH_URL: `${baseOrigin}/api/health/db`,
  TOKEN_KEY: 'hostelcare_token',
  USER_KEY: 'hostelcare_user'
};

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

export default CONFIG;

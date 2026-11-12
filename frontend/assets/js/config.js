/**
 * HostelCare — Frontend Global Configuration
 * Central configuration for API endpoints, storage keys, and environment detection
 */

function resolveApiOrigin() {
  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }
  // 1. Explicit global override for flexible multi-environment or CDN deployment
  if (window.__API_BASE_URL__) {
    return window.__API_BASE_URL__.replace(/\/+$/, '');
  }
  // 2. If opened directly via file:// protocol, fallback to standard localhost:5000 backend
  if (window.location && window.location.protocol === 'file:') {
    return 'http://localhost:5000';
  }
  // 3. Dynamic origin detection (works across any host, port, protocol, or reverse proxy)
  if (window.location && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return 'http://localhost:5000';
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

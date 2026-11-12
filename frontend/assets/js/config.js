/**
 * HostelCare — Frontend Global Configuration
 * Central configuration for API endpoints, storage keys, and environment detection
 */

const CONFIG = {
  APP_NAME: 'HostelCare',
  APP_VERSION: '1.0.0',
  API_BASE_URL: (typeof window !== 'undefined' && window.location.origin.includes('5000'))
    ? `${window.location.origin}/api/v1`
    : 'http://localhost:5000/api/v1',
  HEALTH_URL: (typeof window !== 'undefined' && window.location.origin.includes('5000'))
    ? `${window.location.origin}/api/health`
    : 'http://localhost:5000/api/health',
  DB_HEALTH_URL: (typeof window !== 'undefined' && window.location.origin.includes('5000'))
    ? `${window.location.origin}/api/health/db`
    : 'http://localhost:5000/api/health/db',
  TOKEN_KEY: 'hostelcare_token',
  USER_KEY: 'hostelcare_user'
};

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

export default CONFIG;

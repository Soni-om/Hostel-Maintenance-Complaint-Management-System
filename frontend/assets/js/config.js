/**
 * HostelCare — Frontend Global Configuration
 */

const CONFIG = {
  APP_NAME: 'HostelCare',
  APP_VERSION: '1.0.0',
  API_BASE_URL: window.location.origin.includes('5000') 
    ? `${window.location.origin}/api/v1` 
    : 'http://localhost:5000/api/v1',
  TOKEN_STORAGE_KEY: 'hostelcare_auth_token',
  USER_STORAGE_KEY: 'hostelcare_auth_user',
  DEFAULT_AVATAR: 'https://ui-avatars.com/api/?background=1e40af&color=fff&name='
};

// Freeze to prevent runtime modifications
Object.freeze(CONFIG);


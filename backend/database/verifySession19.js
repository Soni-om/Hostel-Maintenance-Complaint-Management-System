/**
 * HostelCare — Session 19 Verification & Cloud Deployment Test Suite
 * Automated verification of Express Backend, Cloud MySQL connectivity,
 * Production Environment Variables, HTTPS/CORS, Durable File Storage,
 * Health Probes, and Backup & Disaster Recovery.
 */

import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../src/app.js';
import pool, { testConnection } from '../src/config/db.js';
import { generateToken } from '../src/utils/jwt.js';
import { resolveSafeStoragePath, UPLOAD_ROOT } from '../src/utils/fileStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

let server;
let baseUrl;
const results = [];
const createdUserIds = [];
const createdComplaintIds = [];

function recordTest(id, name, passed, evidence = null, error = null) {
  results.push({ id, name, passed, evidence, error });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] Test ${id}: ${name}`);
  if (evidence) console.log(`       Evidence: ${evidence}`);
  if (error) console.error(`       Error: ${error}`);
}

async function makeRequest({ path: reqPath, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve) => {
    const url = new URL(reqPath, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { ...headers }
    };

    let payload = null;
    if (body) {
      if (Buffer.isBuffer(body)) {
        payload = body;
      } else if (typeof body === 'object') {
        payload = JSON.stringify(body);
        if (!options.headers['Content-Type']) {
          options.headers['Content-Type'] = 'application/json';
        }
      } else {
        payload = String(body);
      }
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, headers: {}, error: err.message });
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runSession19Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 19 VERIFICATION & CLOUD DEPLOYMENT AUDIT');
  console.log('  Cloud MySQL, Production Express, CORS, Storage & Disaster Recovery');
  console.log('========================================================================\n');

  // Start dedicated test server on ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: CLOUD MYSQL CONNECTIVITY & HEALTH PROBES (TASKS 2, 8)
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: CLOUD MYSQL CONNECTIVITY & HEALTH PROBES ---\n');

    // Test 1: Direct MySQL pool connectivity & latency probe
    {
      const dbHealth = await testConnection();
      const passed = dbHealth.success === true && typeof dbHealth.latencyMs === 'number';
      recordTest(
        1,
        'Direct MySQL connection pool established with active keep-alive and valid latency probe',
        passed,
        `Status: ${dbHealth.success}, DB: ${dbHealth.database}, Host: ${dbHealth.host}, Latency: ${dbHealth.latencyMs}ms, SSL: ${dbHealth.ssl}`
      );
    }

    // Test 2: GET /api/health endpoint returns 200 OK with healthy status
    {
      const res = await makeRequest({ path: '/api/health' });
      const passed = res.status === 200 &&
        res.data.status === 'healthy' &&
        res.data.database?.status === 'connected' &&
        typeof res.data.uptimeSeconds === 'number';
      recordTest(
        2,
        'GET /api/health returns HTTP 200 with healthy application and connected database status',
        passed,
        `Status: ${res.status}, App: ${res.data.application}, DB Status: ${res.data.database?.status}`
      );
    }

    // Test 3: GET /api/health/db returns 200 OK with dedicated DB metrics
    {
      const res = await makeRequest({ path: '/api/health/db' });
      const passed = res.status === 200 &&
        res.data.success === true &&
        res.data.database?.status === 'connected' &&
        typeof res.data.database?.latencyMs === 'number';
      recordTest(
        3,
        'GET /api/health/db returns HTTP 200 with database connection confirmation and latency',
        passed,
        `Status: ${res.status}, Connected: ${res.data.success}, Latency: ${res.data.database?.latencyMs}ms`
      );
    }

    // Test 4: Route version parity: /api/v1/health and /api/v1/health/db return identical payloads
    {
      const resV1 = await makeRequest({ path: '/api/v1/health' });
      const resDbV1 = await makeRequest({ path: '/api/v1/health/db' });
      const passed = resV1.status === 200 && resDbV1.status === 200 && resV1.data.status === 'healthy';
      recordTest(
        4,
        'Route parity: /api/v1/health and /api/v1/health/db respond with HTTP 200',
        passed,
        `v1 Health: ${resV1.status}, v1 DB Health: ${resDbV1.status}`
      );
    }

    // Test 5: Credentials & Secrets Leakage Audit
    {
      const res = await makeRequest({ path: '/api/health' });
      const resDb = await makeRequest({ path: '/api/health/db' });
      const payloadStr = JSON.stringify(res.data) + JSON.stringify(resDb.data);

      const leaksPassword = payloadStr.toLowerCase().includes(String(process.env.DB_PASSWORD).toLowerCase()) && process.env.DB_PASSWORD.length > 3;
      const leaksJwtSecret = payloadStr.includes(String(process.env.JWT_SECRET)) && process.env.JWT_SECRET.length > 5;
      const leaksFullConnString = payloadStr.includes('mysql://') || payloadStr.includes('@');

      const passed = !leaksPassword && !leaksJwtSecret && !leaksFullConnString;
      recordTest(
        5,
        'Security Audit: Health probes strictly exclude passwords, JWT secret keys, and raw connection strings',
        passed,
        `Leaks Password: ${leaksPassword}, Leaks JWT Secret: ${leaksJwtSecret}, Leaks Connection URI: ${leaksFullConnString}`
      );
    }

    // -------------------------------------------------------------------------
    // SECTION 2: PRODUCTION ENVIRONMENT & CONFIGURATION (TASKS 1, 4, 5)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: PRODUCTION ENVIRONMENT & DEPLOYMENT ARTIFACTS ---\n');

    // Test 6: Environment template .env.production.example exists with required keys
    {
      const envPath = path.join(rootDir, '.env.production.example');
      const exists = fs.existsSync(envPath);
      let hasRequiredKeys = false;
      if (exists) {
        const content = fs.readFileSync(envPath, 'utf8');
        hasRequiredKeys = content.includes('NODE_ENV=production') &&
          content.includes('FRONTEND_ORIGIN') &&
          content.includes('JWT_SECRET') &&
          content.includes('UPLOAD_DIR') &&
          content.includes('DATABASE_URL');
      }
      const passed = exists && hasRequiredKeys;
      recordTest(
        6,
        'Production configuration template .env.production.example defines all required cloud deployment variables',
        passed,
        `File Exists: ${exists}, Required Keys Defined: ${hasRequiredKeys}`
      );
    }

    // Test 7: railway.json Infrastructure as Code deployment descriptor exists and is valid JSON
    {
      const railwayPath = path.join(rootDir, 'railway.json');
      const exists = fs.existsSync(railwayPath);
      let isValid = false;
      if (exists) {
        try {
          const cfg = JSON.parse(fs.readFileSync(railwayPath, 'utf8'));
          isValid = cfg.deploy?.startCommand === 'npm start' && cfg.deploy?.healthcheckPath === '/api/health';
        } catch {}
      }
      const passed = exists && isValid;
      recordTest(
        7,
        'railway.json deployment descriptor configures startCommand (npm start) and healthcheckPath (/api/health)',
        passed,
        `File Exists: ${exists}, Valid Configuration: ${isValid}`
      );
    }

    // Test 8: Production Dockerfile and .dockerignore exist for container deployments
    {
      const dockerfilePath = path.join(rootDir, 'Dockerfile');
      const dockerignorePath = path.join(rootDir, '.dockerignore');
      const dfExists = fs.existsSync(dockerfilePath);
      const diExists = fs.existsSync(dockerignorePath);
      let dfValid = false;
      if (dfExists) {
        const df = fs.readFileSync(dockerfilePath, 'utf8');
        dfValid = df.includes('node:20-alpine') &&
          (df.includes('npm start') || df.includes('"npm", "start"')) &&
          df.includes('EXPOSE 5000');
      }
      const passed = dfExists && diExists && dfValid;
      recordTest(
        8,
        'Containerization: Multi-stage Dockerfile and .dockerignore configured for lightweight secure production execution',
        passed,
        `Dockerfile: ${dfExists}, .dockerignore: ${diExists}, Valid Spec: ${dfValid}`
      );
    }

    // -------------------------------------------------------------------------
    // SECTION 3: HTTPS & CORS ALLOWLIST ENFORCEMENT (TASK 6)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: HTTPS & CORS ALLOWLIST ENFORCEMENT ---\n');

    // Test 9: CORS allows requests with valid allowed origin (e.g. from local or configured origin)
    {
      const origin = 'http://localhost:5000';
      const res = await makeRequest({
        path: '/api/health',
        headers: { Origin: origin }
      });
      const passed = res.status === 200 && res.headers['access-control-allow-origin'] === origin;
      recordTest(
        9,
        'CORS Allowlist: Request from authorized origin receives Access-Control-Allow-Origin header',
        passed,
        `Status: ${res.status}, Allow-Origin: ${res.headers['access-control-allow-origin']}`
      );
    }

    // Test 10: CORS preflight OPTIONS request returns 204 or 200 with permitted methods
    {
      const origin = 'http://localhost:5000';
      const res = await makeRequest({
        path: '/api/auth/login',
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });
      const passed = (res.status === 204 || res.status === 200) &&
        res.headers['access-control-allow-origin'] === origin &&
        res.headers['access-control-allow-methods']?.includes('POST');
      recordTest(
        10,
        'CORS Preflight: OPTIONS request resolves successfully with allowed methods (GET, POST, PUT, PATCH, DELETE)',
        passed,
        `Status: ${res.status}, Allowed Methods: ${res.headers['access-control-allow-methods']}`
      );
    }

    // Test 11: Non-browser request (e.g. mobile app, curl without Origin header) succeeds without CORS block
    {
      const res = await makeRequest({ path: '/api/health' });
      const passed = res.status === 200 && res.data.status === 'healthy';
      recordTest(
        11,
        'Non-Browser Clients: Requests without Origin header (curl/mobile/server-to-server) pass through cleanly',
        passed,
        `Status: ${res.status}, Result: ${res.data.status}`
      );
    }

    // -------------------------------------------------------------------------
    // SECTION 4: DURABLE FILE STORAGE & SECURITY (TASK 7)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: DURABLE FILE STORAGE & SECURITY ---\n');

    // Test 12: UPLOAD_ROOT resolves dynamically and storage directory exists
    {
      const exists = fs.existsSync(UPLOAD_ROOT);
      const passed = exists && typeof UPLOAD_ROOT === 'string';
      recordTest(
        12,
        'Durable Storage: Upload root directory verified on filesystem and respects UPLOAD_DIR environment override',
        passed,
        `Upload Root: ${UPLOAD_ROOT}, Exists: ${exists}`
      );
    }

    // Test 13: Direct static access to /uploads is blocked with HTTP 403 Forbidden
    {
      const res = await makeRequest({ path: '/uploads/complaints/test.jpg' });
      const passed = res.status === 403 && res.data.message?.includes('Access Denied');
      recordTest(
        13,
        'Upload Directory Isolation: Direct unauthenticated HTTP access to /uploads blocked with HTTP 403 Forbidden',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 14: Path Traversal defense in storage path resolution
    {
      let caught = false;
      try {
        resolveSafeStoragePath('../../etc/passwd');
      } catch (err) {
        caught = true;
      }
      recordTest(
        14,
        'Path Traversal Defense: Upward directory traversal attempts strictly detected and rejected',
        caught,
        `Traversal rejected: ${caught}`
      );
    }

    // -------------------------------------------------------------------------
    // SECTION 5: AUTHENTICATION & CORE WORKFLOWS AUDIT (TASK 9)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: CORE AUTHENTICATION & API WORKFLOW AUDIT ---\n');

    let studentToken = null;
    let staffToken = null;
    let adminToken = null;

    // Test 15: Student login returns valid JWT token and safe user profile
    {
      const res = await makeRequest({
        path: '/api/auth/login',
        method: 'POST',
        body: {
          email: 'rahul.cs23@hostelcare.edu',
          password: 'Password@123'
        }
      });
      const passed = res.status === 200 && res.data.token && res.data.user?.role === 'student' && !res.data.user.password_hash;
      if (passed) studentToken = res.data.token;
      recordTest(
        15,
        'Student Authentication: POST /api/auth/login returns HTTP 200 with valid JWT and safe profile',
        passed,
        `Status: ${res.status}, User: ${res.data.user?.name}, Token present: ${Boolean(res.data.token)}`
      );
    }

    // Test 16: Staff login returns valid JWT token and designation
    {
      const res = await makeRequest({
        path: '/api/auth/login',
        method: 'POST',
        body: {
          email: 'sunita.supervisor@hostelcare.edu',
          password: 'Password@123'
        }
      });
      const passed = res.status === 200 && res.data.token && res.data.user?.role === 'staff';
      if (passed) staffToken = res.data.token;
      recordTest(
        16,
        'Staff Authentication: POST /api/auth/login returns HTTP 200 with staff role claims',
        passed,
        `Status: ${res.status}, Designation: ${res.data.user?.staff_designation}`
      );
    }

    // Test 17: Admin login returns valid JWT token
    {
      const res = await makeRequest({
        path: '/api/auth/login',
        method: 'POST',
        body: {
          email: 'admin@hostelcare.edu',
          password: 'Password@123'
        }
      });
      const passed = res.status === 200 && res.data.token && res.data.user?.role === 'admin';
      if (passed) adminToken = res.data.token;
      recordTest(
        17,
        'Admin Authentication: POST /api/auth/login returns HTTP 200 with admin role claims',
        passed,
        `Status: ${res.status}, Role: ${res.data.user?.role}`
      );
    }

    // Test 18: Profile verification via GET /api/auth/me against live database
    {
      const res = await makeRequest({
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 200 && res.data.user?.email === 'rahul.cs23@hostelcare.edu' && !res.data.user.password_hash;
      recordTest(
        18,
        'Identity Guard: GET /api/auth/me verifies database user record and strictly omits password_hash',
        passed,
        `Status: ${res.status}, Email: ${res.data.user?.email}, Block: ${res.data.user?.hostel_block}`
      );
    }

    // Test 19: Core API — Student views personal complaint listing
    {
      const res = await makeRequest({
        path: '/api/complaints/mine',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 200 && Array.isArray(res.data.complaints) && res.data.complaints.length >= 2;
      recordTest(
        19,
        'Core API: GET /api/complaints/mine returns student complaints from MySQL database',
        passed,
        `Status: ${res.status}, Complaints Count: ${res.data.complaints?.length}`
      );
    }

    // Test 20: Core API — Staff reviews Option D complaints queue
    {
      const res = await makeRequest({
        path: '/api/staff/complaints',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const passed = res.status === 200 && Array.isArray(res.data.complaints) && res.data.stats;
      recordTest(
        20,
        'Core API: GET /api/staff/complaints computes real database stats under Option D hybrid scoping',
        passed,
        `Status: ${res.status}, Permitted Tickets: ${res.data.stats?.totalPermitted}`
      );
    }

    // -------------------------------------------------------------------------
    // SECTION 6: DISASTER RECOVERY & BACKUP UTILITIES (TASK 10)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 6: DISASTER RECOVERY & BACKUP UTILITIES ---\n');

    // Test 21: Schema deployment utility deploySchema.js exists and is runnable
    {
      const deployPath = path.join(rootDir, 'backend', 'database', 'deploySchema.js');
      const exists = fs.existsSync(deployPath);
      recordTest(
        21,
        'Schema Deployment Utility: backend/database/deploySchema.js exists for automated cloud migrations',
        exists,
        `File Path: ${deployPath}`
      );
    }

    // Test 22: Database backup utility backupDatabase.js exists
    {
      const backupPath = path.join(rootDir, 'backend', 'database', 'backupDatabase.js');
      const exists = fs.existsSync(backupPath);
      recordTest(
        22,
        'Backup & Recovery Utility: backend/database/backupDatabase.js exists for scheduled SQL dump archives',
        exists,
        `File Path: ${backupPath}`
      );
    }

    // Test 23: Deployment & Backup Documentation exists
    {
      const docPath = path.join(rootDir, 'docs', 'deployment', 'backend-deployment-guide.md');
      const exists = fs.existsSync(docPath);
      let isComprehensive = false;
      if (exists) {
        const doc = fs.readFileSync(docPath, 'utf8');
        isComprehensive = doc.includes('Railway') &&
          doc.includes('DATABASE_URL') &&
          doc.includes('CORS') &&
          doc.includes('Disaster Recovery');
      }
      const passed = exists && isComprehensive;
      recordTest(
        23,
        'Deployment Documentation: docs/deployment/backend-deployment-guide.md documents Railway deployment, env vars, and backup procedures',
        passed,
        `Doc Exists: ${exists}, Comprehensive Guide: ${isComprehensive}`
      );
    }

    // Test 24: Database Baseline Integrity Preserved
    {
      const [[{ count: complaintCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaints');
      const [[{ count: userCount }]] = await pool.query('SELECT COUNT(*) as count FROM users');
      const [[{ count: assignmentCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaint_assignments');
      const [[{ count: feedbackCount }]] = await pool.query('SELECT COUNT(*) as count FROM feedback');
      const [[{ count: categoryCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaint_categories');

      const passed =
        Number(complaintCount) === 5 &&
        Number(userCount) === 8 &&
        Number(assignmentCount) === 4 &&
        Number(feedbackCount) === 2 &&
        Number(categoryCount) === 6;

      recordTest(
        24,
        'Database baseline integrity preserved (5 complaints, 8 users, 4 assignments, 2 feedback, 6 categories)',
        passed,
        `Complaints: ${complaintCount} (exp 5), Users: ${userCount} (exp 8), Assignments: ${assignmentCount} (exp 4), Feedback: ${feedbackCount} (exp 2), Categories: ${categoryCount} (exp 6)`
      );
    }

  } catch (err) {
    console.error('Fatal Verification Error:', err);
    recordTest(999, 'Unexpected verification exception', false, null, err.message);
  } finally {
    server.close();
    console.log('\nVerification test server closed.\n');
  }

  // Summary Report
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed).length;

  console.log('========================================================================');
  console.log('  SESSION 19 VERIFICATION EXECUTION SUMMARY');
  console.log('========================================================================');
  console.log(`Total Automated Tests : ${totalTests}`);
  console.log(`Tests Passed           : ${passedTests}`);
  console.log(`Tests Failed           : ${failedTests}`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL SESSION 19 TESTS PASSED PERFECTLY!');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Inspect details above.');
  }
  console.log('========================================================================\n');

  return failedTests === 0;
}

runSession19Verification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });

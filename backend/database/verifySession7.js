/**
 * HostelCare — Session 7 Live Verification Suite
 * Comprehensive automated verification for Authentication Middleware (requireAuth),
 * Profile API (GET /api/auth/me & GET /api/v1/auth/me), Logout Endpoint,
 * Live MySQL User Validation, Inactive Account Rejection, Safe Attribute Sanitization,
 * Role-Based Access Control (requireRole), and Shared Frontend auth.js Integration.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/db.js');
const { default: UserModel } = await import('../src/models/userModel.js');
const { generateToken, verifyToken } = await import('../src/utils/jwt.js');
const { requireAuth, requireRole } = await import('../src/middleware/authMiddleware.js');

const results = [];

function recordTest(testNum, testName, passed, evidence, failureDetails = null) {
  results.push({ testNum, testName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] Test ${testNum}: ${testName}`);
  if (evidence) {
    console.log(`       Evidence: ${evidence}`);
  }
  if (!passed && failureDetails) {
    console.log(`       Failure Details: ${failureDetails}`);
  }
}

async function requestJson(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const method = options.method || 'GET';
  const headers = {
    'Accept': 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers
  };

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSession7Verification() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 7 LIVE VERIFICATION SUITE           ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tempInactiveEmail = 'session7.inactive@hostelcare.edu';

  try {
    // Clean any leftover test accounts
    await pool.query('DELETE FROM users WHERE email = ?', [tempInactiveEmail]);

    // Retrieve active seed users for testing
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu');
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');

    if (!studentUser || !staffUser || !adminUser) {
      throw new Error('Seed users missing. Please ensure database seed data is present.');
    }

    // Generate valid tokens
    const studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
      name: studentUser.name
    });

    const staffToken = generateToken({
      id: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      name: staffUser.name
    });

    const adminToken = generateToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name
    });

    // ------------------------------------------------------------------------
    // Test 1: Express Server & Route Mounting
    // ------------------------------------------------------------------------
    const healthRes = await requestJson(baseUrl, '/api/health');
    recordTest(
      1,
      'Express Server & Health Probes Active',
      healthRes.status === 200 && healthRes.data.status === 'healthy',
      `HTTP ${healthRes.status}, app: ${healthRes.data.application}, db: ${healthRes.data.database?.status}`
    );

    // ------------------------------------------------------------------------
    // Test 2: Missing Authorization Header on /api/auth/me
    // ------------------------------------------------------------------------
    const noTokenRes1 = await requestJson(baseUrl, '/api/auth/me');
    recordTest(
      2,
      'requireAuth rejects missing token on /api/auth/me with HTTP 401',
      noTokenRes1.status === 401 && noTokenRes1.data.success === false && noTokenRes1.data.code === 'NO_TOKEN',
      `HTTP ${noTokenRes1.status}, code: ${noTokenRes1.data.code}, message: "${noTokenRes1.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 3: Missing Authorization Header on /api/v1/auth/me
    // ------------------------------------------------------------------------
    const noTokenRes2 = await requestJson(baseUrl, '/api/v1/auth/me');
    recordTest(
      3,
      'requireAuth rejects missing token on /api/v1/auth/me with HTTP 401',
      noTokenRes2.status === 401 && noTokenRes2.data.success === false && noTokenRes2.data.code === 'NO_TOKEN',
      `HTTP ${noTokenRes2.status}, code: ${noTokenRes2.data.code}, message: "${noTokenRes2.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 4: Malformed Authorization Header — Missing "Bearer" Prefix
    // ------------------------------------------------------------------------
    const malformedPrefixRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Token ${studentToken}` }
    });
    recordTest(
      4,
      'requireAuth rejects non-Bearer prefix (Token xyz) with HTTP 401',
      malformedPrefixRes.status === 401 && malformedPrefixRes.data.code === 'MALFORMED_TOKEN',
      `HTTP ${malformedPrefixRes.status}, code: ${malformedPrefixRes.data.code}, message: "${malformedPrefixRes.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 5: Malformed Authorization Header — Empty Token ("Bearer ")
    // ------------------------------------------------------------------------
    const emptyTokenRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Bearer ' }
    });
    recordTest(
      5,
      'requireAuth rejects empty Bearer token ("Bearer ") with HTTP 401',
      emptyTokenRes.status === 401 && emptyTokenRes.data.code === 'MALFORMED_TOKEN',
      `HTTP ${emptyTokenRes.status}, code: ${emptyTokenRes.data.code}, message: "${emptyTokenRes.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 6: Malformed Authorization Header — Arbitrary format ("Basic dXNlcg==")
    // ------------------------------------------------------------------------
    const basicAuthRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Basic dXNlcjpwYXNz' }
    });
    recordTest(
      6,
      'requireAuth rejects Basic auth credentials with HTTP 401 MALFORMED_TOKEN',
      basicAuthRes.status === 401 && basicAuthRes.data.code === 'MALFORMED_TOKEN',
      `HTTP ${basicAuthRes.status}, code: ${basicAuthRes.data.code}`
    );

    // ------------------------------------------------------------------------
    // Test 7: Invalid Token Signature (Signed with wrong/foreign secret)
    // ------------------------------------------------------------------------
    const foreignToken = jwt.sign(
      { id: studentUser.id, email: studentUser.email, role: studentUser.role },
      'completely_different_foreign_secret_key_12345',
      { expiresIn: '1h' }
    );
    const foreignSecretRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${foreignToken}` }
    });
    recordTest(
      7,
      'requireAuth rejects foreign/tampered JWT signature with HTTP 401 INVALID_TOKEN',
      foreignSecretRes.status === 401 && foreignSecretRes.data.code === 'INVALID_TOKEN',
      `HTTP ${foreignSecretRes.status}, code: ${foreignSecretRes.data.code}, message: "${foreignSecretRes.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 8: Nonsense / Malformed Token String
    // ------------------------------------------------------------------------
    const nonsenseRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Bearer this.is.not.a.valid.jwt' }
    });
    recordTest(
      8,
      'requireAuth rejects malformed JWT payload string with HTTP 401 INVALID_TOKEN',
      nonsenseRes.status === 401 && nonsenseRes.data.code === 'INVALID_TOKEN',
      `HTTP ${nonsenseRes.status}, code: ${nonsenseRes.data.code}`
    );

    // ------------------------------------------------------------------------
    // Test 9: Expired Token
    // ------------------------------------------------------------------------
    const expiredToken = jwt.sign(
      { id: studentUser.id, email: studentUser.email, role: studentUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // Expired 1 second in the past
    );
    const expiredRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    recordTest(
      9,
      'requireAuth rejects expired token with HTTP 401 TOKEN_EXPIRED',
      expiredRes.status === 401 && expiredRes.data.code === 'TOKEN_EXPIRED',
      `HTTP ${expiredRes.status}, code: ${expiredRes.data.code}, message: "${expiredRes.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 10: Mandatory 1 — Fetch current user from MySQL: Non-existent User ID
    // ------------------------------------------------------------------------
    const nonExistentUserToken = generateToken({
      id: 999999, // Non-existent primary key
      email: 'ghost.user@hostelcare.edu',
      role: 'student',
      name: 'Ghost User'
    });
    const ghostRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${nonExistentUserToken}` }
    });
    recordTest(
      10,
      'Mandatory 1: requireAuth queries MySQL UserModel.findById() and rejects deleted user with HTTP 401',
      ghostRes.status === 401 && ghostRes.data.code === 'USER_NOT_FOUND',
      `HTTP ${ghostRes.status}, code: ${ghostRes.data.code}, message: "${ghostRes.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 11: Mandatory 2 — Reject inactive or suspended accounts on protected requests
    // ------------------------------------------------------------------------
    const [createInactive] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES (?, ?, 'dummy_hash', 'student', 'inactive')`,
      ['Suspended Student', tempInactiveEmail]
    );
    const inactiveUserId = createInactive.insertId;
    const inactiveToken = generateToken({
      id: inactiveUserId,
      email: tempInactiveEmail,
      role: 'student',
      name: 'Suspended Student'
    });

    const inactiveRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${inactiveToken}` }
    });
    recordTest(
      11,
      'Mandatory 2: Reject inactive / suspended account with HTTP 403 ACCOUNT_INACTIVE',
      inactiveRes.status === 403 && inactiveRes.data.code === 'ACCOUNT_INACTIVE',
      `HTTP ${inactiveRes.status}, code: ${inactiveRes.data.code}, message: "${inactiveRes.data.message}"`
    );

    // Clean up temporary inactive account immediately
    await pool.query('DELETE FROM users WHERE id = ?', [inactiveUserId]);

    // ------------------------------------------------------------------------
    // Test 12: Mandatory 3 — Valid Student Token returns HTTP 200 with safe user data
    // ------------------------------------------------------------------------
    const studentProfileRes = await requestJson(baseUrl, '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const studentUserObj = studentProfileRes.data?.user;
    const isStudentValid = studentProfileRes.status === 200 &&
      studentProfileRes.data.success === true &&
      studentUserObj?.id === studentUser.id &&
      studentUserObj?.role === 'student' &&
      studentUserObj?.email === studentUser.email;

    recordTest(
      12,
      'Mandatory 3: GET /api/auth/me returns HTTP 200 with database-verified student profile',
      isStudentValid,
      `HTTP ${studentProfileRes.status}, name: "${studentUserObj?.name}", role: ${studentUserObj?.role}, block: ${studentUserObj?.hostel_block}, room: ${studentUserObj?.room_number}`
    );

    // ------------------------------------------------------------------------
    // Test 13: Mandatory 3 — Security: password_hash is strictly absent from req.user
    // ------------------------------------------------------------------------
    const hasPasswordHash = 'password_hash' in (studentUserObj || {}) || 'password' in (studentUserObj || {});
    recordTest(
      13,
      'Mandatory 3: Sensitive password_hash is strictly absent from returned profile',
      !hasPasswordHash,
      `Keys returned: [${Object.keys(studentUserObj || {}).join(', ')}] — password_hash present: ${hasPasswordHash}`
    );

    // ------------------------------------------------------------------------
    // Test 14: Mandatory 6 — Dual endpoint test: GET /api/v1/auth/me returns identical data
    // ------------------------------------------------------------------------
    const studentV1Res = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const isV1Identical = studentV1Res.status === 200 &&
      studentV1Res.data?.user?.id === studentUser.id &&
      studentV1Res.data?.user?.email === studentUser.email;

    recordTest(
      14,
      'Mandatory 6: Parity check: GET /api/v1/auth/me returns HTTP 200 with identical profile',
      isV1Identical,
      `HTTP ${studentV1Res.status}, user id: ${studentV1Res.data?.user?.id}, email: ${studentV1Res.data?.user?.email}`
    );

    // ------------------------------------------------------------------------
    // Test 15: Valid Staff Profile via GET /api/v1/auth/me
    // ------------------------------------------------------------------------
    const staffProfileRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const staffUserObj = staffProfileRes.data?.user;
    const isStaffValid = staffProfileRes.status === 200 &&
      staffUserObj?.id === staffUser.id &&
      staffUserObj?.role === 'staff' &&
      staffUserObj?.staff_designation === 'Senior Electrician';

    recordTest(
      15,
      'GET /api/v1/auth/me returns HTTP 200 with staff profile & designation',
      isStaffValid,
      `HTTP ${staffProfileRes.status}, designation: "${staffUserObj?.staff_designation}", role: ${staffUserObj?.role}`
    );

    // ------------------------------------------------------------------------
    // Test 16: Valid Admin Profile via GET /api/v1/auth/me
    // ------------------------------------------------------------------------
    const adminProfileRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminUserObj = adminProfileRes.data?.user;
    const isAdminValid = adminProfileRes.status === 200 &&
      adminUserObj?.id === adminUser.id &&
      adminUserObj?.role === 'admin';

    recordTest(
      16,
      'GET /api/v1/auth/me returns HTTP 200 with admin profile',
      isAdminValid,
      `HTTP ${adminProfileRes.status}, name: "${adminUserObj?.name}", role: ${adminUserObj?.role}`
    );

    // ------------------------------------------------------------------------
    // Test 17: POST /api/auth/logout Endpoint
    // ------------------------------------------------------------------------
    const logoutRes1 = await requestJson(baseUrl, '/api/auth/logout', { method: 'POST' });
    recordTest(
      17,
      'POST /api/auth/logout returns HTTP 200 with success confirmation',
      logoutRes1.status === 200 && logoutRes1.data.success === true,
      `HTTP ${logoutRes1.status}, message: "${logoutRes1.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 18: POST /api/v1/auth/logout Endpoint
    // ------------------------------------------------------------------------
    const logoutRes2 = await requestJson(baseUrl, '/api/v1/auth/logout', { method: 'POST' });
    recordTest(
      18,
      'POST /api/v1/auth/logout returns HTTP 200 with success confirmation',
      logoutRes2.status === 200 && logoutRes2.data.success === true,
      `HTTP ${logoutRes2.status}, message: "${logoutRes2.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 19: requireRole Middleware Unit Test — Authorized Role
    // ------------------------------------------------------------------------
    let rolePassed = false;
    const mockReq1 = { user: { role: 'admin' } };
    const mockRes1 = { status: () => ({ json: () => {} }) };
    const adminRoleGuard = requireRole('admin');
    adminRoleGuard(mockReq1, mockRes1, () => { rolePassed = true; });

    recordTest(
      19,
      'requireRole allows access when user role matches permitted roles',
      rolePassed === true,
      `Role 'admin' permitted on admin-only route: next() called successfully`
    );

    // ------------------------------------------------------------------------
    // Test 20: requireRole Middleware Unit Test — Forbidden Role
    // ------------------------------------------------------------------------
    let forbiddenStatusCode = null;
    let forbiddenResponse = null;
    const mockReq2 = { user: { role: 'student' } };
    const mockRes2 = {
      status(code) {
        forbiddenStatusCode = code;
        return {
          json(payload) {
            forbiddenResponse = payload;
          }
        };
      }
    };
    const staffOnlyGuard = requireRole('staff', 'admin');
    staffOnlyGuard(mockReq2, mockRes2, () => {});

    recordTest(
      20,
      'requireRole rejects forbidden user role with HTTP 403 FORBIDDEN_ROLE',
      forbiddenStatusCode === 403 && forbiddenResponse?.code === 'FORBIDDEN_ROLE',
      `HTTP ${forbiddenStatusCode}, code: ${forbiddenResponse?.code}, message: "${forbiddenResponse?.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 21: Frontend auth.js File Existence & Method Verification
    // ------------------------------------------------------------------------
    const authJsPath = path.join(rootDir, 'frontend', 'js', 'auth.js');
    const authAssetsJsPath = path.join(rootDir, 'frontend', 'assets', 'js', 'auth.js');
    const authJsExists = fs.existsSync(authJsPath) && fs.existsSync(authAssetsJsPath);
    const authJsContent = authJsExists ? fs.readFileSync(authJsPath, 'utf8') : '';

    const hasGetUser = authJsContent.includes('getUser()');
    const hasRequireAuth = authJsContent.includes('requireAuth(');
    const hasFetchProfile = authJsContent.includes('fetchProfile()');
    const hasLogout = authJsContent.includes('logout(');

    recordTest(
      21,
      'Frontend shared auth.js implements getUser, requireAuth, fetchProfile, and logout',
      authJsExists && hasGetUser && hasRequireAuth && hasFetchProfile && hasLogout,
      `auth.js file exists at frontend/js and frontend/assets/js. Methods present: getUser, requireAuth, fetchProfile, logout`
    );

    // ------------------------------------------------------------------------
    // Test 22: Dashboard Pages Integrate auth.js and Role Guards
    // ------------------------------------------------------------------------
    const studentDashPath = path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html');
    const staffDashPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
    const adminDashPath = path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html');

    const sHtml = fs.readFileSync(studentDashPath, 'utf8');
    const stHtml = fs.readFileSync(staffDashPath, 'utf8');
    const aHtml = fs.readFileSync(adminDashPath, 'utf8');

    const sHasAuth = sHtml.includes('/js/auth.js') && sHtml.includes("requireAuth(['student'])");
    const stHasAuth = stHtml.includes('/js/auth.js') && stHtml.includes("requireAuth(['staff'])");
    const aHasAuth = aHtml.includes('/js/auth.js') && aHtml.includes("requireAuth(['admin'])");

    recordTest(
      22,
      'Student, Staff, and Admin dashboard pages integrate auth.js with role-specific guards',
      sHasAuth && stHasAuth && aHasAuth,
      `Student dash guard: ${sHasAuth}, Staff dash guard: ${stHasAuth}, Admin dash guard: ${aHasAuth}`
    );

    // ------------------------------------------------------------------------
    // Test 23: Regression Check — Student Registration (Session 5)
    // ------------------------------------------------------------------------
    const regDuplicateRes = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Rahul Sharma',
        email: 'rahul.cs23@hostelcare.edu',
        password: 'Password@123',
        phone: '9876543210',
        hostel_block: 'Block A',
        room_number: '101'
      }
    });
    recordTest(
      23,
      'Regression Check (Session 5): Duplicate registration properly rejected with HTTP 409',
      regDuplicateRes.status === 409,
      `HTTP ${regDuplicateRes.status}, message: "${regDuplicateRes.data?.message}"`
    );

    // ------------------------------------------------------------------------
    // Test 24: Regression Check — Login Flow (Session 6)
    // ------------------------------------------------------------------------
    const loginRes = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'rahul.cs23@hostelcare.edu',
        password: 'Password@123'
      }
    });
    recordTest(
      24,
      'Regression Check (Session 6): User login returns HTTP 200 with token and safe user profile',
      loginRes.status === 200 && !!loginRes.data.token && !('password_hash' in loginRes.data.user),
      `HTTP ${loginRes.status}, token received: ${loginRes.data.token ? 'YES' : 'NO'}, role: ${loginRes.data.user?.role}`
    );

    // ------------------------------------------------------------------------
    // Test 25: Database User Count Integrity Check
    // ------------------------------------------------------------------------
    const [userCountRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = userCountRows[0].total;
    recordTest(
      25,
      'Database Integrity: Exactly 8 pristine seed users remain in MySQL (Zero test artifacts)',
      totalUsers === 8,
      `Total users count in database: ${totalUsers}`
    );

  } finally {
    // Teardown test server
    await new Promise((resolve) => server.close(resolve));
    console.log('\n✓ Test HTTP server closed.');
  }

  // Verification Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`SESSION 7 VERIFICATION COMPLETE: ${passedCount}/${results.length} TESTS PASSED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED TESTS: ${failedCount}`);
    await pool.end();
    process.exit(1);
  } else {
    console.log('ALL SESSION 7 TESTS COMPLETED WITH ZERO FAILURES.');
    await pool.end();
    process.exit(0);
  }
}

runSession7Verification().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});

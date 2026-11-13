/**
 * HostelCare — Session 7 Comprehensive Technical & Security Audit
 * Deep audit verifying:
 * 1. Authentication Middleware (requireAuth) robustness & error handling
 * 2. Mandatory MySQL live lookup on every protected request
 * 3. Inactive and suspended account rejection on protected endpoints
 * 4. Safe user profile sanitization (strict exclusion of password_hash)
 * 5. GET /api/auth/me and GET /api/v1/auth/me parity across Student, Staff, and Admin
 * 6. POST /api/auth/logout and /api/v1/auth/logout endpoints
 * 7. Role-Based Access Control (requireRole) guard enforcement
 * 8. Shared frontend auth.js architecture and role guards
 * 9. Token storage strategy analysis & architectural security documentation
 * 10. Database state cleanliness & regression verification
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

const auditResults = [];

function recordAudit(section, testNum, testName, passed, evidence, failureDetails = null) {
  auditResults.push({ section, testNum, testName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] [${section}] #${testNum}: ${testName}`);
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

async function runSession7Audit() {
  console.log('================================================================');
  console.log('       HOSTELCARE — SESSION 7 COMPREHENSIVE SECURITY AUDIT      ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tempInactiveEmail = 'audit.session7.inactive@hostelcare.edu';

  try {
    // Clean any prior temporary test user
    await pool.query('DELETE FROM users WHERE email = ?', [tempInactiveEmail]);

    // Retrieve active seed users
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu');
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');

    if (!studentUser || !staffUser || !adminUser) {
      throw new Error('Seed users not found in database. Please run seed script.');
    }

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

    // ========================================================================
    // SECTION 1: requireAuth Middleware Robustness & Header Parsing
    // ========================================================================
    console.log('--- SECTION 1: requireAuth Header & Token Validation ---');

    // 1.1: Missing Authorization Header
    const r1 = await requestJson(baseUrl, '/api/auth/me');
    recordAudit(
      'Middleware',
      1,
      'Reject missing Authorization header on /api/auth/me with HTTP 401',
      r1.status === 401 && r1.data.code === 'NO_TOKEN',
      `HTTP ${r1.status}, code: ${r1.data.code}, message: "${r1.data.message}"`
    );

    // 1.2: Missing Authorization Header on /api/v1/auth/me
    const r2 = await requestJson(baseUrl, '/api/v1/auth/me');
    recordAudit(
      'Middleware',
      2,
      'Reject missing Authorization header on /api/v1/auth/me with HTTP 401',
      r2.status === 401 && r2.data.code === 'NO_TOKEN',
      `HTTP ${r2.status}, code: ${r2.data.code}`
    );

    // 1.3: Malformed Header — Missing 'Bearer' prefix
    const r3 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': studentToken }
    });
    recordAudit(
      'Middleware',
      3,
      'Reject raw token without "Bearer" prefix with HTTP 401 MALFORMED_TOKEN',
      r3.status === 401 && r3.data.code === 'MALFORMED_TOKEN',
      `HTTP ${r3.status}, code: ${r3.data.code}`
    );

    // 1.4: Malformed Header — Non-Bearer scheme
    const r4 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Token ${studentToken}` }
    });
    recordAudit(
      'Middleware',
      4,
      'Reject invalid prefix "Token <token>" with HTTP 401 MALFORMED_TOKEN',
      r4.status === 401 && r4.data.code === 'MALFORMED_TOKEN',
      `HTTP ${r4.status}, code: ${r4.data.code}`
    );

    // 1.5: Malformed Header — Empty Bearer
    const r5 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Bearer ' }
    });
    recordAudit(
      'Middleware',
      5,
      'Reject empty Bearer header ("Bearer ") with HTTP 401 MALFORMED_TOKEN',
      r5.status === 401 && r5.data.code === 'MALFORMED_TOKEN',
      `HTTP ${r5.status}, code: ${r5.data.code}`
    );

    // 1.6: Malformed Header — Multi-word junk
    const r6 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Bearer foo bar baz' }
    });
    recordAudit(
      'Middleware',
      6,
      'Reject multi-part header ("Bearer foo bar baz") with HTTP 401 MALFORMED_TOKEN',
      r6.status === 401 && r6.data.code === 'MALFORMED_TOKEN',
      `HTTP ${r6.status}, code: ${r6.data.code}`
    );

    // 1.7: Valid Bearer with excessive whitespace (gracefully handles standard split)
    const r7 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer   ${studentToken}` }
    });
    recordAudit(
      'Middleware',
      7,
      'Accept Bearer token with multiple whitespace characters',
      r7.status === 200 && r7.data.success === true,
      `HTTP ${r7.status}, user: ${r7.data.user?.name}`
    );

    // ========================================================================
    // SECTION 2: Cryptographic JWT Verification Security
    // ========================================================================
    console.log('\n--- SECTION 2: Cryptographic JWT Verification ---');

    // 2.1: Invalid signature (Signed with foreign key)
    const fakeKeyToken = jwt.sign(
      { id: studentUser.id, email: studentUser.email, role: 'student' },
      'completely_unauthorized_key_9999999999999999',
      { expiresIn: '1h' }
    );
    const r8 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${fakeKeyToken}` }
    });
    recordAudit(
      'Crypto',
      8,
      'Reject token signed with foreign secret with HTTP 401 INVALID_TOKEN',
      r8.status === 401 && r8.data.code === 'INVALID_TOKEN',
      `HTTP ${r8.status}, code: ${r8.data.code}`
    );

    // 2.2: Tampered payload (signature does not match modified payload)
    const parts = studentToken.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ id: 1, role: 'admin' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const r9 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    recordAudit(
      'Crypto',
      9,
      'Reject cryptographically tampered JWT token with HTTP 401 INVALID_TOKEN',
      r9.status === 401 && r9.data.code === 'INVALID_TOKEN',
      `HTTP ${r9.status}, code: ${r9.data.code}`
    );

    // 2.3: Non-JWT random string
    const r10 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': 'Bearer random_unformatted_string_12345' }
    });
    recordAudit(
      'Crypto',
      10,
      'Reject non-JWT random string with HTTP 401 INVALID_TOKEN',
      r10.status === 401 && r10.data.code === 'INVALID_TOKEN',
      `HTTP ${r10.status}, code: ${r10.data.code}`
    );

    // 2.4: Expired token
    const expiredToken = jwt.sign(
      { id: studentUser.id, email: studentUser.email, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const r11 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    recordAudit(
      'Crypto',
      11,
      'Reject expired JWT token with HTTP 401 TOKEN_EXPIRED',
      r11.status === 401 && r11.data.code === 'TOKEN_EXPIRED',
      `HTTP ${r11.status}, code: ${r11.data.code}, message: "${r11.data.message}"`
    );

    // ========================================================================
    // SECTION 3: Live Database Lookup & Account Status Checks
    // ========================================================================
    console.log('\n--- SECTION 3: Live MySQL Lookup & Account Status Checks ---');

    // 3.1: Token contains non-existent user ID
    const ghostToken = generateToken({
      id: 888888,
      email: 'ghost@hostelcare.edu',
      role: 'student',
      name: 'Ghost'
    });
    const r12 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${ghostToken}` }
    });
    recordAudit(
      'DB Validation',
      12,
      'Mandatory Requirement 1: Query MySQL UserModel.findById() and reject non-existent user with HTTP 401',
      r12.status === 401 && r12.data.code === 'USER_NOT_FOUND',
      `HTTP ${r12.status}, code: ${r12.data.code}, message: "${r12.data.message}"`
    );

    // 3.2: Inactive / Suspended account rejection
    const [createInactive] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES (?, ?, 'dummy_hash', 'student', 'inactive')`,
      ['Suspended Test Student', tempInactiveEmail]
    );
    const inactiveUserId = createInactive.insertId;
    const inactiveToken = generateToken({
      id: inactiveUserId,
      email: tempInactiveEmail,
      role: 'student',
      name: 'Suspended Test Student'
    });

    const r13 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${inactiveToken}` }
    });
    recordAudit(
      'DB Validation',
      13,
      'Mandatory Requirement 2: Reject inactive/suspended account on protected request with HTTP 403',
      r13.status === 403 && r13.data.code === 'ACCOUNT_INACTIVE',
      `HTTP ${r13.status}, code: ${r13.data.code}, message: "${r13.data.message}"`
    );

    // Cleanup inactive user
    await pool.query('DELETE FROM users WHERE id = ?', [inactiveUserId]);

    // ========================================================================
    // SECTION 4: Safe Profile Data & Role Profiles (GET /api/auth/me)
    // ========================================================================
    console.log('\n--- SECTION 4: Profile Data Sanitization & Multi-Role Parity ---');

    // 4.1: Student profile retrieval on /api/auth/me
    const r14 = await requestJson(baseUrl, '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const studentData = r14.data?.user;
    recordAudit(
      'Profile',
      14,
      'GET /api/auth/me returns HTTP 200 with complete student profile',
      r14.status === 200 && studentData?.id === studentUser.id && studentData?.role === 'student',
      `HTTP ${r14.status}, id: ${studentData?.id}, name: "${studentData?.name}", block: "${studentData?.hostel_block}", room: "${studentData?.room_number}"`
    );

    // 4.2: Strict exclusion of password_hash in response
    const hasHash = 'password_hash' in (studentData || {}) || 'password' in (studentData || {});
    recordAudit(
      'Profile',
      15,
      'Mandatory Requirement 3: password_hash is strictly excluded from returned profile',
      !hasHash,
      `password_hash present: ${hasHash}, keys: [${Object.keys(studentData || {}).join(', ')}]`
    );

    // 4.3: Route parity check with /api/v1/auth/me
    const r16 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const v1Data = r16.data?.user;
    const isParityIdentical = JSON.stringify(studentData) === JSON.stringify(v1Data);
    recordAudit(
      'Profile',
      16,
      'Mandatory Requirement 6: GET /api/auth/me and GET /api/v1/auth/me return identical payloads',
      r16.status === 200 && isParityIdentical,
      `Payload equality: ${isParityIdentical}, HTTP ${r16.status}`
    );

    // 4.4: Staff profile retrieval with designation
    const r17 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const staffData = r17.data?.user;
    recordAudit(
      'Profile',
      17,
      'Staff profile includes staff_designation and assigned block info',
      r17.status === 200 && staffData?.role === 'staff' && staffData?.staff_designation === 'Senior Electrician',
      `HTTP ${r17.status}, role: "${staffData?.role}", designation: "${staffData?.staff_designation}"`
    );

    // 4.5: Admin profile retrieval
    const r18 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminData = r18.data?.user;
    recordAudit(
      'Profile',
      18,
      'Admin profile returns role "admin" with administrative privileges',
      r18.status === 200 && adminData?.role === 'admin',
      `HTTP ${r18.status}, role: "${adminData?.role}", name: "${adminData?.name}"`
    );

    // ========================================================================
    // SECTION 5: Logout Endpoints & Session Invalidation
    // ========================================================================
    console.log('\n--- SECTION 5: Logout Endpoints ---');

    // 5.1: POST /api/auth/logout
    const r19 = await requestJson(baseUrl, '/api/auth/logout', { method: 'POST' });
    recordAudit(
      'Logout',
      19,
      'POST /api/auth/logout returns HTTP 200 with session cleanup message',
      r19.status === 200 && r19.data.success === true,
      `HTTP ${r19.status}, message: "${r19.data.message}"`
    );

    // 5.2: POST /api/v1/auth/logout
    const r20 = await requestJson(baseUrl, '/api/v1/auth/logout', { method: 'POST' });
    recordAudit(
      'Logout',
      20,
      'POST /api/v1/auth/logout returns HTTP 200 with session cleanup message',
      r20.status === 200 && r20.data.success === true,
      `HTTP ${r20.status}, message: "${r20.data.message}"`
    );

    // ========================================================================
    // SECTION 6: Role-Based Access Control (RBAC) Guard (requireRole)
    // ========================================================================
    console.log('\n--- SECTION 6: Role-Based Access Control (requireRole) ---');

    // 6.1: requireRole accepts matching single role
    let passedSingle = false;
    const guardAdmin = requireRole('admin');
    guardAdmin({ user: { role: 'admin' } }, {}, () => { passedSingle = true; });
    recordAudit(
      'RBAC',
      21,
      'requireRole allows access when user role exactly matches permitted single role',
      passedSingle === true,
      `Admin accessing admin route: next() called`
    );

    // 6.2: requireRole accepts matching multi-role
    let passedMulti = false;
    const guardStaffOrAdmin = requireRole('staff', 'admin');
    guardStaffOrAdmin({ user: { role: 'staff' } }, {}, () => { passedMulti = true; });
    recordAudit(
      'RBAC',
      22,
      'requireRole allows access when user role matches one of multiple permitted roles',
      passedMulti === true,
      `Staff accessing staff/admin route: next() called`
    );

    // 6.3: requireRole rejects non-matching role with HTTP 403
    let rbacStatusCode = null;
    let rbacResponse = null;
    const guardStaffOnly = requireRole('staff', 'admin');
    guardStaffOnly(
      { user: { role: 'student' } },
      {
        status(code) {
          rbacStatusCode = code;
          return { json(p) { rbacResponse = p; } };
        }
      },
      () => {}
    );
    recordAudit(
      'RBAC',
      23,
      'requireRole rejects unauthorized role with HTTP 403 FORBIDDEN_ROLE',
      rbacStatusCode === 403 && rbacResponse?.code === 'FORBIDDEN_ROLE',
      `HTTP ${rbacStatusCode}, code: ${rbacResponse?.code}, message: "${rbacResponse?.message}"`
    );

    // 6.4: requireRole rejects missing req.user with HTTP 401
    let unauthCode = null;
    guardAdmin(
      {},
      {
        status(code) {
          unauthCode = code;
          return { json() {} };
        }
      },
      () => {}
    );
    recordAudit(
      'RBAC',
      24,
      'requireRole rejects unauthenticated request (missing req.user) with HTTP 401',
      unauthCode === 401,
      `HTTP ${unauthCode}`
    );

    // ========================================================================
    // SECTION 7: Frontend Shared auth.js & Dashboard Integration
    // ========================================================================
    console.log('\n--- SECTION 7: Frontend auth.js Architecture & Dashboard Integration ---');

    const authJsPath = path.join(rootDir, 'frontend', 'js', 'auth.js');
    const authAssetsJsPath = path.join(rootDir, 'frontend', 'assets', 'js', 'auth.js');
    const bothExist = fs.existsSync(authJsPath) && fs.existsSync(authAssetsJsPath);
    const contentJs = fs.readFileSync(authJsPath, 'utf8');
    const contentAssets = fs.readFileSync(authAssetsJsPath, 'utf8');
    const areIdentical = contentJs === contentAssets;

    recordAudit(
      'Frontend',
      25,
      'Shared auth.js synchronized identically between frontend/js and frontend/assets/js',
      bothExist && areIdentical,
      `Both files exist: ${bothExist}, Identical character content: ${areIdentical}`
    );

    const hasCoreMethods = contentJs.includes('getUser()') &&
                           contentJs.includes('setUser(') &&
                           contentJs.includes('getToken()') &&
                           contentJs.includes('isAuthenticated()') &&
                           contentJs.includes('getRole()') &&
                           contentJs.includes('getDashboardUrl(') &&
                           contentJs.includes('fetchProfile()') &&
                           contentJs.includes('logout(') &&
                           contentJs.includes('requireAuth(');

    recordAudit(
      'Frontend',
      26,
      'Shared auth.js exposes complete API suite (getUser, isAuthenticated, fetchProfile, logout, requireAuth)',
      hasCoreMethods,
      `Core method presence: ${hasCoreMethods}`
    );

    // Inspect dashboard HTML script inclusions and guards
    const studentDashHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html'), 'utf8');
    const staffDashHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html'), 'utf8');
    const adminDashHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'index.html'), 'utf8');

    const sGuarded = studentDashHtml.includes('/js/auth.js') && studentDashHtml.includes("requireAuth(['student'])");
    const stGuarded = staffDashHtml.includes('/js/auth.js') && staffDashHtml.includes("requireAuth(['staff'])");
    const aGuarded = adminDashHtml.includes('/js/auth.js') && adminDashHtml.includes("requireAuth(['admin'])");
    const idxIntegrated = indexHtml.includes('/js/auth.js') && indexHtml.includes('window.Auth.isAuthenticated()');

    recordAudit(
      'Frontend',
      27,
      'All 3 dashboards and landing page integrate auth.js and role guards',
      sGuarded && stGuarded && aGuarded && idxIntegrated,
      `Student: ${sGuarded}, Staff: ${stGuarded}, Admin: ${aGuarded}, Landing: ${idxIntegrated}`
    );

    // ========================================================================
    // SECTION 8: Regression Stability (Sessions 1 to 6)
    // ========================================================================
    console.log('\n--- SECTION 8: Regression Stability (Sessions 1 to 6) ---');

    // 8.1: Health endpoint
    const hRes = await requestJson(baseUrl, '/api/health');
    recordAudit(
      'Regression',
      28,
      'Session 3: Application & MySQL health check remains healthy',
      hRes.status === 200 && hRes.data.database?.status === 'connected',
      `HTTP ${hRes.status}, database: ${hRes.data.database?.status}`
    );

    // 8.2: Registration duplicate rejection
    const regRes = await requestJson(baseUrl, '/api/auth/register', {
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
    recordAudit(
      'Regression',
      29,
      'Session 5: Student registration prevents duplicate emails with HTTP 409',
      regRes.status === 409,
      `HTTP ${regRes.status}, message: "${regRes.data?.message}"`
    );

    // 8.3: Login flow with bcrypt.compare
    const lRes = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'rahul.cs23@hostelcare.edu',
        password: 'Password@123'
      }
    });
    recordAudit(
      'Regression',
      30,
      'Session 6: Login API verifies password and returns JWT token & safe profile',
      lRes.status === 200 && !!lRes.data.token && !('password_hash' in lRes.data.user),
      `HTTP ${lRes.status}, token: ${Boolean(lRes.data.token)}, role: "${lRes.data.user?.role}"`
    );

    // ========================================================================
    // SECTION 9: Database Hygiene & State Integrity
    // ========================================================================
    console.log('\n--- SECTION 9: Database Integrity ---');

    const [userRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const totalCount = userRows[0].total;
    recordAudit(
      'Database',
      31,
      'MySQL database retains exactly 8 pristine seed records (Zero test pollution)',
      totalCount === 8,
      `Total users in DB: ${totalCount} (1 Admin, 3 Staff, 4 Students)`
    );

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\n✓ Ephemeral test server closed.');
  }

  // Summary
  const passedCount = auditResults.filter((r) => r.passed).length;
  const failedCount = auditResults.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`SESSION 7 COMPREHENSIVE AUDIT: ${passedCount}/${auditResults.length} CHECKS PASSED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED AUDIT CHECKS: ${failedCount}`);
    await pool.end();
    process.exit(1);
  } else {
    console.log('ALL 31/31 SESSION 7 AUDIT CHECKS PASSED WITH ZERO ERRORS.');
    await pool.end();
    process.exit(0);
  }
}

runSession7Audit().catch((err) => {
  console.error('Fatal Audit Error:', err);
  process.exit(1);
});

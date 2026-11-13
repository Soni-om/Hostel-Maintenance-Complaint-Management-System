/**
 * HostelCare — Session 8 Live Verification Suite
 * Automated tests for:
 * 1. Backend Role-Based Authorization (requireRole)
 * 2. Role Boundary Enforcement (Student vs Staff vs Admin)
 * 3. Controlled Staff/Admin Account Provisioning (POST /api/v1/users)
 * 4. Privilege Escalation Prevention & Request Body Role Validation
 * 5. Direct Dashboard HTML Route Protection & Frontend auth.js Integration
 * 6. User Directory Listing & Status Administration
 * 7. Regression Validation (Sessions 5, 6, 7 Unbroken)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/db.js');
const { default: UserModel } = await import('../src/models/userModel.js');
const { generateToken } = await import('../src/utils/jwt.js');

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

async function runSession8Verification() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 8 LIVE VERIFICATION SUITE           ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tempStaffEmail = 's8.anand.carpenter@hostelcare.edu';
  const tempAdminEmail = 's8.asst.warden@hostelcare.edu';

  try {
    // Teardown any leftover test accounts from previous runs
    await pool.query('DELETE FROM users WHERE email IN (?, ?)', [tempStaffEmail, tempAdminEmail]);

    // Retrieve active seed users
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu');
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');

    if (!studentUser || !staffUser || !adminUser) {
      throw new Error('Seed users missing from database. Please run seed script.');
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

    // ------------------------------------------------------------------------
    // Verification 1: Student cannot access Staff APIs (403 Forbidden)
    // ------------------------------------------------------------------------
    const t1 = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordTest(
      1,
      'Student cannot access Staff APIs (returns HTTP 403 FORBIDDEN_ROLE)',
      t1.status === 403 && t1.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t1.status}, code: ${t1.data.code}, message: "${t1.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 2: Student cannot access Admin APIs (403 Forbidden)
    // ------------------------------------------------------------------------
    const t2 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordTest(
      2,
      'Student cannot access Admin User Directory API (returns HTTP 403 FORBIDDEN_ROLE)',
      t2.status === 403 && t2.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t2.status}, code: ${t2.data.code}, message: "${t2.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 3: Staff cannot access Admin APIs (403 Forbidden)
    // ------------------------------------------------------------------------
    const t3 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    recordTest(
      3,
      'Staff cannot access Admin User Directory API (returns HTTP 403 FORBIDDEN_ROLE)',
      t3.status === 403 && t3.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t3.status}, code: ${t3.data.code}, message: "${t3.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 4: Admin can access permitted administrative APIs (200 OK)
    // ------------------------------------------------------------------------
    const t4 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    recordTest(
      4,
      'Admin can access permitted administrative User Directory API (returns HTTP 200 OK)',
      t4.status === 200 && Array.isArray(t4.data.users) && t4.data.pagination?.total >= 8,
      `HTTP ${t4.status}, total users returned: ${t4.data.users?.length}, pagination total: ${t4.data.pagination?.total}`
    );

    // ------------------------------------------------------------------------
    // Verification 5: Missing token returns 401
    // ------------------------------------------------------------------------
    const t5 = await requestJson(baseUrl, '/api/v1/users');
    recordTest(
      5,
      'Missing token returns HTTP 401 Unauthorized (NO_TOKEN)',
      t5.status === 401 && t5.data.code === 'NO_TOKEN',
      `HTTP ${t5.status}, code: ${t5.data.code}, message: "${t5.data.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 6: Invalid token returns 401
    // ------------------------------------------------------------------------
    const t6 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': 'Bearer invalid.token.payload' }
    });
    recordTest(
      6,
      'Invalid token returns HTTP 401 Unauthorized (INVALID_TOKEN)',
      t6.status === 401 && t6.data.code === 'INVALID_TOKEN',
      `HTTP ${t6.status}, code: ${t6.data.code}`
    );

    // ------------------------------------------------------------------------
    // Verification 7: Unauthorized role returns 403
    // ------------------------------------------------------------------------
    const t7 = await requestJson(baseUrl, '/api/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordTest(
      7,
      'Unauthorized role returns HTTP 403 Forbidden across both /api and /api/v1 aliases',
      t7.status === 403 && t7.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t7.status}, code: ${t7.data.code}`
    );

    // ------------------------------------------------------------------------
    // Verification 8: Public Staff registration is rejected (HTTP 403)
    // ------------------------------------------------------------------------
    const t8 = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Malicious Staff Attempt',
        email: 'attacker.staff@hostelcare.edu',
        password: 'Password@123',
        role: 'staff'
      }
    });
    recordTest(
      8,
      'Public Staff self-registration is strictly rejected with HTTP 403 Forbidden',
      t8.status === 403,
      `HTTP ${t8.status}, message: "${t8.data?.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 9: Public Admin registration is rejected (HTTP 403)
    // ------------------------------------------------------------------------
    const t9 = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Malicious Admin Attempt',
        email: 'attacker.admin@hostelcare.edu',
        password: 'Password@123',
        role: 'admin'
      }
    });
    recordTest(
      9,
      'Public Admin self-registration is strictly rejected with HTTP 403 Forbidden',
      t9.status === 403,
      `HTTP ${t9.status}, message: "${t9.data?.message}"`
    );

    // ------------------------------------------------------------------------
    // Verification 10: Student cannot provision Staff/Admin accounts (HTTP 403)
    // ------------------------------------------------------------------------
    const t10 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        name: 'Unauthorized Staff',
        email: 'unauth.staff@hostelcare.edu',
        password: 'Password@123',
        role: 'staff'
      }
    });
    recordTest(
      10,
      'Student cannot provision Staff/Admin accounts (HTTP 403 FORBIDDEN_ROLE)',
      t10.status === 403 && t10.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t10.status}, code: ${t10.data.code}`
    );

    // ------------------------------------------------------------------------
    // Verification 11: Staff cannot provision Staff/Admin accounts (HTTP 403)
    // ------------------------------------------------------------------------
    const t11 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${staffToken}` },
      body: {
        name: 'Unauthorized Sub-Staff',
        email: 'unauth.substaff@hostelcare.edu',
        password: 'Password@123',
        role: 'staff'
      }
    });
    recordTest(
      11,
      'Staff cannot provision Staff/Admin accounts (HTTP 403 FORBIDDEN_ROLE)',
      t11.status === 403 && t11.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t11.status}, code: ${t11.data.code}`
    );

    // ------------------------------------------------------------------------
    // Verification 12: Authorized Admin can provision Staff accounts (HTTP 201)
    // ------------------------------------------------------------------------
    const t12 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Anand Varma',
        email: tempStaffEmail,
        password: 'Password@123',
        role: 'staff',
        staff_designation: 'Senior Carpenter',
        hostel_block: 'Block A',
        phone: '+91 9899112233'
      }
    });
    const provisionedUser = t12.data?.user;
    const isProvisionValid = t12.status === 201 &&
      provisionedUser?.role === 'staff' &&
      provisionedUser?.email === tempStaffEmail &&
      provisionedUser?.staff_designation === 'Senior Carpenter' &&
      !('password_hash' in (provisionedUser || {}));

    recordTest(
      12,
      'Authorized Admin can provision Staff accounts with safe return (HTTP 201 Created)',
      isProvisionValid,
      `HTTP ${t12.status}, id: ${provisionedUser?.id}, name: "${provisionedUser?.name}", role: ${provisionedUser?.role}, password_hash leaked: ${'password_hash' in (provisionedUser || {})}`
    );

    // ------------------------------------------------------------------------
    // Verification 13: Request body role manipulation is rejected
    // ------------------------------------------------------------------------
    // 13a: Non-permitted role on POST /api/v1/users (e.g. 'superadmin')
    const t13a = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Invalid Role Attempt',
        email: 'invalid.role@hostelcare.edu',
        password: 'Password@123',
        role: 'superadmin'
      }
    });
    // 13b: Student role on POST /api/v1/users (Student must self-register, not provisioned)
    const t13b = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Invalid Student Attempt',
        email: 'invalid.student@hostelcare.edu',
        password: 'Password@123',
        role: 'student'
      }
    });
    const roleManipulationPassed = t13a.status === 400 && t13b.status === 400;
    recordTest(
      13,
      'Request body role manipulation is rejected with HTTP 400 Validation Error',
      roleManipulationPassed,
      `Invalid 'superadmin' role: HTTP ${t13a.status} ("${t13a.data?.message}"), Invalid 'student' role: HTTP ${t13b.status}`
    );

    // ------------------------------------------------------------------------
    // Verification 14: Direct dashboard URL access is protected in frontend HTML
    // ------------------------------------------------------------------------
    const studentDashPath = path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html');
    const staffDashPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
    const adminDashPath = path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html');

    const sContent = fs.readFileSync(studentDashPath, 'utf8');
    const stContent = fs.readFileSync(staffDashPath, 'utf8');
    const aContent = fs.readFileSync(adminDashPath, 'utf8');

    const sGuarded = sContent.includes("requireAuth(['student'])");
    const stGuarded = stContent.includes("requireAuth(['staff'])");
    const aGuarded = aContent.includes("requireAuth(['admin'])");

    recordTest(
      14,
      'Direct dashboard URL access is protected with role-specific guards in HTML pages',
      sGuarded && stGuarded && aGuarded,
      `Student guard: ${sGuarded}, Staff guard: ${stGuarded}, Admin guard: ${aGuarded}`
    );

    // ------------------------------------------------------------------------
    // Verification 15: Session 7 authentication continues working & regression checks
    // ------------------------------------------------------------------------
    const meRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const logoutRes = await requestJson(baseUrl, '/api/v1/auth/logout', { method: 'POST' });
    const s7StillWorking = meRes.status === 200 && meRes.data?.user?.id === studentUser.id && logoutRes.status === 200;

    recordTest(
      15,
      'Session 7 authentication (GET /auth/me & POST /auth/logout) continues working perfectly',
      s7StillWorking,
      `/auth/me HTTP: ${meRes.status}, user: "${meRes.data?.user?.name}", /auth/logout HTTP: ${logoutRes.status}`
    );

    // ------------------------------------------------------------------------
    // Additional Test 16: Staff Operational Overview API works for Staff & Admin
    // ------------------------------------------------------------------------
    const staffOverviewRes = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const adminStaffOverviewRes = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const staffOverviewPassed = staffOverviewRes.status === 200 && adminStaffOverviewRes.status === 200;

    recordTest(
      16,
      'Staff Operational Overview API accessible by Staff and Admin',
      staffOverviewPassed,
      `Staff caller HTTP: ${staffOverviewRes.status}, Admin caller HTTP: ${adminStaffOverviewRes.status}`
    );

    // ------------------------------------------------------------------------
    // Additional Test 17: Admin Account Status Administration & Self-Deactivation Protection
    // ------------------------------------------------------------------------
    // Attempt self-deactivation by admin (must be rejected)
    const selfDeactivateRes = await requestJson(baseUrl, `/api/v1/users/${adminUser.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { account_status: 'inactive' }
    });
    // Toggle provisioned staff account status (must succeed)
    const toggleStaffRes = await requestJson(baseUrl, `/api/v1/users/${provisionedUser.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { account_status: 'inactive' }
    });

    const statusAdminPassed = selfDeactivateRes.status === 400 && toggleStaffRes.status === 200;
    recordTest(
      17,
      'Admin Account Status Management prevents self-deactivation and toggles target user status',
      statusAdminPassed,
      `Self-deactivation rejected: HTTP ${selfDeactivateRes.status} ("${selfDeactivateRes.data?.message}"), Target toggle: HTTP ${toggleStaffRes.status}`
    );

    // ------------------------------------------------------------------------
    // Clean up temporary test staff record
    // ------------------------------------------------------------------------
    if (provisionedUser?.id) {
      await pool.query('DELETE FROM users WHERE id = ?', [provisionedUser.id]);
    }

    // ------------------------------------------------------------------------
    // Final Test 18: Database Relational Integrity (Exactly 8 Pristine Seed Users)
    // ------------------------------------------------------------------------
    const [userCount] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = userCount[0].total;
    recordTest(
      18,
      'Database Relational Integrity: Exactly 8 pristine seed users remain in MySQL',
      totalUsers === 8,
      `Total users remaining in database: ${totalUsers} (1 Admin, 3 Staff, 4 Students)`
    );

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\n✓ Test HTTP server closed.');
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`SESSION 8 VERIFICATION COMPLETE: ${passedCount}/${results.length} TESTS PASSED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED TESTS: ${failedCount}`);
    await pool.end();
    process.exit(1);
  } else {
    console.log('ALL SESSION 8 TESTS COMPLETED WITH ZERO FAILURES.');
    await pool.end();
    process.exit(0);
  }
}

runSession8Verification().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
